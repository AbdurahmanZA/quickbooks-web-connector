'use strict';

// The eight QBWC methods, independent of SOAP and of any database.
//
// You plug your application in with four callbacks:
//
//   authenticate(username, password)  -> { id, companyFile } | null
//   requestsFor(account, { ticket })  -> [qbXML request strings]  (this run's work)
//   onResponse(account, results, { ticket })   results = parseQbxmlResponse(...)
//   onSessionEnd(account, { ticket, ok, errors, records, startedAt })   optional
//
// Web Connector calls, in order:
//   serverVersion, clientVersion, authenticate,
//   then sendRequestXML / receiveResponseXML in a loop until we return 100,
//   then closeConnection.  connectionError / getLastError when things fail.
const { Sessions, percentComplete } = require('./sessions');
const { parseQbxmlResponse } = require('./qbxml/parse');
const { continueRequest, DEFAULT_PAGE_SIZE } = require('./qbxml/envelope');

const SERVER_VERSION = require('../package.json').version;

function createConnector(app, { logger = console, pageSize = DEFAULT_PAGE_SIZE, sessionTtlMs } = {}) {
  for (const fn of ['authenticate', 'requestsFor', 'onResponse']) {
    if (typeof app[fn] !== 'function') throw new TypeError(`app.${fn} must be a function`);
  }
  const sessions = new Sessions({ ttlMs: sessionTtlMs });
  const short = t => `${String(t || '').slice(0, 8)}…`;   // never log whole tickets

  async function end(session, ok) {
    if (session.ended) return;
    session.ended = true;
    if (app.onSessionEnd) {
      await app.onSessionEnd(session.account, {
        ticket: session.ticket, ok, errors: session.errors,
        records: session.records, startedAt: session.startedAt,
      });
    }
  }

  return {
    sessions,

    serverVersion() {
      return SERVER_VERSION;
    },

    // '' accepts any Web Connector version. Return 'W:<message>' to warn the
    // user or 'E:<message>' to refuse an old version.
    clientVersion() {
      return '';
    },

    // Returns the string array Web Connector expects:
    //   ['', 'nvu']            not a valid user
    //   [ticket, 'none']       valid, but nothing to do this run
    //   [ticket, companyFile]  go. companyFile is the FULL path to the .qbw.
    //     '' means "use whatever company file is open" - and when QuickBooks
    //     is closed that fails with 0x80040408 "Could not start QuickBooks".
    async authenticate({ strUserName, strPassword }) {
      const username = String(strUserName || '').trim();
      const account = await app.authenticate(username, String(strPassword ?? ''));
      if (!account) {
        logger.warn(`[qbwc] authenticate: rejected "${username}"`);
        return ['', 'nvu'];
      }

      // A new run proves any earlier run for this account is dead (Web
      // Connector killed mid-run, server restarted...). Close it properly.
      for (const old of sessions.forAccount(account.id)) {
        old.errors.push('superseded by a newer session');
        await end(old, false);
        sessions.close(old.ticket);
      }

      const ticket = sessions.create(account);
      const session = sessions.get(ticket);
      session.requests = [...(await app.requestsFor(account, { ticket }))];
      if (session.requests.length === 0) {
        await end(session, true);
        sessions.close(ticket);
        return [ticket, 'none'];
      }
      logger.info(`[qbwc] authenticate: "${username}" ticket=${short(ticket)} requests=${session.requests.length}`);
      return [ticket, account.companyFile || ''];
    },

    sendRequestXML({ ticket }) {
      const session = sessions.get(ticket);
      if (!session || session.index >= session.requests.length) return '';
      return session.requests[session.index++];
    },

    // Returns 0-99 (more to do), 100 (done) or a negative number (error;
    // Web Connector then calls getLastError).
    async receiveResponseXML({ ticket, response, hresult, message }) {
      const session = sessions.get(ticket);
      if (!session) return -1;

      if (hresult && hresult !== '0x00000000') {
        session.lastError = `${hresult}: ${message || 'QuickBooks error'}`;
        session.errors.push(session.lastError);
        logger.error(`[qbwc] receiveResponseXML ${short(ticket)}: ${session.lastError}`);
        await end(session, false);
        return -1;
      }

      let results = [];
      try {
        results = parseQbxmlResponse(response);
      } catch (e) {
        session.errors.push(`unreadable response: ${e.message}`);
      }

      for (const r of results) {
        session.records += r.rows.length;
        // A failed QUERY means a window of data was not read, so the run must
        // not count as a success. Failed writes (Add/Mod requests) are the
        // app's business: it records that one failure and the run carries on.
        if (r.statusSeverity === 'Error' && r.type.endsWith('QueryRs')) {
          session.errors.push(`${r.type} ${r.statusCode}: ${r.statusMessage}`);
        }
        // Paging: more rows waiting -> serve the Continue request next, so
        // this entity finishes before the following one starts.
        if (r.iteratorID && r.remaining > 0) {
          const rqTag = r.type.replace(/Rs$/, 'Rq');
          session.requests.splice(session.index, 0, continueRequest(rqTag, r.requestID, r.iteratorID, pageSize));
        }
      }

      try {
        await app.onResponse(session.account, results, { ticket });
      } catch (e) {
        session.errors.push(`store failed: ${e.message}`);
        logger.error(`[qbwc] onResponse ${short(ticket)}: ${e.stack || e.message}`);
      }

      const pct = percentComplete(session);
      if (pct === 100) await end(session, session.errors.length === 0);
      return pct;
    },

    // Web Connector could not reach QuickBooks (or QuickBooks refused).
    // Return 'done' to end the run.
    async connectionError({ ticket, hresult, message }) {
      const session = sessions.get(ticket);
      logger.error(`[qbwc] connectionError ${short(ticket)}: ${hresult} ${message}`);
      if (session) {
        session.errors.push(`connection error ${hresult}: ${message}`);
        await end(session, false);
        sessions.close(ticket);
      }
      return 'done';
    },

    getLastError({ ticket }) {
      return sessions.get(ticket)?.lastError || '';
    },

    // The returned text is shown in the Web Connector status column.
    async closeConnection({ ticket }) {
      const session = sessions.get(ticket);
      if (!session) return 'OK';
      if (!session.ended) {
        session.errors.push('closed before all requests were answered');
        await end(session, false);
      }
      sessions.close(ticket);
      return session.errors.length
        ? `Finished with ${session.errors.length} error(s): ${session.errors[0]}`.slice(0, 250)
        : `OK: ${session.records} record(s)`;
    },
  };
}

module.exports = { createConnector };
