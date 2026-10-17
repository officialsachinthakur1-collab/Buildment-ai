// server/auth/rateLimiter.js — Login Rate Limiter and Brute-Force Defense
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_USER_ATTEMPTS = 5;       // Max 5 failed attempts per account before account lockout
const MAX_IP_ATTEMPTS = 30;        // Max 30 failed attempts per IP before global IP lockout
const LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout

// In-memory tracker with automatic cleanup
const attemptsMap = new Map();

function getMaxAttempts(key) {
  return key.startsWith('ip:') ? MAX_IP_ATTEMPTS : MAX_USER_ATTEMPTS;
}

// Periodic cleanup every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attemptsMap.entries()) {
    if (record.lockoutUntil && record.lockoutUntil < now) {
      attemptsMap.delete(key);
    } else if (now - record.lastAttempt > WINDOW_MS && !record.lockoutUntil) {
      attemptsMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Check if an IP or identifier is currently rate-limited
 */
function checkRateLimit(key) {
  const now = Date.now();
  const maxAttempts = getMaxAttempts(key);
  const record = attemptsMap.get(key);

  if (!record) {
    return { limited: false, remainingAttempts: maxAttempts };
  }

  if (record.lockoutUntil && record.lockoutUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockoutUntil - now) / 1000);
    return {
      limited: true,
      retryAfterSeconds,
      error: `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`
    };
  }

  // If lockout expired, reset
  if (record.lockoutUntil && record.lockoutUntil <= now) {
    attemptsMap.delete(key);
    return { limited: false, remainingAttempts: maxAttempts };
  }

  // If window expired, reset
  if (now - record.firstAttempt > WINDOW_MS) {
    attemptsMap.delete(key);
    return { limited: false, remainingAttempts: maxAttempts };
  }

  const remainingAttempts = Math.max(0, maxAttempts - record.count);
  return { limited: false, remainingAttempts };
}

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(key) {
  const now = Date.now();
  const maxAttempts = getMaxAttempts(key);
  let record = attemptsMap.get(key);

  if (!record || (now - record.firstAttempt > WINDOW_MS && !record.lockoutUntil)) {
    record = {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
      lockoutUntil: null
    };
  } else {
    record.count += 1;
    record.lastAttempt = now;
  }

  if (record.count >= maxAttempts) {
    record.lockoutUntil = now + LOCKOUT_MS;
  }

  attemptsMap.set(key, record);
  return record;
}

/**
 * Reset rate limit tracker after successful login
 */
function resetRateLimit(key) {
  attemptsMap.delete(key);
}

module.exports = {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  MAX_USER_ATTEMPTS,
  MAX_IP_ATTEMPTS,
  WINDOW_MS,
  LOCKOUT_MS
};
