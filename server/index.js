// server/index.js — BuildAI Full-Stack Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const {
  db,
  UserModel,
  SessionModel,
  ProjectModel,
  FileModel,
  MessageModel,
  DiagnosticModel,
  CheckpointModel,
  RepairProposalModel,
  RepairAuditModel,
  ProjectVersionModel,
  UsageModel,
  validateFilePath,
  validateFileContent
} = require('./db');
const { authMiddleware, verifyProjectOwner } = require('./middleware/auth');
const { hashPassword, verifyPassword, validatePasswordStrength, needsRehash } = require('./auth/passwordService');
const { checkRateLimit, recordFailedAttempt, resetRateLimit } = require('./auth/rateLimiter');
const { getUserQuotaStatus, checkQuota, recordOperationUsage, PLAN_LIMITS } = require('./quota/quotaService');
const RuntimeManager = require('./runtime/runtimeManager');
const RepairService = require('./agent/repairService');
const VersionService = require('./versioning/versionService');
const zipExporter = require('./versioning/zipExporter');
const { checkContainerCapability } = require('./runtime/containerAdapter');
const { getAIStatus, generateFiles, editFiles } = require('./aiService');
const { getStarterTemplates, getTemplateById } = require('./templates/starterTemplates');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Studio & Workspace Routes
app.get('/workspace', (req, res) => res.sendFile(path.join(__dirname, '../public/workspace.html')));
app.get('/studio', (req, res) => res.sendFile(path.join(__dirname, '../public/workspace.html')));

