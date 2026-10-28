#!/usr/bin/env node
'use strict';

// Small helper CLI.
//
//   qbwc hash-password
//        reads the password from $QBWC_PASSWORD or stdin, prints a hash for QBWC_PASSWORD_HASH
//   qbwc make-qwc --name "My App" --url https://qb.example.com/qbwc --user <username> [--minutes 15]
const readline = require('node:readline');
const { makeQwc } = require('../src/qwc');
const { hashPassword } = require('../src/auth');

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
    else out._.push(argv[i]);
  }
  return out;
}

function readPassword() {
  if (process.env.QBWC_PASSWORD) return Promise.resolve(process.env.QBWC_PASSWORD);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise(resolve => rl.question('Password for the Web Connector account: ', a => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (cmd === 'hash-password') {
    console.log(await hashPassword(await readPassword()));
  } else if (cmd === 'make-qwc') {
    process.stdout.write(makeQwc({ appName: a.name, appUrl: a.url, username: a.user, minutes: a.minutes || 15, description: a.description }));
  } else {
    console.log('commands: hash-password | make-qwc  (see the top of bin/qbwc.js)');
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
