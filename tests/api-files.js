'use strict';
// Files area (docs/features-files.md): Files tab (folders, uploads, moving), rename/delete, versions, zip downloads,
// share links, the Files app, permissions (outsiders, history limits, legal hold) and garbage collection.
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const { readZipIndex } = require(H.ROOT + '/lib/zip');

H.suite('Files', async (t) => {
  const s = await t.server();
  const ana = await s.user('Ana'), bob = await s.user('Bob'), eve = await s.user('Eve'), adm = await s.user('Adam', 'admin');
  const grp = (await s.call('POST', '/api/channel', { name: 'Project', members: [bob.id] }, ana.token)).d.id; // Ana + Bob
  const up = async (u, name, data) => { const r = await s.upload(u.token, name, Buffer.from(data)); t.eq(r.s, 200, r.d); return r.d; };
  const post = async (u, chan, files, text = '') => { const r = await s.call('POST', '/api/send', { chan, text, files }, u.token); t.eq(r.s, 200, r.d); return r.d.id; };
  const list = async (u, chan) => s.call('GET', '/api/files/list?chan=' + encodeURIComponent(chan), undefined, u.token);
  const raw = (p, tok, hdr = {}) => fetch(s.B + p + (tok ? (p.includes('?') ? '&' : '?') + 'token=' + tok : ''), { headers: hdr });
  let report, notes, plan;

  await t.section('Files tab: files posted in the chat are listed at the top level; outsiders get nothing', async () => {
    report = await up(ana, 'report.pdf', '%PDF-1.4 report v1'); notes = await up(ana, 'notes.txt', 'line one\nline two\n');
    await post(ana, grp, [report, notes], 'here you go');
    const l = await list(bob, grp); t.eq(l.s, 200, l.d);
    t.eq(l.d.files.map((f) => f.name).sort(), ['notes.txt', 'report.pdf']); t.ok(l.d.files.every((f) => f.folder === '' && f.msg), l.d); t.eq(l.d.canWrite, true);
    t.eq((await list(eve, grp)).s, 404, 'outsider cannot list');
    t.eq((await s.call('GET', '/api/files/info?id=' + report.id, undefined, eve.token)).s, 404, 'outsider cannot see details');
  });

  await t.section('folders: create, rename, duplicates, move files, no cycles, delete keeps the contents', async () => {
    const a = await s.call('POST', '/api/files/folder', { chan: grp, op: 'add', name: 'Designs' }, bob.token); t.eq(a.s, 200, a.d);
    const sub = await s.call('POST', '/api/files/folder', { chan: grp, op: 'add', name: 'Old / ../ stuff', parent: a.d.folder.id }, ana.token); t.eq(sub.s, 200, sub.d);
    t.ok(!sub.d.folder.name.includes('/') && !sub.d.folder.name.includes('..'), 'folder names have no path tricks: ' + sub.d.folder.name);
    t.eq((await s.call('POST', '/api/files/folder', { chan: grp, op: 'add', name: 'designs' }, ana.token)).s, 409, 'same name twice');
    t.eq((await s.call('POST', '/api/files/folder', { chan: grp, op: 'rename', id: a.d.folder.id, name: 'Nope' }, ana.token)).s, 403, 'only the folder maker or an admin renames');
    t.eq((await s.call('POST', '/api/files/folder', { chan: grp, op: 'add', name: 'Spy' }, eve.token)).s, 404, 'outsider cannot add folders');
    const ev = s.sse(ana.token); await ev.waitFor('init');
    const mv = await s.call('POST', '/api/files/move', { chan: grp, files: [report.id], to: sub.d.folder.id }, bob.token); t.eq(mv.s, 200, mv.d);
    await ev.waitFor('fl_files', (d) => d.chan === grp); ev.close();
    t.eq((await list(ana, grp)).d.files.find((f) => f.id === report.id).folder, sub.d.folder.id);
    t.eq((await s.call('POST', '/api/files/move', { chan: grp, folders: [a.d.folder.id], to: sub.d.folder.id }, bob.token)).s, 400, 'a folder cannot go inside itself');
    t.eq((await s.call('POST', '/api/files/move', { chan: grp, files: [report.id], to: '' }, eve.token)).s, 404, 'outsider cannot move');
    const del = await s.call('POST', '/api/files/folder', { chan: grp, op: 'delete', id: sub.d.folder.id }, ana.token); t.eq(del.s, 200, del.d);
    const l = await list(ana, grp); t.eq(l.d.files.find((f) => f.id === report.id).folder, a.d.folder.id, 'contents move up one level'); t.eq(l.d.folders.length, 1);
  });

  await t.section('upload straight into the Files tab: members can read it, outsiders cannot; it survives clean-up', async () => {
    plan = await up(bob, 'plan.md', '# Plan\n- one\n'); const folder = (await list(bob, grp)).d.folders[0].id;
    t.eq((await s.call('POST', '/api/files/add', { chan: grp, folder, ids: [plan.id] }, ana.token)).s, 400, "cannot add someone else's upload");
    t.eq((await s.call('POST', '/api/files/add', { chan: grp, folder, ids: [plan.id] }, bob.token)).s, 200);
    const l = await list(ana, grp); const f = l.d.files.find((x) => x.id === plan.id); t.ok(f && f.folder === folder && !f.msg, l.d);
    t.eq((await raw(`/files/${plan.id}/plan.md`, ana.token)).status, 200, 'member reads a Files-tab upload');
    t.eq((await raw(`/files/${plan.id}/plan.md`, eve.token)).status, 404, 'outsider cannot');
    s.ctx.gcFiles(Object.keys(s.db.files)); t.ok(s.db.files[plan.id] && fs.existsSync(path.join(s.ctx.P.uploads, plan.id)), 'kept by garbage collection');
  });

  await t.section('rename and delete: your own files (admins any); deleting leaves "File deleted" in messages', async () => {
    t.eq((await s.call('POST', '/api/files/rename', { id: notes.id, name: 'x.txt' }, bob.token)).s, 403, 'not your file');
    t.eq((await s.call('POST', '/api/files/rename', { id: notes.id, name: 'x.txt' }, eve.token)).s, 404, 'outsider');
    const r = await s.call('POST', '/api/files/rename', { id: notes.id, name: '../../Meeting notes‮.txt' }, ana.token); t.eq(r.s, 200, r.d);
    t.ok(!r.d.file.name.includes('/') && !r.d.file.name.includes('‮'), r.d.file.name);
    const m = (await s.call('GET', '/api/messages?chan=' + grp, undefined, bob.token)).d.messages.find((x) => x.files && x.files.some((f) => f.id === notes.id));
    t.eq(m.files.find((f) => f.id === notes.id).name, r.d.file.name, 'the message shows the new name');
    const junk = await up(bob, 'junk.bin', 'xx'); const jm = await post(bob, grp, [junk]);
    t.eq((await s.call('POST', '/api/files/delete', { id: junk.id }, ana.token)).s, 403, "Ana cannot delete Bob's file");
    t.eq((await s.call('POST', '/api/files/delete', { id: junk.id }, adm.token)).s, 404, 'an admin who cannot see the chat gets nothing');
    const d = await s.call('POST', '/api/files/delete', { id: junk.id }, bob.token); t.eq(d.s, 200, d.d);
    const after = (await s.call('GET', '/api/messages?chan=' + grp, undefined, ana.token)).d.messages.find((x) => x.id === jm);
    t.ok(!after.files && after.filesDeleted && after.filesDeleted[0].name === 'junk.bin', after);
    t.ok(!s.db.files[junk.id] && !fs.existsSync(path.join(s.ctx.P.uploads, junk.id)), 'bytes removed');
    const gen = await up(bob, 'general.txt', 'hi'); await post(bob, 'general', [gen]);
    t.eq((await s.call('POST', '/api/files/rename', { id: gen.id, name: 'renamed-by-admin.txt' }, adm.token)).s, 200, 'admins can rename any file they can see');
  });

  await t.section('versions: same file id, the message shows the latest; history, download and restore; permissions', async () => {
    const v2 = await up(ana, 'report.pdf', '%PDF-1.4 report v2 longer');
    t.eq((await s.call('POST', '/api/files/version', { id: report.id, upload: v2.id }, bob.token)).s, 403, "Bob can't replace Ana's file");
    const wrong = await up(ana, 'report.docx', 'nope'); t.eq((await s.call('POST', '/api/files/version', { id: report.id, upload: wrong.id }, ana.token)).s, 400, 'same kind of file');
    const r = await s.call('POST', '/api/files/version', { id: report.id, upload: v2.id }, ana.token); t.eq(r.s, 200, r.d); t.eq(r.d.file.v, 2);
    t.eq(await (await raw(`/files/${report.id}/report.pdf`, bob.token)).text(), '%PDF-1.4 report v2 longer', 'the same id serves the new bytes');
    const m = (await s.call('GET', '/api/messages?chan=' + grp, undefined, bob.token)).d.messages.find((x) => x.files && x.files.some((f) => f.id === report.id));
    const mf = m.files.find((f) => f.id === report.id); t.eq([mf.v, mf.size], [2, 25]);
    const v = await s.call('GET', '/api/files/versions?id=' + report.id, undefined, bob.token); t.eq(v.d.versions.map((x) => x.n), [1]);
    t.eq(await (await raw(`/api/files/vget?id=${report.id}&n=1`, bob.token)).text(), '%PDF-1.4 report v1', 'old version downloads');
    t.eq((await s.call('GET', '/api/files/versions?id=' + report.id, undefined, eve.token)).s, 404, 'outsider cannot list versions');
    t.eq((await raw(`/api/files/vget?id=${report.id}&n=1`, eve.token)).status, 404, 'outsider cannot download versions');
    const blob = Object.values(s.db.files).find((f) => f.verOf === report.id);
    t.eq((await raw(`/files/${blob.id}/x.pdf`, eve.token)).status, 404, 'outsider cannot read the old bytes directly');
    t.eq((await raw(`/files/${blob.id}/x.pdf`, bob.token)).status, 200, 'a member can');
    s.ctx.gcFiles(Object.keys(s.db.files)); t.ok(s.db.files[blob.id], 'old versions survive garbage collection');
    const rs = await s.call('POST', '/api/files/restore', { id: report.id, n: 1 }, ana.token); t.eq(rs.s, 200, rs.d); t.eq(rs.d.file.v, 3);
    t.eq(await (await raw(`/files/${report.id}/report.pdf`, bob.token)).text(), '%PDF-1.4 report v1', 'restored');
    t.eq((await s.call('GET', '/api/files/versions?id=' + report.id, undefined, ana.token)).d.versions.map((x) => x.n), [2, 1]);
  });

  await t.section('zip: whole chat with folders, a selection, only files you may read, safe names', async () => {
    const z = await raw(`/api/files/zip?chan=${grp}`, bob.token); t.eq(z.status, 200); t.eq(z.headers.get('content-type'), 'application/zip');
    const file = path.join(s.dir, 'dl.zip'); fs.writeFileSync(file, Buffer.from(await z.arrayBuffer()));
    const names = readZipIndex(file).map((e) => e.name).sort(); t.ok(names.includes('report.pdf') || names.some((n) => n.endsWith('/report.pdf')), names);
    t.ok(names.some((n) => n === 'Designs/plan.md'), 'folder structure kept: ' + names.join(', ')); t.ok(names.every((n) => !n.includes('..') && !n.startsWith('/')), names);
    const sel = await raw(`/api/files/zip?chan=${grp}&ids=${plan.id}`, ana.token); fs.writeFileSync(file, Buffer.from(await sel.arrayBuffer())); t.eq(readZipIndex(file).map((e) => e.name), ['plan.md']);
    t.eq((await raw(`/api/files/zip?chan=${grp}`, eve.token)).status, 404, 'outsider: no zip of the chat');
    t.eq((await raw(`/api/files/zip?ids=${plan.id},${report.id}`, eve.token)).status, 404, 'outsider: picked ids are skipped');
    const mixed = await up(eve, 'eve.txt', 'eve'); await post(eve, 'general', [mixed]);
    const zz = await raw(`/api/files/zip?ids=${plan.id},${mixed.id}`, eve.token); fs.writeFileSync(file, Buffer.from(await zz.arrayBuffer())); t.eq(readZipIndex(file).map((e) => e.name), ['eve.txt'], 'only readable files are included');
  });

  await t.section('share links: chat members by default, "anyone" only for owner/admin, expiry and revoke reveal nothing', async () => {
    const mem = await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600 }, ana.token); t.eq(mem.s, 200, mem.d); t.eq(mem.d.link.scope, 'members');
    t.eq((await s.call('GET', '/api/files/link/open?k=' + mem.d.link.k, undefined, bob.token)).d.file.id, plan.id);
    t.eq((await s.call('GET', '/api/files/link/open?k=' + mem.d.link.k, undefined, eve.token)).s, 404, 'a members link does not open for outsiders');
    t.eq((await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600, scope: 'anyone' }, ana.token)).s, 403, 'only the owner or an admin may make a public link');
    t.eq((await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600 }, eve.token)).s, 404, 'outsider cannot make links');
    t.eq((await s.call('POST', '/api/files/link', { id: plan.id, ttl: 5 }, bob.token)).s, 400, 'too short');
    const any = await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600, scope: 'anyone' }, bob.token); t.eq(any.s, 200, any.d);
    const pub = await fetch(`${s.B}/api/share?k=${any.d.link.k}`); t.eq(pub.status, 200); t.eq(await pub.text(), '# Plan\n- one\n');
    t.eq((await fetch(`${s.B}/api/share?k=${'0'.repeat(32)}`)).status, 404);
    const mine = await s.call('GET', '/api/files/links', undefined, bob.token); t.ok(mine.d.links.some((l) => l.id === any.d.link.id), mine.d);
    t.eq((await s.call('POST', '/api/files/link/revoke', { id: any.d.link.id }, eve.token)).s, 403);
    t.eq((await s.call('POST', '/api/files/link/revoke', { id: any.d.link.id }, bob.token)).s, 200);
    const gone = await fetch(`${s.B}/api/share?k=${any.d.link.k}`); t.eq(gone.status, 404); const txt = await gone.text(); t.ok(!txt.includes('plan'), 'reveals nothing: ' + txt);
    const exp = await s.call('POST', '/api/files/link', { id: plan.id, ttl: 300, scope: 'anyone' }, bob.token);
    s.db.fileLinks[exp.d.link.id].exp = Date.now() - 1;
    const e1 = await fetch(`${s.B}/api/share?k=${exp.d.link.k}`); t.eq(e1.status, 404); t.ok(!(await e1.text()).includes('plan'));
    t.eq((await s.call('GET', '/api/files/link/open?k=' + exp.d.link.k, undefined, bob.token)).s, 404);
    s.tick(); t.ok(!s.db.fileLinks[exp.d.link.id], 'expired links are removed');
    s.ctx.allowAnyoneLink = () => false;
    t.eq((await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600, scope: 'anyone' }, bob.token)).s, 403, 'chat rules can forbid public links');
    t.eq((await s.call('POST', '/api/files/link', { id: plan.id, ttl: 3600 }, bob.token)).s, 200, 'members links still work');
    delete s.ctx.allowAnyoneLink;
  });

  await t.section('Files app: only files shared in chats you can see; mine, type and recording filters', async () => {
    const av = await up(bob, 'me.png', 'png'); await s.call('POST', '/api/profile', { avatar: av.id }, bob.token);
    const loose = await up(bob, 'loose.txt', 'not shared');
    const all = await s.call('GET', '/api/files/all?view=recent', undefined, bob.token); const names = all.d.files.map((f) => f.name);
    t.ok(names.includes('plan.md') && names.includes('report.pdf'), names); t.ok(!names.includes('me.png') && !names.includes('loose.txt'), 'avatars and unshared uploads are not listed: ' + names);
    t.ok(!(await s.call('GET', '/api/files/all', undefined, eve.token)).d.files.some((f) => f.chan === grp), 'outsider sees none of the group');
    const mine = await s.call('GET', '/api/files/all?view=mine', undefined, ana.token); t.ok(mine.d.files.every((f) => f.by === ana.id), mine.d);
    const docs = await s.call('GET', '/api/files/all?type=code', undefined, ana.token); t.ok(docs.d.files.every((f) => f.kind === 'code'), docs.d);
    const vid = await up(ana, 'meeting.webm', 'webm'); s.ctx.addMessage({ chan: grp, from: ana.id, text: '', files: [{ id: vid.id, name: vid.name, size: vid.size }], recording: true });
    const recs = await s.call('GET', '/api/files/all?type=recording', undefined, bob.token); t.eq(recs.d.files.map((f) => f.name), ['meeting.webm']);
    void loose;
  });

  await t.section('history limits: someone added without the history sees no older files, versions, zips or links', async () => {
    const cid = (await s.call('POST', '/api/channel', { name: 'Secret', members: [bob.id] }, ana.token)).d.id;
    const old = await up(ana, 'old.txt', 'old'); await post(ana, cid, [old]); const oldTab = await up(ana, 'oldtab.txt', 'x'); await s.call('POST', '/api/files/add', { chan: cid, ids: [oldTab.id] }, ana.token);
    const add = await s.call('POST', '/api/channel/members', { id: cid, add: [eve.id], history: 'none' }, ana.token); t.eq(add.s, 200, add.d);
    const fresh = await up(ana, 'new.txt', 'new'); await post(ana, cid, [fresh]);
    const hl = await list(eve, cid); t.eq(hl.d.files.map((f) => f.name), ['new.txt'], JSON.stringify([hl.d.files.map((f) => [f.name, f.msg]), (s.db.cxStart || {})[cid]]));
    t.eq((await raw(`/files/${oldTab.id}/oldtab.txt`, eve.token)).status, 404, 'old Files-tab upload hidden too');
    const zf = path.join(s.dir, 'h.zip'); fs.writeFileSync(zf, Buffer.from(await (await raw(`/api/files/zip?chan=${cid}`, eve.token)).arrayBuffer())); t.eq(readZipIndex(zf).map((e) => e.name), ['new.txt']);
    t.eq((await s.call('GET', '/api/files/versions?id=' + old.id, undefined, eve.token)).s, 404);
    const l = await s.call('POST', '/api/files/link', { id: old.id, ttl: 3600 }, ana.token); t.eq((await s.call('GET', '/api/files/link/open?k=' + l.d.link.k, undefined, eve.token)).s, 404);
    t.ok(!(await s.call('GET', '/api/files/all', undefined, eve.token)).d.files.some((f) => f.name === 'old.txt'));
  });

  await t.section('legal hold: files in kept messages cannot be renamed, replaced or deleted', async () => {
    const held = await up(ana, 'contract.txt', 'v1'); const mid = await post(ana, grp, [held]);
    s.ctx.hooks.keepMessage.push((m) => m.id === mid);
    for (const [p, b] of [['/api/files/rename', { id: held.id, name: 'x.txt' }], ['/api/files/delete', { id: held.id }]]) { const r = await s.call('POST', p, b, ana.token); t.eq(r.s, 423, r.d); t.eq(r.d.error, 'This file is on legal hold.'); }
    const nv = await up(ana, 'contract.txt', 'v2'); t.eq((await s.call('POST', '/api/files/version', { id: held.id, upload: nv.id }, ana.token)).s, 423);
    t.eq((await s.call('GET', '/api/files/info?id=' + held.id, undefined, bob.token)).d.hold, true);
    s.ctx.hooks.keepMessage.pop();
  });

  await t.section('a deleted chat takes its Files-tab uploads and folders with it', async () => {
    const cid = (await s.call('POST', '/api/channel', { name: 'Temp', members: [bob.id] }, ana.token)).d.id;
    const f = await up(ana, 'temp.txt', 'tmp'); await s.call('POST', '/api/files/add', { chan: cid, ids: [f.id] }, ana.token); await s.call('POST', '/api/files/folder', { chan: cid, op: 'add', name: 'A' }, ana.token);
    t.eq((await s.call('POST', '/api/channel/delete', { id: cid }, ana.token)).s, 200);
    s.tick(); await s.wait(50); t.ok(!s.db.files[f.id] && !s.db.fileTree[cid], 'cleaned up');
  });

  // ================= Calendar =================
  const C = require(H.ROOT + '/public/js/files-calcore.js');
  const DAY = 864e5, MIN = 6e4, TZ = 'Europe/Berlin';
  const evAdd = (u, chan, x) => s.call('POST', '/api/event', { chan, op: 'add', tz: TZ, ...x }, u.token);
  const range = (u, from, to, chan) => s.call('GET', `/api/calendar?from=${from}&to=${to}${chan ? '&chan=' + encodeURIComponent(chan) : ''}`, undefined, u.token);
  const base = C.fromWall(2027, 0, 4, 9, 0, TZ); // Monday 4 Jan 2027, 09:00 Berlin

  await t.section('calendar: old-style events still work; new fields (all-day, repeat, time zone, location, online) round-trip', async () => {
    const old = await s.call('POST', '/api/event', { chan: grp, op: 'add', title: 'Plain', start: base, remind: 0 }, ana.token); t.eq(old.s, 200, old.d);
    const r = await range(bob, base - DAY, base + DAY, grp); const p = r.d.events.find((e) => e.title === 'Plain'); t.ok(p && p.end === base + 30 * MIN, r.d);
    s.db.extras[grp].events.push({ id: 'legacy000001', by: ana.id, ts: Date.now(), title: 'Legacy', start: base + 3600000, end: 0, notes: 'n', remind: 0 });
    t.ok((await range(bob, base - DAY, base + DAY, grp)).d.events.some((e) => e.title === 'Legacy'), 'old events without the new fields load');
    const ad = await evAdd(ana, grp, { title: 'Offsite', start: Date.UTC(2027, 0, 6), end: Date.UTC(2027, 0, 8), allDay: true, location: 'Lake house', online: true });
    const e = (await range(bob, base, base + 7 * DAY, grp)).d.events.find((x) => x.id === ad.d.id);
    t.eq([e.allDay, e.start, e.end, e.location, e.online], [true, Date.UTC(2027, 0, 6), Date.UTC(2027, 0, 8), 'Lake house', true]);
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'add', title: '', start: base }, ana.token)).s, 400, 'a title is required');
  });

  let rep;
  await t.section('calendar: repeating events — weekly on chosen days, until / count, delete one occurrence, edit and move the series', async () => {
    const r = await evAdd(ana, grp, { title: 'Gym', start: base + 9 * 3600000, end: base + 10 * 3600000, repeat: { freq: 'weekly', days: [1, 3], count: 6 } }); t.eq(r.s, 200, r.d); rep = r.d.id;
    let occ = (await range(bob, base, base + 60 * DAY, grp)).d.events.filter((x) => x.id === rep); t.eq(occ.length, 6, 'count respected');
    const wall = occ.map((o) => C.wall(o.start, TZ)); t.ok(wall.every((w) => w.h === 18 && [1, 3].includes(w.dow)), 'same wall-clock time on Mon/Wed (across DST rules)');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'delocc', id: rep, occ: occ[1].start }, ana.token)).s, 200);
    occ = (await range(bob, base, base + 60 * DAY, grp)).d.events.filter((x) => x.id === rep); t.eq(occ.length, 5, 'one occurrence deleted');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'move', id: rep, start: occ[0].series.start + 3600000, end: occ[0].series.end + 3600000 }, bob.token)).s, 403, 'only the creator or an admin moves it');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'move', id: rep, start: occ[0].series.start + 3600000, end: occ[0].series.end + 3600000 }, ana.token)).s, 200);
    const moved = (await range(bob, base, base + 60 * DAY, grp)).d.events.filter((x) => x.id === rep); t.eq(moved.length, 5, 'the deleted occurrence moved along');
    t.ok(moved.every((o) => C.wall(o.start, TZ).h === 19), 'one hour later');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'edit', id: rep, title: 'Gym (series)', repeat: { freq: 'daily', interval: 2, until: base + 9 * DAY } }, adm.token)).s, 404, 'an admin outside the chat gets nothing');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'edit', id: rep, title: 'Gym (series)', repeat: { freq: 'daily', interval: 2, until: base + 9 * DAY } }, ana.token)).s, 200);
    t.eq((await range(bob, base, base + 60 * DAY, grp)).d.events.filter((x) => x.id === rep).length, 5, 'every 2 days until the 13th');
    const yr = await evAdd(ana, grp, { title: 'Birthday', start: Date.UTC(2028, 1, 29), end: Date.UTC(2028, 2, 1), allDay: true, repeat: { freq: 'yearly' } });
    t.eq((await range(bob, Date.UTC(2028, 0, 1), Date.UTC(2028, 11, 31), grp)).d.events.filter((x) => x.id === yr.d.id).length, 1, '29 February in a leap year');
    t.eq((await range(bob, Date.UTC(2029, 0, 1), Date.UTC(2029, 11, 31), grp)).d.events.filter((x) => x.id === yr.d.id).length, 0, 'and not in other years');
  });

  await t.section('calendar: outsiders see nothing; only the creator or an admin edits; muted people cannot add', async () => {
    t.eq((await range(eve, base - DAY, base + 60 * DAY, grp)).s, 404);
    t.ok(!(await range(eve, base - DAY, base + 60 * DAY)).d.events.some((e) => e.chan === grp), 'the all-chats range skips chats you are not in');
    const x = (await range(bob, base - DAY, base + 60 * DAY, grp)).d.events.find((e) => e.title === 'Plain');
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'del', id: x.id }, bob.token)).s, 403);
    t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'del', id: x.id }, eve.token)).s, 404);
    s.db.users[bob.id].mutedUntil = Date.now() + 60000; t.eq((await evAdd(bob, grp, { title: 'x', start: base })).s, 403); s.db.users[bob.id].mutedUntil = 0;
    t.eq((await s.call('POST', '/api/event', { chan: 'general', op: 'add', title: 'Admin edit test', start: base }, bob.token)).s, 200);
    const gen = (await range(adm, base - DAY, base + DAY, 'general')).d.events.find((e) => e.title === 'Admin edit test');
    t.eq((await s.call('POST', '/api/event', { chan: 'general', op: 'edit', id: gen.id, title: 'Edited by admin' }, adm.token)).s, 200, 'admins may edit any event they can see');
  });

  await t.section('calendar: Accept / Tentative / Decline per person, visible to the chat; the creator gets an activity item', async () => {
    const ev = s.sse(ana.token); await ev.waitFor('init');
    t.eq((await s.call('POST', '/api/calendar/rsvp', { chan: grp, id: rep, rsvp: 'maybe' }, bob.token)).s, 200);
    await ev.waitFor('activity', (a) => a.type === 'event' && a.rsvp === 'maybe' && a.from === bob.id); ev.close();
    t.eq((await s.call('POST', '/api/calendar/rsvp', { chan: grp, id: rep, rsvp: 'later' }, bob.token)).s, 400);
    t.eq((await s.call('POST', '/api/calendar/rsvp', { chan: grp, id: rep, rsvp: 'yes' }, eve.token)).s, 404);
    const e = (await range(ana, base, base + 60 * DAY, grp)).d.events.find((x) => x.id === rep); t.eq(e.rsvp[bob.id], 'maybe');
  });

  await t.section('free/busy: busy blocks for the creator and people who accepted; titles only for chats you are in; meetings too', async () => {
    const day0 = base - 9 * 3600000;
    const fb = await s.call('GET', `/api/freebusy?users=${ana.id},${bob.id},${eve.id}&from=${base}&to=${base + 14 * DAY}`, undefined, eve.token); t.eq(fb.s, 200, fb.d);
    t.ok(fb.d.busy[ana.id].length > 0 && fb.d.busy[ana.id].every((b) => b.title === undefined), 'Eve sees Ana busy, without titles: ' + JSON.stringify(fb.d.busy[ana.id][0]));
    t.ok(fb.d.busy[bob.id].some((b) => b.tentative), 'tentative is marked');
    const mine = await s.call('GET', `/api/freebusy?users=${ana.id}&from=${base}&to=${base + 14 * DAY}`, undefined, bob.token); t.ok(mine.d.busy[ana.id].some((b) => b.title === 'Gym (series)'), 'Bob is in the chat: he sees titles');
    const m = await s.call('POST', '/api/meetings/create', { title: 'Secret meeting', start: day0 + 30 * DAY + 14 * 3600000, end: day0 + 30 * DAY + 15 * 3600000, invitees: [bob.id] }, ana.token); t.eq(m.s, 200, m.d);
    const fm = await s.call('GET', `/api/freebusy?users=${bob.id}&from=${day0 + 30 * DAY}&to=${day0 + 31 * DAY}`, undefined, eve.token); t.ok(fm.d.busy[bob.id].length === 1 && !fm.d.busy[bob.id][0].title, JSON.stringify(fm.d));
    t.eq((await s.call('GET', `/api/freebusy?users=${bob.id}&from=0&to=${100 * DAY}`, undefined, eve.token)).s, 400, 'range checked');
  });

  await t.section('.ics export: events with repeat rules and deleted occurrences; outsiders cannot export a chat', async () => {
    await evAdd(ana, grp, { title: 'Comma, semi; colon: test', start: base + 20 * DAY, end: base + 20 * DAY + 3600000, notes: 'Line 1\nLine 2 ' + 'long '.repeat(30) });
    const o = (await range(ana, base, base + 60 * DAY, grp)).d.events.filter((x) => x.id === rep); t.eq((await s.call('POST', '/api/event', { chan: grp, op: 'delocc', id: rep, occ: o[1].start }, ana.token)).s, 200);
    const r = await fetch(`${s.B}/api/calendar/ics?chan=${grp}&token=${ana.token}`); t.eq(r.status, 200); t.ok(/text\/calendar/.test(r.headers.get('content-type')));
    const txt = await r.text(); t.ok(txt.startsWith('BEGIN:VCALENDAR\r\n') && txt.includes('END:VCALENDAR'), 'a calendar');
    t.ok(/RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=/.test(txt), 'repeat rule'); t.ok(/EXDATE;TZID=Europe\/Berlin:/.test(txt), 'deleted occurrence');
    t.ok(txt.includes('SUMMARY:Comma\\, semi\\; colon: test'), 'text is escaped'); t.ok(txt.split('\r\n').every((l) => Buffer.byteLength(l) <= 75), 'lines are folded');
    t.ok(/DTSTART;VALUE=DATE:20270106/.test(txt), 'all-day dates');
    t.eq((await fetch(`${s.B}/api/calendar/ics?chan=${grp}&token=${eve.token}`)).status, 404);
    const all = await (await fetch(`${s.B}/api/calendar/ics?token=${bob.token}`)).text(); t.ok(all.includes('SUMMARY:Secret meeting'), 'my calendar includes meetings I am invited to');
    t.ok(!(await (await fetch(`${s.B}/api/calendar/ics?token=${eve.token}`)).text()).includes('Gym'), "Eve's calendar has nothing from the group");
  });

  await t.section('.ics import: time zones, UTC, all-day, weekly rules, counts, deleted occurrences, folded and escaped text', async () => {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:a@x', 'DTSTART;TZID=America/New_York:20270301T090000', 'DTEND;TZID=America/New_York:20270301T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=10',
      'EXDATE;TZID=America/New_York:20270302T090000', 'SUMMARY:Daily sync', 'DESCRIPTION:Bring notes\\, please\\nand coffee', 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20270310T120000Z', 'DURATION:PT1H30M', 'SUMMARY:Lunch with a very long title that goes on and on and on so that it has to', '  be folded', 'LOCATION:Cafe', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20270320', 'DTEND;VALUE=DATE:20270322', 'SUMMARY:Trip', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20270401T100000Z', 'RRULE:FREQ=MONTHLY;BYDAY=2TU', 'SUMMARY:Second Tuesday', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20270401T100000Z', 'STATUS:CANCELLED', 'SUMMARY:Gone', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    t.eq((await s.call('POST', '/api/calendar/import', { chan: grp, ics, tz: TZ }, eve.token)).s, 404, 'outsider cannot import into the chat');
    t.eq((await s.call('POST', '/api/calendar/import', { chan: grp, ics: 'hello', tz: TZ }, bob.token)).s, 400);
    const r = await s.call('POST', '/api/calendar/import', { chan: grp, ics, tz: TZ }, bob.token); t.eq(r.s, 200, r.d); t.eq([r.d.added, r.d.partial], [4, 1]);
    const evs = (await range(ana, Date.UTC(2027, 1, 25), Date.UTC(2027, 4, 1), grp)).d.events;
    const sync = evs.filter((e) => e.title === 'Daily sync'); t.eq(sync.length, 9, 'weekdays, 10 times minus one deleted');
    t.ok(sync.every((e) => C.wall(e.start, 'America/New_York').h === 9), 'kept in New York time');
    t.eq(sync[0].notes, 'Bring notes, please\nand coffee');
    const lunch = evs.find((e) => e.title.startsWith('Lunch with')); t.ok(lunch && lunch.title.endsWith('to be folded') && lunch.end - lunch.start === 90 * MIN && lunch.location === 'Cafe', JSON.stringify(lunch));
    const trip = evs.find((e) => e.title === 'Trip'); t.eq([trip.allDay, trip.start, trip.end], [true, Date.UTC(2027, 2, 20), Date.UTC(2027, 2, 22)]);
    t.ok(!evs.some((e) => e.title === 'Gone'), 'cancelled events are skipped');
  });

  await t.section('reminders: one per occurrence, never twice (old reminder tick included)', async () => {
    const chan = (await s.call('POST', '/api/channel', { name: 'Remind', members: [bob.id] }, ana.token)).d.id, now = Date.now();
    await evAdd(ana, chan, { title: 'Soon', start: now + 5 * MIN, end: now + 35 * MIN, remind: 10 });
    s.db.extras[chan].events.push({ id: 'legacy000002', by: ana.id, ts: now, title: 'Old soon', start: now + 4 * MIN, end: 0, notes: '', remind: 10 });
    await evAdd(ana, chan, { title: 'Daily soon', start: now + 3 * MIN - DAY, end: now + 33 * MIN - DAY, remind: 10, repeat: { freq: 'daily' } });
    const ev = s.sse(bob.token); await ev.waitFor('init');
    s.tick(now); s.tick(now + 1000); s.tick(now + 2000); await s.wait(150); ev.close();
    const lines = s.ctx.chanMsgs(chan).filter((m) => m.system && /starts/.test(m.system)).map((m) => m.system);
    t.eq(lines.filter((l) => l.includes('Soon')).length, 1, lines.join(' | ')); t.eq(lines.filter((l) => l.includes('Old soon')).length, 1, lines.join(' | ')); t.eq(lines.filter((l) => l.includes('Daily soon')).length, 1, lines.join(' | '));
    t.eq(ev.events.filter(([n]) => n === 'reminder').length, 3);
  });

  await t.section('personal calendar settings: category names, a category per event or meeting, a second time zone', async () => {
    const r = await s.call('POST', '/api/calendar/prefs', { cats: { red: 'Work', blue: '  ', nope: 'x' }, cat: { key: `e:${grp}/${rep}`, color: 'red' }, tz2: 'Asia/Kolkata' }, bob.token); t.eq(r.s, 200, r.d);
    t.eq([r.d.cats, r.d.catOf[`e:${grp}/${rep}`], r.d.tz2], [{ red: 'Work' }, 'red', 'Asia/Kolkata']);
    t.eq((await s.call('POST', '/api/calendar/prefs', { cat: { key: '__proto__', color: 'red' } }, bob.token)).s, 400);
    t.eq((await s.call('POST', '/api/calendar/prefs', { tz2: 'Mars/Olympus' }, bob.token)).d.tz2, '');
    const ev = s.sse(bob.token); const init = await ev.waitFor('init'); ev.close(); t.eq(init.flCal.cats.red, 'Work', 'sent at start-up');
    t.eq((await s.call('GET', '/api/calendar/prefs', undefined, ana.token)).d.cats, {}, 'per person');
  });
});
