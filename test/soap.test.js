'use strict';

// End-to-end over real HTTP: a fake Web Connector runs a full session against
// the server backed by the in-memory demo app.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createConnector, createServer, createDemoApp, hashPassword } = require('../src');
const { soapCall, soapResult, qbResponse, silent } = require('./helpers');

let HASH;
test.before(async () => { HASH = await hashPassword('example-password'); });

async function start() {
  const app = createDemoApp({ username: 'sync_user', passwordHash: HASH, companyFile: 'C:\\Data\\Example Company.qbw', logger: silent });
  const server = createServer(createConnector(app, { logger: silent }), { logger: silent });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/qbwc`;
  const call = async (method, params) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml' }, body: soapCall(method, params) });
    return { status: res.status, result: soapResult(method, await res.text()) };
  };
  const login = async () => (await call('authenticate', { strUserName: 'sync_user', strPassword: 'example-password' })).result;
  return { app, server, url, call, login };
}

const customers = (remaining, rows) => qbResponse(`
  <CustomerQueryRs requestID="customers" statusCode="0" statusSeverity="Info" statusMessage="Status OK"
                   iteratorRemainingCount="${remaining}" iteratorID="{it-1}">${rows}</CustomerQueryRs>`);

test('GET ?wsdl serves the WSDL', async t => {
  const { server, url } = await start();
  t.after(() => server.close());
  const body = await (await fetch(`${url}?wsdl`)).text();
  assert.match(body, /<wsdl:definitions/);
  assert.match(body, /operation name="receiveResponseXML"/);
});

test('full session: authenticate -> paged send/receive loop -> closeConnection', async t => {
  const { app, server, call, login } = await start();
  t.after(() => server.close());

  assert.equal((await call('serverVersion')).result, '1.0.0');
  assert.equal((await call('clientVersion', { strVersion: '2.3.0.215' })).result ?? '', '');

  const [ticket, companyFile] = await login();
  assert.equal(companyFile, 'C:\\Data\\Example Company.qbw');

  const rq1 = (await call('sendRequestXML', { ticket, strHCPResponse: '', strCompanyFileName: '', qbXMLCountry: 'US', qbXMLMajorVers: 13, qbXMLMinorVers: 0 })).result;
  assert.match(rq1, /<CustomerQueryRq requestID="customers" iterator="Start">/);
  assert.doesNotMatch(rq1, /FromModifiedDate/, 'first sync pulls everything');

  // Page 1 says one more row is waiting -> progress < 100 and a Continue comes next.
  const page1 = customers(1, `<CustomerRet><ListID>80000001-1</ListID><FullName>Example Customer &amp; Co</FullName>
      <Balance>12 345,67</Balance><IsActive>true</IsActive></CustomerRet>`);
  assert.equal((await call('receiveResponseXML', { ticket, response: page1, hresult: '', message: '' })).result, '50');

  const rq2 = (await call('sendRequestXML', { ticket })).result;
  assert.match(rq2, /iterator="Continue" iteratorID="\{it-1\}"/);
  const page2 = customers(0, '<CustomerRet><ListID>80000002-1</ListID><FullName>Second Customer</FullName><Balance>0.00</Balance></CustomerRet>');
  assert.equal((await call('receiveResponseXML', { ticket, response: page2, hresult: '', message: '' })).result, '100');

  assert.equal((await call('closeConnection', { ticket })).result, 'OK: 2 record(s)');
  assert.equal(app.customers.get('80000001-1').name, 'Example Customer & Co');
  assert.equal(app.customers.get('80000001-1').balance, 12345.67);
  assert.ok(app.lastSyncAt, 'cursor advanced after a clean run');

  // Second run is incremental.
  const [ticket2] = await login();
  assert.match((await call('sendRequestXML', { ticket: ticket2 })).result, /<FromModifiedDate>\d{4}-\d{2}-\d{2}<\/FromModifiedDate>/);
});

test('bad password over SOAP returns nvu', async t => {
  const { server, call } = await start();
  t.after(() => server.close());
  assert.deepEqual((await call('authenticate', { strUserName: 'sync_user', strPassword: 'wrong' })).result, ['', 'nvu']);
});

test('QuickBooks error hresult: -1, getLastError explains, cursor stays put', async t => {
  const { app, server, call, login } = await start();
  t.after(() => server.close());
  const [ticket] = await login();
  await call('sendRequestXML', { ticket });
  const r = await call('receiveResponseXML', { ticket, response: '', hresult: '0x80040400', message: 'QuickBooks found an error when parsing the provided XML text stream.' });
  assert.equal(r.result, '-1');
  assert.match((await call('getLastError', { ticket })).result, /^0x80040400/);
  await call('closeConnection', { ticket });
  assert.equal(app.lastSyncAt, null);
});

test('a query that comes back with statusSeverity=Error fails the run', async t => {
  const { app, server, call, login } = await start();
  t.after(() => server.close());
  const [ticket] = await login();
  await call('sendRequestXML', { ticket });
  const failed = qbResponse('<CustomerQueryRs requestID="customers" statusCode="3120" statusSeverity="Error" statusMessage="Object not found"/>');
  assert.equal((await call('receiveResponseXML', { ticket, response: failed, hresult: '', message: '' })).result, '100');
  assert.match((await call('closeConnection', { ticket })).result, /^Finished with 1 error/);
  assert.equal(app.lastSyncAt, null);
});

test('connectionError ends the run as failed', async t => {
  const { app, server, call, login } = await start();
  t.after(() => server.close());
  const [ticket] = await login();
  assert.equal((await call('connectionError', { ticket, hresult: '0x80040408', message: 'Could not start QuickBooks.' })).result, 'done');
  assert.equal(app.lastSyncAt, null);
});

test('malformed SOAP gets a SOAP fault, unknown ticket gets an empty request', async t => {
  const { server, url, call } = await start();
  t.after(() => server.close());
  const res = await fetch(url, { method: 'POST', body: '<not-soap/>' });
  assert.equal(res.status, 500);
  assert.match(await res.text(), /<soap:Fault>/);
  assert.equal((await call('sendRequestXML', { ticket: 'forged' })).result ?? '', '');
});
