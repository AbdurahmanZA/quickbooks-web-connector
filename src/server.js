'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const soap = require('./soap');

const WSDL = fs.readFileSync(path.join(__dirname, '..', 'wsdl', 'QBWebConnectorSvc.wsdl'), 'utf8');
const METHODS = new Set([
  'serverVersion', 'clientVersion', 'authenticate', 'sendRequestXML',
  'receiveResponseXML', 'connectionError', 'getLastError', 'closeConnection',
]);
const MAX_BODY = 64 * 1024 * 1024;   // a full invoice pull can be tens of MB

async function handleSoap(connector, xml) {
  const { method, params } = soap.parseRequest(xml);
  if (!METHODS.has(method)) throw new Error(`unknown method ${method}`);
  return soap.response(method, await connector[method](params));
}

// Web Connector only talks to https:// (plain http is allowed for localhost
// only). Either pass { tls: { cert, key } } or put a TLS reverse proxy in front
// and leave this listening on 127.0.0.1.
function createServer(connector, { tls = null, logger = console } = {}) {
  const onRequest = (req, res) => {
    if (req.method === 'GET') {
      const isWsdl = /[?&]wsdl\b/i.test(req.url);
      res.writeHead(200, { 'Content-Type': isWsdl ? 'text/xml; charset=utf-8' : 'text/plain; charset=utf-8' });
      res.end(isWsdl ? WSDL : 'QuickBooks Web Connector endpoint. POST SOAP here.\n');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'GET, POST' });
      res.end();
      return;
    }

    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) req.destroy();
      else chunks.push(chunk);
    });
    req.on('end', async () => {
      let status = 200, body;
      try {
        body = await handleSoap(connector, Buffer.concat(chunks).toString('utf8'));
      } catch (e) {
        logger.error(`[qbwc] SOAP error: ${e.message}`);
        status = 500;
        body = soap.fault(e.message);
      }
      res.writeHead(status, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(body);
    });
  };

  return tls ? https.createServer(tls, onRequest) : http.createServer(onRequest);
}

module.exports = { createServer, handleSoap };
