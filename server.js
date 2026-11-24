'use strict';
// LANChat command-line server. Run:  node server.js
// Environment: PORT, DATA_DIR, SESSION_NAME, PASSCODE, REQUIRE_APPROVAL=0 (open join), ADMIN_KEY, DB_PASSPHRASE, TRUST_PROXY=1, PUBLIC_URL (used when printing the host link)
const path = require('path');
const readline = require('readline');
const { createApp } = require('./lib/app');

const ask = (q) => new Promise((resolve) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); resolve(a); }); });

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'), port = Number(process.env.PORT) || 3000;
  const opts = {
    dataDir, name: process.env.SESSION_NAME || process.env.CHAT_NAME, adminKey: process.env.ADMIN_KEY, passphrase: process.env.DB_PASSPHRASE,
    passcode: process.env.PASSCODE !== undefined ? process.env.PASSCODE : undefined, requireApproval: process.env.REQUIRE_APPROVAL === '0' ? false : undefined, trustProxy: process.env.TRUST_PROXY === '1',
  };
  let app;
  for (;;) {
    try { app = createApp(opts); break; }
    catch (e) {
      if (e.code !== 'LOCKED' && e.code !== 'BAD_PASSPHRASE') throw e;
      if (!process.stdin.isTTY) { console.error(e.message + ' Set DB_PASSPHRASE.'); process.exit(1); }
      opts.passphrase = await ask(e.code === 'BAD_PASSPHRASE' ? 'Wrong passphrase. Try again: ' : 'This session is encrypted. Passphrase: ');
    }
  }
  app.ctx.opts.onEvent = (name, p) => { if (name === 'joinrequest') console.log(`\n  ➜ ${p.name} wants to join${p.existing ? ' (existing account)' : ''}. Approve in the chat (Manage people).\n`); };
  await app.start(port);
  const p = app.port;
  console.log(`\n  ${app.getName()} is running. Friends on the same Wi-Fi can open one of these:\n`);
  for (const a of app.lanAddresses()) console.log(`    ${a.url}${a.lan ? '' : '   (probably a VPN/virtual adapter - try the others first)'}`);
  const base = (process.env.PUBLIC_URL || `http://localhost:${p}`).replace(/\/$/, '');
  console.log(`\n  HOST/ADMIN: open this link to sign in as the host (keep it private):\n\n    ${base}/#k=${app.adminKey}\n`);
  console.log('  Keep that link private: anyone with it can take over the host account.');
  console.log('  New people must be approved by you before they get in.');
  if (app.ctx.S.passcode) console.log('  Room passcode is enabled.');
  console.log(`  Data stored in: ${dataDir}\n`);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { app.stop(); process.exit(0); });
}

if (require.main === module) main().catch((e) => { console.error('Could not start:', e.message); process.exit(1); });
module.exports = { createApp };
