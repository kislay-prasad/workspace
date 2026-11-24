'use strict';
// Server test suite: exercises approval, roles, privacy, messaging, collab, backup/restore and encryption in-process.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('./lib/app');
const { writeZip, readZipIndex } = require('./lib/zip');
const { fetchPreview } = require('./lib/linkpreview');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchat-test-'));
const results = []; let ipn = 10;
const nextIp = () => '10.9.' + Math.floor(ipn / 250) + '.' + (ipn++ % 250 + 1);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let app, B, owner, KEY;
async function call(method, p, b, tok, hdr = {}) {
  const r = await fetch(B + p, { method, headers: { 'x-token': tok || '', 'content-type': 'application/json', 'x-forwarded-for': hdr.ip || '10.1.1.1', ...hdr }, body: b === undefined ? undefined : JSON.stringify(b) });
  let d; try { d = await r.json(); } catch { d = {}; }
  return { s: r.status, d };
}
function sse(token) {
  const events = [], ac = new AbortController(); let buf = '';
  fetch(`${B}/api/events?token=${token}`, { signal: ac.signal }).then(async (r) => { const rd = r.body.getReader(); for (;;) { const { value, done } = await rd.read(); if (done) break; buf += Buffer.from(value).toString(); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const e = /event: (.*)/.exec(blk), d = /data: (.*)/.exec(blk); if (e && d) events.push([e[1], JSON.parse(d[1])]); } } }).catch(() => {});
  const has = (name, pred = () => true) => events.some(([n, d]) => n === name && pred(d));
  const waitFor = async (name, pred = () => true, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { if (has(name, pred)) return events.find(([n, d]) => n === name && pred(d))[1]; await wait(25); } throw new Error('timed out waiting for event ' + name); };
  return { events, has, waitFor, close: () => ac.abort() };
}
// full join flow: request -> owner approves -> poll -> token
async function newUser(name) {
  const ip = nextIp(), j = await call('POST', '/api/join', { name, deviceId: 'dev-' + name }, null, { ip });
  assert.equal(j.s, 202, 'join should wait for approval: ' + JSON.stringify(j.d));
  const dec = await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'approve' }, owner.token);
  assert.equal(dec.s, 200, 'approve: ' + JSON.stringify(dec.d));
  const st = await call('GET', `/api/join/status?id=${j.d.id}&s=${j.d.secret}`);
  assert.equal(st.d.status, 'approved'); return { token: st.d.token, id: st.d.me.id, name, ip };
}
const tick = (now = Date.now()) => { for (const t of app.ctx.ticks) t.fn(now); };
async function section(name, fn) { try { await fn(); results.push([name, true]); console.log('  ✓', name); } catch (e) { results.push([name, false, e]); console.log('  ✗', name, '\n     ', (e.stack || e.message).split('\n').slice(0, 4).join('\n      ')); } }

