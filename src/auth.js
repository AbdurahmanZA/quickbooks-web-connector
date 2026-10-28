'use strict';

// Password hashing for Web Connector accounts, using Node's built-in scrypt so
// there is no native dependency. Stored format:
//   scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>
const crypto = require('node:crypto');

const N = 16384, R = 8, P = 1, KEYLEN = 32;

function scrypt(password, salt, n, r, p) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: n, r, p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('password must be at least 8 characters');
  }
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(String(password ?? ''), Buffer.from(saltB64, 'base64'), +n, +r, +p);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// Used when the username does not exist, so a wrong username takes as long to
// reject as a wrong password (no account-name probing by timing).
const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

module.exports = { hashPassword, verifyPassword, DUMMY_HASH };
