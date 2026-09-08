'use strict';

/**
 * Reset the /admin password.
 *
 *   node scripts/reset-password.js              # generate a secure random one
 *   node scripts/reset-password.js "new secret" # or pass one explicitly
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/* load .env if present (same rules as server.js) */
(function () {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
    }
  }
})();

const auth = require('../src/auth');

const password = process.argv[2] || crypto.randomBytes(9).toString('base64url');

if (password.length < 10) {
  console.error('Please use a password of at least 10 characters.');
  process.exit(1);
}

auth.setPassword(password);

console.log('──────────────────────────────────────────');
console.log('  Admin password updated.');
console.log(`  Username: admin`);
console.log(`  Password: ${password}`);
console.log('──────────────────────────────────────────');
console.log('Store it in your password manager. It is hashed on disk, never in plain text.');
