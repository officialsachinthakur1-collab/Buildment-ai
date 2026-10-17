// server/db.js — Persistent SQLite Storage using Node.js Native node:sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'buildai.sqlite');
const db = new DatabaseSync(dbPath);

// Initialize schema with foreign keys
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT,
    token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    prompt TEXT DEFAULT '',
    owner_id TEXT DEFAULT 'usr_default',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(project_id, path)
  );

  CREATE TABLE IF NOT EXISTS file_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS preview_sessions (
    project_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'stopped',
    started_at DATETIME,
    stopped_at DATETIME,
    last_health_check DATETIME,
    error_message TEXT,
    logs TEXT DEFAULT '[]',
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS diagnostics (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'build_error', 'runtime_error', 'compiler_diagnostic', 'health_check_timeout'
    message TEXT NOT NULL,
    file_path TEXT,
    line_number INTEGER,
    col_number INTEGER,
    stack_trace TEXT,
    status TEXT DEFAULT 'unresolved', -- 'unresolved', 'diagnosing', 'fixed', 'dismissed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS checkpoints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    description TEXT NOT NULL,
    snapshot_json TEXT NOT NULL, -- JSON array of [{ path, content }]
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS repair_proposals (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    diagnostic_id TEXT,
    diagnosis TEXT NOT NULL,
    root_cause TEXT,
    reasoning TEXT,
    diff_summary TEXT,
    changes_json TEXT NOT NULL, -- JSON array of [{ path, oldContent, newContent, diff }]
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'rolled_back'
    checkpoint_id TEXT,
    attempt_number INTEGER DEFAULT 1,
    retest_status TEXT, -- 'pending', 'passed', 'failed'
    retest_logs TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(diagnostic_id) REFERENCES diagnostics(id) ON DELETE SET NULL,
    FOREIGN KEY(checkpoint_id) REFERENCES checkpoints(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS repair_audit (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    repair_proposal_id TEXT,
    action TEXT NOT NULL, -- 'applied', 'rejected', 'rolled_back'
    user_id TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT,
    version_number INTEGER NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual', -- 'manual', 'ai_generation', 'ai_chat', 'ai_repair', 'pre_restore'
    snapshot_json TEXT NOT NULL,          -- JSON array of [{ path, content }]
    git_commit_hash TEXT,
    file_count INTEGER NOT NULL DEFAULT 0,
    total_bytes INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_agent TEXT,
    ip_address TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    operation TEXT NOT NULL, -- 'generate' | 'chat_edit' | 'diagnose_repair'
    provider TEXT NOT NULL,  -- 'gemini' | 'openai' | 'anthropic'
    model TEXT NOT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_usage_user_date ON ai_usage_logs(user_id, created_at);
`);

// Migration safety: Ensure owner_id column exists on existing projects table
try {
  const projectCols = db.prepare("PRAGMA table_info(projects)").all();
  if (!projectCols.some(col => col.name === 'owner_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN owner_id TEXT DEFAULT 'usr_default';`);
  }
} catch (err) {
  // Column already present or migration skipped
}

// Migration safety: Ensure password, plan tier, and security columns exist on users table
try {
  const userCols = db.prepare("PRAGMA table_info(users)").all();
  if (!userCols.some(col => col.name === 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT;`);
  }
  if (!userCols.some(col => col.name === 'needs_password_migration')) {
    db.exec(`ALTER TABLE users ADD COLUMN needs_password_migration INTEGER DEFAULT 0;`);
  }
  if (!userCols.some(col => col.name === 'password_updated_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_updated_at DATETIME;`);
  }
  if (!userCols.some(col => col.name === 'failed_login_attempts')) {
    db.exec(`ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;`);
  }
  if (!userCols.some(col => col.name === 'lockout_until')) {
    db.exec(`ALTER TABLE users ADD COLUMN lockout_until DATETIME;`);
  }
  if (!userCols.some(col => col.name === 'plan_tier')) {
    db.exec(`ALTER TABLE users ADD COLUMN plan_tier TEXT DEFAULT 'free';`);
  }
  if (!userCols.some(col => col.name === 'custom_daily_quota')) {
    db.exec(`ALTER TABLE users ADD COLUMN custom_daily_quota INTEGER;`);
  }

  // Mark existing accounts without password_hash as needing migration
  db.exec(`UPDATE users SET needs_password_migration = 1 WHERE password_hash IS NULL;`);
} catch (err) {
  // Migration skipped or columns exist
}

// ---------------------------------------------------------------------------
// Security & Validation Helpers
// ---------------------------------------------------------------------------

function validateFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return { valid: false, error: 'File path is required.' };
  }
  const cleanPath = filePath.trim().replace(/\\/g, '/');

  // Prevent directory traversal and dangerous characters
  if (cleanPath.startsWith('/') || cleanPath.includes('..') || cleanPath.includes('\0')) {
    return { valid: false, error: 'Directory traversal and absolute paths are prohibited.' };
  }

  // Length limit
  if (cleanPath.length > 250) {
    return { valid: false, error: 'File path exceeds maximum limit of 250 characters.' };
  }

  // Allowed characters: alphanumeric, dash, underscore, dot, slash
  if (!/^[a-zA-Z0-9_\-\.\/]+$/.test(cleanPath)) {
    return { valid: false, error: 'File path contains invalid characters. Use letters, numbers, dash, underscore, dot, or slash.' };
  }

  // Disallow hidden files or folder-only paths
  if (cleanPath.endsWith('/') || cleanPath.split('/').some(part => part.startsWith('.'))) {
    return { valid: false, error: 'Invalid file path. Hidden dotfiles and empty filenames are not permitted.' };
  }

  // Allowed file extensions for web applications
  const ext = path.extname(cleanPath).toLowerCase();
  const allowedExtensions = ['.html', '.htm', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.svg', '.md', '.txt'];
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `Disallowed file extension "${ext}". Supported types: ${allowedExtensions.join(', ')}` };
  }

  return { valid: true, cleanPath };
}

