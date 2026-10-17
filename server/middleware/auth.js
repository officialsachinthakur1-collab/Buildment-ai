// server/middleware/auth.js — Authentication and Project Ownership Enforcement
const { SessionModel, ProjectModel } = require('../db');

/**
 * Authentication Middleware:
 * Inspects HttpOnly cookies, x-auth-token, Authorization: Bearer header, and query parameters.
 * Validates session against SQLite hashed sessions table with automatic rotation and expiration checks.
 */
function authMiddleware(req, res, next) {
  // Check cookie, header, or query token
  let token = null;

  if (req.cookies && req.cookies.buildai_session) {
    token = req.cookies.buildai_session;
  }

  if (!token && req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  const authHeader = req.headers['authorization'];
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Authentication required. Please log in or provide an API token.'
    });
  }

  const sessionData = SessionModel.validateSession(token);
  if (!sessionData) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid or expired authentication token.'
    });
  }

  req.user = sessionData.user;
  req.session = sessionData.session;
  req.authToken = sessionData.rawToken;
  next();
}

/**
 * Project Ownership Verification Middleware:
 * Enforces strict per-user ownership on all project and child resource operations.
 * Cross-user access is blocked with HTTP 403 Forbidden.
 */
function verifyProjectOwner(req, res, next) {
  const projectId = req.params.id;
  if (!projectId) {
    return res.status(400).json({ success: false, error: 'Project ID is required.' });
  }

  const project = ProjectModel.getById(projectId);
  if (!project) {
    return res.status(404).json({ success: false, error: 'Project not found.' });
  }

  // Strict ownership enforcement: Must match the authenticated user's ID
  if (!req.user || project.owner_id !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden: You do not have permission to access or modify this project.'
    });
  }

  req.project = project;
  next();
}

module.exports = {
  authMiddleware,
  verifyProjectOwner
};
