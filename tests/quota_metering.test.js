// tests/quota_metering.test.js — Token Quotas, Usage Metering & Plan Tier Test Suite
const assert = require('assert');
const { UserModel, SessionModel, UsageModel, ProjectModel, db } = require('../server/db');
const {
  PLAN_LIMITS,
  getUserQuotaStatus,
  checkQuota,
  recordOperationUsage
} = require('../server/quota/quotaService');

const BASE_URL = 'http://localhost:3001';

async function runQuotaMeteringTests() {
  console.log('🧪 Starting BuildAI User Quota & Usage Metering Test Suite...\n');

  const runId = Math.random().toString(36).substring(2, 7);
  const freeUser = `QuotaFree_${runId}`;
  const freeEmail = `free_${runId}@quota.test`;
  const bobUser = `QuotaBob_${runId}`;
  const bobEmail = `bob_${runId}@quota.test`;

  // -----------------------------------------------------------------
  // Test 1: User Registration & Default Free Plan Quota Status
  // -----------------------------------------------------------------
  console.log('1️⃣ Testing Free Tier Default Quota Allocation...');

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: freeUser,
      email: freeEmail,
      password: 'StrongPassword123!'
    })
  });
  assert.strictEqual(regRes.status, 201, 'User registration should succeed');
  const regData = await regRes.json();
  const freeUserId = regData.user.id;
  const freeToken = regData.token;

  // Verify sanitized user has plan_tier = 'free'
  assert.strictEqual(regData.user.plan_tier, 'free', 'Default plan tier should be free');

  // Query GET /api/user/quota
  const quotaRes = await fetch(`${BASE_URL}/api/user/quota`, {
    headers: { 'x-auth-token': freeToken }
  });
  assert.strictEqual(quotaRes.status, 200, 'Quota endpoint should return 200');
  const quotaData = await quotaRes.json();
  assert.strictEqual(quotaData.success, true);
  assert.strictEqual(quotaData.quota.tier, 'free');
  assert.strictEqual(quotaData.quota.limits.dailyGenerations, 5);
  assert.strictEqual(quotaData.quota.limits.dailyEdits, 20);
  assert.strictEqual(quotaData.quota.limits.dailyRepairs, 10);
  assert.strictEqual(quotaData.quota.limits.dailyTokenBudget, 100000);
  assert.strictEqual(quotaData.quota.remaining.generations, 5);
  assert.strictEqual(quotaData.quota.todayUsage.generationsToday, 0);
  assert.ok(quotaData.quota.resetsInSeconds > 0, 'Reset seconds should be positive');
  console.log('   ✓ Verified Free tier defaults (5 gens, 20 edits, 10 repairs, 100k tokens)');

  // -----------------------------------------------------------------
  // Test 2: Accurate Usage Logging & Token Metering Calculation
  // -----------------------------------------------------------------
  console.log('\n2️⃣ Testing Usage Logging & Token Estimation...');

  // Record generation usage directly through service
  const samplePrompt = 'Build a responsive portfolio website with project gallery and dark mode';
  const sampleOutput = '===FILE: index.html===\n<!DOCTYPE html><html><body><h1>Portfolio</h1></body></html>\n===END_FILE===';
  
  const logged = recordOperationUsage({
    userId: freeUserId,
    operation: 'generate',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    promptText: samplePrompt,
    outputText: sampleOutput
  });

  assert.ok(logged.id, 'Usage log record should be created with ID');
  assert.strictEqual(logged.user_id, freeUserId);
  assert.strictEqual(logged.operation, 'generate');
  assert.strictEqual(logged.prompt_tokens, Math.ceil(samplePrompt.length / 4));
  assert.strictEqual(logged.completion_tokens, Math.ceil(sampleOutput.length / 4));
  assert.strictEqual(logged.total_tokens, logged.prompt_tokens + logged.completion_tokens);

  // Check updated quota status
  const updatedQuota = getUserQuotaStatus(UserModel.findById(freeUserId));
  assert.strictEqual(updatedQuota.todayUsage.generationsToday, 1);
  assert.strictEqual(updatedQuota.remaining.generations, 4);
  assert.strictEqual(updatedQuota.todayUsage.totalTokens, logged.total_tokens);
  assert.strictEqual(updatedQuota.percentages.generationUsage, 20); // 1 / 5 = 20%
  console.log(`   ✓ Usage recorded: 1 generation, ${logged.total_tokens} tokens consumed (4 gens left)`);

  // Verify GET /api/user/usage/logs endpoint
  const logsRes = await fetch(`${BASE_URL}/api/user/usage/logs`, {
    headers: { 'x-auth-token': freeToken }
  });
  assert.strictEqual(logsRes.status, 200);
  const logsData = await logsRes.json();
  assert.strictEqual(logsData.success, true);
  assert.ok(Array.isArray(logsData.logs));
  assert.strictEqual(logsData.logs.length, 1);
  assert.strictEqual(logsData.logs[0].operation, 'generate');
  console.log('   ✓ Telemetry verified via GET /api/user/usage/logs');

  // -----------------------------------------------------------------
  // Test 3: Daily Quota Limit Enforcement (HTTP 429 & DAILY_QUOTA_EXCEEDED)
  // -----------------------------------------------------------------
  console.log('\n3️⃣ Testing Daily Quota Exhaustion & Rejection (HTTP 429)...');

  // Record 4 more generations to hit the 5 generation cap
  for (let i = 0; i < 4; i++) {
    recordOperationUsage({
      userId: freeUserId,
      operation: 'generate',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      promptText: `Prompt #${i + 2}`,
      outputText: 'output code'
    });
  }

  const cappedStatus = getUserQuotaStatus(UserModel.findById(freeUserId));
  assert.strictEqual(cappedStatus.todayUsage.generationsToday, 5);
  assert.strictEqual(cappedStatus.remaining.generations, 0);

  // Verify checkQuota pre-flight returns allowed: false
  const preCheck = checkQuota(UserModel.findById(freeUserId), 'generate');
  assert.strictEqual(preCheck.allowed, false);
  assert.strictEqual(preCheck.error, 'DAILY_QUOTA_EXCEEDED');
  assert.ok(preCheck.message.includes('reached your daily limit'));
  console.log('   ✓ checkQuota correctly blocked 6th generation:', preCheck.message);

  // Create a project for freeUser to test HTTP route rejection
  const projRes = await fetch(`${BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': freeToken
    },
    body: JSON.stringify({ name: 'Quota Test Project', prompt: 'Test app' })
  });
  const projData = await projRes.json();
  const testProjectId = projData.project.id;

  // Call POST /api/projects/:id/generate and verify HTTP 429 response
  const blockedGenRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': freeToken
    },
    body: JSON.stringify({ prompt: 'Generate app beyond quota' })
  });
  assert.strictEqual(blockedGenRes.status, 429, 'Exceeded quota must return HTTP 429');
  const blockedData = await blockedGenRes.json();
  assert.strictEqual(blockedData.success, false);
  assert.strictEqual(blockedData.error, 'DAILY_QUOTA_EXCEEDED');
  assert.ok(blockedData.quota, 'Quota telemetry should be included in 429 error response');
  console.log('   ✓ POST /api/projects/:id/generate returned HTTP 429 with DAILY_QUOTA_EXCEEDED');

  // -----------------------------------------------------------------
  // Test 4: Plan Upgrade to Pro Unlocks Generous Quota (100 gens, 2M tokens)
  // -----------------------------------------------------------------
  console.log('\n4️⃣ Testing Pro Developer Upgrade & Instant Quota Unlock...');

  // Upgrade freeUser to 'pro'
  const upgradeRes = await fetch(`${BASE_URL}/api/user/plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': freeToken
    },
    body: JSON.stringify({ plan_tier: 'pro' })
  });
  assert.strictEqual(upgradeRes.status, 200, 'Plan upgrade should succeed');
  const upgradeData = await upgradeRes.json();
  assert.strictEqual(upgradeData.success, true);
  assert.strictEqual(upgradeData.user.plan_tier, 'pro');
  assert.strictEqual(upgradeData.quota.tier, 'pro');
  assert.strictEqual(upgradeData.quota.limits.dailyGenerations, 100);
  assert.strictEqual(upgradeData.quota.limits.dailyEdits, 500);
  assert.strictEqual(upgradeData.quota.limits.dailyRepairs, 200);
  assert.strictEqual(upgradeData.quota.limits.dailyTokenBudget, 2000000);
  assert.strictEqual(upgradeData.quota.remaining.generations, 95); // 100 - 5 = 95
  console.log('   ✓ Upgraded to Pro: 95 / 100 generations remaining, 2,000,000 token budget');

  // Verify checkQuota pre-flight now succeeds
  const proCheck = checkQuota(UserModel.findById(freeUserId), 'generate');
  assert.strictEqual(proCheck.allowed, true, 'Generation must now be allowed on Pro plan');
  console.log('   ✓ Previously capped user is now unlocked and allowed to generate');

  // -----------------------------------------------------------------
  // Test 5: Multi-User Quota Isolation
  // -----------------------------------------------------------------
  console.log('\n5️⃣ Testing Multi-User Quota Isolation...');

  // Register second user (Bob)
  const bobRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: bobUser,
      email: bobEmail,
      password: 'StrongBobPassword123!'
    })
  });
  const bobData = await bobRes.json();
  const bobToken = bobData.token;

  // Check Bob's quota: should be completely fresh (5 remaining)
  const bobQuotaRes = await fetch(`${BASE_URL}/api/user/quota`, {
    headers: { 'x-auth-token': bobToken }
  });
  const bobQuota = await bobQuotaRes.json();
  assert.strictEqual(bobQuota.quota.tier, 'free');
  assert.strictEqual(bobQuota.quota.todayUsage.generationsToday, 0, "Bob's usage must be 0");
  assert.strictEqual(bobQuota.quota.remaining.generations, 5, "Bob must have full 5 generations");
  console.log("   ✓ User isolation confirmed: Bob has fresh 5/5 generations unaffected by Alice's usage");

  // Verify Bob cannot view Alice's usage logs
  const bobLogsRes = await fetch(`${BASE_URL}/api/user/usage/logs`, {
    headers: { 'x-auth-token': bobToken }
  });
  const bobLogs = await bobLogsRes.json();
  assert.strictEqual(bobLogs.logs.length, 0, "Bob must not see another user's usage logs");
  console.log("   ✓ Usage logs isolation confirmed: Bob has 0 logs");

  // -----------------------------------------------------------------
  // Test 6: Custom Daily Quota Override
  // -----------------------------------------------------------------
  console.log('\n6️⃣ Testing Custom Daily Quota Override...');

  UserModel.setCustomQuota(freeUserId, 250);
  const customStatus = getUserQuotaStatus(UserModel.findById(freeUserId));
  assert.strictEqual(customStatus.limits.dailyGenerations, 250, 'Custom quota of 250 should override tier default');
  assert.strictEqual(customStatus.remaining.generations, 245); // 250 - 5 = 245
  console.log('   ✓ Custom quota override verified: 250 daily generations');

  // Reset custom quota
  UserModel.setCustomQuota(freeUserId, null);
  const resetStatus = getUserQuotaStatus(UserModel.findById(freeUserId));
  assert.strictEqual(resetStatus.limits.dailyGenerations, 100);
  console.log('   ✓ Reset custom quota restored Pro tier default (100)');

  console.log('\n✅ ALL USER TOKEN QUOTA & USAGE METERING TESTS PASSED (100% SUCCESS)\n');
}

if (require.main === module) {
  runQuotaMeteringTests().catch(err => {
    console.error('\n❌ Test Suite Failed:', err);
    process.exit(1);
  });
}

module.exports = runQuotaMeteringTests;
