// tests/repair.test.js — Automated Tests for AI Debugging & Auto-Repair Agent
const assert = require('assert');
const { parseDiagnosisResponse } = require('../server/aiService');
const { CheckpointModel, FileModel, ProjectModel, RepairProposalModel, RepairAuditModel, DiagnosticModel } = require('../server/db');
const RepairService = require('../server/agent/repairService');

const BASE_URL = 'http://localhost:3001';

async function testRepairAgent() {
  console.log('🧪 Starting AI Debugging & Auto-Repair Test Suite...\n');

  // -------------------------------------------------------------
  // Test 1: Missing Credentials Handling (Zero Fake Diagnosis)
  // -------------------------------------------------------------
  console.log('1️⃣ Testing Missing Credentials Handling (No Fake Diagnosis)...');
  
  // Register a test user and project
  const userRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Tester Debug', email: 'debug@test.local' })
  });
  const userData = await userRes.json();
  const token = userData.user.token;

  const projRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': token
    },
    body: JSON.stringify({ name: 'Broken App Test', prompt: 'Calculator with syntax error' })
  });
  const projData = await projRes.json();
  const projectId = projData.project.id;

  // Save broken index.html
  await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({ path: 'index.html', content: '<html><body><h1>Broken</h1><script src="app.js"></script></body></html>' })
  });

  // Record a diagnostic error
  const diagRes = await fetch(`${BASE_URL}/api/projects/${projectId}/diagnostics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({
      type: 'runtime_error',
      message: 'Uncaught TypeError: Cannot read properties of undefined (reading "addEventListener")',
      file_path: 'app.js',
      line_number: 14
    })
  });
  const diagData = await diagRes.json();
  assert.strictEqual(diagData.success, true, 'Diagnostic reporting should succeed');
  const diagnosticId = diagData.diagnostic.id;
  console.log(`   ✓ Persistent diagnostic recorded: ${diagnosticId} (app.js:14)`);

  const statusRes = await fetch(`${BASE_URL}/api/status`);
  const statusData = await statusRes.json();

  if (statusData.ai && statusData.ai.configured) {
    const diagnoseRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ diagnosticId })
    });
    const diagnoseData = await diagnoseRes.json();
    assert.strictEqual(diagnoseData.success, true, 'Diagnosis with active AI key must succeed');
    assert.ok(diagnoseData.proposal.diagnosis, 'Proposal diagnosis must be present');
    console.log(`   ✓ Live AI Provider (${statusData.ai.activeProvider}) diagnosed error cleanly!`);
  } else {
    // Attempt diagnosis with unconfigured AI provider -> Must reject with clear error, NEVER invent diagnosis
    const diagnoseRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/diagnose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
      body: JSON.stringify({ diagnosticId })
    });
    const diagnoseData = await diagnoseRes.json();
    assert.strictEqual(diagnoseData.success, false, 'Diagnosis must fail cleanly when AI credentials missing');
    assert(diagnoseData.error.includes('AI_NOT_CONFIGURED'), 'Error must specify AI_NOT_CONFIGURED');
    console.log('   ✓ Missing credentials cleanly handled without faking AI diagnosis');
  }

  // Also verify unit test: diagnoseAndFix directly fails when env keys are absent
  const origKey = process.env.GEMINI_API_KEY;
  try {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    let failedCleanly = false;
    try {
      const { diagnoseAndFix } = require('../server/aiService');
      await diagnoseAndFix({ errorDetails: {}, currentFiles: [] });
    } catch (err) {
      failedCleanly = err.message.includes('AI_NOT_CONFIGURED');
    }
    assert.strictEqual(failedCleanly, true, 'Unit check: diagnoseAndFix must reject with AI_NOT_CONFIGURED when keys absent');
    console.log('   ✓ Anti-mocking verification confirmed: Zero fake responses when credentials missing');
  } finally {
    if (origKey) process.env.GEMINI_API_KEY = origKey;
  }

  // -------------------------------------------------------------
  // Test 2: Deterministic Diagnostic Parsing & Malformed AI Output
  // -------------------------------------------------------------
  console.log('\n2️⃣ Testing Structured AI Response Parser & Malformed Output...');

  // Valid structured output fixture
  const validAiOutput = `
===DIAGNOSIS===
The button element 'submit-btn' was queried before the DOM finished loading, returning null.
===ROOT_CAUSE===
app.js:14 - querySelector inside inline script
===REASONING===
Wrapping the event listener in a DOMContentLoaded listener guarantees element exists.
===FILES===
===FILE: app.js===
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('submit-btn');
  if (btn) btn.addEventListener('click', () => alert('Clicked'));
});
===END_FILE===
`;
  const parsed = parseDiagnosisResponse(validAiOutput);
  assert.strictEqual(parsed.diagnosis.includes('The button element'), true);
  assert.strictEqual(parsed.rootCause.includes('app.js:14'), true);
  assert.strictEqual(parsed.files.length, 1);
  assert.strictEqual(parsed.files[0].path, 'app.js');
  console.log('   ✓ Valid structured AI response parsed successfully');

  // Malformed output without file blocks
  const malformedAiOutput = `