(async () => {
  app = createApp({ dataDir: path.join(tmp, 'main'), name: 'Test Session', trustProxy: true, publicDir: path.join(__dirname, 'public') });
  const port = await app.start(3900 + Math.floor(Math.random() * 90)); B = `http://127.0.0.1:${port}`; KEY = app.adminKey;
  console.log('LANChat server tests on', B);

  let bob, carol, dave, eve, ownerSse, bobSse;
  await section('config is public and says approval is required', async () => {
    const c = await call('GET', '/api/config'); assert.equal(c.s, 200); assert.equal(c.d.approval, true); assert.equal(c.d.name, 'Test Session');
  });
  await section('host claims ownership with the admin key (no approval)', async () => {
    const j = await call('POST', '/api/join', { name: 'Host', adminKey: KEY, deviceId: 'dev-host' }, null, { ip: nextIp() });
    assert.equal(j.s, 200); assert.equal(j.d.me.role, 'owner'); owner = { token: j.d.token, id: j.d.me.id };
    ownerSse = sse(owner.token); await ownerSse.waitFor('init');
  });
  await section('a wrong admin key gives no special powers', async () => {
    const j = await call('POST', '/api/join', { name: 'Mallory', adminKey: 'x'.repeat(48), deviceId: 'dev-m' }, null, { ip: nextIp() });
    assert.equal(j.s, 202, 'wrong key must fall back to the normal approval path'); assert(!j.d.token);
  });
  await section('joining needs approval; requester has no access until approved', async () => {
    const ip = nextIp(), j = await call('POST', '/api/join', { name: 'Bob', deviceId: 'dev-bob' }, null, { ip });
    assert.equal(j.s, 202); assert(j.d.id && j.d.secret && !j.d.token);
    assert.equal((await call('GET', '/api/messages?chan=general')).s, 401);
    assert.equal((await call('GET', `/api/join/status?id=${j.d.id}&s=wrong`)).s, 404, 'wrong secret');
    assert.equal((await call('GET', `/api/join/status?id=${j.d.id}&s=${j.d.secret}`)).d.status, 'pending');
    assert.equal((await fetch(`${B}/api/events?token=${j.d.secret}`)).status, 401, 'secret is not a token');
    await ownerSse.waitFor('joinrequest', (r) => r.name === 'Bob');
    const dup = await call('POST', '/api/join', { name: 'bob', deviceId: 'someone-else' }, null, { ip: nextIp() }); assert.equal(dup.s, 409, 'same name, other device');
    const same = await call('POST', '/api/join', { name: 'Bob', deviceId: 'dev-bob' }, null, { ip }); assert.equal(same.d.id, j.d.id, 'same device resumes the same request');
    const sneaky = await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'approve' }, j.d.secret); assert.equal(sneaky.s, 401);
    const ok = await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'approve' }, owner.token); assert.equal(ok.s, 200);
    const st = await call('GET', `/api/join/status?id=${j.d.id}&s=${j.d.secret}`); assert.equal(st.d.status, 'approved'); bob = { token: st.d.token, id: st.d.me.id, ip };
    assert.equal(st.d.me.role, 'member');
    assert.equal((await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'approve' }, owner.token)).s, 404, 'cannot decide twice');
    bobSse = sse(bob.token); await bobSse.waitFor('init');
  });
  await section('members cannot approve; deny and block work; blocked people stay out', async () => {
    const ip = nextIp(), j = await call('POST', '/api/join', { name: 'Troll', deviceId: 'dev-troll' }, null, { ip });
    assert.equal((await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'approve' }, bob.token)).s, 403);
    assert.equal((await call('GET', '/api/admin/requests', undefined, bob.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'block' }, owner.token)).s, 200);
    assert.equal((await call('GET', `/api/join/status?id=${j.d.id}&s=${j.d.secret}`)).d.status, 'denied');
    assert.equal((await call('POST', '/api/join', { name: 'Troll', deviceId: 'x' }, null, { ip: nextIp() })).s, 403, 'name blocked');
    assert.equal((await call('POST', '/api/join', { name: 'Another', deviceId: 'dev-troll' }, null, { ip: nextIp() })).s, 403, 'device blocked');
    assert.equal((await call('POST', '/api/join', { name: 'Another', deviceId: 'y' }, null, { ip })).s, 403, 'ip blocked');
    const bans = (await call('GET', '/api/admin/bans', undefined, owner.token)).d; assert(bans.names.includes('troll'));
    await call('POST', '/api/admin/unban', { kind: 'name', value: 'troll' }, owner.token); await call('POST', '/api/admin/unban', { kind: 'device', value: 'dev-troll' }, owner.token); await call('POST', '/api/admin/unban', { kind: 'ip', value: ip }, owner.token);
    const d = await call('POST', '/api/join', { name: 'Troll', deviceId: 'dev-troll' }, null, { ip }); assert.equal(d.s, 202, 'unblocked');
    await call('POST', '/api/admin/requests/decide', { id: d.d.id, decision: 'deny' }, owner.token);
  });
  await section('passcode is enforced before a request is even queued', async () => {
    assert.equal((await call('POST', '/api/admin/settings', { passcode: 'letmein' }, bob.token)).s, 403, 'members cannot change settings');
    assert.equal((await call('POST', '/api/admin/settings', { passcode: 'letmein' }, owner.token)).s, 200);
    assert.equal((await call('GET', '/api/config')).d.needPass, true);
    assert.equal((await call('POST', '/api/join', { name: 'Pat', deviceId: 'p1' }, null, { ip: nextIp() })).s, 403);
    const ok = await call('POST', '/api/join', { name: 'Pat', passcode: 'letmein', deviceId: 'p1' }, null, { ip: nextIp() }); assert.equal(ok.s, 202);
    await call('POST', '/api/admin/requests/decide', { id: ok.d.id, decision: 'deny' }, owner.token);
    await call('POST', '/api/admin/settings', { passcode: '' }, owner.token);
    const ip = nextIp(); await call('POST', '/api/admin/settings', { passcode: 'zz' }, owner.token);
    for (let i = 0; i < 6; i++) await call('POST', '/api/join', { name: 'Guess' + i, passcode: 'no' + i, deviceId: 'g' }, null, { ip });
    assert.equal((await call('POST', '/api/join', { name: 'Guess9', passcode: 'zz', deviceId: 'g' }, null, { ip })).s, 429, 'passcode guessing is rate limited');
    await call('POST', '/api/admin/settings', { passcode: '' }, owner.token);
  });
  await section('join attempts are rate limited per address', async () => {
    const ip = nextIp(); let last;
    for (let i = 0; i < 18; i++) last = await call('POST', '/api/join', { name: 'Spam' + i, deviceId: 'sp' + i }, null, { ip });
    assert(last.s === 429, 'expected 429, got ' + last.s);
  });
  await section('more people join; names are unique and reclaiming needs approval', async () => {
    carol = await newUser('Carol'); dave = await newUser('Dave'); eve = await newUser('Eve');
    const same = await call('POST', '/api/join', { name: 'carol', deviceId: 'dev-new' }, null, { ip: nextIp() }); assert.equal(same.s, 202, 'existing name needs approval (recovery)');
    await ownerSse.waitFor('joinrequest', (r) => r.name === 'Carol' && r.existing);
    const online = await call('POST', '/api/join', { name: 'Host', deviceId: 'zzz' }, null, { ip: nextIp() }); assert.equal(online.s, 409, 'cannot take an online name');
    const carolSse = sse(carol.token); await carolSse.waitFor('init'); const again = await call('POST', '/api/join', { name: 'Carol', deviceId: 'dev-3' }, null, { ip: nextIp() });
    assert.equal(again.s, 409, 'Carol is online'); carolSse.close(); await wait(100);
    const dec = await call('POST', '/api/admin/requests/decide', { id: same.d.id, decision: 'approve' }, owner.token); assert.equal(dec.s, 200);
    const st = await call('GET', `/api/join/status?id=${same.d.id}&s=${same.d.secret}`); assert.equal(st.d.me.id, carol.id, 'recovery returns the same account');
    assert.equal((await call('GET', '/api/messages?chan=general', undefined, carol.token)).s, 200, 'old token still works');
    assert.equal((await call('GET', '/api/messages?chan=general', undefined, st.d.token)).s, 200, 'new token works');
  });
  await section('open-join mode lets new people straight in (existing names still need approval)', async () => {
    await call('POST', '/api/admin/settings', { requireApproval: false }, owner.token);
    const j = await call('POST', '/api/join', { name: 'Walkin', deviceId: 'w' }, null, { ip: nextIp() }); assert.equal(j.s, 200); assert(j.d.token);
    const r = await call('POST', '/api/join', { name: 'Carol', deviceId: 'w2' }, null, { ip: nextIp() }); assert.equal(r.s, 202);
    await call('POST', '/api/admin/requests/decide', { id: r.d.id, decision: 'deny' }, owner.token);
    await call('POST', '/api/admin/settings', { requireApproval: true }, owner.token);
  });
  await section('settings validation', async () => {
    assert.equal((await call('POST', '/api/admin/settings', { retentionDays: -4 }, owner.token)).s, 400);
    assert.equal((await call('POST', '/api/admin/settings', { maxUploadMB: 'lots' }, owner.token)).s, 400);
    assert.equal((await call('POST', '/api/admin/name', { name: '  Friday   Gang ' }, owner.token)).d.name, 'Friday Gang');
    await ownerSse.waitFor('meta', (m) => m.name === 'Friday Gang');
  });

  await section('roles: only the host promotes; admins get moderator powers but not host powers', async () => {
    assert.equal((await call('POST', '/api/admin/user/role', { id: dave.id, role: 'admin' }, bob.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/user/role', { id: dave.id, role: 'admin' }, owner.token)).s, 200);
    assert.equal((await call('POST', '/api/admin/user/role', { id: eve.id, role: 'admin' }, dave.token)).s, 403, 'admin cannot promote');
    assert.equal((await call('POST', '/api/admin/settings', { linkPreviews: true }, dave.token)).s, 403, 'admin cannot change host settings');
    assert.equal((await call('POST', '/api/admin/user/remove', { id: owner.id }, dave.token)).s, 403, 'host cannot be removed');
    assert.equal((await call('POST', '/api/admin/user/mute', { id: owner.id, minutes: 5 }, dave.token)).s, 403);
    const j = await call('POST', '/api/join', { name: 'Fred', deviceId: 'f' }, null, { ip: nextIp() });
    assert.equal((await call('POST', '/api/admin/requests/decide', { id: j.d.id, decision: 'deny' }, dave.token)).s, 200, 'admins can approve');
    assert.equal((await call('GET', '/api/admin/storage', undefined, dave.token)).s, 200);
    assert.equal((await call('GET', '/api/admin/backup', undefined, dave.token)).s, 403, 'only the host can back up');
    assert.equal((await call('POST', '/api/admin/encryption', { enable: true, passphrase: 'abcdefgh' }, dave.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/retention/run', {}, dave.token)).s, 403);
  });

  // ---------- channels & groups ----------
  let gid, cid;
  await section('public channels, read-only, slow mode, and permissions', async () => {
    cid = (await call('POST', '/api/channel', { name: 'Game Night!' }, bob.token)).d.id; assert.equal(cid, 'game-night');
    assert.equal((await call('POST', '/api/channel', { name: 'game night' }, bob.token)).s, 409);
    assert.equal((await call('POST', '/api/channel/update', { id: cid, topic: 'x' }, carol.token)).s, 403, 'members cannot edit channels');
    assert.equal((await call('POST', '/api/channel/update', { id: cid, topic: 'Play', category: 'Fun' }, dave.token)).d.category, 'Fun');
    await call('POST', '/api/admin/settings', { membersCanCreateChannels: false }, owner.token);
    assert.equal((await call('POST', '/api/channel', { name: 'nope' }, bob.token)).s, 403); assert.equal((await call('POST', '/api/channel', { name: 'ok-admin' }, dave.token)).s, 200);
    await call('POST', '/api/admin/settings', { membersCanCreateChannels: true }, owner.token);
    const ann = (await call('POST', '/api/channel', { name: 'announcements', readonly: true }, dave.token)).d;
    assert.equal((await call('POST', '/api/send', { chan: ann.id, text: 'hi' }, bob.token)).s, 403, 'read-only for members');
    assert.equal((await call('POST', '/api/send', { chan: ann.id, text: 'Welcome' }, dave.token)).s, 200, 'admins can post');
    assert.equal((await call('POST', '/api/channel/update', { id: cid, slow: 30 }, dave.token)).d.slow, 30);
    assert.equal((await call('POST', '/api/send', { chan: cid, text: 'one' }, bob.token)).s, 200);
    assert.equal((await call('POST', '/api/send', { chan: cid, text: 'two' }, bob.token)).s, 429, 'slow mode');
    assert.equal((await call('POST', '/api/send', { chan: cid, text: 'admins are exempt' }, dave.token)).s, 200);
    await call('POST', '/api/channel/update', { id: cid, slow: 0 }, dave.token);
    assert.equal((await call('POST', '/api/channel/delete', { id: 'general' }, owner.token)).s, 400, 'general stays');
    assert.equal((await call('POST', '/api/channel/delete', { id: cid }, bob.token)).s, 403);
    const tmpc = (await call('POST', '/api/channel', { name: 'temp' }, bob.token)).d; await call('POST', '/api/send', { chan: tmpc.id, text: 'bye' }, bob.token);
    assert.equal((await call('POST', '/api/channel/delete', { id: tmpc.id }, dave.token)).s, 200); assert.equal((await call('GET', '/api/messages?chan=temp', undefined, bob.token)).s, 404);
  });
  await section('private groups: only members see, read or post; managers add/remove; members can leave', async () => {
    const g = await call('POST', '/api/channel', { name: 'Study crew', members: [carol.id] }, bob.token); assert.equal(g.s, 200); gid = g.d.id; assert(g.d.members.includes(bob.id));
    assert.equal((await call('POST', '/api/channel', { name: 'solo', members: [] }, bob.token)).s, 400);
    const dSse = sse(dave.token), cSse = sse(carol.token); await dSse.waitFor('init'); await cSse.waitFor('init');
    await call('POST', '/api/send', { chan: gid, text: 'group secret' }, bob.token); await cSse.waitFor('message', (m) => m.text === 'group secret'); await wait(100);
    assert(!dSse.has('message', (m) => m.text === 'group secret'), 'outsider must not get the message');
    assert(!(await call('GET', '/api/search?q=group%20secret', undefined, dave.token)).d.results.length, 'search respects privacy');
    assert.equal((await call('GET', '/api/messages?chan=' + gid, undefined, dave.token)).s, 404); assert.equal((await call('POST', '/api/send', { chan: gid, text: 'x' }, dave.token)).s, 404);
    assert.equal((await call('POST', '/api/channel/members', { id: gid, add: [dave.id] }, carol.token)).s, 403, 'plain members cannot add');
    assert.equal((await call('POST', '/api/channel/members', { id: gid, add: [dave.id] }, bob.token)).s, 200); await dSse.waitFor('channel', (c) => c.id === gid);
    assert.equal((await call('GET', '/api/messages?chan=' + gid, undefined, dave.token)).s, 200);
    await call('POST', '/api/channel/members', { id: gid, remove: [dave.id] }, bob.token); await dSse.waitFor('channel_removed', (c) => c.id === gid);
    assert.equal((await call('GET', '/api/messages?chan=' + gid, undefined, dave.token)).s, 404);
    assert.equal((await call('POST', '/api/channel/members', { id: gid, remove: [bob.id] }, carol.token)).s, 403, 'cannot remove someone else');
    assert.equal((await call('POST', '/api/channel/members', { id: gid, remove: [carol.id] }, carol.token)).s, 200, 'leave');
    const init = (await (async () => { const s = sse(carol.token); const d = await s.waitFor('init'); s.close(); return d; })()); assert(!init.channels.some((c) => c.id === gid), 'left group is gone from init');
    dSse.close(); cSse.close();
  });
  await section('direct messages are private and well-formed', async () => {
    const dm = 'dm:' + [bob.id, carol.id].sort().join(':');
    assert.equal((await call('POST', '/api/send', { chan: dm, text: 'psst' }, bob.token)).s, 200);
    assert.equal((await call('GET', '/api/messages?chan=' + dm, undefined, carol.token)).d.messages.length, 1);
    assert.equal((await call('GET', '/api/messages?chan=' + dm, undefined, dave.token)).s, 404);
    assert.equal((await call('POST', '/api/send', { chan: dm, text: 'x' }, owner.token)).s, 404, 'even the host cannot read DMs');
    assert.equal((await call('GET', '/api/messages?chan=' + 'dm:' + [bob.id, carol.id].sort().reverse().join(':'), undefined, bob.token)).s, 404, 'non-canonical id rejected');
    assert.equal((await call('GET', '/api/search?q=psst', undefined, owner.token)).d.results.length, 0, 'host search does not leak DMs');
  });

  // ---------- messages ----------
  let m1;
  await section('send / edit (with history) / react / delete permissions', async () => {
    const s = await call('POST', '/api/send', { chan: 'general', text: 'hello **world**' }, bob.token); m1 = s.d.id;
    assert.equal((await call('POST', '/api/edit', { id: m1, text: 'x' }, carol.token)).s, 403);
    assert.equal((await call('POST', '/api/edit', { id: m1, text: 'hello again' }, bob.token)).s, 200);
    const h = (await call('GET', '/api/msg/history?id=' + m1, undefined, carol.token)).d.versions; assert.deepEqual(h.map((v) => v.text), ['hello **world**', 'hello again']);
    assert.equal((await call('POST', '/api/react', { id: m1, emoji: '👍' }, carol.token)).s, 200);
    for (const bad of ['__proto__', 'constructor', 'abc', ':nope:', 'x'.repeat(30)]) assert.equal((await call('POST', '/api/react', { id: m1, emoji: bad }, carol.token)).s, 400, 'bad reaction ' + bad);
    const got = (await call('GET', '/api/messages?chan=general', undefined, bob.token)).d.messages.find((m) => m.id === m1); assert.deepEqual(got.reactions['👍'], [carol.id]); assert.equal(got.edits, 1); assert(!got.editHistory);
    assert.equal((await call('POST', '/api/delete', { id: m1 }, carol.token)).s, 403);
    const mine = (await call('POST', '/api/send', { chan: 'general', text: 'from carol' }, carol.token)).d.id;
    assert.equal((await call('POST', '/api/delete', { id: mine }, dave.token)).s, 200, 'admins can delete others');
    const own = (await call('POST', '/api/send', { chan: 'general', text: 'host says' }, owner.token)).d.id;
    assert.equal((await call('POST', '/api/delete', { id: own }, dave.token)).s, 403, "admins cannot delete the host's messages");
    assert.equal((await call('POST', '/api/delete', { id: own }, owner.token)).s, 200);
    const tomb = (await call('GET', '/api/messages?chan=general', undefined, bob.token)).d.messages.find((m) => m.id === mine); assert(tomb.deleted && !tomb.text && tomb.deletedBy === dave.id);
  });
  await section('threads keep replies out of the main stream and count them', async () => {
    const root = (await call('POST', '/api/send', { chan: 'general', text: 'discuss' }, bob.token)).d.id;
    await call('POST', '/api/send', { chan: 'general', text: 'r1', thread: root }, carol.token); await call('POST', '/api/send', { chan: 'general', text: 'r2', thread: root }, dave.token);
    assert.equal((await call('POST', '/api/send', { chan: 'general', text: 'bad', thread: m1 + 'zz' }, dave.token)).s, 400);
    const main = (await call('GET', '/api/messages?chan=general', undefined, bob.token)).d.messages; assert(!main.some((m) => m.thread)); assert.equal(main.find((m) => m.id === root).threadCount, 2);
    const t = (await call('GET', `/api/thread?chan=general&id=${root}`, undefined, eve.token)).d; assert.deepEqual(t.messages.map((m) => m.text), ['r1', 'r2']);
    const nested = await call('POST', '/api/send', { chan: 'general', text: 'nested', thread: t.messages[0].id }, bob.token); assert.equal(nested.s, 400, 'no nested threads');
  });
  await section('mentions and @everyone', async () => {
    const e = sse(eve.token); await e.waitFor('init');
    const a = (await call('POST', '/api/send', { chan: 'general', text: 'hey @Eve and @eve, email me@Eve.com' }, bob.token)).d.id; const m = await e.waitFor('message', (x) => x.id === a); assert.deepEqual(m.mentions, [eve.id]);
    const b = (await call('POST', '/api/send', { chan: 'general', text: '@everyone hi' }, bob.token)).d.id; const mb = await e.waitFor('message', (x) => x.id === b); assert(!mb.everyone, 'members cannot @everyone by default');
    const c = (await call('POST', '/api/send', { chan: 'general', text: '@everyone meeting' }, dave.token)).d.id; assert((await e.waitFor('message', (x) => x.id === c)).everyone, 'admins can');
    e.close(); const ini = await (async () => { const s = sse(eve.token); const d = await s.waitFor('init'); s.close(); return d; })();
    assert(ini.mentions.general >= 2, 'unread mentions counted: ' + JSON.stringify(ini.mentions)); assert(ini.unread.general >= 3);
    await call('POST', '/api/read', { chan: 'general' }, eve.token); const ini2 = await (async () => { const s = sse(eve.token); const d = await s.waitFor('init'); s.close(); return d; })(); assert(!ini2.unread.general && !ini2.mentions.general);
  });
  await section('pins: admins in channels, participants in DMs; saved bookmarks via prefs', async () => {
    assert.equal((await call('POST', '/api/pin', { id: m1 }, carol.token)).s, 403);
    assert.equal((await call('POST', '/api/pin', { id: m1 }, dave.token)).d.pinned, true);
    const dm = 'dm:' + [bob.id, carol.id].sort().join(':'), dmm = (await call('GET', '/api/messages?chan=' + dm, undefined, bob.token)).d.messages[0].id;
    assert.equal((await call('POST', '/api/pin', { id: dmm }, carol.token)).d.pinned, true, 'DM participant can pin'); assert.equal((await call('POST', '/api/pin', { id: dmm }, dave.token)).s, 404);
    assert.equal((await call('POST', '/api/prefs', { saved: [m1, 'not-an-id', '__proto__'], pinnedChats: ['general', 'nonexistent'], muted: { general: true, __proto__: true, bogus: 1 }, evil: 1 }, bob.token)).d.prefs.saved.length, 1);
    const p = (await call('GET', '/api/search?has=pin', undefined, bob.token)).d.results; assert(p.some((x) => x.id === m1));
    const saved = (await call('POST', '/api/messages/byids', { ids: [m1, dmm] }, bob.token)).d.messages; assert.equal(saved.length, 2);
    const forbidden = (await call('POST', '/api/messages/byids', { ids: [dmm] }, dave.token)).d.messages; assert.equal(forbidden.length, 0);
    const pr = (await call('GET', '/api/me-prefs', undefined, bob.token)); assert.equal(pr.s, 404);
  });
  await section('uploads: limits, ownership, access control, ranges, forwarding, multi-file', async () => {
    await call('POST', '/api/admin/settings', { maxUploadMB: 1 }, owner.token);
    const big = await fetch(`${B}/api/upload?name=big.bin`, { method: 'POST', headers: { 'x-token': bob.token }, body: Buffer.alloc(2 * 1048576) }); assert.equal(big.status, 413);
    await call('POST', '/api/admin/settings', { maxUploadMB: 100 }, owner.token);
    const up = async (tok, name, data) => (await fetch(`${B}/api/upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'x-token': tok }, body: data })).json();
    const f1 = await up(bob.token, '../../evil name.png', Buffer.from('PNGDATA-1234567890')), f2 = await up(bob.token, 'note.txt', Buffer.from('hello'));
    assert(!f1.name.includes('/') && !f1.name.includes('..'), 'sanitized: ' + f1.name);
    const sent = await call('POST', '/api/send', { chan: gid, text: '', files: [f1, f2] }, bob.token); assert.equal(sent.s, 200);
    const get = (tok, id, name, hdr) => fetch(`${B}/files/${id}/${encodeURIComponent(name)}?token=${tok}&inline=1`, { headers: hdr });
    assert.equal((await get(carol.token, f1.id, f1.name)).status, 404, 'carol left the group');
    const rejoin = await call('POST', '/api/channel/members', { id: gid, add: [carol.id] }, bob.token); assert.equal(rejoin.s, 200);
    assert.equal((await call('POST', '/api/send', { chan: gid, text: 'stolen', files: [f1] }, carol.token)).s, 400, 'cannot attach someone else’s upload');
    const r = await get(carol.token, f1.id, f1.name); assert.equal(r.status, 200); assert.equal(await r.text(), 'PNGDATA-1234567890'); assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal((await get(dave.token, f1.id, f1.name)).status, 404, 'outsider blocked'); assert.equal((await fetch(`${B}/files/${f1.id}/x`)).status, 401);
    const rg = await get(carol.token, f1.id, f1.name, { range: 'bytes=3-6' }); assert.equal(rg.status, 206); assert.equal(await rg.text(), 'DATA'); assert.equal(rg.headers.get('content-range'), 'bytes 3-6/18');
    const html = await up(bob.token, 'x.html', Buffer.from('<script>alert(1)</script>')); await call('POST', '/api/send', { chan: gid, text: 'h', files: [html] }, bob.token);
    const h = await get(carol.token, html.id, 'x.html'); assert.equal(h.headers.get('content-type'), 'application/octet-stream'); assert(/attachment/.test(h.headers.get('content-disposition')));
    const msgs = (await call('GET', '/api/messages?chan=' + gid, undefined, bob.token)).d.messages, fm = msgs.find((m) => m.files && m.files.length === 2);
    const fw = await call('POST', '/api/forward', { id: fm.id, chan: 'general' }, carol.token); assert.equal(fw.s, 200);
    const gen = (await call('GET', '/api/messages?chan=general', undefined, dave.token)).d.messages.find((m) => m.id === fw.d.id); assert(gen.fwd && gen.files.length === 2);
    assert.equal((await get(dave.token, f1.id, f1.name)).status, 200, 'forwarded files become visible where forwarded');
    const lf = (await call('GET', `/api/files?chan=${gid}&kind=image`, undefined, carol.token)).d.files; assert.equal(lf.length, 1);
    await call('POST', '/api/delete', { id: fm.id }, bob.token); assert.equal((await get(bob.token, f2.id, f2.name)).status, 200, 'file kept: still referenced by the forward');
    await call('POST', '/api/delete', { id: fw.d.id }, carol.token); await wait(50); assert(!fs.existsSync(path.join(app.ctx.P.uploads, f2.id)), 'unreferenced file removed from disk');
  });
  await section('polls, quizzes and tic-tac-toe', async () => {
    const p = (await call('POST', '/api/send', { chan: 'general', poll: { q: 'Pizza?', options: ['Yes', 'No', ''], multi: false } }, bob.token)).d.id;
    assert.equal((await call('POST', '/api/send', { chan: 'general', poll: { q: 'x', options: ['only'] } }, bob.token)).s, 400);
    await call('POST', '/api/poll/vote', { id: p, option: 0 }, carol.token); await call('POST', '/api/poll/vote', { id: p, option: 1 }, carol.token);
    const got = () => call('GET', '/api/messages?chan=general', undefined, bob.token).then((r) => r.d.messages.find((m) => m.id === p));
    let pm = await got(); assert.deepEqual(pm.poll.options.map((o) => o.v.length), [0, 1], 'single choice moves the vote');
    assert.equal((await call('POST', '/api/poll/close', { id: p }, carol.token)).s, 403); await call('POST', '/api/poll/close', { id: p }, bob.token); assert.equal((await call('POST', '/api/poll/vote', { id: p, option: 0 }, dave.token)).s, 400);
    const q = (await call('POST', '/api/send', { chan: 'general', poll: { q: '2+2?', options: ['3', '4', '5'], correct: 1 } }, bob.token)).d.id;
    const qm = () => call('GET', '/api/messages?chan=general', undefined, carol.token).then((r) => r.d.messages.find((m) => m.id === q));
    assert.equal((await qm()).poll.correct, undefined, 'answer hidden while open'); await call('POST', '/api/poll/vote', { id: q, option: 1 }, carol.token); assert.equal((await call('POST', '/api/poll/vote', { id: q, option: 2 }, carol.token)).s, 409, 'one answer only');
    await call('POST', '/api/poll/close', { id: q }, bob.token); assert.equal((await qm()).poll.correct, 1, 'revealed on close');
    const g = (await call('POST', '/api/send', { chan: 'general', game: { type: 'ttt' } }, bob.token)).d.id;
    assert.equal((await call('POST', '/api/game/move', { id: g, cell: 0 }, bob.token)).s, 400, 'needs two players'); assert.equal((await call('POST', '/api/game/join', { id: g }, bob.token)).s, 400);
    await call('POST', '/api/game/join', { id: g }, carol.token);
    for (const [who, cell] of [[bob, 0], [carol, 3], [bob, 1], [carol, 4], [bob, 2]]) assert.equal((await call('POST', '/api/game/move', { id: g, cell }, who.token)).s, 200);
    const gm = (await call('GET', '/api/messages?chan=general', undefined, bob.token)).d.messages.find((m) => m.id === g); assert.equal(gm.game.winner, 'x');
    assert.equal((await call('POST', '/api/game/move', { id: g, cell: 5 }, carol.token)).s, 400, 'game over');
  });
  await section('scheduled messages, disappearing messages, retention', async () => {
    const at = Date.now() + 60000, s = await call('POST', '/api/send', { chan: 'general', text: 'later', sendAt: at }, bob.token); assert(s.d.scheduled);
    assert.equal((await call('GET', '/api/scheduled', undefined, bob.token)).d.scheduled.length, 1); assert.equal((await call('GET', '/api/scheduled', undefined, carol.token)).d.scheduled.length, 0);
    const doomed = await call('POST', '/api/send', { chan: 'general', text: 'cancel me', sendAt: at }, bob.token);
    assert.equal((await call('POST', '/api/scheduled/cancel', { id: doomed.d.scheduled.id }, carol.token)).s, 404); assert.equal((await call('POST', '/api/scheduled/cancel', { id: doomed.d.scheduled.id }, bob.token)).s, 200);
    app.ctx.db.scheduled[0].sendAt = Date.now() - 1; tick(); await wait(50);
    assert((await call('GET', '/api/messages?chan=general', undefined, carol.token)).d.messages.some((m) => m.text === 'later'), 'scheduled message delivered');
    const t = (await call('POST', '/api/send', { chan: 'general', text: 'poof', ttl: 60 }, bob.token)).d.id; assert(app.ctx.msgById.get(t).expiresAt > Date.now());
    app.ctx.msgById.get(t).expiresAt = Date.now() - 1; tick(); await wait(50); assert(!(await call('GET', '/api/messages?chan=general', undefined, carol.token)).d.messages.some((m) => m.id === t), 'expired message purged');
    await call('POST', '/api/admin/settings', { retentionDays: 1 }, owner.token);
    const old = (await call('POST', '/api/send', { chan: 'general', text: 'ancient' }, bob.token)).d.id; const keep = (await call('POST', '/api/send', { chan: 'general', text: 'ancient pinned' }, bob.token)).d.id;
    for (const id of [old, keep]) app.ctx.msgById.get(id).ts = Date.now() - 3 * 86400000; await call('POST', '/api/pin', { id: keep }, dave.token);
    assert.equal((await call('POST', '/api/admin/retention/run', {}, dave.token)).s, 403); const run = await call('POST', '/api/admin/retention/run', {}, owner.token); assert(run.d.removed >= 1);
    assert(!app.ctx.msgById.has(old) && app.ctx.msgById.has(keep), 'old removed, pinned kept'); await call('POST', '/api/admin/settings', { retentionDays: 0 }, owner.token);
    const dm = 'dm:' + [bob.id, carol.id].sort().join(':'); assert.equal((await call('POST', '/api/chat/ttl', { chan: dm, ttl: 3600 }, bob.token)).s, 200);
    const dd = (await call('POST', '/api/send', { chan: dm, text: 'timed' }, carol.token)).d.id; assert(app.ctx.msgById.get(dd).expiresAt); await call('POST', '/api/chat/ttl', { chan: dm, ttl: 0 }, bob.token);
  });
  await section('receipts: delivered and seen events; privacy switch', async () => {
    const dm = 'dm:' + [bob.id, dave.id].sort().join(':'), bs = sse(bob.token); await bs.waitFor('init');
    const ds = sse(dave.token); await ds.waitFor('init');
    const mm = await call('POST', '/api/send', { chan: dm, text: 'ping' }, bob.token); await bs.waitFor('delivered', (e) => e.chan === dm && e.user === dave.id && e.seq === mm.d.seq);
    await call('POST', '/api/read', { chan: dm }, dave.token); await bs.waitFor('seen', (e) => e.chan === dm && e.user === dave.id && e.seq >= mm.d.seq);
    await call('POST', '/api/prefs', { readReceipts: false }, dave.token); const m2 = await call('POST', '/api/send', { chan: dm, text: 'again' }, bob.token); await call('POST', '/api/read', { chan: dm }, dave.token); await wait(150);
    assert(!bs.has('seen', (e) => e.seq >= m2.d.seq), 'no read receipt when switched off'); bs.close(); ds.close();
    const seenby = (await call('GET', `/api/seenby?chan=general&seq=1`, undefined, bob.token)).d.users; assert(Array.isArray(seenby));
  });
  await section('search filters', async () => {
    const r = (await call('GET', `/api/search?q=hello&from=${bob.id}`, undefined, carol.token)).d.results; assert(r.length >= 1 && r.every((m) => m.from === bob.id));
    assert.equal((await call('GET', `/api/search?q=hello&from=${dave.id}`, undefined, carol.token)).d.results.length, 0);
    assert((await call('GET', '/api/search?has=file&chan=' + gid, undefined, bob.token)).d.results.every((m) => m.files)); assert((await call('GET', `/api/search?has=mention`, undefined, eve.token)).d.results.length >= 1);
    assert.equal((await call('GET', `/api/search?q=hello&after=${Date.now() + 10000}`, undefined, carol.token)).d.results.length, 0, 'date filter');
    assert.equal((await call('GET', '/api/search?q=a', undefined, carol.token)).d.results.length, 0, 'one-letter search ignored');
    const win = (await call('GET', `/api/messages?chan=general&from=${Date.now() - 86400000}&limit=10`, undefined, bob.token)).d; assert(win.messages.length <= 10 && win.messages.length > 0);
    const older = (await call('GET', `/api/messages?chan=general&before=${win.messages[win.messages.length - 1].seq}&limit=10`, undefined, bob.token)).d; assert(older.messages.every((m) => m.seq < win.messages[win.messages.length - 1].seq));
  });
  await section('custom emoji, profile, presence', async () => {
    const png = await (await fetch(`${B}/api/upload?name=party.png`, { method: 'POST', headers: { 'x-token': bob.token }, body: Buffer.from('89504e470d0a1a0a', 'hex') })).json();
    assert.equal((await call('POST', '/api/emoji/add', { name: 'Party_Parrot', file: png.id }, bob.token)).s, 200);
    assert.equal((await call('POST', '/api/emoji/add', { name: 'party_parrot', file: png.id }, carol.token)).s, 409);
    assert.equal((await call('POST', '/api/emoji/add', { name: '__proto__', file: png.id }, bob.token)).s, 400);
    const x = (await call('POST', '/api/send', { chan: 'general', text: 'yay :party_parrot:' }, bob.token)).d.id; assert.equal((await call('POST', '/api/react', { id: x, emoji: ':party_parrot:' }, carol.token)).s, 200);
    assert.equal((await call('POST', '/api/emoji/remove', { name: 'party_parrot' }, carol.token)).s, 403); assert.equal((await call('POST', '/api/emoji/remove', { name: 'party_parrot' }, bob.token)).s, 200);
    assert.equal((await call('POST', '/api/profile', { name: 'carol' }, bob.token)).s, 409); assert.equal((await call('POST', '/api/profile', { name: 'everyone' }, bob.token)).s, 400);
    assert.equal((await call('POST', '/api/profile', { color: 'red' }, bob.token)).s, 400); assert.equal((await call('POST', '/api/profile', { statusText: 'In a meeting', statusEmoji: '📅', color: '#112233' }, bob.token)).d.me.statusText, 'In a meeting');
    const av = await (await fetch(`${B}/api/upload?name=me.jpg`, { method: 'POST', headers: { 'x-token': bob.token }, body: Buffer.from('jpg') })).json(); assert.equal((await call('POST', '/api/profile', { avatar: av.id }, bob.token)).s, 200);
    const txt = await (await fetch(`${B}/api/upload?name=me.exe`, { method: 'POST', headers: { 'x-token': bob.token }, body: Buffer.from('x') })).json(); assert.equal((await call('POST', '/api/profile', { avatar: txt.id }, bob.token)).s, 400);
    const cs = sse(carol.token); await cs.waitFor('init');
    await call('POST', '/api/presence', { state: 'invisible' }, bob.token); const seen = await cs.waitFor('user', (u) => u.id === bob.id); assert.equal(seen.presence, 'offline', 'invisible looks offline to others');
    await call('POST', '/api/presence', { state: 'dnd' }, bob.token); assert.equal((await cs.waitFor('user', (u) => u.id === bob.id && u.presence === 'dnd')).presence, 'dnd'); await call('POST', '/api/presence', { state: 'auto' }, bob.token); cs.close();
    assert.equal((await call('POST', '/api/profile', { name: 'Bobby' }, bob.token)).s, 200); await call('POST', '/api/profile', { name: 'Bob' }, bob.token);
  });
  await section('mute / timeout, removal, purge, sign-out', async () => {
    assert.equal((await call('POST', '/api/admin/user/mute', { id: eve.id, minutes: 10 }, carol.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/user/mute', { id: eve.id, minutes: 10 }, dave.token)).s, 200);
    assert.equal((await call('POST', '/api/send', { chan: 'general', text: 'muted?' }, eve.token)).s, 403); assert.equal((await call('POST', '/api/react', { id: m1, emoji: '👍' }, eve.token)).s, 403);
    await call('POST', '/api/admin/user/mute', { id: eve.id, minutes: 0 }, dave.token); assert.equal((await call('POST', '/api/send', { chan: 'general', text: 'unmuted' }, eve.token)).s, 200);
    const nick = await newUser('Nick'); await call('POST', '/api/send', { chan: 'general', text: 'nick was here' }, nick.token); const ns = sse(nick.token); await ns.waitFor('init');
    assert.equal((await call('POST', '/api/admin/user/remove', { id: nick.id }, bob.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/user/remove', { id: dave.id }, carol.token)).s, 403);
    assert.equal((await call('POST', '/api/admin/user/remove', { id: nick.id, purge: true, block: true }, dave.token)).s, 200); await ns.waitFor('kicked');
    assert.equal((await call('GET', '/api/messages?chan=general', undefined, nick.token)).s, 401, 'token revoked'); assert.equal((await fetch(`${B}/api/events?token=${nick.token}`)).status, 401);
    assert(!app.ctx.db.messages.some((m) => m.text === 'nick was here'), 'purged');
    assert.equal((await call('POST', '/api/join', { name: 'Nick', deviceId: 'dev-Nick' }, null, { ip: nick.ip })).s, 403, 'blocked after removal');
    const eve2 = await newUser('Zed'); await call('POST', '/api/signout', {}, eve2.token); assert.equal((await call('GET', '/api/messages?chan=general', undefined, eve2.token)).s, 401, 'signed out');
  });

  // ---------- collab ----------
  await section('shared note with conflict detection; whiteboard; to-dos; calendar + reminders', async () => {
    const n1 = await call('POST', '/api/note', { chan: 'general', text: 'v1', v: 0 }, bob.token); assert.equal(n1.d.note.v, 1);
    const conflict = await call('POST', '/api/note', { chan: 'general', text: 'mine', v: 0 }, carol.token); assert.equal(conflict.s, 409); assert.equal(conflict.d.note.text, 'v1');
    assert.equal((await call('POST', '/api/note', { chan: gid, text: 'x', v: 0 }, dave.token)).s, 404, 'private group note is private');
    const s = await call('POST', '/api/board/stroke', { chan: 'general', stroke: { c: '#ff0000', w: 4, pts: [1, 2, 3, 4, 5000, -9] } }, bob.token); assert.equal(s.s, 200);
    assert.equal((await call('POST', '/api/board/stroke', { chan: 'general', stroke: { c: '#ff0000', w: 4, pts: [1] } }, bob.token)).s, 400);
    const col = (await call('GET', '/api/collab?chan=general', undefined, carol.token)).d; assert.deepEqual(col.board[0].pts, [1, 2, 3, 4, 1000, 0]);
    await call('POST', '/api/board/undo', { chan: 'general' }, carol.token); assert.equal((await call('GET', '/api/collab?chan=general', undefined, carol.token)).d.board.length, 1, 'carol cannot undo bob’s stroke'); await call('POST', '/api/board/undo', { chan: 'general' }, bob.token); await call('POST', '/api/board/clear', { chan: 'general' }, carol.token);
    await call('POST', '/api/todo', { chan: 'general', op: 'add', text: 'Buy snacks', assignee: carol.id, due: Date.now() - 1000 }, bob.token); const td = (await call('GET', '/api/collab?chan=general', undefined, bob.token)).d.todos[0];
    assert.equal((await call('POST', '/api/todo', { chan: 'general', op: 'del', id: td.id }, carol.token)).s, 403, 'only creator/admin delete'); await call('POST', '/api/todo', { chan: 'general', op: 'toggle', id: td.id }, carol.token);
    await call('POST', '/api/todo', { chan: 'general', op: 'toggle', id: td.id }, carol.token); const cs = sse(carol.token); await cs.waitFor('init'); tick(Date.now() + 25000); await cs.waitFor('reminder', (r) => /Buy snacks/.test(r.text)); cs.close();
    const start = Date.now() + 5 * 60000; await call('POST', '/api/event', { chan: 'general', op: 'add', title: 'Movie night', start, remind: 10 }, bob.token);
    const es = sse(dave.token); await es.waitFor('init'); tick(Date.now() + 25000); await es.waitFor('reminder', (r) => /Movie night/.test(r.text)); es.close();
    assert.equal((await call('POST', '/api/event', { chan: 'general', op: 'add', title: '', start }, bob.token)).s, 400);
  });
  await section('calls: signaling only between participants', async () => {
    const st = await call('POST', '/api/call/start', { chan: 'general', mode: 'video' }, bob.token); assert.equal(st.s, 200); assert.deepEqual(st.d.call.participants, [bob.id]);
    const cs = sse(carol.token); const init = await cs.waitFor('init'); assert(init.calls.some((c) => c.chan === 'general'));
    assert.equal((await call('POST', '/api/call/signal', { chan: 'general', to: carol.id, kind: 'offer', data: {} }, bob.token)).s, 400, 'carol not in the call yet');
    await call('POST', '/api/call/join', { chan: 'general' }, carol.token);
    assert.equal((await call('POST', '/api/call/signal', { chan: 'general', to: carol.id, kind: 'offer', data: { sdp: 'x' } }, bob.token)).s, 200); const sig = await cs.waitFor('callsig'); assert.equal(sig.from, bob.id); assert.equal(sig.kind, 'offer');
    assert.equal((await call('POST', '/api/call/signal', { chan: 'general', to: carol.id, kind: 'evil', data: {} }, bob.token)).s, 400);
    assert.equal((await call('POST', '/api/call/signal', { chan: 'general', to: carol.id, kind: 'ice', data: {} }, dave.token)).s, 400, 'outsider cannot inject');
    await call('POST', '/api/call/leave', { chan: 'general' }, bob.token); await call('POST', '/api/call/leave', { chan: 'general' }, carol.token); await cs.waitFor('callstate', (s) => s.call === null); cs.close();
    const dm = 'dm:' + [bob.id, carol.id].sort().join(':'), ds = sse(carol.token); await ds.waitFor('init'); await call('POST', '/api/call/start', { chan: dm, mode: 'voice' }, bob.token); await ds.waitFor('callring'); ds.close(); await call('POST', '/api/call/leave', { chan: dm }, bob.token);
  });

  // ---------- admin data ----------
  let backupFile;
  await section('storage report and backup download', async () => {
    const s = (await call('GET', '/api/admin/storage', undefined, dave.token)).d; assert(s.messages > 10 && s.perUser.length && s.perChat.length && s.dbBytes > 0);
    const r = await fetch(`${B}/api/admin/backup?token=${owner.token}`); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/zip');
    backupFile = path.join(tmp, 'backup.zip'); fs.writeFileSync(backupFile, Buffer.from(await r.arrayBuffer()));
    const names = readZipIndex(backupFile).map((e) => e.name); assert(names.includes('db.json') && names.includes('meta.json') && names.some((n) => n.startsWith('uploads/')), names.join(','));
  });
  await section('restore: replaces everything, rejects junk and path tricks, keeps a safety copy', async () => {
    const before = app.ctx.db.messages.length; await call('POST', '/api/send', { chan: 'general', text: 'after backup' }, bob.token);
    const post = (buf, hdr) => fetch(`${B}/api/admin/restore`, { method: 'POST', headers: { 'x-token': owner.token, ...(hdr || {}) }, body: buf });
    assert.equal((await fetch(`${B}/api/admin/restore`, { method: 'POST', headers: { 'x-token': bob.token }, body: fs.readFileSync(backupFile) })).status, 403);
    assert.equal((await post(Buffer.from('this is not a zip'))).status, 400);
    const evil = path.join(tmp, 'evil.zip'); const ws = fs.createWriteStream(evil);
    await writeZip([{ name: '../../escaped.txt', data: Buffer.from('pwned') }, { name: 'uploads/../../escaped2', data: Buffer.from('pwned') }, { name: 'uploads/' + 'a'.repeat(24), data: Buffer.from('ok') }, { name: 'db.json', data: fs.readFileSync(path.join(app.ctx.P.dir, 'db.json')) }], ws); ws.end(); await new Promise((r) => ws.on('finish', r));
    const res = await post(fs.readFileSync(evil)); assert.equal(res.status, 200, 'valid db inside, junk entries ignored');
    for (const f of [path.join(tmp, 'escaped.txt'), path.join(tmp, 'main', 'escaped2'), path.join(tmp, '..', 'escaped.txt')]) assert(!fs.existsSync(f), 'path traversal leaked ' + f);
    const ok = await post(fs.readFileSync(backupFile)); const body = await ok.json(); assert.equal(ok.status, 200, JSON.stringify(body)); assert(body.previous.startsWith('before-restore-'));
    assert(!app.ctx.db.messages.some((m) => m.text === 'after backup'), 'restored state replaced newer data'); assert.equal(app.ctx.db.messages.length, before);
    assert.equal((await call('GET', '/api/messages?chan=general', undefined, bob.token)).s, 200, 'users and tokens restored');
    assert(fs.readdirSync(app.ctx.P.dir).some((f) => f.startsWith('before-restore-')), 'safety copy kept');
    assert.equal(Number((await call('GET', '/api/admin/storage', undefined, owner.token)).s), 200);
  });
  await section('link previews never fetch private addresses (SSRF)', async () => {
    for (const u of ['http://127.0.0.1:' + port + '/', 'http://localhost/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'http://2130706433/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://0.0.0.0/', 'ftp://example.com/', 'http://user:pw@example.com/', 'http://printer.local/', 'http://intranet/']) {
      let blocked = false; try { await fetchPreview(u, 1500); } catch (e) { blocked = true; } assert(blocked, 'must refuse ' + u);
    }
  });
  await section('hardening: auth required everywhere, headers, traversal, body limits, bad input', async () => {
    const open = new Set(['POST /api/join', 'GET /api/join/status', 'POST /api/join/cancel', 'GET /api/config']);
    for (const key of Object.keys(app.ctx.api)) { if (open.has(key)) continue; const [m, p] = key.split(' '); let r; try { r = await fetch(B + p, { method: m, body: m === 'POST' ? '{}' : undefined }); } catch (e) { throw new Error('fetch failed for ' + key + ': ' + (e.cause && e.cause.message)); } assert.equal(r.status, 401, key + ' must require a token'); }
    const idx = await fetch(B + '/'); assert(/default-src 'self'/.test(idx.headers.get('content-security-policy'))); assert.equal(idx.headers.get('x-content-type-options'), 'nosniff');
    for (const p of ['/..%2f..%2fetc/passwd', '/%2e%2e/server.js', '/lib/app.js', '/..%2flib%2fapp.js']) { const r = await fetch(B + p); assert([403, 404].includes(r.status), p + ' → ' + r.status); }
    assert.equal((await fetch(B + '/api/send', { method: 'POST', headers: { 'x-token': bob.token }, body: 'x'.repeat(2e6) })).status, 413);
    assert.equal((await call('POST', '/api/send', { chan: 'general', text: 'x'.repeat(9000) }, bob.token)).s, 200); assert.equal(app.ctx.db.messages.at(-1).text.length, 8000, 'text capped at 8000');
    assert.equal((await call('POST', '/api/send', { chan: ['general'], text: 'x' }, bob.token)).s, 404); assert.equal((await call('POST', '/api/send', { chan: '__proto__', text: 'x' }, bob.token)).s, 404);
    assert.equal((await call('POST', '/api/prefs', { nicknames: { __proto__: 'x', [carol.id]: 'CC' } }, bob.token)).d.prefs.nicknames[carol.id], 'CC'); assert.equal({}.polluted, undefined);
    const conns = []; for (let i = 0; i < 9; i++) conns.push(await fetch(`${B}/api/events?token=${carol.token}`).then((r) => r.status)); assert(conns.includes(429), 'SSE connections per user are capped');
  });

  // ---------- persistence: encryption, migration ----------
  await section('encryption at rest: ciphertext on disk, locked without passphrase, restart keeps data', async () => {
    const dir = path.join(tmp, 'enc'), a = createApp({ dataDir: dir, name: 'Enc', trustProxy: true, publicDir: path.join(__dirname, 'public') }), pt = await a.start(3990 + Math.floor(Math.random() * 9));
    const C = (m, p, b, t) => fetch(`http://127.0.0.1:${pt}${p}`, { method: m, headers: { 'x-token': t || '', 'x-forwarded-for': '10.7.7.7' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => ({ s: r.status, d: await r.json().catch(() => ({})) }));
    const j = await C('POST', '/api/join', { name: 'Own', adminKey: a.adminKey, deviceId: 'd' }); await C('POST', '/api/send', { chan: 'general', text: 'TOP-SECRET-MARKER-42' }, j.d.token);
    assert.equal((await C('POST', '/api/admin/encryption', { enable: true, passphrase: 'short' }, j.d.token)).s, 400);
    assert.equal((await C('POST', '/api/admin/encryption', { enable: true, passphrase: 'correct horse battery' }, j.d.token)).s, 200);
    assert(fs.existsSync(path.join(dir, 'db.enc')) && !fs.existsSync(path.join(dir, 'db.json')), 'plain file removed');
    assert(!fs.readFileSync(path.join(dir, 'db.enc')).includes('TOP-SECRET-MARKER-42'), 'no plaintext in the encrypted file');
    assert.equal((await C('POST', '/api/admin/encryption', { enable: false, current: 'wrong' }, j.d.token)).s, 403);
    a.stop(); await wait(100);
    assert.throws(() => createApp({ dataDir: dir }), (e) => e.code === 'LOCKED'); assert.throws(() => createApp({ dataDir: dir, passphrase: 'nope nope nope' }), (e) => e.code === 'BAD_PASSPHRASE');
    const b = createApp({ dataDir: dir, passphrase: 'correct horse battery', publicDir: path.join(__dirname, 'public') }); assert(b.ctx.db.messages.some((m) => m.text === 'TOP-SECRET-MARKER-42'), 'data intact after unlock');
    const pt2 = await b.start(3980 + Math.floor(Math.random() * 9)); const tok = (await fetch(`http://127.0.0.1:${pt2}/api/join`, { method: 'POST', body: JSON.stringify({ name: 'Own', adminKey: b.adminKey, deviceId: 'd' }) }).then((r) => r.json())).token;
    const off = await fetch(`http://127.0.0.1:${pt2}/api/admin/encryption`, { method: 'POST', headers: { 'x-token': tok }, body: JSON.stringify({ enable: false, current: 'correct horse battery' }) }); assert.equal(off.status, 200);
    assert(fs.existsSync(path.join(dir, 'db.json')) && !fs.existsSync(path.join(dir, 'db.enc')), 'back to plain'); b.stop();
  });
  await section('old (v3) data files are migrated: tokens hashed, files registered, read pointers converted', async () => {
    const dir = path.join(tmp, 'legacy'); fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
    const now = Date.now(); fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ users: { u1: { id: 'u1', name: 'Old', color: '#6264a7', token: 'legacy-token-123', read: { general: now - 500 }, created: now - 9999 } }, channels: { general: { id: 'general', name: 'general' } }, messages: [{ id: 'aaaaaaaaaaaaaaaa', chan: 'general', from: 'u1', text: 'old one', ts: now - 2000, file: { id: 'f'.repeat(24), name: 'a.png', size: 3 }, reactions: {} }, { id: 'bbbbbbbbbbbbbbbb', chan: 'general', from: 'u1', text: 'old two', ts: now - 400, reactions: {} }] }));
    const a = createApp({ dataDir: dir, publicDir: path.join(__dirname, 'public') }), pt = await a.start(3970 + Math.floor(Math.random() * 9));
    const j = await fetch(`http://127.0.0.1:${pt}/api/join`, { method: 'POST', body: JSON.stringify({ token: 'legacy-token-123' }) }).then((r) => r.json()); assert.equal(j.me.name, 'Old', 'old login token still works');
    assert(!JSON.stringify(a.ctx.db).includes('legacy-token-123'), 'plaintext token is no longer stored'); assert(a.ctx.db.files['f'.repeat(24)], 'legacy file registered'); assert.equal(a.ctx.db.messages[0].files[0].name, 'a.png');
    assert.deepEqual(a.ctx.db.messages.map((m) => m.seq), [1, 2]); assert.equal(a.ctx.db.users.u1.read.general, 1, 'read pointer converted to a sequence number'); a.stop();
  });
  await section('persistence: restart keeps users, tokens, history', async () => {
    const dir = path.join(tmp, 'main'); app.flush(); const before = app.ctx.db.messages.length, tok = bob.token; app.stop(); await wait(100);
    const a = createApp({ dataDir: dir, publicDir: path.join(__dirname, 'public') }); const pt = await a.start(3960 + Math.floor(Math.random() * 9));
    assert.equal(a.ctx.db.messages.length, before); const r = await fetch(`http://127.0.0.1:${pt}/api/messages?chan=general`, { headers: { 'x-token': tok } }); assert.equal(r.status, 200, 'old token still valid after restart');
    assert.equal(a.ctx.db.settings.name, 'Friday Gang'); a.stop();
  });

  ownerSse.close(); bobSse.close();
  const failed = results.filter((r) => !r[1]);
  console.log(`\n${results.length - failed.length}/${results.length} sections passed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
