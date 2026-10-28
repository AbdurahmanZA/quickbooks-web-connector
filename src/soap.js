'use strict';

// Just enough SOAP 1.1 for Web Connector: read the method name and its
// parameters from the request envelope, write a response envelope back.
const { XMLParser } = require('fast-xml-parser');

const NS = 'http://developer.intuit.com/';

const parser = new XMLParser({
  removeNSPrefix: true,      // soap:Body / SOAP-ENV:Body -> Body
  ignoreAttributes: true,
  parseTagValue: false,      // tickets, hresults and qbXML stay strings
  htmlEntities: true,        // the qbXML in <response> arrives entity-escaped
});

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parseRequest(xml) {
  const body = parser.parse(xml)?.Envelope?.Body;
  if (!body || typeof body !== 'object') throw new Error('no SOAP Body');
  const method = Object.keys(body)[0];
  if (!method) throw new Error('no method in SOAP Body');
  const params = {};
  for (const [k, v] of Object.entries(body[method] || {})) params[k] = typeof v === 'string' ? v : String(v ?? '');
  return { method, params };
}

function envelope(inner) {
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<soap:Body>${inner}</soap:Body></soap:Envelope>`;
}

// value: string | number -> <xResult>value</xResult>
//        string[]        -> <xResult><string>..</string>...</xResult>  (authenticate)
// sendRequestXML's qbXML goes in a CDATA section so it reaches QuickBooks
// byte-for-byte; a literal "]]>" inside is split across two sections.
function response(method, value) {
  let inner;
  if (Array.isArray(value)) {
    inner = value.map(s => `<string>${esc(s)}</string>`).join('');
  } else if (method === 'sendRequestXML' && value) {
    inner = `<![CDATA[${String(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
  } else {
    inner = esc(value);
  }
  return envelope(`<${method}Response xmlns="${NS}"><${method}Result>${inner}</${method}Result></${method}Response>`);
}

function fault(message) {
  return envelope(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>${esc(message)}</faultstring></soap:Fault>`);
}

module.exports = { parseRequest, response, fault, NS };