===DIAGNOSIS===
Something went wrong with JavaScript.
===ROOT_CAUSE===
Unknown.
===REASONING===
Fix the code.
`;
  const parsedMalformed = parseDiagnosisResponse(malformedAiOutput);
  assert.strictEqual(parsedMalformed.files.length, 0, 'Malformed output has 0 files');
  console.log('   ✓ Malformed AI output cleanly detected (0 files generated)');

  // -------------------------------------------------------------
  // Test 3: Path Traversal & Destructive Patch Protection
  // -------------------------------------------------------------
  console.log('\n3️⃣ Testing Security Rules & Destructive Patch Protection...');

  const maliciousAiOutput = `
===DIAGNOSIS===
Fixing system configuration.
===ROOT_CAUSE===
System level.
===REASONING===
Escape directory.
===FILES===
===FILE: ../../etc/malicious.js===
console.log('Hacked');
===END_FILE===
`;
  const parsedMalicious = parseDiagnosisResponse(maliciousAiOutput);
  let caughtSecurityError = false;
  try {
    const { validateFilePath } = require('../server/db');
    const check = validateFilePath(parsedMalicious.files[0].path);
    if (!check.valid) throw new Error(check.error);
  } catch (err) {
    caughtSecurityError = true;
    console.log(`   ✓ Malicious patch rejected: "${err.message}"`);
  }
  assert.strictEqual(caughtSecurityError, true, 'Unsafe path must be rejected by validator');

  // -------------------------------------------------------------
  // Test 4: Checkpoints & Full Project Rollback
  // -------------------------------------------------------------
  console.log('\n4️⃣ Testing Project Checkpoint Creation & Rollback...');

  // Project currently has index.html
  const initialFiles = FileModel.getByProject(projectId);
  assert.strictEqual(initialFiles.length, 1);

  // Create checkpoint
  const checkpoint = CheckpointModel.create(projectId, 'Pre-damage snapshot');
  assert(checkpoint.id.startsWith('ckpt_'), 'Checkpoint should be created');
  console.log(`   ✓ Created Checkpoint: ${checkpoint.id}`);

  // Mutate project: modify index.html and add unwanted file
  FileModel.save(projectId, 'index.html', '<h1>Corrupted Content</h1>');
  FileModel.save(projectId, 'unwanted.js', 'console.log("bad");');
  assert.strictEqual(FileModel.getByProject(projectId).length, 2);
  console.log('   ✓ Damaged project state (added unwanted file & altered index.html)');

  // Execute Rollback via RepairService
  const rollbackRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({ checkpointId: checkpoint.id })
  });
  const rollbackData = await rollbackRes.json();
  assert.strictEqual(rollbackData.success, true);

  const restoredFiles = FileModel.getByProject(projectId);
  assert.strictEqual(restoredFiles.length, 1, 'Unwanted file must be removed during rollback');
  assert(restoredFiles[0].content.includes('<h1>Broken</h1>'), 'Original content must be restored');
  console.log('   ✓ Rollback successfully restored exact pre-repair state and deleted unwanted files');

  // -------------------------------------------------------------
  // Test 5: Safe Auto-Fix Application & Retest Execution
  // -------------------------------------------------------------
  console.log('\n5️⃣ Testing Safe Auto-Fix Application, Retest, & Audit Trail...');

  // Create deterministic repair proposal fixture in SQLite
  const testChanges = [{
    path: 'app.js',
    oldContent: '',
    newContent: 'console.log("Fixed app script");',
    diff: '+ console.log("Fixed app script");',
    linesAdded: 1,
    linesRemoved: 0,
    summary: '+1 / -0 lines'
  }];

  const proposal = RepairProposalModel.create(projectId, {
    diagnostic_id: diagnosticId,
    diagnosis: 'Script app.js was missing entirely.',
    root_cause: 'app.js not found',
    reasoning: 'Synthesized valid app.js entry point.',
    diff_summary: 'app.js (+1 / -0 lines)',
    changes_json: testChanges,
    attempt_number: 1
  });

  // Apply the repair fix via endpoint
  const applyRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify({ proposalId: proposal.id })
  });
  const applyData = await applyRes.json();
  assert.strictEqual(applyData.success, true);
  assert(applyData.checkpointId, 'Auto-repair must generate an automatic safety checkpoint');
  assert.strictEqual(applyData.retestStatus, 'passed', 'Retest must succeed when files compile cleanly');
  console.log(`   ✓ Repair applied. Automatic checkpoint: ${applyData.checkpointId}. Retest Status: "${applyData.retestStatus}"`);

  // Verify file was written
  const updatedAppFile = FileModel.getFile(projectId, 'app.js');
  assert(updatedAppFile !== null, 'app.js must be created by the repair');
  assert.strictEqual(updatedAppFile.content, 'console.log("Fixed app script");');

  // Verify diagnostic status updated to fixed
  const updatedDiag = DiagnosticModel.getById(diagnosticId);
  assert.strictEqual(updatedDiag.status, 'fixed', 'Diagnostic should be marked fixed');

  // Verify audit log entry
  const auditRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/audit`, {
    headers: { 'x-auth-token': token }
  });
  const auditData = await auditRes.json();
  assert.strictEqual(auditData.success, true);
  assert(auditData.auditLogs.length >= 1, 'Audit log must record the applied repair');
  console.log(`   ✓ Audit trail confirmed: ${auditData.auditLogs[0].action} - ${auditData.auditLogs[0].details}`);

  // -------------------------------------------------------------
  // Test 6: Infinite Repair Loop Prevention (Rate Limit)
  // -------------------------------------------------------------
  console.log('\n6️⃣ Testing Infinite Repair Loop Prevention...');

  // Create additional attempts to reach limit (3 attempts)
  RepairProposalModel.create(projectId, {
    diagnosis: 'Attempt 2',
    changes_json: testChanges,
    attempt_number: 2
  });
  RepairProposalModel.create(projectId, {
    diagnosis: 'Attempt 3',
    changes_json: testChanges,
    attempt_number: 3
  });

  const rateLimitCheck = await RepairService.diagnose({ projectId, userId: userData.user.id });
  assert.strictEqual(rateLimitCheck.success, false);
  assert(rateLimitCheck.error.includes('Maximum automated repair limit (3 attempts) reached'), 'Must halt after 3 attempts');
  console.log('   ✓ Infinite repair loop prevented: Rate limit halts after 3 attempts');

  // -------------------------------------------------------------
  // Test 7: Ownership & Access Control
  // -------------------------------------------------------------
  console.log('\n7️⃣ Testing Ownership Permissions on Repair Operations...');

  // Register unauthorized user
  const bobRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Bob Intruder', email: 'bob.intruder@test.local' })
  });
  const bobData = await bobRes.json();
  const bobToken = bobData.user.token;

  // Bob attempts to read diagnostics of project -> MUST BE 403
  const bobDiagRes = await fetch(`${BASE_URL}/api/projects/${projectId}/diagnostics`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobDiagRes.status, 403, 'Unauthorized diagnostic read must return 403');

  // Bob attempts to apply repair to project -> MUST BE 403
  const bobApplyRes = await fetch(`${BASE_URL}/api/projects/${projectId}/debug/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': bobToken },
    body: JSON.stringify({ proposalId: proposal.id })
  });
  assert.strictEqual(bobApplyRes.status, 403, 'Unauthorized repair apply must return 403');
  console.log('   ✓ Unauthorized diagnostic and repair requests rejected with HTTP 403 Forbidden');

  // Clean up
  await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'x-auth-token': token }
  });
  console.log('   ✓ Cleanup: Project deleted');

  console.log('\n🎉 ALL AI DEBUGGING & AUTO-REPAIR TESTS PASSED!\n');
}

testRepairAgent().catch(err => {
  console.error('\n❌ Repair Agent test failed with error:', err);
  process.exit(1);
});
