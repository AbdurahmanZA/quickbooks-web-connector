'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeQwc } = require('../src/qwc');

test('makeQwc: https only, fresh GUIDs, support URL on the same host', () => {
  const a = makeQwc({ appName: 'Example Sync', appUrl: 'https://qb.example.com/qbwc', username: 'sync_user' });
  const b = makeQwc({ appName: 'Example Sync', appUrl: 'https://qb.example.com/qbwc', username: 'sync_user' });
  assert.match(a, /<AppURL>https:\/\/qb\.example\.com\/qbwc<\/AppURL>/);
  assert.match(a, /<AppSupport>https:\/\/qb\.example\.com\/support<\/AppSupport>/);
  assert.match(a, /<UserName>sync_user<\/UserName>/);
  assert.match(a, /<OwnerID>\{[0-9A-F-]{36}\}<\/OwnerID>/);
  assert.notEqual(a.match(/<FileID>(.*)<\/FileID>/)[1], b.match(/<FileID>(.*)<\/FileID>/)[1]);
});

test('makeQwc: refuses plain http except for localhost, escapes text', () => {
  assert.throws(() => makeQwc({ appName: 'x', appUrl: 'http://qb.example.com/qbwc', username: 'u' }), /https/);
  assert.doesNotThrow(() => makeQwc({ appName: 'x', appUrl: 'http://localhost:8080/qbwc', username: 'u' }));
  assert.match(makeQwc({ appName: 'A & B', appUrl: 'https://qb.example.com/qbwc', username: 'u' }), /<AppName>A &amp; B<\/AppName>/);
});