function validateFileContent(content) {
  if (content === null || content === undefined) {
    return { valid: true, cleanContent: '', byteLength: 0 };
  }
  if (typeof content !== 'string') {
    return { valid: false, error: 'File content must be a text string.' };
  }
  const byteLength = Buffer.byteLength(content, 'utf8');
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB limit per file
  if (byteLength > MAX_FILE_SIZE) {
    return { valid: false, error: `File content exceeds maximum limit of 2MB (${(byteLength / (1024 * 1024)).toFixed(2)}MB).` };
  }
  return { valid: true, cleanContent: content, byteLength };
}

// ---------------------------------------------------------------------------
// UserModel
// ---------------------------------------------------------------------------
const UserModel = {
  sanitize(user) {
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      plan_tier: user.plan_tier || 'free',
      custom_daily_quota: user.custom_daily_quota || null,
      needs_password_migration: Boolean(user.needs_password_migration),
      created_at: user.created_at,
      password_updated_at: user.password_updated_at
    };
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
    return stmt.get(id);
  },

  findById(id) {
    return this.getById(id);
  },

  getByToken(token) {
    if (!token) return null;
    const stmt = db.prepare(`SELECT * FROM users WHERE token = ?`);
    return stmt.get(token);
  },

  getByUsernameOrEmail(identifier) {
    if (!identifier || typeof identifier !== 'string') return null;
    const clean = identifier.trim().toLowerCase();
    const stmt = db.prepare(`SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?`);
    return stmt.get(clean, clean);
  },

  create({ id, username, email = null, passwordHash = null, needsPasswordMigration = 0, token = null }) {
    const userId = id || `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const legacyToken = token || crypto.randomBytes(32).toString('hex');
    const needsMigration = passwordHash ? 0 : (needsPasswordMigration !== undefined ? needsPasswordMigration : 1);
    const passwordUpdatedAt = passwordHash ? new Date().toISOString() : null;

    const stmt = db.prepare(`
      INSERT INTO users (id, username, email, token, password_hash, needs_password_migration, password_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(userId, username, email, legacyToken, passwordHash, needsMigration, passwordUpdatedAt);
    return this.getById(userId);
  },

  setPassword(userId, passwordHash) {
    const stmt = db.prepare(`
      UPDATE users 
      SET password_hash = ?, 
          needs_password_migration = 0, 
          password_updated_at = CURRENT_TIMESTAMP,
          failed_login_attempts = 0,
          lockout_until = NULL
      WHERE id = ?
    `);
    stmt.run(passwordHash, userId);
    return this.getById(userId);
  },

  recordFailedLogin(userId) {
    const user = this.getById(userId);
    if (!user) return;
    const attempts = (user.failed_login_attempts || 0) + 1;
    let lockout = null;
    if (attempts >= 5) {
      lockout = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    }
    db.prepare(`UPDATE users SET failed_login_attempts = ?, lockout_until = ? WHERE id = ?`).run(attempts, lockout, userId);
  },

  resetFailedLogins(userId) {
    db.prepare(`UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?`).run(userId);
  },

  setPlanTier(userId, tier) {
    db.prepare(`UPDATE users SET plan_tier = ? WHERE id = ?`).run(tier, userId);
    return this.getById(userId);
  },

  setCustomQuota(userId, quota) {
    db.prepare(`UPDATE users SET custom_daily_quota = ? WHERE id = ?`).run(quota, userId);
    return this.getById(userId);
  },

  getOrCreateDefault() {
    let defaultUser = this.getById('usr_default');
    if (!defaultUser) {
      defaultUser = this.create({
        id: 'usr_default',
        username: 'Developer',
        email: 'developer@buildai.local',
        token: 'dev_token_buildai_local_session',
        needsPasswordMigration: 1
      });
    }
    return defaultUser;
  }
};

