'use strict';

/**
 * Authentication for /admin:
 *  - scrypt password hashing (no plaintext anywhere)
 *  - HTTP-only session cookies (SameSite=Strict)
 *  - per-session CSRF tokens
 *  - in-memory login rate limiting per IP
 */

const crypto = require('crypto');
const fs = require('fs');
const { JsonStore } = require('./store');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_COOKIE = 'dgpsid';
const CSRF_COOKIE = 'dgpc';

const authStore = new JsonStore('auth.json', () => ({
  passwordHash: null,
  createdAt: new Date().toISOString(),
}));
const sessionStore = new JsonStore('sessions.json', () => ({ sessions: {} }));

/** Always read the hash fresh from disk so `npm run reset-password`
 *  (a separate process) takes effect immediately on a running server. */
function readPasswordHash() {
  try {
    return JSON.parse(fs.readFileSync(authStore.file, 'utf8')).passwordHash || null;
  } catch (err) {
    return null;
  }
}

/* ---------------- password ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const hash = crypto.scryptSync(password, salt, 64, { N, r, p });
  return ['scrypt', N, r, p, salt.toString('hex'), hash.toString('hex')].join('$');
}

function verifyPassword(password) {
  const stored = readPasswordHash();
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  let actual;
  try {
    actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, {
      N: parseInt(nStr, 10),
      r: parseInt(rStr, 10),
      p: parseInt(pStr, 10),
    });
  } catch (err) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function setPassword(password) {
  authStore.mutate((d) => {
    d.passwordHash = hashPassword(password);
  });
}

/**
 * Create the initial admin password on first boot.
 * Never hard-coded in source: printed to the server console once.
 */
function ensureInitialPassword() {
  if (readPasswordHash()) return null;
  const password = crypto.randomBytes(9).toString('base64url'); // 12 chars, URL-safe
  const data = authStore.data;
  data.passwordHash = hashPassword(password);
  authStore._saveSync();
  return password;
}

/** Constant-time string comparison (hash both sides first to equalise length). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------------- sessions ---------------- */

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  sessionStore.mutate((d) => {
    d.sessions[token] = { csrf, createdAt: Date.now() };
  });
  return { token, csrf };
}

function getSession(token) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = sessionStore.data.sessions[token];
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    destroySession(token);
    return null;
  }
  return session;
}

function destroySession(token) {
  sessionStore.mutate((d) => {
    delete d.sessions[token];
  });
}

function purgeExpiredSessions() {
  sessionStore.mutate((d) => {
    for (const [token, s] of Object.entries(d.sessions)) {
      if (Date.now() - s.createdAt > SESSION_TTL_MS) delete d.sessions[token];
    }
  });
}

/* ---------------- login rate limiting ---------------- */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map(); // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, entry);
  }
  entry.count += 1;
  // opportunistic cleanup
  if (attempts.size > 5000) {
    for (const [key, value] of attempts) if (now > value.resetAt) attempts.delete(key);
  }
  return {
    allowed: entry.count <= MAX_ATTEMPTS,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

function clearRateLimit(ip) {
  attempts.delete(ip);
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_TTL_MS,
  ensureInitialPassword,
  verifyPassword,
  setPassword,
  safeEqual,
  createSession,
  getSession,
  destroySession,
  purgeExpiredSessions,
  checkRateLimit,
  clearRateLimit,
};
