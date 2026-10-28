'use strict';

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,        // keep "00123" and "12 345,67" as strings
  parseAttributeValue: false,
  // Any *Ret element (CustomerRet, InvoiceRet, InvoiceLineRet...) and any
  // *Rs response is a list, even when QuickBooks sends just one.
  isArray: (name, jpath, isLeaf, isAttribute) =>
    !isAttribute && (/Ret$/.test(name) || jpath === `QBXML.QBXMLMsgsRs.${name}`),
});

// Turns a qbXML response into a flat list of results:
//   { type: 'CustomerQueryRs', requestID, statusCode, statusSeverity,
//     statusMessage, iteratorID, remaining, rows: [ ...CustomerRet ] }
// statusCode "0" is success, "1" is "no matching objects" (not an error),
// statusSeverity "Error" means the request failed.
function parseQbxmlResponse(xml) {
  if (!xml || !String(xml).trim()) return [];
  const doc = parser.parse(String(xml));
  const msgs = doc?.QBXML?.QBXMLMsgsRs;
  if (!msgs) throw new Error('not a qbXML response (no QBXMLMsgsRs)');

  const results = [];
  for (const [type, list] of Object.entries(msgs)) {
    if (type.startsWith('@')) continue;
    for (const rs of list) {
      const retKey = Object.keys(rs).find(k => /Ret$/.test(k));
      results.push({
        type,
        requestID: rs['@requestID'] || '',
        statusCode: rs['@statusCode'] || '0',
        statusSeverity: rs['@statusSeverity'] || 'Info',
        statusMessage: rs['@statusMessage'] || '',
        iteratorID: rs['@iteratorID'] || null,
        remaining: parseInt(rs['@iteratorRemainingCount'] || '0', 10),
        rows: retKey ? rs[retKey] : [],
      });
    }
  }
  return results;
}

module.exports = { parseQbxmlResponse };
