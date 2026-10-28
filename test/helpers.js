'use strict';

// Plays the part of QuickBooks Web Connector: wraps a call in the same kind
// of SOAP envelope it sends, and pulls results back out of our replies.
const { XMLParser } = require('fast-xml-parser');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const reader = new XMLParser({ removeNSPrefix: true, parseTagValue: false, isArray: n => n === 'string' });

function soapCall(method, params = {}) {
  const inner = Object.entries(params).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
    `<soap:Body><${method} xmlns="http://developer.intuit.com/">${inner}</${method}></soap:Body></soap:Envelope>`;
}

function soapResult(method, xml) {
  const result = reader.parse(xml).Envelope.Body[`${method}Response`][`${method}Result`];
  return result && typeof result === 'object' && 'string' in result ? result.string : result;
}

// A canned qbXML response, as QuickBooks would return it.
function qbResponse(rsXml) {
  return `<?xml version="1.0" ?><QBXML><QBXMLMsgsRs>${rsXml}</QBXMLMsgsRs></QBXML>`;
}

const silent = { info() {}, warn() {}, error() {} };

module.exports = { soapCall, soapResult, qbResponse, silent };
