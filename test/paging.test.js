'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createConnector } = require('../src/connector');
const { customerQuery } = require('../src/qbxml/customers');
const { qbxml } = require('../src/qbxml/envelope');
const { percentComplete } = require('../src/sessions');
const { qbResponse, silent } = require('./helpers');

function page(n, remaining) {
  const rows = Array.from({ length: n }, (_, i) => `<CustomerRet><ListID>id-${remaining}-${i}</ListID></CustomerRet>`).join('');
  return qbResponse(`<CustomerQueryRs requestID="customers" statusCode="0" statusSeverity="Info"
    iteratorRemainingCount="${remaining}" iteratorID="{iter-42}">${rows}</CustomerQueryRs>`);
}

test('iteratorRemainingCount > 0 queues a Continue request before the next query', async () => {
  const seen = [];
  const hostQuery = qbxml('    <HostQueryRq requestID="host"/>');
  const qbwc = createConnector({
    authenticate: async () => ({ id: 'acct', companyFile: '' }),
    requestsFor: async () => [customerQuery({ pageSize: 2 }), hostQuery],
    onResponse: async (account, results) => results.forEach(r => seen.push(...r.rows.map(x => x.ListID))),
  }, { logger: silent, pageSize: 2 });

  const [ticket] = await qbwc.authenticate({ strUserName: 'u', strPassword: 'p' });

  assert.match(qbwc.sendRequestXML({ ticket }), /iterator="Start"/);
  assert.equal(await qbwc.receiveResponseXML({ ticket, response: page(2, 3) }), 33);   // 1 of 3 sent

  const cont = qbwc.sendRequestXML({ ticket });
  assert.match(cont, /<CustomerQueryRq requestID="customers" iterator="Continue" iteratorID="\{iter-42\}">/);
  assert.match(cont, /<MaxReturned>2<\/MaxReturned>/);
  assert.doesNotMatch(cont, /IncludeRetElement/, 'Continue carries no filters');
  assert.equal(await qbwc.receiveResponseXML({ ticket, response: page(2, 1) }), 50);   // 2 of 4

  assert.match(qbwc.sendRequestXML({ ticket }), /iterator="Continue"/);
  assert.equal(await qbwc.receiveResponseXML({ ticket, response: page(1, 0) }), 75);   // 3 of 4, no more pages

  assert.match(qbwc.sendRequestXML({ ticket }), /<HostQueryRq/);
  assert.equal(seen.length, 5);
});

test('percentComplete never reports 100 while requests remain', () => {
  assert.equal(percentComplete({ requests: new Array(200), index: 199 }), 99);
  assert.equal(percentComplete({ requests: new Array(200), index: 200 }), 100);
  assert.equal(percentComplete({ requests: [], index: 0 }), 100);
});
