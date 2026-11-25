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
});