// Ensure default user exists
UserModel.getOrCreateDefault();

// ---------------------------------------------------------------------------
// SessionModel (Secure Hashed Tokens & Rotation)
// ---------------------------------------------------------------------------
const SessionModel = {
  hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  },

  createSession(userId, { userAgent = '', ipAddress = '', expiresInDays = 7 } = {}) {
    const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at, user_agent, ip_address, created_at, last_active)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(sessionId, userId, tokenHash, expiresAt, userAgent, ipAddress);

    return {
      sessionId,
      userId,
      rawToken,
      expiresAt
    };
  },

  validateSession(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') return null;
    const tokenHash = this.hashToken(rawToken);

    // 1. Check in sessions table
    const stmt = db.prepare(`
      SELECT s.*, u.id as user_id, u.username, u.email, u.password_hash, u.needs_password_migration, u.created_at as user_created_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND datetime(s.expires_at) > datetime('now')
    `);
    const result = stmt.get(tokenHash);
    if (result) {
      // Touch last_active
      db.prepare(`UPDATE sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?`).run(result.id);
      return {
        session: {
          id: result.id,
          expires_at: result.expires_at,
          last_active: result.last_active
        },
        user: {
          id: result.user_id,
          username: result.username,
          email: result.email,
          needs_password_migration: Boolean(result.needs_password_migration),
          created_at: result.user_created_at
        },
        rawToken
      };
    }

    // 2. Legacy fallback & auto-upgrade
    const legacyUser = UserModel.getByToken(rawToken);
    if (legacyUser && !rawToken.startsWith('revoked_')) {
      const newSession = this.createSession(legacyUser.id, { userAgent: 'legacy-token-upgrade' });
      db.prepare(`UPDATE users SET token = ? WHERE id = ?`).run(
        `revoked_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        legacyUser.id
      );
      return {
        session: {
          id: newSession.sessionId,
          expires_at: newSession.expiresAt
        },
        user: UserModel.sanitize(legacyUser),
        rawToken: newSession.rawToken
      };
    }

    return null;
  },

  rotateSession(userId, oldRawToken, metadata = {}) {
    if (oldRawToken) {
      this.invalidateSession(oldRawToken);
    }
    if (userId) {
      db.prepare(`UPDATE users SET token = ? WHERE id = ?`).run(
        `revoked_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        userId
      );
    }
    return this.createSession(userId, metadata);
  },

  invalidateSession(rawToken) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash);
    db.prepare(`UPDATE users SET token = ? WHERE token = ?`).run(
      `revoked_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      rawToken
    );
  },

  invalidateAllForUser(userId) {
    if (!userId) return;
    db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    db.prepare(`UPDATE users SET token = ? WHERE id = ?`).run(
      `revoked_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      userId
    );
  },

  cleanExpired() {
    db.prepare(`DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')`).run();
  }
};

