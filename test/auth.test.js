'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword, DUMMY_HASH } = require('../src/auth');
const { createDemoApp } = require('../src/demo-app');
const { createConnector } = require('../src/connector');
const { silent } = require('./helpers');

test('hash and verify', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword('correct horse battery', h), true);
  assert.equal(await verifyPassword('wrong password', h), false);
  assert.notEqual(await hashPassword('correct horse battery'), h, 'salted');
});

test('malformed hashes and the dummy hash never verify', async () => {
  for (const h of ['', null, 'plain-text', 'bcrypt$x$y', DUMMY_HASH]) {
    assert.equal(await verifyPassword('anything', h), false);
  }
});

test('short passwords are refused', async () => {
  await assert.rejects(hashPassword('short'), /at least 8/);
});

test('authenticate: good login returns ticket + company file; bad ones return nvu', async () => {
  const app = createDemoApp({ username: 'sync_user', passwordHash: await hashPassword('example-password'),
    companyFile: 'C:\\Data\\Example Company.qbw', logger: silent });
  const qbwc = createConnector(app, { logger: silent });

  const [ticket, file] = await qbwc.authenticate({ strUserName: 'sync_user', strPassword: 'example-password' });
  assert.match(ticket, /^[0-9a-f]{48}$/);
  assert.equal(file, 'C:\\Data\\Example Company.qbw');

  assert.deepEqual(await qbwc.authenticate({ strUserName: 'sync_user', strPassword: 'nope' }), ['', 'nvu']);
  assert.deepEqual(await qbwc.authenticate({ strUserName: 'nobody', strPassword: 'example-password' }), ['', 'nvu']);
});

test('authenticate: nothing to do returns "none"', async () => {
  const qbwc = createConnector({
    authenticate: async () => ({ id: 'a', companyFile: '' }),
    requestsFor: async () => [],
    onResponse: async () => {},
  }, { logger: silent });
  const [ticket, status] = await qbwc.authenticate({ strUserName: 'a', strPassword: 'b' });
  assert.ok(ticket);
  assert.equal(status, 'none');
});

test('a new login retires an unfinished session for the same account', async () => {
  const ended = [];
  const qbwc = createConnector({
    authenticate: async () => ({ id: 'a', companyFile: '' }),
    requestsFor: async () => ['<request/>'],
    onResponse: async () => {},
    onSessionEnd: async (account, info) => ended.push(info),
  }, { logger: silent });
  const [first] = await qbwc.authenticate({ strUserName: 'a', strPassword: 'b' });
  await qbwc.authenticate({ strUserName: 'a', strPassword: 'b' });
  assert.equal(ended.length, 1);
  assert.equal(ended[0].ok, false);
  assert.equal(qbwc.sendRequestXML({ ticket: first }), '', 'old ticket is dead');
});