// Cookie helper
function setSessionCookie(res, token) {
  res.cookie('buildai_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie('buildai_session', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });
}

// -------------------------------------------------------------
// System & Capability Status API
// -------------------------------------------------------------
app.get('/api/status', (req, res) => {
  res.json({
    app: 'BuildAI',
    status: 'online',
    ai: getAIStatus(),
    containerRuntime: checkContainerCapability()
  });
});

// -------------------------------------------------------------
// Authentication & Identity API (Argon2id, Sessions, Rate-Limited)
// -------------------------------------------------------------

// Get currently authenticated session and sanitized user profile
app.get('/api/auth/session', authMiddleware, (req, res) => {
  res.json({
    success: true,
    user: {
      ...UserModel.sanitize(req.user),
      token: req.authToken
    },
    token: req.authToken
  });
});

// User Registration with Argon2id Password Hashing
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, error: 'Username is required.' });
    }

    const cleanUsername = username.trim();
    if (cleanUsername.length < 2 || cleanUsername.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Username must be between 2 and 50 characters.'
      });
    }

    if (!/^[a-zA-Z0-9_\-\. ]+$/.test(cleanUsername)) {
      return res.status(400).json({
        success: false,
        error: 'Username contains invalid characters. Use letters, numbers, spaces, dots, dashes, or underscores.'
      });
    }

    let cleanEmail = null;
    if (email && email.trim()) {
      cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ success: false, error: 'Invalid email address format.' });
      }
    }

    // For password registration, enforce account uniqueness
    if (password) {
      const existing = db.prepare(`
        SELECT * FROM users 
        WHERE (LOWER(username) = LOWER(?) OR (email IS NOT NULL AND LOWER(email) = LOWER(?)))
          AND password_hash IS NOT NULL
      `).get(cleanUsername, cleanEmail || cleanUsername);

      if (existing) {
        return res.status(409).json({ success: false, error: 'Username or email is already registered.' });
      }
    }

    let passwordHash = null;
    let needsMigration = 0;

    if (password) {
      const passValidation = validatePasswordStrength(password);
      if (!passValidation.valid) {
        return res.status(400).json({ success: false, error: passValidation.error });
      }
      passwordHash = await hashPassword(password);
    } else {
      // Legacy registration fallback for test suites without password
      needsMigration = 1;
    }

    const user = UserModel.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      needsPasswordMigration: needsMigration
    });

    // Create secure hashed session
    const session = SessionModel.createSession(user.id, {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || ''
    });

    // Invalidate initial users.token placeholder so only the hashed session token is valid
    db.prepare(`UPDATE users SET token = 'revoked_' || ? WHERE id = ?`).run(session.sessionId, user.id);

    setSessionCookie(res, session.rawToken);

    res.status(201).json({
      success: true,
      user: {
        ...UserModel.sanitize(user),
        token: session.rawToken
      },
      token: session.rawToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// User Login with Rate Limiting & Argon2id Verification
app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    const ipCheck = checkRateLimit(`ip:${ip}`);
    if (ipCheck.limited) {
      return res.status(429).json({
        success: false,
        error: ipCheck.error,
        retryAfterSeconds: ipCheck.retryAfterSeconds
      });
    }

    const { identifier, password } = req.body;
    if (!identifier || typeof identifier !== 'string' || !password || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Username/email and password are required.' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const idCheck = checkRateLimit(`user:${cleanIdentifier}`);
    if (idCheck.limited) {
      return res.status(429).json({
        success: false,
        error: idCheck.error,
        retryAfterSeconds: idCheck.retryAfterSeconds
      });
    }

    const user = UserModel.getByUsernameOrEmail(cleanIdentifier);
    if (!user) {
      recordFailedAttempt(`ip:${ip}`);
      recordFailedAttempt(`user:${cleanIdentifier}`);
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Check account lockout
    if (user.lockout_until && new Date(user.lockout_until) > new Date()) {
      return res.status(429).json({
        success: false,
        error: 'Account temporarily locked due to consecutive failed attempts. Please try again later.'
      });
    }

    // Check if account has no password yet (needs migration)
    if (!user.password_hash) {
      return res.status(403).json({
        success: false,
        needs_password_migration: true,
        error: 'Account requires password initialization. Please authenticate with your existing token and set a password.'
      });
    }

    // Verify Argon2id hash
    const isValid = await verifyPassword(user.password_hash, password);
    if (!isValid) {
      recordFailedAttempt(`ip:${ip}`);
      recordFailedAttempt(`user:${cleanIdentifier}`);
      UserModel.recordFailedLogin(user.id);
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Login successful — reset rate limiters and lockout
    resetRateLimit(`ip:${ip}`);
    resetRateLimit(`user:${cleanIdentifier}`);
    UserModel.resetFailedLogins(user.id);

    // Check if Argon2id hash needs parameter upgrade
    if (needsRehash(user.password_hash)) {
      const newHash = await hashPassword(password);
      UserModel.setPassword(user.id, newHash);
    }

    // Rotate session: invalidate prior sessions for this user and issue a fresh session
    SessionModel.invalidateAllForUser(user.id);
    const session = SessionModel.createSession(user.id, {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: ip
    });

    setSessionCookie(res, session.rawToken);

    res.json({
      success: true,
      message: 'Login successful.',
      user: {
        ...UserModel.sanitize(user),
        token: session.rawToken
      },
      token: session.rawToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout — Invalidates active session and clears cookie
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  try {
    SessionModel.invalidateSession(req.authToken);
    clearSessionCookie(res);
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Account Migration — Initialize password for existing token accounts
app.post('/api/auth/migrate-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const passValidation = validatePasswordStrength(password);
    if (!passValidation.valid) {
      return res.status(400).json({ success: false, error: passValidation.error });
    }

    const passwordHash = await hashPassword(password);
    UserModel.setPassword(req.user.id, passwordHash);

    // Rotate session for security
    const session = SessionModel.rotateSession(req.user.id, req.authToken, {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || ''
    });

    setSessionCookie(res, session.rawToken);

    res.json({
      success: true,
      message: 'Password successfully initialized with Argon2id.',
      user: {
        ...UserModel.sanitize(UserModel.getById(req.user.id)),
        token: session.rawToken
      },
      token: session.rawToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Change Password — Authenticated user updates their existing password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = UserModel.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (user.password_hash) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'Current password is required.' });
      }
      const isCurrentValid = await verifyPassword(user.password_hash, currentPassword);
      if (!isCurrentValid) {
        return res.status(401).json({ success: false, error: 'Current password is incorrect.' });
      }
    }

    const passValidation = validatePasswordStrength(newPassword);
    if (!passValidation.valid) {
      return res.status(400).json({ success: false, error: passValidation.error });
    }

    const newHash = await hashPassword(newPassword);
    UserModel.setPassword(user.id, newHash);

    // Invalidate all other sessions for this user except the new one
    SessionModel.invalidateAllForUser(user.id);
    const session = SessionModel.createSession(user.id, {
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.ip || ''
    });

    setSessionCookie(res, session.rawToken);

    res.json({
      success: true,
      message: 'Password changed successfully. All other sessions have been logged out.',
      token: session.rawToken
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// User Quotas, Plan Tiers & Usage Metering API
// -------------------------------------------------------------

// Get authenticated user quota status, plan limits, and today's usage
app.get('/api/user/quota', authMiddleware, (req, res) => {
  try {
    const quotaStatus = getUserQuotaStatus(req.user);
    res.json({ success: true, quota: quotaStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upgrade or switch plan tier ('free' or 'pro')
app.post('/api/user/plan', authMiddleware, (req, res) => {
  try {
    const { plan_tier } = req.body;
    if (!plan_tier || !['free', 'pro'].includes(plan_tier.toLowerCase())) {
      return res.status(400).json({ success: false, error: "Invalid plan tier. Allowed: 'free', 'pro'." });
    }
    const cleanTier = plan_tier.toLowerCase();
    UserModel.setPlanTier(req.user.id, cleanTier);
    const updatedUser = UserModel.findById(req.user.id);
    const quotaStatus = getUserQuotaStatus(updatedUser);
    res.json({
      success: true,
      message: `Successfully switched to ${quotaStatus.tierName}!`,
      user: UserModel.sanitize(updatedUser),
      quota: quotaStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get recent AI usage audit logs for user
app.get('/api/user/usage/logs', authMiddleware, (req, res) => {
  try {
    const logs = UsageModel.getRecentLogs(req.user.id, 50);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Starter Templates API
// -------------------------------------------------------------

// List available starter templates
app.get('/api/templates', (req, res) => {
  try {
    const templates = getStarterTemplates().map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      badge: t.badge,
      badgeColor: t.badgeColor,
      icon: t.icon,
      description: t.description,
      tags: t.tags,
      fileCount: t.files.length,
      filesSummary: t.files.map(f => f.path)
    }));
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single starter template details
app.get('/api/templates/:id', (req, res) => {
  try {
    const template = getTemplateById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: `Starter template '${req.params.id}' not found.` });
    }
    res.json({ success: true, template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create project from starter template (Ownership enforced)
app.post('/api/projects/template', authMiddleware, (req, res) => {
  try {
    const { templateId, name } = req.body;
    if (!templateId) {
      return res.status(400).json({ success: false, error: 'templateId is required.' });
    }

    const template = getTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: `Starter template '${templateId}' not found.` });
    }

    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const projectName = (name && name.trim()) ? name.trim() : template.name;

    const project = ProjectModel.create({
      id,
      name: projectName,
      description: template.description,
      prompt: `Initialized from ${template.name} template`,
      owner_id: req.user.id
    });

    // Save all template files into project storage
    for (const f of template.files) {
      FileModel.save(id, f.path, f.content);
    }

    // Add initial assistant chat message
    MessageModel.add(
      id,
      'assistant',
      `Created project from "${template.name}" starter template with ${template.files.length} files: ${template.files.map(f => f.path).join(', ')}.`
    );

    // Record initial Version 1 snapshot in SQLite and Git repo
    try {
      VersionService.createVersion(id, {
        userId: req.user.id,
        user: req.user,
        summary: `Starter Template: ${template.name}`,
        source: 'template_init'
      });
    } catch (verErr) {
      console.warn('[VersionService] Failed to create template version snapshot:', verErr.message);
    }

    res.status(201).json({
      success: true,
      project,
      files: FileModel.getByProject(id),
      message: `Created project from ${template.name}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Projects API (User-Scoped & Persistent in SQLite)
// -------------------------------------------------------------

// List projects belonging to the authenticated user
app.get('/api/projects', authMiddleware, (req, res) => {
  try {
    const projects = ProjectModel.getAllForUser(req.user.id);
    res.json({ success: true, projects, user: req.user.username });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create project attributed to the authenticated user
app.post('/api/projects', authMiddleware, (req, res) => {
  try {
    const { name, description = '', prompt = '' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Project name is required' });
    }

    const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const project = ProjectModel.create({
      id,
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      owner_id: req.user.id
    });

    // If initial prompt provided, save as initial user message
    if (prompt && prompt.trim()) {
      MessageModel.add(id, 'user', prompt.trim());
    }

    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single project with files, versions, and messages (Ownership verified)
app.get('/api/projects/:id', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const project = req.project;
    const files = FileModel.getByProject(project.id);
    const messages = MessageModel.getByProject(project.id);
    const runtimeStatus = RuntimeManager.getStatus(project.id);

    res.json({
      success: true,
      project,
      files,
      messages,
      runtimeStatus
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update project metadata
app.patch('/api/projects/:id', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { name, description } = req.body;
    const project = ProjectModel.update(req.params.id, { name, description });
    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete project
app.delete('/api/projects/:id', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    RuntimeManager.stop(req.params.id);
    ProjectModel.delete(req.params.id);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Files API (Ownership Verified & Auto-Versioning)
// -------------------------------------------------------------

// Save / update a file with security checks and automatic version history
app.post('/api/projects/:id/files', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { path: filePath, content } = req.body;

    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.valid) {
      return res.status(400).json({ success: false, error: pathCheck.error });
    }

    const contentCheck = validateFileContent(content);
    if (!contentCheck.valid) {
      return res.status(400).json({ success: false, error: contentCheck.error });
    }

    const file = FileModel.save(req.project.id, pathCheck.cleanPath, contentCheck.cleanContent);
    const versions = FileModel.getVersions(req.project.id, pathCheck.cleanPath);

    res.json({
      success: true,
      file,
      versionCount: versions.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a file
app.delete('/api/projects/:id/files', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path query is required' });
    }

    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.valid) {
      return res.status(400).json({ success: false, error: pathCheck.error });
    }

    FileModel.delete(req.project.id, pathCheck.cleanPath);
    res.json({ success: true, message: 'File deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Retrieve version history for a file
app.get('/api/projects/:id/files/versions', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ success: false, error: 'File path query is required' });

    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.valid) return res.status(400).json({ success: false, error: pathCheck.error });

    const versions = FileModel.getVersions(req.project.id, pathCheck.cleanPath);
    res.json({ success: true, path: pathCheck.cleanPath, versions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Revert file to a previous snapshot
app.post('/api/projects/:id/files/revert', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { path: filePath, versionId } = req.body;
    if (!filePath || !versionId) {
      return res.status(400).json({ success: false, error: 'File path and versionId are required' });
    }

    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.valid) return res.status(400).json({ success: false, error: pathCheck.error });

    const restoredFile = FileModel.revertToVersion(req.project.id, pathCheck.cleanPath, versionId);
    res.json({ success: true, file: restoredFile, message: 'File reverted to previous snapshot' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Project Version History, Restore & Export API
// -------------------------------------------------------------

// List all project versions
app.get('/api/projects/:id/versions', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const versions = VersionService.getVersions(req.project.id);
    res.json({ success: true, versions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create manual project version snapshot
app.post('/api/projects/:id/versions', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { summary = 'Manual project snapshot' } = req.body;
    const version = VersionService.createVersion(req.project.id, {
      userId: req.user.id,
      user: req.user,
      summary: (summary && summary.trim()) ? summary.trim() : 'Manual project snapshot',
      source: 'manual'
    });
    res.status(201).json({ success: true, version });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Get single project version details with files
app.get('/api/projects/:id/versions/:versionId', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const version = VersionService.getVersionById(req.params.versionId);
    if (version.project_id !== req.project.id) {
      return res.status(403).json({ success: false, error: 'Forbidden: Version belongs to a different project.' });
    }
    res.json({ success: true, version });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Restore project to an earlier version atomically with safety checkpoint
app.post('/api/projects/:id/versions/:versionId/restore', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const result = await VersionService.restoreVersion(req.project.id, req.params.versionId, {
      userId: req.user.id,
      user: req.user
    });
    res.json({
      success: true,
      message: `Project successfully restored to Version #${result.versionNumber}`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export project files as a secure ZIP archive
app.get('/api/projects/:id/export/zip', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const exportResult = zipExporter.exportProject(req.project.id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
    res.setHeader('Content-Length', exportResult.totalBytes);
    res.send(exportResult.buffer);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// Isolated Runtime & Preview Session API
// -------------------------------------------------------------

// Get runtime status and health info
app.get('/api/projects/:id/preview/status', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const status = RuntimeManager.getStatus(req.project.id);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start preview session (validates files, builds bundle, starts health-check timer)
app.post('/api/projects/:id/preview/start', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const result = await RuntimeManager.start(req.project.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop preview session
app.post('/api/projects/:id/preview/stop', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const result = RuntimeManager.stop(req.project.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restart preview session
app.post('/api/projects/:id/preview/restart', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const result = await RuntimeManager.restart(req.project.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get session logs (build events, console logs, errors)
app.get('/api/projects/:id/preview/logs', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const logs = RuntimeManager.getLogs(req.project.id);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear session logs
app.delete('/api/projects/:id/preview/logs', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const result = RuntimeManager.clearLogs(req.project.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check heartbeat from the running client iframe
app.post('/api/projects/:id/preview/heartbeat', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const result = RuntimeManager.recordHeartbeat(req.project.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Relay console logs from the running client iframe
app.post('/api/projects/:id/preview/log', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { level, args } = req.body;
    RuntimeManager.recordClientLog(req.project.id, level, args);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// AI Debugging & Automatic Repair Agent API
// -------------------------------------------------------------

// List all diagnostics for project
app.get('/api/projects/:id/diagnostics', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const diagnostics = DiagnosticModel.getByProject(req.project.id);
    res.json({ success: true, diagnostics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Report a runtime diagnostic
app.post('/api/projects/:id/diagnostics', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { type, message, file_path, line_number, col_number, stack_trace } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

    const diagnostic = DiagnosticModel.add(req.project.id, {
      type: type || 'runtime_error',
      message,
      file_path,
      line_number,
      col_number,
      stack_trace
    });
    res.status(201).json({ success: true, diagnostic });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear diagnostics
app.delete('/api/projects/:id/diagnostics', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    DiagnosticModel.clearForProject(req.project.id);
    res.json({ success: true, message: 'Diagnostics cleared' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Request AI Diagnosis & Proposed Patch
app.post('/api/projects/:id/debug/diagnose', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const quotaCheck = checkQuota(req.user, 'diagnose_repair');
    if (!quotaCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: quotaCheck.error,
        message: quotaCheck.message,
        quota: quotaCheck.status
      });
    }

    const { diagnosticId } = req.body;
    const result = await RepairService.diagnose({
      projectId: req.project.id,
      diagnosticId,
      userId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Apply an approved repair fix (Creates checkpoint, applies changes, triggers retest)
app.post('/api/projects/:id/debug/apply', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const { proposalId } = req.body;
    if (!proposalId) return res.status(400).json({ success: false, error: 'proposalId is required' });

    const result = await RepairService.applyRepair({
      projectId: req.project.id,
      proposalId,
      userId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Roll back to a checkpoint
app.post('/api/projects/:id/debug/rollback', authMiddleware, verifyProjectOwner, async (req, res) => {
  try {
    const { checkpointId } = req.body;
    if (!checkpointId) return res.status(400).json({ success: false, error: 'checkpointId is required' });

    const result = await RepairService.rollback({
      projectId: req.project.id,
      checkpointId,
      userId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reject a proposed repair fix
app.post('/api/projects/:id/debug/reject', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const { proposalId } = req.body;
    if (!proposalId) return res.status(400).json({ success: false, error: 'proposalId is required' });

    const result = RepairService.rejectRepair({
      projectId: req.project.id,
      proposalId,
      userId: req.user.id
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// List checkpoints for project
app.get('/api/projects/:id/checkpoints', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const checkpoints = CheckpointModel.getByProject(req.project.id);
    res.json({ success: true, checkpoints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// View repair audit log
app.get('/api/projects/:id/debug/audit', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const auditLogs = RepairAuditModel.getByProject(req.project.id);
    res.json({ success: true, auditLogs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Sandboxed Runnable Bundle Endpoint (With CSP & Parent-Bridge)
app.get('/api/projects/:id/bundle', authMiddleware, verifyProjectOwner, (req, res) => {
  try {
    const project = req.project;
    const files = FileModel.getByProject(project.id);
    const htmlFile = files.find(f => f.path.toLowerCase() === 'index.html');

    if (!htmlFile) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>No index.html</title></head>
        <body style="font-family: sans-serif; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; background:#0b0c0e; color:#94a3b8; text-align:center;">
          <div style="max-width:400px; padding:24px;">
            <div style="font-size:28px; margin-bottom:12px;">⚠️</div>
            <h2 style="color:#f8fafc; margin-bottom:8px; font-size:18px;">No runnable index.html found</h2>
            <p style="font-size:13px; line-height:1.5;">Create an index.html file in the code editor or generate one using AI.</p>
          </div>
        </body>
        </html>
      `);
    }

    let bundledHtml = htmlFile.content;

    // Inject styles.css inline if present
    const cssFile = files.find(f => f.path.toLowerCase() === 'styles.css' || f.path.toLowerCase() === 'style.css');
    if (cssFile && cssFile.content) {
      const styleBlock = `<style data-injected="styles.css">\n${cssFile.content}\n</style>`;
      if (bundledHtml.includes('</head>')) {
        bundledHtml = bundledHtml.replace('</head>', `${styleBlock}\n</head>`);
      } else {
        bundledHtml = `${styleBlock}\n` + bundledHtml;
      }
    }

    // Prepare Parent Bridge Script: captures console logs, unhandled errors, and signals health readiness
    const bridgeScript = `
<script data-buildai-bridge="true">
  (function() {
    function safeStringify(item) {
      if (item === null) return 'null';
      if (item === undefined) return 'undefined';
      if (typeof item === 'object') {
        try { return JSON.stringify(item); } catch (e) { return String(item); }
      }
      return String(item);
    }

    function relay(level, args) {
      try {
        var strArgs = Array.prototype.slice.call(args).map(safeStringify);
        window.parent.postMessage({
          type: 'buildai:console',
          level: level,
          args: strArgs
        }, '*');
      } catch (err) {}
    }

    var origLog = console.log;
    var origWarn = console.warn;
    var origError = console.error;
    var origInfo = console.info;

    console.log = function() { relay('log', arguments); if (origLog) origLog.apply(console, arguments); };
    console.warn = function() { relay('warn', arguments); if (origWarn) origWarn.apply(console, arguments); };
    console.error = function() { relay('error', arguments); if (origError) origError.apply(console, arguments); };
    console.info = function() { relay('info', arguments); if (origInfo) origInfo.apply(console, arguments); };

    window.addEventListener('error', function(event) {
      relay('error', ['[Uncaught Error] ' + (event.message || 'Script error') + (event.filename ? ' at ' + event.filename + ':' + event.lineno : '')]);
    });

    function signalReady() {
      try {
        window.parent.postMessage({ type: 'buildai:ready', timestamp: Date.now() }, '*');
      } catch (e) {}
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(signalReady, 100);
    } else {
      window.addEventListener('DOMContentLoaded', function() { setTimeout(signalReady, 100); });
      window.addEventListener('load', function() { setTimeout(signalReady, 150); });
    }
  })();
</script>
`;

    // Inject app.js inline if present
    const jsFile = files.find(f => f.path.toLowerCase() === 'app.js' || f.path.toLowerCase() === 'script.js' || f.path.toLowerCase() === 'main.js');
    let jsBlock = '';
    if (jsFile && jsFile.content) {
      jsBlock = `<script data-injected="app.js">\n${jsFile.content}\n</script>`;
    }

    if (bundledHtml.includes('</body>')) {
      bundledHtml = bundledHtml.replace('</body>', `${bridgeScript}\n${jsBlock}\n</body>`);
    } else {
      bundledHtml = bundledHtml + `\n${bridgeScript}\n${jsBlock}`;
    }

    // Set Restrictive Content-Security-Policy:
    // Allows needed styles, scripts, fonts, and inline execution, but strictly restricts connect-src
    // to prevent access to cloud metadata services (e.g. 169.254.169.254) and internal networks.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
      "connect-src 'self' data: https:; " +
      "frame-ancestors 'self'; " +
      "block-all-mixed-content;"
    );

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(bundledHtml);
  } catch (err) {
    res.status(500).send(`Server Error: ${err.message}`);
  }
});

// -------------------------------------------------------------
// Real AI Generation Streaming (Ownership Verified)
// -------------------------------------------------------------

// Generate initial project files
app.post('/api/projects/:id/generate', authMiddleware, verifyProjectOwner, async (req, res) => {
  const { prompt } = req.body;
  const projectId = req.params.id;
  const project = req.project;

  // Pre-flight Quota & Rate Limit Check
  const quotaCheck = checkQuota(req.user, 'generate');
  if (!quotaCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: quotaCheck.error,
      message: quotaCheck.message,
      quota: quotaCheck.status
    });
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const aiStatus = getAIStatus();
    if (!aiStatus.configured) {
      const msg = 'AI generation is not configured. Please add GEMINI_API_KEY (recommended free tier from https://aistudio.google.com), ANTHROPIC_API_KEY, or OPENAI_API_KEY to your .env file.';
      MessageModel.add(projectId, 'system', `⚠️ ${msg}`);
      sendEvent('error', { error: 'AI_NOT_CONFIGURED', message: msg });
      res.end();
      return;
    }

    sendEvent('status', { message: `Connected to ${aiStatus.activeProvider.toUpperCase()}. Synthesizing source code...` });

    const { files, fullResponse } = await generateFiles({
      prompt: prompt || project.prompt,
      onToken: (token) => {
        sendEvent('token', { token });
      }
    });

    // Persist real generated files to SQLite database
    for (const f of files) {
      FileModel.save(projectId, f.path, f.content);
    }

    // Record initial project version in version history
    try {
      VersionService.createVersion(projectId, {
        userId: req.user.id,
        user: req.user,
        summary: `AI Initial Generation: ${(prompt || project.prompt || 'Synthesized application').substring(0, 80)}`,
        source: 'ai_generation'
      });
    } catch (verErr) {
      console.warn('[VersionService] Failed to record generation version:', verErr.message);
    }

    // Record AI Usage Metering & Token Consumption
    try {
      recordOperationUsage({
        userId: req.user.id,
        projectId,
        operation: 'generate',
        provider: aiStatus.activeProvider || 'gemini',
        model: 'gemini-2.5-flash',
        promptText: prompt || project.prompt || '',
        outputText: fullResponse || files.map(f => f.content).join('\n')
      });
    } catch (usageErr) {
      console.warn('[UsageMetering] Failed to record generation usage:', usageErr.message);
    }

    // Persist assistant message
    MessageModel.add(projectId, 'assistant', `Generated ${files.length} files: ${files.map(f => f.path).join(', ')}.`);

    sendEvent('done', {
      files: FileModel.getByProject(projectId),
      summary: `Successfully generated ${files.length} project files.`
    });
    res.end();

  } catch (err) {
    console.error('Generation Error:', err);
    sendEvent('error', { error: err.message });
    res.end();
  }
});

// Chat-based iteration on existing project
app.post('/api/projects/:id/chat', authMiddleware, verifyProjectOwner, async (req, res) => {
  const { message } = req.body;
  const projectId = req.params.id;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Pre-flight Quota & Rate Limit Check
  const quotaCheck = checkQuota(req.user, 'chat_edit');
  if (!quotaCheck.allowed) {
    return res.status(429).json({
      success: false,
      error: quotaCheck.error,
      message: quotaCheck.message,
      quota: quotaCheck.status
    });
  }

  // Save user instruction
  MessageModel.add(projectId, 'user', message.trim());

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    const aiStatus = getAIStatus();
    if (!aiStatus.configured) {
      const msg = 'AI generation is not configured. Please add GEMINI_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to your .env file.';
      MessageModel.add(projectId, 'system', `⚠️ ${msg}`);
      sendEvent('error', { error: 'AI_NOT_CONFIGURED', message: msg });
      res.end();
      return;
    }

    const currentFiles = FileModel.getByProject(projectId);
    const chatHistory = MessageModel.getByProject(projectId);

    sendEvent('status', { message: `Planning updates with ${aiStatus.activeProvider.toUpperCase()}...` });

    const { updatedFiles, fullResponse } = await editFiles({
      instruction: message,
      currentFiles,
      chatHistory,
      onToken: (token) => {
        sendEvent('token', { token });
      }
    });

    // Save updated files
    for (const f of updatedFiles) {
      FileModel.save(projectId, f.path, f.content);
    }

    // Record project version for chat iteration
    try {
      VersionService.createVersion(projectId, {
        userId: req.user.id,
        user: req.user,
        summary: `AI Chat: ${message.substring(0, 80)}`,
        source: 'ai_chat'
      });
    } catch (verErr) {
      console.warn('[VersionService] Failed to record chat version:', verErr.message);
    }

    // Record AI Usage Metering & Token Consumption
    try {
      recordOperationUsage({
        userId: req.user.id,
        projectId,
        operation: 'chat_edit',
        provider: aiStatus.activeProvider || 'gemini',
        model: 'gemini-2.5-flash',
        promptText: message,
        outputText: fullResponse || updatedFiles.map(f => f.content).join('\n')
      });
    } catch (usageErr) {
      console.warn('[UsageMetering] Failed to record chat usage:', usageErr.message);
    }

    MessageModel.add(projectId, 'assistant', `Updated ${updatedFiles.length} file(s): ${updatedFiles.map(f => f.path).join(', ')}.`);

    sendEvent('done', {
      updatedFiles,
      allFiles: FileModel.getByProject(projectId),
      summary: `Applied updates to ${updatedFiles.length} file(s).`
    });
    res.end();

  } catch (err) {
    console.error('Chat Iteration Error:', err);
    sendEvent('error', { error: err.message });
    res.end();
  }
});

// Single Page Application Fallback
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 BuildAI Server running at http://localhost:${PORT}`);
  const status = getAIStatus();
  if (status.configured) {
    console.log(`✨ AI Provider configured: ${status.activeProvider.toUpperCase()}`);
  } else {
    console.log(`⚠️ AI Provider is NOT configured (add GEMINI_API_KEY to .env). No fake results will be generated.`);
  }
});
