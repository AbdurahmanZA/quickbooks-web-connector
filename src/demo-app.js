'use strict';

// A minimal "app" for the connector: one Web Connector account, customers
// kept in memory. It shows the four callbacks; swap it for your own database.
const { verifyPassword, DUMMY_HASH } = require('./auth');
const { customerQuery } = require('./qbxml/customers');
const { parseQbDecimal } = require('./decimal');

const day = (date, minusDays) => new Date(date.getTime() - minusDays * 86400000).toISOString().slice(0, 10);

function createDemoApp({ username, passwordHash, companyFile = '', pageSize, logger = console }) {
  const customers = new Map();   // ListID -> customer
  let lastSyncAt = null;         // start time of the last clean run

  return {
    customers,
    get lastSyncAt() { return lastSyncAt; },

    async authenticate(user, password) {
      const ok = await verifyPassword(password, user === username ? passwordHash : DUMMY_HASH);
      return user === username && ok ? { id: username, companyFile } : null;
    },

    // First run: every customer. Later runs: changed since a day before the
    // last clean run (a day of overlap covers clock and time-zone drift).
    requestsFor() {
      return [customerQuery({ fromModified: lastSyncAt && day(lastSyncAt, 1), pageSize })];
    },

    onResponse(account, results) {
      for (const r of results) {
        if (r.type !== 'CustomerQueryRs') continue;
        for (const c of r.rows) {
          customers.set(c.ListID, {
            listId: c.ListID, name: c.FullName ?? null, email: c.Email ?? null,
            balance: parseQbDecimal(c.Balance), active: c.IsActive !== 'false', modified: c.TimeModified ?? null,
          });
        }
      }
    },

    // Move the cursor only after a clean run, and to when the run STARTED,
    // so anything changed in QuickBooks during the run is fetched next time.
    onSessionEnd(account, { ok, errors, records, startedAt }) {
      if (ok) lastSyncAt = startedAt;
      logger.info(`[demo] run ${ok ? 'ok' : 'FAILED'}: ${records} record(s), ${customers.size} customer(s) held` +
        (errors.length ? ` - ${errors.join(' | ')}` : ''));
    },
  };
}

module.exports = { createDemoApp };
