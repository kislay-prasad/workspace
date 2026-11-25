'use strict';
// Shared helpers for API tests. Every feature area has its own file tests/api-<area>.js, run by tests/run-api.js
// (and by `npm test`). A test file looks like:
//
//   const H = require('./harness');
//   H.suite('Polls and quizzes', async (t) => {
//     const s = await t.server();                 // fresh app + temp data dir, owner "Host" already signed in
//     const bob = await s.user('Bob');            // approved member { id, name, token }
//     await t.section('bob votes', async () => {
//       const r = await s.call('POST', '/api/send', { chan: 'general', text: 'hi' }, bob.token);
//       t.eq(r.s, 200, r.d);
//     });
//   });
//
// Each server listens on a free port (port 0), so area test files can run at the same time.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { createApp } = require(ROOT + '/lib/app');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ipn = 10;
const nextIp = () => '10.77.' + Math.floor(ipn / 250) + '.' + (ipn++ % 250 + 1);

async function startServer(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchat-api-'));
  const app = createApp({ dataDir: dir, name: opts.name || 'API test', publicDir: ROOT + '/public', trustProxy: true, requireApproval: opts.requireApproval !== false, ...opts.app });
  const port = await app.start(opts.port || 0); // 0 = any free port
  const B = `http://127.0.0.1:${port}`, ctx = app.ctx;
  async function call(method, p, b, tok, hdr = {}) {
    const r = await fetch(B + p, { method, headers: { 'x-token': tok || '', 'content-type': 'application/json', 'x-forwarded-for': hdr.ip || '10.1.1.1', ...hdr }, body: b === undefined ? undefined : JSON.stringify(b) });
    let d; const text = await r.text(); try { d = JSON.parse(text); } catch { d = { raw: text }; }
    return { s: r.status, d, h: r.headers };
  }
  // raw upload (POST /api/upload?name=...): returns the file record
  async function upload(tok, name, buf, type = 'application/octet-stream') {
    const r = await fetch(`${B}/api/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'x-token': tok, 'content-type': type, 'x-forwarded-for': '10.1.1.1' }, body: buf });
    let d; try { d = await r.json(); } catch { d = {}; } return { s: r.status, d };
  }
  // live event stream for a token: s.sse(tok).waitFor('message', (d) => d.text === 'hi')
  function sse(token) {
    const events = [], ac = new AbortController(); let buf = '';
    fetch(`${B}/api/events?token=${token}`, { signal: ac.signal, headers: { 'x-forwarded-for': '10.1.1.1' } }).then(async (r) => {
      const rd = r.body.getReader();
      for (;;) {
        const { value, done } = await rd.read(); if (done) break; buf += Buffer.from(value).toString(); let i;
        while ((i = buf.indexOf('\n\n')) >= 0) { const chunk = buf.slice(0, i); buf = buf.slice(i + 2); const ev = /^event: (.*)$/m.exec(chunk), da = /^data: (.*)$/m.exec(chunk); if (ev && da) { try { events.push([ev[1], JSON.parse(da[1])]); } catch {} } }
      }
    }).catch(() => {});
    const has = (name, pred = () => true) => events.some(([n, d]) => n === name && pred(d));
    const waitFor = async (name, pred = () => true, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { const hit = events.find(([n, d]) => n === name && pred(d)); if (hit) return hit[1]; await wait(25); } throw new Error(`timed out waiting for event "${name}"`); };
    return { events, has, waitFor, close: () => ac.abort() };
  }
  const host = ctx.makeUser('Host'); ctx.makeOwner(host);
  const owner = { id: host.id, name: 'Host', token: ctx.newToken(host) };
  // a member, created the way an approved join creates one (approval flow itself is covered by test.js)
  async function user(name, role) {
    const u = ctx.makeUser(name); if (role === 'admin') u.role = 'admin'; u.baseSeq = ctx.db.seq; ctx.store.save(); ctx.joined(u);
    return { id: u.id, name, token: ctx.newToken(u) };
  }
  const tick = (now = Date.now()) => { for (const t of ctx.ticks) t.fn(now); };
  const dm = (a, b) => 'dm:' + [a.id, b.id].sort().join(':');
  const close = () => { try { app.stop(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { app, ctx, db: ctx.db, B, port, dir, call, upload, sse, owner, user, tick, dm, wait, close, nextIp };
}

function suite(name, fn) {
  const results = []; const servers = [];
  const t = {
    server: async (o) => { const s = await startServer(o); servers.push(s); return s; },
    section: async (label, f) => {
      try { await f(); results.push([label, true]); console.log('  ✓', label); }
      catch (e) { results.push([label, false, e]); console.log('  ✗', label, '\n     ', String(e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); }
    },
    eq: (a, b, info) => assert.deepStrictEqual(a, b, info === undefined ? undefined : typeof info === 'string' ? info : JSON.stringify(info)),
    ok: (v, info) => assert.ok(v, info === undefined ? undefined : typeof info === 'string' ? info : JSON.stringify(info)),
    wait,
  };
  (async () => {
    console.log(name);
    try { await fn(t); } catch (e) { results.push(['(suite setup)', false, e]); console.log('  ✗ suite failed:', e.stack || e.message); }
    for (const s of servers) s.close();
    const bad = results.filter((r) => !r[1]).length;
    console.log(`${name}: ${results.length - bad}/${results.length} passed`);
    process.exit(bad ? 1 : 0);
  })();
}

module.exports = { startServer, suite, wait, ROOT };
