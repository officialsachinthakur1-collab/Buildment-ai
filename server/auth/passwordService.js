// server/auth/passwordService.js — Modern Password Hashing via Argon2id
const argon2 = require('argon2');

// OWASP Recommended Argon2id parameters
const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4     // 4 threads
};

/**
 * Hash a plaintext password using Argon2id.
 * Plaintext passwords are never logged or stored.
 */
async function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password must be a non-empty string.');
  }
  return await argon2.hash(plainPassword, ARGON2_CONFIG);
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Constant-time comparison is handled by the underlying C/C++ library to prevent timing attacks.
 */
async function verifyPassword(hash, plainPassword) {
  if (!hash || !plainPassword || typeof hash !== 'string' || typeof plainPassword !== 'string') {
    return false;
  }
  try {
    return await argon2.verify(hash, plainPassword);
  } catch (err) {
    return false;
  }
}

/**
 * Validate password complexity:
 * - At least 8 characters
 * - At most 128 characters (prevents memory DoS during hashing)
 * - Contains at least one letter and at least one number
 */
function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required and must be a string.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters.' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

/**
 * Check if a stored hash needs to be upgraded to current OWASP parameters
 */
function needsRehash(hash) {
  if (!hash || typeof hash !== 'string') return true;
  try {
    return argon2.needsRehash(hash, ARGON2_CONFIG);
  } catch {
    return true;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  needsRehash,
  ARGON2_CONFIG
};
