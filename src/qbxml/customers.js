'use strict';

const { qbxml, esc, DEFAULT_PAGE_SIZE } = require('./envelope');

// Customers changed since `fromModified` (YYYY-MM-DD), or all of them when it
// is empty. List queries take FromModifiedDate directly (no range wrapper).
// Order matters: MaxReturned, ActiveStatus, FromModifiedDate, IncludeRetElement.
function customerQuery({ fromModified = null, pageSize = DEFAULT_PAGE_SIZE } = {}) {
  const since = fromModified ? `\n      <FromModifiedDate>${esc(fromModified)}</FromModifiedDate>` : '';
  const fields = ['ListID', 'FullName', 'CompanyName', 'Email', 'Phone', 'Balance', 'IsActive', 'TimeModified'];
  return qbxml(`    <CustomerQueryRq requestID="customers" iterator="Start">
      <MaxReturned>${pageSize}</MaxReturned>
      <ActiveStatus>All</ActiveStatus>${since}
${fields.map(f => `      <IncludeRetElement>${f}</IncludeRetElement>`).join('\n')}
    </CustomerQueryRq>`);
}

module.exports = { customerQuery };
