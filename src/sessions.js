'use strict';

// One session per Web Connector run. The ticket handed out by authenticate()
// is the only credential Web Connector presents on every later call, so it has
// to be unguessable - never derive it from a user id or a timestamp.
const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;   // abandoned runs are swept after 2h

class Sessions {
  constructor({ ttlMs = DEFAULT_TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  create(account) {
    this.sweep();
    const ticket = crypto.randomBytes(24).toString('hex');
    this.map.set(ticket, {
      ticket,
      account,
      requests: [],      // qbXML strings, served in order
      index: 0,          // next request to serve
      records: 0,        // rows received this run
      errors: [],        // query errors - a run with errors must not move the sync cursor
      lastError: '',     // what getLastError() reports
      ended: false,
      startedAt: new Date(),
    });
    return ticket;
  }

  get(ticket) {
    return this.map.get(ticket) || null;
  }

  forAccount(accountId) {
    return [...this.map.values()].filter(s => s.account.id === accountId);
  }

  close(ticket) {
    this.map.delete(ticket);
  }

  sweep(now = Date.now()) {
    for (const [t, s] of this.map) if (now - s.startedAt.getTime() > this.ttlMs) this.map.delete(t);
  }
}

// Web Connector ends the run when receiveResponseXML returns 100, so never
// report 100 while requests remain (Math.round(199/200*100) would be 100).
function percentComplete(session) {
  const total = session.requests.length;
  if (total === 0 || session.index >= total) return 100;
  return Math.min(99, Math.floor((session.index / total) * 100));
}

module.exports = { Sessions, percentComplete };
