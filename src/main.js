'use strict';

// Runs the connector with the in-memory demo app.
//   QBWC_USER           username in the .qwc file (default sync_user)
//   QBWC_PASSWORD_HASH  from `node bin/qbwc.js hash-password`  (required)
//   QBWC_COMPANY_FILE   full path to the .qbw on the QuickBooks PC
//   PORT (8080)  HOST (127.0.0.1)
//   TLS_CERT / TLS_KEY  paths to a PEM cert + key to serve https directly
const fs = require('node:fs');
const { createConnector } = require('./connector');
const { createServer } = require('./server');
const { createDemoApp } = require('./demo-app');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
if (!process.env.QBWC_PASSWORD_HASH) {
  console.error('Set QBWC_PASSWORD_HASH (run: node bin/qbwc.js hash-password)');
  process.exit(1);
}
if (!process.env.QBWC_COMPANY_FILE) {
  console.warn('QBWC_COMPANY_FILE is not set: syncing will only work while QuickBooks is open.');
}

const app = createDemoApp({
  username: process.env.QBWC_USER || 'sync_user',
  passwordHash: process.env.QBWC_PASSWORD_HASH,
  companyFile: process.env.QBWC_COMPANY_FILE || '',
});
const tls = process.env.TLS_CERT && process.env.TLS_KEY
  ? { cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) }
  : null;

createServer(createConnector(app), { tls }).listen(PORT, HOST, () => {
  console.log(`[qbwc] listening on ${tls ? 'https' : 'http'}://${HOST}:${PORT}/qbwc  (WSDL: ?wsdl)`);
});
