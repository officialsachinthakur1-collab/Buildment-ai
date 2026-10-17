// tests/workspace.test.js — Automated Tests for Workspace, Ownership, Validation, & Runtime
const assert = require('assert');

const BASE_URL = 'http://localhost:3001';

async function testWorkspace() {
  console.log('🧪 Starting Workspace & Runtime Test Suite...\n');

  // -------------------------------------------------------------
  // Test 1: Authentication & User Registration
  // -------------------------------------------------------------
  console.log('1️⃣ Testing Authentication & Sessions...');
  
  // Register User A
  const resUserA = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Alice Developer', email: 'alice@test.local' })
  });
  const dataUserA = await resUserA.json();
  assert.strictEqual(dataUserA.success, true, 'User A registration should succeed');
  const userA = dataUserA.user;
  console.log(`   ✓ Created User A: ${userA.username} (Token: ${userA.token.substring(0, 8)}...)`);

  // Register User B
  const resUserB = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Bob Intruder', email: 'bob@test.local' })
  });
  const dataUserB = await resUserB.json();
  assert.strictEqual(dataUserB.success, true, 'User B registration should succeed');
  const userB = dataUserB.user;
  console.log(`   ✓ Created User B: ${userB.username} (Token: ${userB.token.substring(0, 8)}...)`);

  // -------------------------------------------------------------
  // Test 2: Project Creation & Ownership Isolation
  // -------------------------------------------------------------
  console.log('\n2️⃣ Testing Project Ownership Isolation...');

  // User A creates Project A
  const resProjA = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ name: "Alice's Secret Project", prompt: 'A private dashboard' })
  });
  const dataProjA = await resProjA.json();
  assert.strictEqual(dataProjA.success, true, 'Project creation should succeed');
  const projectA = dataProjA.project;
  console.log(`   ✓ User A created project: ${projectA.id} ("${projectA.name}")`);

  // User B tries to read User A's project -> MUST BE 403 FORBIDDEN
  const resIntrusion = await fetch(`${BASE_URL}/api/projects/${projectA.id}`, {
    headers: { 'x-auth-token': userB.token }
  });
  assert.strictEqual(resIntrusion.status, 403, 'User B reading User A project should return 403 Forbidden');
  console.log('   ✓ User B read attempt correctly blocked with HTTP 403 Forbidden');

  // User B tries to write to User A's project -> MUST BE 403 FORBIDDEN
  const resIntrusionWrite = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userB.token
    },
    body: JSON.stringify({ path: 'hack.html', content: '<h1>Hacked</h1>' })
  });
  assert.strictEqual(resIntrusionWrite.status, 403, 'User B writing to User A project should return 403 Forbidden');
  console.log('   ✓ User B write attempt correctly blocked with HTTP 403 Forbidden');

  // -------------------------------------------------------------
  // Test 3: Path Traversal & Security Validation
  // -------------------------------------------------------------
  console.log('\n3️⃣ Testing Path Traversal & Validation...');

  // Dangerous path with .. traversal
  const resTraversal = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: '../../etc/passwd.html', content: 'malicious' })
  });
  assert.strictEqual(resTraversal.status, 400, 'Path traversal should return 400 Bad Request');
  const dataTraversal = await resTraversal.json();
  console.log(`   ✓ Directory traversal blocked: "${dataTraversal.error}"`);

  // Illegal characters
  const resBadChars = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: 'bad*file?.js', content: 'console.log(1);' })
  });
  assert.strictEqual(resBadChars.status, 400, 'Illegal filename characters should return 400');
  console.log('   ✓ Illegal characters in path rejected');

  // Disallowed extension
  const resDisallowedExt = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: 'trojan.exe', content: 'binary' })
  });
  assert.strictEqual(resDisallowedExt.status, 400, 'Disallowed extension should return 400');
  console.log('   ✓ Disallowed file extension (.exe) rejected');

  // -------------------------------------------------------------
  // Test 4: File Saving & Automatic Version History
  // -------------------------------------------------------------
  console.log('\n4️⃣ Testing File Saving & Versioning...');

  // Save version 1
  const v1Content = '<!DOCTYPE html><html><head><title>Version 1</title></head><body><h1>Hello V1</h1></body></html>';
  const resSaveV1 = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: 'index.html', content: v1Content })
  });
  const dataSaveV1 = await resSaveV1.json();
  assert.strictEqual(dataSaveV1.success, true, 'Saving V1 should succeed');
  console.log('   ✓ Saved index.html Version 1');

  // Save version 2
  const v2Content = '<!DOCTYPE html><html><head><title>Version 2</title></head><body><h1>Hello V2 Enhanced</h1></body></html>';
  const resSaveV2 = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: 'index.html', content: v2Content })
  });
  const dataSaveV2 = await resSaveV2.json();
  assert.strictEqual(dataSaveV2.success, true, 'Saving V2 should succeed');
  console.log('   ✓ Saved index.html Version 2 (auto-archived V1)');

  // Inspect version history
  const resVersions = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files/versions?path=index.html`, {
    headers: { 'x-auth-token': userA.token }
  });
  const dataVersions = await resVersions.json();
  assert.strictEqual(dataVersions.success, true);
  assert(dataVersions.versions.length >= 1, 'Should contain at least 1 archived version');
  console.log(`   ✓ Version history confirmed: ${dataVersions.versions.length} archived snapshot(s)`);

  // Revert back to Version 1
  const versionToRevert = dataVersions.versions[0].id;
  const resRevert = await fetch(`${BASE_URL}/api/projects/${projectA.id}/files/revert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ path: 'index.html', versionId: versionToRevert })
  });
  const dataRevert = await resRevert.json();
  assert.strictEqual(dataRevert.success, true);
  assert(dataRevert.file.content.includes('Version 1'), 'File should contain restored V1 content');
  console.log('   ✓ Successfully reverted index.html to Version 1 snapshot');

  // -------------------------------------------------------------
  // Test 5: Live Runtime Preview Session & Health Checks
  // -------------------------------------------------------------
  console.log('\n5️⃣ Testing Live Preview Runtime & Health Verification...');

  // Start preview session
  const resStart = await fetch(`${BASE_URL}/api/projects/${projectA.id}/preview/start`, {
    method: 'POST',
    headers: { 'x-auth-token': userA.token }
  });
  const dataStart = await resStart.json();
  assert.strictEqual(dataStart.success, true);
  assert.strictEqual(dataStart.status, 'starting', 'Initial status should be starting');
  console.log('   ✓ Preview session started. Status: "starting" (awaiting health check)');

  // Verify health check heartbeat transitions state to 'running'
  const resHeartbeat = await fetch(`${BASE_URL}/api/projects/${projectA.id}/preview/heartbeat`, {
    method: 'POST',
    headers: { 'x-auth-token': userA.token }
  });
  const dataHeartbeat = await resHeartbeat.json();
  assert.strictEqual(dataHeartbeat.success, true);
  assert.strictEqual(dataHeartbeat.status, 'running', 'Heartbeat should transition status to running');
  console.log('   ✓ Health check heartbeat confirmed. Status: "running"');

  // Relay client console log
  await fetch(`${BASE_URL}/api/projects/${projectA.id}/preview/log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': userA.token
    },
    body: JSON.stringify({ level: 'info', args: ['App initialized successfully with 3 widgets'] })
  });

  // Verify logs captured
  const resLogs = await fetch(`${BASE_URL}/api/projects/${projectA.id}/preview/logs`, {
    headers: { 'x-auth-token': userA.token }
  });
  const dataLogs = await resLogs.json();
  assert.strictEqual(dataLogs.success, true);
  const foundConsoleLog = dataLogs.logs.some(l => l.message.includes('App initialized successfully'));
  assert(foundConsoleLog, 'Console log should be recorded in session log');
  console.log(`   ✓ Console logs captured successfully (${dataLogs.logs.length} log entries recorded)`);

  // Stop preview session
  const resStop = await fetch(`${BASE_URL}/api/projects/${projectA.id}/preview/stop`, {
    method: 'POST',
    headers: { 'x-auth-token': userA.token }
  });
  const dataStop = await resStop.json();
  assert.strictEqual(dataStop.status, 'stopped');
  console.log('   ✓ Preview session stopped successfully');

  // -------------------------------------------------------------
  // Test 6: Container Capability Reporting
  // -------------------------------------------------------------
  console.log('\n6️⃣ Testing Container Capability & Security Headers...');
  const resStatus = await fetch(`${BASE_URL}/api/status`);
  const dataStatus = await resStatus.json();
  assert(dataStatus.containerRuntime !== undefined, 'Container runtime info should be reported');
  console.log(`   ✓ Host Container Support: ${dataStatus.containerRuntime.supported ? 'Docker Active' : 'Not installed (Clean Sandboxed Fallback)'}`);

  // Clean up
  await fetch(`${BASE_URL}/api/projects/${projectA.id}`, {
    method: 'DELETE',
    headers: { 'x-auth-token': userA.token }
  });
  console.log('   ✓ Cleanup: Project deleted');

  console.log('\n🎉 ALL WORKSPACE, SECURITY, AND RUNTIME TESTS PASSED!\n');
}

testWorkspace().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