// ---------------------------------------------------------------------------
// UsageModel (Token Quota & Usage Tracking)
// ---------------------------------------------------------------------------
const UsageModel = {
  recordUsage({ userId, projectId = null, operation, provider, model, promptTokens = 0, completionTokens = 0, totalTokens = null }) {
    const usageId = `use_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const calculatedTotal = totalTokens !== null ? totalTokens : (promptTokens + completionTokens);

    const stmt = db.prepare(`
      INSERT INTO ai_usage_logs (id, user_id, project_id, operation, provider, model, prompt_tokens, completion_tokens, total_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(usageId, userId, projectId, operation, provider, model, promptTokens, completionTokens, calculatedTotal);
    return this.getById(usageId);
  },

  getById(id) {
    return db.prepare(`SELECT * FROM ai_usage_logs WHERE id = ?`).get(id);
  },

  getTodayUsage(userId) {
    const stmt = db.prepare(`
      SELECT 
        COUNT(*) as total_operations,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(CASE WHEN operation = 'generate' THEN 1 ELSE 0 END), 0) as generations_today,
        COALESCE(SUM(CASE WHEN operation = 'chat_edit' THEN 1 ELSE 0 END), 0) as edits_today,
        COALESCE(SUM(CASE WHEN operation = 'diagnose_repair' THEN 1 ELSE 0 END), 0) as repairs_today
      FROM ai_usage_logs
      WHERE user_id = ? AND date(created_at) = date('now')
    `);
    return stmt.get(userId);
  },

  getRecentLogs(userId, limit = 20) {
    const stmt = db.prepare(`
      SELECT * FROM ai_usage_logs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(userId, limit);
  }
};

// ---------------------------------------------------------------------------
// ProjectModel (Strict User Scoping & Isolation)
// ---------------------------------------------------------------------------
const ProjectModel = {
  getAllForUser(userId) {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        COUNT(f.id) as file_count,
        (SELECT COUNT(m.id) FROM messages m WHERE m.project_id = p.id) as message_count
      FROM projects p
      LEFT JOIN files f ON f.project_id = p.id
      WHERE p.owner_id = ?
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);
    return stmt.all(userId);
  },

  getAll() {
    const stmt = db.prepare(`
      SELECT 
        p.*, 
        COUNT(f.id) as file_count,
        (SELECT COUNT(m.id) FROM messages m WHERE m.project_id = p.id) as message_count
      FROM projects p
      LEFT JOIN files f ON f.project_id = p.id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);
    return stmt.all();
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM projects WHERE id = ?`);
    return stmt.get(id);
  },

  create({ id, name, description = '', prompt = '', owner_id = 'usr_default' }) {
    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description, prompt, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, name, description, prompt, owner_id);
    return this.getById(id);
  },

  update(id, { name, description }) {
    const stmt = db.prepare(`
      UPDATE projects 
      SET name = COALESCE(?, name), 
          description = COALESCE(?, description),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name || null, description || null, id);
    return this.getById(id);
  },

  touch(id) {
    const stmt = db.prepare(`UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
    stmt.run(id);
  },

  delete(id) {
    const stmt = db.prepare(`DELETE FROM projects WHERE id = ?`);
    stmt.run(id);
  }
};

// ---------------------------------------------------------------------------
// FileModel with Auto-Versioning and Validation
// ---------------------------------------------------------------------------
const FileModel = {
  getByProject(projectId) {
    const stmt = db.prepare(`SELECT * FROM files WHERE project_id = ? ORDER BY path ASC`);
    return stmt.all(projectId);
  },

  getFile(projectId, filePath) {
    const stmt = db.prepare(`SELECT * FROM files WHERE project_id = ? AND path = ?`);
    return stmt.get(projectId, filePath);
  },

  save(projectId, filePath, content) {
    const pathCheck = validateFilePath(filePath);
    if (!pathCheck.valid) {
      throw new Error(`Validation Error: ${pathCheck.error}`);
    }
    const cleanPath = pathCheck.cleanPath;

    const contentCheck = validateFileContent(content);
    if (!contentCheck.valid) {
      throw new Error(`Validation Error: ${contentCheck.error}`);
    }
    const cleanContent = contentCheck.cleanContent;

    // Check if previous version exists to preserve history
    const existing = this.getFile(projectId, cleanPath);
    if (existing && existing.content !== cleanContent) {
      const countStmt = db.prepare(`SELECT COUNT(*) as count FROM file_versions WHERE project_id = ? AND path = ?`);
      const countRow = countStmt.get(projectId, cleanPath);
      const nextVersion = (countRow ? countRow.count : 0) + 1;

      const verId = `ver_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const verStmt = db.prepare(`
        INSERT INTO file_versions (id, project_id, path, content, version_number, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      verStmt.run(verId, projectId, cleanPath, existing.content, nextVersion);
    }

    const id = `${projectId}:${cleanPath}`;
    const stmt = db.prepare(`
      INSERT INTO files (id, project_id, path, content, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id, path) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(id, projectId, cleanPath, cleanContent);
    ProjectModel.touch(projectId);
    return this.getFile(projectId, cleanPath);
  },

  getVersions(projectId, filePath) {
    const stmt = db.prepare(`
      SELECT id, project_id, path, version_number, created_at, length(content) as byte_size
      FROM file_versions 
      WHERE project_id = ? AND path = ? 
      ORDER BY version_number DESC
    `);
    return stmt.all(projectId, filePath);
  },

  getVersionContent(versionId) {
    const stmt = db.prepare(`SELECT * FROM file_versions WHERE id = ?`);
    return stmt.get(versionId);
  },

  revertToVersion(projectId, filePath, versionId) {
    const version = this.getVersionContent(versionId);
    if (!version || version.project_id !== projectId || version.path !== filePath) {
      throw new Error('Version snapshot not found or mismatched file');
    }
    return this.save(projectId, filePath, version.content);
  },

  delete(projectId, filePath) {
    const stmt = db.prepare(`DELETE FROM files WHERE project_id = ? AND path = ?`);
    stmt.run(projectId, filePath);
    const verStmt = db.prepare(`DELETE FROM file_versions WHERE project_id = ? AND path = ?`);
    verStmt.run(projectId, filePath);
    ProjectModel.touch(projectId);
  }
};

// ---------------------------------------------------------------------------
// MessageModel
// ---------------------------------------------------------------------------
const MessageModel = {
  getByProject(projectId) {
    const stmt = db.prepare(`SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC`);
    return stmt.all(projectId);
  },

  add(projectId, role, content) {
    const id = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const stmt = db.prepare(`
      INSERT INTO messages (id, project_id, role, content, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, projectId, role, content);
    ProjectModel.touch(projectId);
    return { id, project_id: projectId, role, content, created_at: new Date().toISOString() };
  }
};

// ---------------------------------------------------------------------------
// PreviewSessionModel
// ---------------------------------------------------------------------------
const PreviewSessionModel = {
  get(projectId) {
    const stmt = db.prepare(`SELECT * FROM preview_sessions WHERE project_id = ?`);
    const row = stmt.get(projectId);
    if (!row) {
      return {
        project_id: projectId,
        status: 'stopped',
        started_at: null,
        stopped_at: null,
        last_health_check: null,
        error_message: null,
        logs: []
      };
    }
    let parsedLogs = [];
    try {
      parsedLogs = JSON.parse(row.logs || '[]');
    } catch (e) {
      parsedLogs = [];
    }
    return {
      ...row,
      logs: parsedLogs
    };
  },

  setStatus(projectId, status, errorMessage = null) {
    const existing = this.get(projectId);
    const now = new Date().toISOString();
    let startedAt = existing.started_at;
    let stoppedAt = existing.stopped_at;

    if (status === 'starting' || status === 'queued') {
      startedAt = now;
      stoppedAt = null;
    } else if (status === 'stopped' || status === 'failed') {
      stoppedAt = now;
    }

    const stmt = db.prepare(`
      INSERT INTO preview_sessions (project_id, status, started_at, stopped_at, error_message, logs)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        status = excluded.status,
        started_at = excluded.started_at,
        stopped_at = excluded.stopped_at,
        error_message = excluded.error_message
    `);
    stmt.run(projectId, status, startedAt, stoppedAt, errorMessage, JSON.stringify(existing.logs || []));
    return this.get(projectId);
  },

  recordHealthCheck(projectId) {
    const stmt = db.prepare(`
      UPDATE preview_sessions 
      SET last_health_check = CURRENT_TIMESTAMP,
          status = 'running',
          error_message = null
      WHERE project_id = ?
    `);
    stmt.run(projectId);
    return this.get(projectId);
  },

  addLog(projectId, level, message) {
    const session = this.get(projectId);
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level || 'info', // 'build', 'info', 'warn', 'error', 'console'
      message: typeof message === 'string' ? message : JSON.stringify(message)
    };
    const logs = (session.logs || []).slice(-199); // Retain last 200 logs
    logs.push(logEntry);

    const stmt = db.prepare(`
      INSERT INTO preview_sessions (project_id, status, logs)
      VALUES (?, 'stopped', ?)
      ON CONFLICT(project_id) DO UPDATE SET
        logs = excluded.logs
    `);
    stmt.run(projectId, JSON.stringify(logs));
    return logEntry;
  },

  clearLogs(projectId) {
    const stmt = db.prepare(`UPDATE preview_sessions SET logs = '[]' WHERE project_id = ?`);
    stmt.run(projectId);
  }
};

// ---------------------------------------------------------------------------
// DiagnosticModel (Error Collection & Tracking)
// ---------------------------------------------------------------------------
const DiagnosticModel = {
  add(projectId, { type, message, file_path = null, line_number = null, col_number = null, stack_trace = null }) {
    const id = `diag_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const stmt = db.prepare(`
      INSERT INTO diagnostics (id, project_id, type, message, file_path, line_number, col_number, stack_trace, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unresolved', CURRENT_TIMESTAMP)
    `);
    stmt.run(id, projectId, type, message, file_path, line_number, col_number, stack_trace);
    return this.getById(id);
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM diagnostics WHERE id = ?`);
    return stmt.get(id);
  },

  getByProject(projectId, limit = 50) {
    const stmt = db.prepare(`SELECT * FROM diagnostics WHERE project_id = ? ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(projectId, limit);
  },

  getLatestUnresolved(projectId) {
    const stmt = db.prepare(`SELECT * FROM diagnostics WHERE project_id = ? AND status = 'unresolved' ORDER BY created_at DESC LIMIT 1`);
    return stmt.get(projectId);
  },

  updateStatus(id, status) {
    const stmt = db.prepare(`UPDATE diagnostics SET status = ? WHERE id = ?`);
    stmt.run(status, id);
    return this.getById(id);
  },

  clearForProject(projectId) {
    const stmt = db.prepare(`DELETE FROM diagnostics WHERE project_id = ?`);
    stmt.run(projectId);
  }
};

// ---------------------------------------------------------------------------
// CheckpointModel (Full Project Snapshot Rollbacks)
// ---------------------------------------------------------------------------
const CheckpointModel = {
  create(projectId, description = 'Pre-repair checkpoint') {
    const id = `ckpt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const files = FileModel.getByProject(projectId);
    const snapshotJson = JSON.stringify(files.map(f => ({ path: f.path, content: f.content })));

    const stmt = db.prepare(`
      INSERT INTO checkpoints (id, project_id, description, snapshot_json, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, projectId, description, snapshotJson);
    return this.getById(id);
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM checkpoints WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    let files = [];
    try {
      files = JSON.parse(row.snapshot_json || '[]');
    } catch (e) {
      files = [];
    }
    return {
      ...row,
      files
    };
  },

  getByProject(projectId) {
    const stmt = db.prepare(`SELECT id, project_id, description, created_at FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC`);
    return stmt.all(projectId);
  },

  restore(checkpointId) {
    const checkpoint = this.getById(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const projectId = checkpoint.project_id;
    const checkpointFiles = checkpoint.files || [];
    const checkpointPathSet = new Set(checkpointFiles.map(f => f.path));

    // Delete files that were created after the checkpoint
    const currentFiles = FileModel.getByProject(projectId);
    for (const f of currentFiles) {
      if (!checkpointPathSet.has(f.path)) {
        FileModel.delete(projectId, f.path);
      }
    }

    // Restore all files from snapshot
    for (const f of checkpointFiles) {
      FileModel.save(projectId, f.path, f.content);
    }

    ProjectModel.touch(projectId);
    return {
      restoredFilesCount: checkpointFiles.length,
      checkpointId
    };
  }
};

// ---------------------------------------------------------------------------
// RepairProposalModel (AI Debug Proposals & Patches)
// ---------------------------------------------------------------------------
const RepairProposalModel = {
  create(projectId, { diagnostic_id = null, diagnosis, root_cause = '', reasoning = '', diff_summary = '', changes_json, attempt_number = 1 }) {
    const id = `rep_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const stmt = db.prepare(`
      INSERT INTO repair_proposals (id, project_id, diagnostic_id, diagnosis, root_cause, reasoning, diff_summary, changes_json, status, attempt_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)
    `);
    const jsonStr = typeof changes_json === 'string' ? changes_json : JSON.stringify(changes_json);
    stmt.run(id, projectId, diagnostic_id, diagnosis, root_cause, reasoning, diff_summary, jsonStr, attempt_number);
    return this.getById(id);
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM repair_proposals WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    let changes = [];
    try {
      changes = JSON.parse(row.changes_json || '[]');
    } catch (e) {
      changes = [];
    }
    return {
      ...row,
      changes
    };
  },

  getByProject(projectId) {
    const stmt = db.prepare(`SELECT * FROM repair_proposals WHERE project_id = ? ORDER BY created_at DESC`);
    const rows = stmt.all(projectId);
    return rows.map(r => {
      let changes = [];
      try { changes = JSON.parse(r.changes_json || '[]'); } catch (e) {}
      return { ...r, changes };
    });
  },

  updateStatus(id, status, { retest_status = null, retest_logs = null, checkpoint_id = null } = {}) {
    const current = this.getById(id);
    if (!current) return null;

    const nextRetestStatus = retest_status !== null ? retest_status : current.retest_status;
    const nextRetestLogs = retest_logs !== null ? retest_logs : current.retest_logs;
    const nextCheckpointId = checkpoint_id !== null ? checkpoint_id : current.checkpoint_id;

    const stmt = db.prepare(`
      UPDATE repair_proposals 
      SET status = ?,
          retest_status = ?,
          retest_logs = ?,
          checkpoint_id = ?
      WHERE id = ?
    `);
    stmt.run(status, nextRetestStatus, nextRetestLogs, nextCheckpointId, id);
    return this.getById(id);
  },

  getRecentAttemptsCount(projectId, minutesWindow = 15) {
    const stmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM repair_proposals 
      WHERE project_id = ? 
        AND created_at >= datetime('now', '-' || ? || ' minutes')
    `);
    const row = stmt.get(projectId, minutesWindow);
    return row ? row.count : 0;
  }
};

// ---------------------------------------------------------------------------
// RepairAuditModel (Audit Trail of Applied Auto-Fixes)
// ---------------------------------------------------------------------------
const RepairAuditModel = {
  log(projectId, { repair_proposal_id = null, action, user_id = null, details = '' }) {
    const id = `audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const stmt = db.prepare(`
      INSERT INTO repair_audit (id, project_id, repair_proposal_id, action, user_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, projectId, repair_proposal_id, action, user_id, details);
    return { id, project_id: projectId, repair_proposal_id, action, user_id, details, created_at: new Date().toISOString() };
  },

  getByProject(projectId) {
    const stmt = db.prepare(`SELECT * FROM repair_audit WHERE project_id = ? ORDER BY created_at DESC`);
    return stmt.all(projectId);
  }
};

// ---------------------------------------------------------------------------
// ProjectVersionModel (Project-Level Snapshots, History & Atomic Restore)
// ---------------------------------------------------------------------------
const ProjectVersionModel = {
  create(projectId, { userId = null, summary = 'Version snapshot', source = 'manual', git_commit_hash = null }) {
    const id = `pver_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const files = FileModel.getByProject(projectId);
    const snapshotJson = JSON.stringify(files.map(f => ({ path: f.path, content: f.content })));
    const fileCount = files.length;
    const totalBytes = files.reduce((acc, f) => acc + Buffer.byteLength(f.content || '', 'utf8'), 0);

    const maxStmt = db.prepare(`SELECT MAX(version_number) as max_v FROM project_versions WHERE project_id = ?`);
    const maxRow = maxStmt.get(projectId);
    const nextVersion = (maxRow?.max_v || 0) + 1;

    const stmt = db.prepare(`
      INSERT INTO project_versions (id, project_id, user_id, version_number, summary, source, snapshot_json, git_commit_hash, file_count, total_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    stmt.run(id, projectId, userId, nextVersion, summary, source, snapshotJson, git_commit_hash, fileCount, totalBytes);
    return this.getById(id);
  },

  getById(id) {
    const stmt = db.prepare(`SELECT * FROM project_versions WHERE id = ?`);
    const row = stmt.get(id);
    if (!row) return null;
    let files = [];
    try {
      files = JSON.parse(row.snapshot_json || '[]');
    } catch (e) {
      files = [];
    }
    return {
      ...row,
      files
    };
  },

  getByProject(projectId) {
    const stmt = db.prepare(`
      SELECT id, project_id, user_id, version_number, summary, source, git_commit_hash, file_count, total_bytes, created_at 
      FROM project_versions 
      WHERE project_id = ? 
      ORDER BY version_number DESC
    `);
    return stmt.all(projectId);
  },

  getLatest(projectId) {
    const stmt = db.prepare(`SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 1`);
    const row = stmt.get(projectId);
    if (!row) return null;
    return this.getById(row.id);
  },

  restore(versionId, userId = null) {
    const target = this.getById(versionId);
    if (!target) {
      throw new Error(`Project version not found: ${versionId}`);
    }

    const projectId = target.project_id;

    // Safety step: Create a pre-restore checkpoint first before making changes
    const preRestoreCheckpoint = CheckpointModel.create(
      projectId,
      `Pre-restore safety checkpoint before reverting to Version #${target.version_number} (${target.id})`
    );

    // Also record a project_version entry for the pre-restore state so it appears in version history
    const preRestoreFiles = FileModel.getByProject(projectId);
    if (preRestoreFiles.length > 0) {
      this.create(projectId, {
        userId,
        summary: `Pre-restore snapshot before reverting to Version #${target.version_number}`,
        source: 'pre_restore'
      });
    }

    const targetFiles = target.files || [];
    const targetPathSet = new Set(targetFiles.map(f => f.path));

    // Execute atomic restore in a database transaction
    db.exec('BEGIN TRANSACTION');
    try {
      // 1. Remove current files that are not in the restored version
      const currentFiles = FileModel.getByProject(projectId);
      for (const cur of currentFiles) {
        if (!targetPathSet.has(cur.path)) {
          FileModel.delete(projectId, cur.path);
        }
      }

      // 2. Overwrite / insert all files from target version
      for (const tf of targetFiles) {
        FileModel.save(projectId, tf.path, tf.content);
      }

      ProjectModel.touch(projectId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Failed to restore project files atomically: ${err.message}`);
    }

    return {
      success: true,
      restoredVersion: target,
      restoredFilesCount: targetFiles.length,
      preRestoreCheckpointId: preRestoreCheckpoint.id
    };
  }
};

module.exports = {
  db,
  validateFilePath,
  validateFileContent,
  UserModel,
  SessionModel,
  UsageModel,
  ProjectModel,
  FileModel,
  MessageModel,
  PreviewSessionModel,
  DiagnosticModel,
  CheckpointModel,
  RepairProposalModel,
  RepairAuditModel,
  ProjectVersionModel
};
