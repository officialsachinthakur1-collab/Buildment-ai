// tests/ui_ux_features.test.js — Starter Templates, Diff View & UI/UX Features Test Suite
const assert = require('assert');
const { ProjectModel, FileModel, ProjectVersionModel, db } = require('../server/db');
const { getStarterTemplates, getTemplateById } = require('../server/templates/starterTemplates');

const BASE_URL = 'http://localhost:3001';

async function runUIUXFeaturesTests() {
  console.log('🧪 Starting BuildAI UI / UX & Starter Templates Test Suite...\n');

  const runId = Math.random().toString(36).substring(2, 7);
  const userA = `UIUserA_${runId}`;
  const userB = `UIUserB_${runId}`;

  // Register User A
  const regARes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userA,
      email: `${userA}@ui.test`,
      password: 'StrongPassword123!'
    })
  });
  assert.strictEqual(regARes.status, 201, 'User A registration should succeed');
  const regAData = await regARes.json();
  const tokenA = regAData.token;
  const userAId = regAData.user.id;

  // Register User B
  const regBRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userB,
      email: `${userB}@ui.test`,
      password: 'StrongPassword123!'
    })
  });
  assert.strictEqual(regBRes.status, 201, 'User B registration should succeed');
  const regBData = await regBRes.json();
  const tokenB = regBData.token;
  const userBId = regBData.user.id;

  // -----------------------------------------------------------------
  // Test 1: Starter Templates Catalog API (GET /api/templates)
  // -----------------------------------------------------------------
  console.log('1️⃣ Testing Starter Templates Catalog Listing...');

  const listRes = await fetch(`${BASE_URL}/api/templates`);
  assert.strictEqual(listRes.status, 200, 'GET /api/templates should return 200');
  const listData = await listRes.json();

  assert.strictEqual(listData.success, true);
  assert.ok(Array.isArray(listData.templates), 'Templates should be an array');
  assert.strictEqual(listData.templates.length, 5, 'Should contain exactly 5 pre-built templates');

  const expectedTemplateIds = [
    'analytics-dashboard',
    'ecommerce-store',
    'kanban-planner',
    'developer-portfolio',
    'saas-landing'
  ];

  expectedTemplateIds.forEach(id => {
    const found = listData.templates.find(t => t.id === id);
    assert.ok(found, `Template with id '${id}' should exist in catalog`);
    assert.ok(found.name, `Template '${id}' should have a name`);
    assert.ok(found.category, `Template '${id}' should have a category`);
    assert.ok(found.description, `Template '${id}' should have a description`);
    assert.ok(Array.isArray(found.tags), `Template '${id}' should have tags`);
    assert.ok(found.fileCount >= 2, `Template '${id}' should have at least 2 files`);
    assert.ok(found.filesSummary.includes('index.html'), `Template '${id}' files should include index.html`);
  });

  console.log('   ✓ Verified 5 rich starter templates available in catalog');

  // -----------------------------------------------------------------
  // Test 2: Single Template Details API (GET /api/templates/:id)
  // -----------------------------------------------------------------
  console.log('2️⃣ Testing Single Template Details Retrieval...');

  const detailRes = await fetch(`${BASE_URL}/api/templates/analytics-dashboard`);
  assert.strictEqual(detailRes.status, 200, 'GET /api/templates/:id should return 200');
  const detailData = await detailRes.json();

  assert.strictEqual(detailData.success, true);
  assert.strictEqual(detailData.template.id, 'analytics-dashboard');
  assert.strictEqual(detailData.template.category, 'Dashboard');
  assert.ok(Array.isArray(detailData.template.files), 'Template files should be an array');
  assert.ok(detailData.template.files.length >= 3, 'Analytics dashboard should have index.html, styles.css, and app.js');

  const htmlFile = detailData.template.files.find(f => f.path === 'index.html');
  assert.ok(htmlFile && htmlFile.content.includes('PulseMetrics'), 'index.html should have PulseMetrics content');

  // Test 404 for non-existent template
  const notFoundRes = await fetch(`${BASE_URL}/api/templates/non-existent-template-id`);
  assert.strictEqual(notFoundRes.status, 404, 'Non-existent template should return 404');
  console.log('   ✓ Verified template details retrieval & 404 handling');

  // -----------------------------------------------------------------
  // Test 3: 1-Click Template Project Creation (POST /api/projects/template)
  // -----------------------------------------------------------------
  console.log('3️⃣ Testing 1-Click Project Initialization from Template...');

  // Unauthenticated request should be rejected
  const unauthRes = await fetch(`${BASE_URL}/api/projects/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId: 'analytics-dashboard' })
  });
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated template creation should return 401');

  // Invalid templateId should return 404
  const invalidRes = await fetch(`${BASE_URL}/api/projects/template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': tokenA
    },
    body: JSON.stringify({ templateId: 'unknown-template-xyz' })
  });
  assert.strictEqual(invalidRes.status, 404, 'Invalid templateId should return 404');

  // Valid template launch by User A
  const createRes = await fetch(`${BASE_URL}/api/projects/template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': tokenA
    },
    body: JSON.stringify({
      templateId: 'kanban-planner',
      name: 'Custom Team Kanban'
    })
  });
  assert.strictEqual(createRes.status, 201, 'Valid template creation should return 201');
  const createData = await createRes.json();

  assert.strictEqual(createData.success, true);
  assert.strictEqual(createData.project.name, 'Custom Team Kanban');
  assert.strictEqual(createData.project.owner_id, userAId, 'Project must be owned by User A');
  assert.ok(Array.isArray(createData.files), 'Files array must be returned');
  assert.ok(createData.files.length >= 3, 'Kanban template should have populated 3 files');

  const projIdA = createData.project.id;

  // Verify files saved persistently in SQLite
  const savedFiles = FileModel.getByProject(projIdA);
  assert.strictEqual(savedFiles.length, createData.files.length, 'All files must be saved in FileModel');

  const savedIndex = savedFiles.find(f => f.path === 'index.html');
  assert.ok(savedIndex && (savedIndex.content.includes('Kronos') || savedIndex.content.includes('Task Board')), 'Kanban HTML should be in SQLite');

  // Verify Version #1 was automatically created by VersionService
  const versionsRes = await fetch(`${BASE_URL}/api/projects/${projIdA}/versions`, {
    headers: { 'x-auth-token': tokenA }
  });
  assert.strictEqual(versionsRes.status, 200);
  const versionsData = await versionsRes.json();
  assert.ok(versionsData.versions.length >= 1, 'Initial version snapshot must exist');
  assert.strictEqual(versionsData.versions[0].source, 'template_init', 'Version source should be template_init');
  console.log('   ✓ Verified atomic project creation, file persistence & initial Version snapshot');

  // -----------------------------------------------------------------
  // Test 4: Project Ownership Isolation on Template Projects
  // -----------------------------------------------------------------
  console.log('4️⃣ Testing Ownership Isolation on Template Projects...');

  // User B tries to read User A's project
  const accessRes = await fetch(`${BASE_URL}/api/projects/${projIdA}`, {
    headers: { 'x-auth-token': tokenB }
  });
  assert.strictEqual(accessRes.status, 403, 'User B must be forbidden from accessing User A project');

  // User B creates their own project from the same template
  const createBRes = await fetch(`${BASE_URL}/api/projects/template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-auth-token': tokenB
    },
    body: JSON.stringify({ templateId: 'kanban-planner' })
  });
  assert.strictEqual(createBRes.status, 201);
  const createBData = await createBRes.json();
  assert.strictEqual(createBData.project.owner_id, userBId, 'User B project must be owned by User B');
  assert.notStrictEqual(createBData.project.id, projIdA, 'Projects must have distinct IDs');

  console.log('   ✓ Verified cross-user isolation: User B cannot access User A template projects');

  // -----------------------------------------------------------------
  // Test 5: Sandboxed Runnable Bundle Generation
  // -----------------------------------------------------------------
  console.log('5️⃣ Testing Sandboxed Runnable Bundle Generation...');

  const bundleRes = await fetch(`${BASE_URL}/api/projects/${projIdA}/bundle`, {
    headers: { 'x-auth-token': tokenA }
  });
  assert.strictEqual(bundleRes.status, 200, 'Bundle endpoint should return 200');
  const bundleHtml = await bundleRes.text();

  assert.ok(bundleHtml.includes('Kronos') || bundleHtml.includes('Task Board'), 'Bundle must contain project HTML');
  assert.ok(bundleHtml.includes('data-buildai-bridge="true"'), 'Bundle must contain health bridge script');
  assert.ok(bundleHtml.includes('data-injected="styles.css"'), 'Bundle must inline styles.css');
  assert.ok(bundleHtml.includes('data-injected="app.js"'), 'Bundle must inline app.js');

  const cspHeader = bundleRes.headers.get('content-security-policy');
  assert.ok(cspHeader, 'Bundle must enforce Content-Security-Policy header');
  assert.ok(cspHeader.includes("frame-ancestors 'self'"), 'CSP must restrict frame ancestors');

  console.log('   ✓ Verified standalone runnable bundle with CSP security & injected scripts');

  // -----------------------------------------------------------------
  // Test 6: Template Code Completeness & Valid Syntax Check
  // -----------------------------------------------------------------
  console.log('6️⃣ Testing Template Code Completeness for all 5 Templates...');

  const allTemplates = getStarterTemplates();
  for (const t of allTemplates) {
    assert.ok(t.id, 'Template must have ID');
    assert.ok(t.name, 'Template must have name');
    assert.ok(t.files.length >= 2, `${t.name} must have multiple files`);

    const hasIndex = t.files.some(f => f.path === 'index.html');
    assert.ok(hasIndex, `${t.name} must have index.html`);

    for (const f of t.files) {
      assert.ok(f.path && f.path.length > 0, 'File path must be non-empty');
      assert.ok(f.content && f.content.length > 50, `${f.path} in ${t.name} must have substantive content`);
    }
  }

  console.log('   ✓ Verified all 5 templates have complete multi-file implementations');

  console.log('\n🎉 ALL UI/UX & STARTER TEMPLATE TESTS PASSED (100%)\n');
}

if (require.main === module) {
  runUIUXFeaturesTests().catch(err => {
    console.error('\n❌ Test suite failed:', err);
    process.exit(1);
  });
}

module.exports = { runUIUXFeaturesTests };
