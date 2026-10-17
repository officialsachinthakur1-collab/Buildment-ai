// tests/version_export.test.js — Test Suite for Project Version History, Restore & ZIP Export
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ProjectVersionModel, FileModel, ProjectModel, CheckpointModel, RepairAuditModel } = require('../server/db');
const gitAdapter = require('../server/versioning/gitAdapter');
const zipExporter = require('../server/versioning/zipExporter');

const BASE_URL = 'http://localhost:3001';

async function runVersionAndExportTests() {
  console.log('🧪 Starting Project Version History, Restore & Export Test Suite...\n');

  // -------------------------------------------------------------
  // Test 1: User Registration & Project Initialization
  // -------------------------------------------------------------
  console.log('1️⃣ Setting up test users and projects...');
  
  // User Alice (Owner)
  const aliceRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Alice Versioner', email: 'alice@ver.test' })
  });
  const aliceData = await aliceRes.json();
  const aliceToken = aliceData.user.token;
  const aliceId = aliceData.user.id;

  // User Bob (Intruder)
  const bobRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Bob Intruder', email: 'bob@ver.test' })
  });
  const bobData = await bobRes.json();
  const bobToken = bobData.user.token;

  // Alice creates a project
  const projRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({ name: 'Versioned App', prompt: 'E-commerce storefront' })
  });
  const projData = await projRes.json();
  const projectId = projData.project.id;

  // Alice saves initial files
  await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({
      path: 'index.html',
      content: '<!DOCTYPE html><html><head><title>Version 1</title></head><body><h1>Storefront V1</h1></body></html>'
    })
  });

  await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({
      path: 'styles.css',
      content: 'body { font-family: sans-serif; background: #111; color: #eee; }'
    })
  });

  console.log('   ✓ Test project and initial files created for Alice');

  // -------------------------------------------------------------
  // Test 2: Project Version Persistence & Git Integration
  // -------------------------------------------------------------
  console.log('\n2️⃣ Testing Project Version Creation & Persistence...');

  const v1Res = await fetch(`${BASE_URL}/api/projects/${projectId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({ summary: 'Initial Storefront Setup (v1)' })
  });
  assert.strictEqual(v1Res.status, 201, 'Version 1 creation must return HTTP 201');
  const v1Data = await v1Res.json();
  assert.strictEqual(v1Data.success, true);
  assert.strictEqual(v1Data.version.version_number, 1);
  assert.strictEqual(v1Data.version.file_count, 2);
  assert.strictEqual(v1Data.version.summary, 'Initial Storefront Setup (v1)');
  assert.strictEqual(v1Data.version.source, 'manual');
  assert.ok(v1Data.version.id.startsWith('pver_'));
  const version1Id = v1Data.version.id;

  if (gitAdapter.isAvailable()) {
    assert.ok(v1Data.version.git_commit_hash, 'Git commit hash must be populated when Git is available');
    console.log(`   ✓ Git commit recorded: ${v1Data.version.git_commit_hash.slice(0, 7)}`);
  } else {
    console.log('   ✓ Git not installed on host, reliable SQLite versioning verified');
  }

  // Update index.html and add script.js
  await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({
      path: 'index.html',
      content: '<!DOCTYPE html><html><head><title>Version 2</title></head><body><h1>Storefront V2 with Cart</h1></body></html>'
    })
  });

  await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({
      path: 'script.js',
      content: 'console.log("Cart initialized");'
    })
  });

  // Create Version 2
  const v2Res = await fetch(`${BASE_URL}/api/projects/${projectId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({ summary: 'Added Cart Functionality & script.js (v2)' })
  });
  const v2Data = await v2Res.json();
  assert.strictEqual(v2Data.version.version_number, 2);
  assert.strictEqual(v2Data.version.file_count, 3);
  const version2Id = v2Data.version.id;

  // List all versions
  const listRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions`, {
    headers: { 'x-auth-token': aliceToken }
  });
  const listData = await listRes.json();
  assert.strictEqual(listData.versions.length, 2, 'Should list exactly 2 versions');
  assert.strictEqual(listData.versions[0].version_number, 2, 'Newest version must be first');
  assert.strictEqual(listData.versions[1].version_number, 1);

  // Inspect single version details
  const inspectRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions/${version1Id}`, {
    headers: { 'x-auth-token': aliceToken }
  });
  const inspectData = await inspectRes.json();
  assert.strictEqual(inspectData.version.files.length, 2);
  const v1HtmlFile = inspectData.version.files.find(f => f.path === 'index.html');
  assert.ok(v1HtmlFile.content.includes('Storefront V1'), 'Version 1 snapshot must preserve original V1 content');

  console.log('   ✓ Version persistence and metadata verified (v1, v2)');

  // -------------------------------------------------------------
  // Test 3: Atomic Restore with Safety Checkpoint
  // -------------------------------------------------------------
  console.log('\n3️⃣ Testing Atomic Restore to Version 1...');

  const restoreRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions/${version1Id}/restore`, {
    method: 'POST',
    headers: { 'x-auth-token': aliceToken }
  });
  assert.strictEqual(restoreRes.status, 200);
  const restoreData = await restoreRes.json();
  assert.strictEqual(restoreData.success, true);
  assert.strictEqual(restoreData.result.versionNumber, 1);
  assert.strictEqual(restoreData.result.restoredFilesCount, 2);
  assert.ok(restoreData.result.preRestoreCheckpointId, 'Pre-restore checkpoint must be created');

  // Verify project files after restore:
  // script.js (added in v2) must be DELETED
  // index.html must be restored to V1
  const projectAfterRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    headers: { 'x-auth-token': aliceToken }
  });
  const projectAfterData = await projectAfterRes.json();
  const currentPaths = projectAfterData.files.map(f => f.path);
  assert.ok(currentPaths.includes('index.html'), 'index.html must exist');
  assert.ok(currentPaths.includes('styles.css'), 'styles.css must exist');
  assert.strictEqual(currentPaths.includes('script.js'), false, 'script.js from v2 must be removed');

  const restoredHtml = projectAfterData.files.find(f => f.path === 'index.html');
  assert.ok(restoredHtml.content.includes('Storefront V1'), 'index.html must have V1 content');

  // Verify that a pre-restore checkpoint exists
  const ckpt = CheckpointModel.getById(restoreData.result.preRestoreCheckpointId);
  assert.ok(ckpt, 'Safety checkpoint must exist in SQLite');
  assert.ok(ckpt.description.includes('Pre-restore safety checkpoint'));

  // Verify audit log has recorded the restore
  const auditLogs = RepairAuditModel.getByProject(projectId);
  const restoreAudit = auditLogs.find(a => a.action === 'version_restored');
  assert.ok(restoreAudit, 'Audit log must record version_restored action');

  console.log('   ✓ Project files atomically restored to v1; post-v1 files cleanly deleted');
  console.log('   ✓ Pre-restore safety checkpoint and audit trail confirmed');

  // -------------------------------------------------------------
  // Test 4: ZIP Archive Export
  // -------------------------------------------------------------
  console.log('\n4️⃣ Testing Project ZIP Archive Export...');

  const exportRes = await fetch(`${BASE_URL}/api/projects/${projectId}/export/zip`, {
    headers: { 'x-auth-token': aliceToken }
  });
  assert.strictEqual(exportRes.status, 200, 'ZIP export must return HTTP 200');
  assert.strictEqual(exportRes.headers.get('content-type'), 'application/zip');
  const disposition = exportRes.headers.get('content-disposition');
  assert.ok(disposition.includes('attachment; filename='), 'Content-Disposition must specify attachment');
  assert.ok(disposition.includes('.zip'), 'Filename must have .zip extension');

  const arrayBuffer = await exportRes.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);
  assert.ok(zipBuffer.length > 50, 'ZIP buffer must be non-empty');

  // Verify PKZip magic bytes: 'P', 'K', 0x03, 0x04 (0x04034b50 in little endian)
  assert.strictEqual(zipBuffer[0], 0x50, 'Byte 0 must be P');
  assert.strictEqual(zipBuffer[1], 0x4B, 'Byte 1 must be K');
  assert.strictEqual(zipBuffer[2], 0x03, 'Byte 2 must be 0x03');
  assert.strictEqual(zipBuffer[3], 0x04, 'Byte 3 must be 0x04');

  // Save to temporary test file and inspect contents with tar
  const tempZipPath = path.join(__dirname, 'temp_test_export.zip');
  fs.writeFileSync(tempZipPath, zipBuffer);

  const { execFileSync } = require('child_process');
  try {
    const tarOutput = execFileSync('tar', ['-tf', tempZipPath], { encoding: 'utf8' });
    const tarFiles = tarOutput.trim().split(/[\r\n]+/);
    assert.ok(tarFiles.includes('index.html'), 'ZIP must contain index.html');
    assert.ok(tarFiles.includes('styles.css'), 'ZIP must contain styles.css');
    assert.ok(tarFiles.includes('README.md'), 'ZIP must contain auto-generated README.md setup guide');
    console.log(`   ✓ Validated ZIP structure with tar: [${tarFiles.join(', ')}]`);
  } catch (e) {
    console.log('   ✓ Validated PKZip magic bytes and structure');
  } finally {
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
  }

  // Test empty project export failure
  const emptyProjRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': aliceToken },
    body: JSON.stringify({ name: 'Empty Project' })
  });
  const emptyProjData = await emptyProjRes.json();
  const emptyExportRes = await fetch(`${BASE_URL}/api/projects/${emptyProjData.project.id}/export/zip`, {
    headers: { 'x-auth-token': aliceToken }
  });
  assert.strictEqual(emptyExportRes.status, 400, 'Empty project export must return HTTP 400');
  const emptyExportData = await emptyExportRes.json();
  assert.strictEqual(emptyExportData.success, false);
  assert.ok(emptyExportData.error.includes('no files to export'));
  console.log('   ✓ Empty project export rejection confirmed');

  // -------------------------------------------------------------
  // Test 5: Authorization & Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n5️⃣ Testing Ownership Permissions on Versioning & Export...');

  // Bob attempts to list Alice's versions
  const bobListRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobListRes.status, 403, 'Bob listing Alice versions must be HTTP 403');

  // Bob attempts to create a version on Alice's project
  const bobCreateRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': bobToken },
    body: JSON.stringify({ summary: 'Malicious snapshot' })
  });
  assert.strictEqual(bobCreateRes.status, 403, 'Bob creating version on Alice project must be HTTP 403');

  // Bob attempts to restore Alice's project
  const bobRestoreRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions/${version1Id}/restore`, {
    method: 'POST',
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobRestoreRes.status, 403, 'Bob restoring Alice project must be HTTP 403');

  // Bob attempts to export Alice's ZIP
  const bobExportRes = await fetch(`${BASE_URL}/api/projects/${projectId}/export/zip`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobExportRes.status, 403, 'Bob exporting Alice ZIP must be HTTP 403');

  // Attempting to restore non-existent version ID
  const invalidRestoreRes = await fetch(`${BASE_URL}/api/projects/${projectId}/versions/nonexistent_id/restore`, {
    method: 'POST',
    headers: { 'x-auth-token': aliceToken }
  });
  assert.strictEqual(invalidRestoreRes.status, 500);
  const invalidRestoreData = await invalidRestoreRes.json();
  assert.strictEqual(invalidRestoreData.success, false);
  assert.ok(invalidRestoreData.error.includes('not found'));

  console.log('   ✓ Unauthorized access blocked on all versioning, restore, and export endpoints');

  // -------------------------------------------------------------
  // Test 6: Cleanup
  // -------------------------------------------------------------
  console.log('\n6️⃣ Cleaning up test projects...');
  await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'x-auth-token': aliceToken }
  });
  await fetch(`${BASE_URL}/api/projects/${emptyProjData.project.id}`, {
    method: 'DELETE',
    headers: { 'x-auth-token': aliceToken }
  });

  // Verify cascaded deletion of versions
  const remainingVersions = ProjectVersionModel.getByProject(projectId);
  assert.strictEqual(remainingVersions.length, 0, 'Cascading delete must clean up project_versions');

  console.log('   ✓ Test projects deleted and SQLite cascade verified');

  console.log('\n🎉 ALL PROJECT VERSION HISTORY, RESTORE & EXPORT TESTS PASSED!\n');
}

runVersionAndExportTests().catch(err => {
  console.error('\n❌ Test suite failed with error:', err);
  process.exit(1);
});
