'use strict';

// Builds the .qwc file you load into Web Connector (File > Update Web
// Services > Add an Application). It tells Web Connector where your server is
// and which username to log in with. The password is NOT in the file - Web
// Connector asks for it once and stores it.
const crypto = require('node:crypto');
const { esc } = require('./qbxml/envelope');

const guid = () => `{${crypto.randomUUID().toUpperCase()}}`;

function makeQwc({ appName, appUrl, username, description = '', supportUrl, minutes = 15, ownerId = guid(), fileId = guid() }) {
  if (!appName || !appUrl || !username) throw new Error('appName, appUrl and username are required');
  const url = new URL(appUrl);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error('Web Connector only accepts https:// URLs (http is allowed for localhost only)');
  }
  // AppSupport must be on the same host as AppURL or Web Connector rejects the file.
  const support = supportUrl || `${url.origin}/support`;
  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${esc(appName)}</AppName>
  <AppID></AppID>
  <AppURL>${esc(appUrl)}</AppURL>
  <AppDescription>${esc(description || appName)}</AppDescription>
  <AppSupport>${esc(support)}</AppSupport>
  <UserName>${esc(username)}</UserName>
  <OwnerID>${ownerId}</OwnerID>
  <FileID>${fileId}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>${Number(minutes)}</RunEveryNMinutes>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>
`;
}

module.exports = { makeQwc };
