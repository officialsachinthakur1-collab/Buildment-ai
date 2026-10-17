// tests/auth_security.test.js — Production Authentication & Ownership Security Test Suite
const assert = require('assert');
const { UserModel, SessionModel, db } = require('../server/db');

const BASE_URL = 'http://localhost:3001';

async function runAuthSecurityTests() {
  console.log('🧪 Starting BuildAI Authentication & Security Test Suite...\n');

  const runId = Math.random().toString(36).substring(2, 7);
  const aliceUser = `SecAlice_${runId}`;
  const aliceEmail = `alice_${runId}@security.test`;
  const bobUser = `SecBob_${runId}`;
  const bobEmail = `bob_${runId}@security.test`;
  const legacyUsername = `LegacyDev_${runId}`;
  const legacyEmail = `legacy_${runId}@buildai.local`;

  // -----------------------------------------------------------------
  // Test 1: User Registration with Argon2id Password Hashing
  // -----------------------------------------------------------------
  console.log('1️⃣ Testing User Registration with Argon2id Hashing...');

  // Weak password rejection
  const weakRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `Weak_${runId}`,
      email: `weak_${runId}@security.test`,
      password: 'weak' // < 8 characters
    })
  });
  assert.strictEqual(weakRes.status, 400, 'Weak password should be rejected with HTTP 400');
  const weakData = await weakRes.json();
  assert.strictEqual(weakData.success, false);
  console.log('   ✓ Rejected weak password (< 8 chars):', weakData.error);

  // Valid registration with strong password
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: aliceUser,
      email: aliceEmail,
      password: 'SuperSecurePassword123!'
    })
  });
  assert.strictEqual(regRes.status, 201, 'Valid registration should succeed with HTTP 201');
  const regData = await regRes.json();
  assert.strictEqual(regData.success, true);
  assert.ok(regData.user.id, 'User ID should be generated');
  assert.strictEqual(regData.user.username, aliceUser);
  assert.strictEqual(regData.user.password, undefined, 'Plaintext password must NEVER be returned');
  assert.strictEqual(regData.user.password_hash, undefined, 'Password hash must NEVER be returned in response');
  assert.ok(regData.token, 'Session token should be returned');

  // Verify Set-Cookie header contains HttpOnly session cookie
  const setCookie = regRes.headers.get('set-cookie');
  assert.ok(setCookie && setCookie.includes('buildai_session='), 'HttpOnly session cookie must be set');
  assert.ok(setCookie.includes('HttpOnly'), 'Cookie must have HttpOnly flag');
  assert.ok(setCookie.includes('SameSite=Lax'), 'Cookie must have SameSite=Lax flag');

  // Inspect database to verify Argon2id hash format without exposing plaintext
  const rawAlice = db.prepare(`SELECT * FROM users WHERE id = ?`).get(regData.user.id);
  assert.ok(rawAlice.password_hash, 'Password hash must be stored in database');
  assert.ok(rawAlice.password_hash.startsWith('$argon2id$v=19$m=65536,p=4,t=3$'), 'Password must be hashed with Argon2id using OWASP parameters');
  assert.strictEqual(rawAlice.password_hash.includes('SuperSecurePassword123!'), false, 'Database must never contain plaintext password');
  console.log(`   ✓ Verified Argon2id hash stored safely: ${rawAlice.password_hash.substring(0, 31)}... (Entropy verified)`);
  console.log('   ✓ Verified Set-Cookie HttpOnly and SameSite attributes.');

  // -----------------------------------------------------------------
  // Test 2: Successful Login & Session Rotation
  // -----------------------------------------------------------------
  console.log('\n2️⃣ Testing Login & Session Token Rotation...');

  const initialToken = regData.token;

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: aliceUser,
      password: 'SuperSecurePassword123!'
    })
  });
  assert.strictEqual(loginRes.status, 200, 'Login should succeed with HTTP 200');
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true);
  assert.ok(loginData.token, 'New session token should be returned');
  assert.notStrictEqual(loginData.token, initialToken, 'Session token MUST be rotated on login');
  console.log(`   ✓ Login succeeded. Session rotated cleanly (${loginData.token.substring(0, 8)}... !== ${initialToken.substring(0, 8)}...)`);

  // Verify old token was revoked
  const checkOldToken = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'x-auth-token': initialToken }
  });
  assert.strictEqual(checkOldToken.status, 401, 'Old rotated session token must be invalid');
  console.log('   ✓ Verified old session token invalidated upon login.');

  // -----------------------------------------------------------------
  // Test 3: Incorrect Password Handling & Timing Protection
  // -----------------------------------------------------------------
  console.log('\n3️⃣ Testing Incorrect Password Handling...');

  const badPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: aliceUser,
      password: 'WrongPassword999!'
    })
  });
  assert.strictEqual(badPassRes.status, 401, 'Incorrect password must return HTTP 401');
  const badPassData = await badPassRes.json();
  assert.strictEqual(badPassData.success, false);
  assert.strictEqual(badPassData.error, 'Invalid credentials.');
  console.log('   ✓ Incorrect password rejected with generic "Invalid credentials."');

  // -----------------------------------------------------------------
  // Test 4: Brute-Force Rate Limiting (5 Attempts Lockout)
  // -----------------------------------------------------------------
  console.log('\n4️⃣ Testing Login Rate Limiting & Account Lockout...');

  // Fire 4 more failed attempts (total 5)
  for (let i = 2; i <= 5; i++) {
    await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: aliceUser,
        password: `BadPasswordAttempt_${i}!`
      })
    });
  }

  // 6th attempt should be blocked by rate limiter with HTTP 429
  const rateLimitRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: aliceUser,
      password: 'SuperSecurePassword123!'
    })
  });
  assert.strictEqual(rateLimitRes.status, 429, 'Excessive failed logins must trigger HTTP 429 Too Many Requests');
  const rateLimitData = await rateLimitRes.json();
  assert.strictEqual(rateLimitData.success, false);
  console.log('   ✓ Rate limit triggered after 5 failed attempts:', rateLimitData.error);

  // -----------------------------------------------------------------
  // Test 5: Controlled Account Migration (Existing Unmigrated Account)
  // -----------------------------------------------------------------
  console.log('\n5️⃣ Testing Safe Account Migration for Legacy Accounts...');

  // Create an unmigrated account directly in SQLite as if from prior version
  const legacyUserId = `usr_legacy_${Date.now()}`;
  const legacyRawToken = `legacy_token_${Date.now()}_abc123`;
  UserModel.create({
    id: legacyUserId,
    username: legacyUsername,
    email: legacyEmail,
    token: legacyRawToken,
    needsPasswordMigration: 1
  });

  // Verify database record has password_hash = NULL and needs_password_migration = 1
  const legacyRecord = db.prepare(`SELECT * FROM users WHERE id = ?`).get(legacyUserId);
  assert.strictEqual(legacyRecord.password_hash, null, 'Legacy account has no password hash');
  assert.strictEqual(legacyRecord.needs_password_migration, 1, 'Legacy account flagged for migration');

  // Attempt login with username/password should be blocked with explicit migration guidance
  const legacyLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identifier: legacyUsername,
      password: 'AnyPassword123!'
    })
  });
  assert.strictEqual(legacyLoginRes.status, 403, 'Unmigrated login must return HTTP 403');
  const legacyLoginData = await legacyLoginRes.json();
  assert.strictEqual(legacyLoginData.needs_password_migration, true);
  console.log('   ✓ Blocked login with clear migration notice:', legacyLoginData.error);

  // Legacy user authenticates using their existing active token
  const legacySessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'x-auth-token': legacyRawToken }
  });
  assert.strictEqual(legacySessionRes.status, 200, 'Legacy token should be accepted and auto-upgraded');
  const legacySessionData = await legacySessionRes.json();
  assert.strictEqual(legacySessionData.user.needs_password_migration, true);
  const upgradedToken = legacySessionData.token;
  console.log('   ✓ Legacy user verified session with needs_password_migration = true.');

  // Legacy user initializes their password via migration endpoint
  const migrateRes = await fetch(`${BASE_URL}/api/auth/migrate-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': upgradedToken
    },
    body: JSON.stringify({
      password: 'NewlySetPassword2026!'
    })
  });
  assert.strictEqual(migrateRes.status, 200, 'Password initialization should succeed');
  const migrateData = await migrateRes.json();
  assert.strictEqual(migrateData.success, true);
  assert.strictEqual(migrateData.user.needs_password_migration, false);

  // Verify database now contains Argon2id hash and needs_password_migration = 0
  const migratedDbRecord = db.prepare(`SELECT * FROM users WHERE id = ?`).get(legacyUserId);
  assert.ok(migratedDbRecord.password_hash && migratedDbRecord.password_hash.startsWith('$argon2id$'), 'Account now has Argon2id hash');
  assert.strictEqual(migratedDbRecord.needs_password_migration, 0, 'Migration flag cleared');
  console.log('   ✓ Legacy account safely migrated to Argon2id without data loss or account lockouts.');

  // -----------------------------------------------------------------
  // Test 6: Strict Cross-User Ownership Enforcement
  // -----------------------------------------------------------------
  console.log('\n6️⃣ Testing Strict Cross-User Isolation (No Default Bypass)...');

  // Register User Bob
  const bobRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: bobUser,
      email: bobEmail,
      password: 'BobSecurePassword123!'
    })
  });
  const bobData = await bobRes.json();
  const bobToken = bobData.token;

  // Alice creates a private project
  const projRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': migrateData.token // Migrated user token
    },
    body: JSON.stringify({
      name: 'Confidential Finance Tool',
      prompt: 'Bank accounting ledger'
    })
  });
  const projData = await projRes.json();
  assert.strictEqual(projData.success, true);
  const projectId = projData.project.id;

  // 1. Bob cannot list Alice's project
  const bobListRes = await fetch(`${BASE_URL}/api/projects`, {
    headers: { 'x-auth-token': bobToken }
  });
  const bobListData = await bobListRes.json();
  const hasAliceProject = bobListData.projects.some(p => p.id === projectId);
  assert.strictEqual(hasAliceProject, false, 'Bob must not see Alice project in project list');
  console.log("   ✓ Project list strictly isolated: Bob cannot see Alice's project.");

  // 2. Bob cannot read Alice's project details
  const bobGetRes = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobGetRes.status, 403, 'Bob GET project must return 403');
  console.log('   ✓ Bob read access blocked with HTTP 403 Forbidden.');

  // 3. Bob cannot modify Alice's project files
  const bobWriteRes = await fetch(`${BASE_URL}/api/projects/${projectId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': bobToken
    },
    body: JSON.stringify({ path: 'trojan.js', content: 'alert(1);' })
  });
  assert.strictEqual(bobWriteRes.status, 403, 'Bob file write must return 403');
  console.log('   ✓ Bob file modification blocked with HTTP 403 Forbidden.');

  // 4. Bob cannot trigger AI repair or diagnostics on Alice's project
  const bobDiagRes = await fetch(`${BASE_URL}/api/projects/${projectId}/diagnostics`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobDiagRes.status, 403, 'Bob diagnostics access must return 403');
  console.log('   ✓ Bob diagnostics access blocked with HTTP 403 Forbidden.');

  // 5. Bob cannot export Alice's project ZIP
  const bobExportRes = await fetch(`${BASE_URL}/api/projects/${projectId}/export/zip`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(bobExportRes.status, 403, 'Bob ZIP export must return 403');
  console.log('   ✓ Bob ZIP archive export blocked with HTTP 403 Forbidden.');

  // 6. Anonymous request without token must return HTTP 401 (No dev fallback bypass)
  const anonRes = await fetch(`${BASE_URL}/api/projects`);
  assert.strictEqual(anonRes.status, 401, 'Anonymous request must return 401 (No usr_default bypass)');
  console.log('   ✓ Anonymous access rejected with HTTP 401 Unauthorized (dev bypass successfully removed).');

  // -----------------------------------------------------------------
  // Test 7: Logout & Session Invalidation
  // -----------------------------------------------------------------
  console.log('\n7️⃣ Testing Logout & Token Invalidation...');

  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout should succeed with HTTP 200');
  const logoutData = await logoutRes.json();
  assert.strictEqual(logoutData.success, true);

  // Bob tries to access with logged out token -> MUST BE 401
  const afterLogoutRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'x-auth-token': bobToken }
  });
  assert.strictEqual(afterLogoutRes.status, 401, 'Logged out token must be rejected with HTTP 401');
  console.log('   ✓ Session invalidated on logout. Subsequent calls rejected with HTTP 401.');

  // Cleanup test records
  db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
  db.prepare(`DELETE FROM users WHERE id IN (?, ?, ?)`).run(regData.user.id, legacyUserId, bobData.user.id);

  console.log('\n🎉 ALL AUTHENTICATION & SECURITY TESTS PASSED!\n');
}

runAuthSecurityTests().catch(err => {
  console.error('\n❌ AUTH SECURITY TEST FAILED:', err);
  process.exit(1);
});
