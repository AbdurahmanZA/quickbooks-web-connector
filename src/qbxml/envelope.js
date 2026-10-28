'use strict';

// qbXML 13.0 is understood by QuickBooks Desktop 2014 and later. Element ORDER
// inside every request is part of the schema: an element in the wrong place
// fails the whole message with 0x80040400 "error parsing the provided XML".
const QBXML_VERSION = '13.0';
const DEFAULT_PAGE_SIZE = 500;

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// onError: "stopOnError" for queries; "continueOnError" lets one bad write in
// a batch fail on its own.
function qbxml(requestsXml, onError = 'stopOnError') {
  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="${QBXML_VERSION}"?>
<QBXML>
  <QBXMLMsgsRq onError="${onError}">
${requestsXml}
  </QBXMLMsgsRq>
</QBXML>`;
}

// The follow-up for a paged query. QuickBooks remembers the filters from the
// iterator="Start" request; a Continue request carries only the iterator id
// and MaxReturned.
function continueRequest(rqTag, requestID, iteratorID, pageSize = DEFAULT_PAGE_SIZE) {
  return qbxml(
    `    <${rqTag} requestID="${esc(requestID)}" iterator="Continue" iteratorID="${esc(iteratorID)}">
      <MaxReturned>${pageSize}</MaxReturned>
    </${rqTag}>`
  );
}

module.exports = { QBXML_VERSION, DEFAULT_PAGE_SIZE, esc, qbxml, continueRequest };
