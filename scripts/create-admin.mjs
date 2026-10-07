#!/usr/bin/env node
// One-off: create the first admin. Prints SQL to run with `wrangler d1 execute`.
// Usage:  node scripts/create-admin.mjs <username> [display name] > admin.local.sql
// The password is read from the ADMIN_PASSWORD env var, or asked interactively.
// Same algorithm as functions/_lib/auth.ts: PBKDF2-HMAC-SHA256, 100,000 iterations, 16-byte salt.
import { webcrypto as crypto } from 'node:crypto';
import { createInterface } from 'node:readline';

const ITER = 100_000;
const [username, displayName = 'Administrator'] = process.argv.slice(2);
if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) {
  console.error('Usage: node scripts/create-admin.mjs <username> [display name]   (username: 3-40 chars a-z 0-9 . _ -)');
  process.exit(1);
}

async function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a))));
}

const password = process.env.ADMIN_PASSWORD ?? (await ask('Password (min 10 chars): '));
if (!password || password.length < 10) {
  console.error('Password must be at least 10 characters.');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
const b64 = (u8) => Buffer.from(u8).toString('base64');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

process.stdout.write(
  `INSERT INTO users (username, display_name, role, password_hash, password_salt, must_change_password, active, failed_count, created_at)\n` +
    `VALUES (${q(username)}, ${q(displayName)}, 'admin', ${q(b64(new Uint8Array(bits)))}, ${q(b64(salt))}, 0, 1, 0, ${q(new Date().toISOString())})\n` +
    `ON CONFLICT(username) DO UPDATE SET role = 'admin', password_hash = excluded.password_hash, password_salt = excluded.password_salt,\n` +
    `  active = 1, failed_count = 0, locked_until = NULL;\n`,
);
