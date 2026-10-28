'use strict';

// Plugging the connector into your own application instead of the demo
// app. Everything QuickBooks-specific stays in the connector;
// your code only answers four questions:
//   who is this?  what should QuickBooks do?  here is what came back.  run over.
//
//   node examples/custom-crm.js   then point a .qwc at it (see README)
const { createConnector, createServer, verifyPassword, customerQuery, parseQbDecimal } = require('..');

// Stand-ins for your real database / API.
const crm = {
  accounts: new Map(),   // username -> { passHash, companyFile, lastSyncAt }
  async upsertContact(qbListId, fields) { console.log('upsert contact', qbListId, fields); },
};

const connector = createConnector({
  async authenticate(username, password) {
    const acct = crm.accounts.get(username);
    if (!acct || !(await verifyPassword(password, acct.passHash))) return null;
    return { id: username, companyFile: acct.companyFile, lastSyncAt: acct.lastSyncAt };
  },

  async requestsFor(account) {
    const since = account.lastSyncAt ? account.lastSyncAt.slice(0, 10) : null;
    return [customerQuery({ fromModified: since })];
  },

  async onResponse(account, results) {
    for (const r of results) {
      if (r.type !== 'CustomerQueryRs') continue;
      for (const c of r.rows) {
        await crm.upsertContact(c.ListID, { name: c.FullName, email: c.Email, balance: parseQbDecimal(c.Balance) });
      }
    }
  },

  async onSessionEnd(account, { ok, startedAt }) {
    if (ok) crm.accounts.get(account.id).lastSyncAt = startedAt.toISOString();
  },
});

createServer(connector).listen(8080, '127.0.0.1', () => console.log('listening on http://127.0.0.1:8080/qbwc'));
