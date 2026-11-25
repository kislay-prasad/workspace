'use strict';
// Files area (section 9 of the Teams list, docs/features-files.md): a chat's Files tab with folders and uploads,
// moving, renaming and deleting files, version history, expiring share links, zip downloads and the Files app.
// The calendar lives in routes-calendar.js.
//
// Data (all owned by this area):
//   db.files[id]            + home (chat whose Files tab it was uploaded to), v (version number), mod/modBy (last new version),
//                             verOf (set on the stored bytes of an OLD version: "this is a version of file X")
//   db.fileTree[chan]       { folders: { id: { id, name, parent, by, ts } }, place: { fileId: folderId } }
//   db.fileVersions[fileId] [{ n, blob, name, size, by, ts }]  old versions, oldest first (blob = db.files id of the old bytes)
//   db.fileLinks[id]        { id, k (secret), file, by, ts, exp, scope: 'members' | 'anyone' }
// Messages: m.files[i].v (latest version number), m.filesDeleted = [{ name, by, ts }] ("File deleted" placeholders).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { writeZip } = require('./zip');

const SAFE_INLINE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.weba': 'audio/webm', '.pdf': 'application/pdf' };
const TEXTY = /^\.(txt|md|markdown|csv|tsv|log|json|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|css|scss|less|xml|ya?ml|ini|cfg|conf|toml|sql|sh|bash|zsh|bat|ps1|swift|lua|r|pl|env)$/;
const KINDS = [
  ['image', /\.(png|jpe?g|gif|webp|bmp|svg|heic|tiff?|ico)$/i], ['video', /\.(mp4|webm|mov|mkv|avi|m4v)$/i], ['audio', /\.(mp3|wav|ogg|opus|m4a|weba|flac|aac)$/i],
  ['archive', /\.(zip|rar|7z|gz|tgz|tar|bz2|xz)$/i],
  ['code', /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|html?|css|scss|less|xml|json|ya?ml|ini|cfg|conf|toml|sql|sh|bash|zsh|bat|ps1|swift|lua|r|pl|vue|svelte|ipynb|env)$/i],
  ['doc', /\.(pdf|docx?|xlsx?|pptx?|od[tsp]|rtf|txt|md|markdown|csv|tsv|log|pages|numbers|key|epub)$/i],
];
const kindOf = (name) => (KINDS.find(([, re]) => re.test(name)) || ['other'])[0];
const extOf = (n) => path.extname(String(n)).toLowerCase();
// names people type for files and folders: no path tricks, control or bidi characters
const cleanName = (v, max) => String(typeof v === 'string' ? v : '').replace(/[\\/\0-\x1f\x7f‪-‮⁦-⁩]/g, '_').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max).trim();
const MAX_VERSIONS = 25;

module.exports = (ctx) => {
  const { api, db, store, P, json, body, fail, rid, str, rate, isAdmin, userById, canSee, validChan, audience, chanMsgs, emit, msgOut, gcFiles, fileCanRead, coll, ipOf, safeEq } = ctx;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const rec = (id) => (typeof id === 'string' && own(db.files, id) ? db.files[id] : null); // db.files is read each time: a restore swaps it
  const trees = () => coll('fileTree'), versions = () => coll('fileVersions'), links = () => coll('fileLinks');
  const treeOf = (chan, create) => { const all = trees(); if (own(all, chan)) return all[chan]; const t = { folders: {}, place: {} }; if (create) all[chan] = t; return t; };
  const idList = (v, re, max) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && re.test(x)))].slice(0, max) : []);
  const FILE_ID = /^[a-f0-9]{24}$/, FOLDER_ID = /^[a-f0-9]{12}$/;
  // a chat whose files still matter: it exists and (for private chats) nobody in it deleted their account
  const chatAlive = (chan) => validChan(chan) && !(chan.startsWith('dm:') && chan.split(':').slice(1).some((i) => { const u = userById(i); return !u || u.deleted; }));
  const mustSee = (me, chan) => { if (!canSee(me, chan)) fail(404, 'No such chat'); };
  const mayWrite = (me, chan) => canSee(me, chan) && !(me.mutedUntil > Date.now()) && (chan.startsWith('dm:') || !db.channels[chan].readonly || isAdmin(me));
  const writer = (me, chan) => {
    mustSee(me, chan);
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    if (!chan.startsWith('dm:') && db.channels[chan].readonly && !isAdmin(me)) fail(403, 'Only admins can change files in this channel.');
  };
  const readable = (me, id) => { const r = rec(id); if (!r || r.verOf || !fileCanRead(me, r.id)) fail(404, 'That file is no longer available.'); return r; };
  const editable = (me, id) => {
    const r = readable(me, id);
    if (r.by !== me.id && !isAdmin(me)) fail(403, 'Only the person who shared this file or an admin can change it.');
    if (me.mutedUntil > Date.now()) fail(403, 'You are muted.');
    return r;
  };
  const fileOut = (r) => ({ id: r.id, name: r.name, size: r.size, by: r.by, ts: r.ts, mod: r.mod || r.ts, modBy: r.modBy || r.by, v: r.v || 1, kind: kindOf(r.name) });
  const folderOut = (f) => ({ id: f.id, name: f.name, parent: f.parent || '', by: f.by, ts: f.ts });
  const folderPath = (t, fid) => { const out = []; let f = fid; for (let i = 0; f && own(t.folders, f) && i < 20; i++) { out.unshift({ id: f, name: t.folders[f].name }); f = t.folders[f].parent; } return out; };
  const inside = (t, fid, ancestor) => { for (let f = fid, i = 0; f && i < 20; i++) { if (f === ancestor) return true; f = own(t.folders, f) ? t.folders[f].parent : ''; } return false; };
  const chatTitle = (chan) => { if (chan.startsWith('dm:')) return chan.split(':').slice(1).map((i) => (userById(i) || {}).name || '?').join(' & '); const c = db.channels[chan]; return c ? (c.members ? c.name : '#' + c.name) : chan; };
  const changed = (chan) => emit('fl_files', { chan }, audience(chan));

  // Every file of a chat: the ones posted in its messages (they sit at the top level until moved) and the ones
  // uploaded straight into its Files tab. Map id -> entry (with .folder, .msg = the first message it was posted in).
  function chatFiles(chan) {
    const out = new Map(), t = treeOf(chan), folderOf = (id) => { const f = own(t.place, id) ? t.place[id] : ''; return f && own(t.folders, f) ? f : ''; };
    for (const m of chanMsgs(chan)) {
      if (m.deleted || !m.files) continue;
      for (const f of m.files) { const r = rec(f.id); if (!r || r.verOf || out.has(r.id)) continue; out.set(r.id, { ...fileOut(r), chan, msg: m.id, from: m.from, shared: m.ts, folder: folderOf(r.id) }); }
    }
    for (const r of Object.values(db.files)) if (r.home === chan && !r.verOf && !out.has(r.id)) out.set(r.id, { ...fileOut(r), chan, msg: null, from: r.by, shared: r.ts, folder: folderOf(r.id) });
    return out;
  }
  const inMessages = (id) => db.messages.some((m) => m.files && m.files.some((f) => f.id === id)) || db.scheduled.some((s) => (s.files || []).some((f) => f.id === id));
  // keep messages pointing at the file: new name, size and version number (renames, new versions)
  function syncMessages(r) {
    const chats = new Set();
    for (const m of db.messages) {
      if (!m.files || !m.files.some((f) => f.id === r.id)) continue;
      for (const f of m.files) if (f.id === r.id) { f.name = r.name; f.size = r.size; if ((r.v || 1) > 1) f.v = r.v; }
      chats.add(m.chan); emit('update', msgOut(m), audience(m.chan));
    }
    for (const s of db.scheduled) for (const f of s.files || []) if (f.id === r.id) { f.name = r.name; f.size = r.size; }
    if (r.home) chats.add(r.home);
    for (const [chan, t] of Object.entries(trees())) if (own(t.place, r.id)) chats.add(chan);
    for (const chan of chats) if (validChan(chan)) changed(chan);
  }

  // ---------- core hooks: files kept in a Files tab (and old versions of live files) are readable and never garbage-collected ----------
  (ctx.hooks.fileRead ||= []).push((u, r) => {
    if (r.home) return canSee(u, r.home);
    if (r.verOf && r.verOf !== r.id) { const main = rec(r.verOf); return !!main && !main.verOf && fileCanRead(u, main.id); }
    return false;
  });
  (ctx.hooks.liveFiles ||= []).push((live) => {
    for (const r of Object.values(db.files)) if (r.home && chatAlive(r.home)) live.add(r.id);
    for (const [fid, list] of Object.entries(versions())) if (live.has(fid)) for (const x of list) live.add(x.blob);
  });
  // a message that shares a file which has newer versions remembers the version number (cache-busting on the client)
  ctx.hooks.beforeMessage.push((m) => { for (const f of m.files || []) { const r = rec(f.id); if (r && (r.v || 1) > 1) f.v = r.v; } });

  // ---------- sending bytes (old versions, public links): ranges, safe types only inline ----------
  function sendFile(req, res, file, name, inline, extra = {}, textInline = false) {
    fs.stat(file, (e, st) => {
      if (e || !st.isFile()) { if (!res.headersSent) res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end('Not found'); }
      const ext = extOf(name), safe = SAFE_INLINE[ext] || (textInline && TEXTY.test(ext) ? 'text/plain; charset=utf-8' : null), size = st.size;
      let start = 0, end = size - 1, status = 200;
      const r = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (r && (r[1] || r[2])) {
        if (r[1]) { start = Number(r[1]); if (r[2]) end = Math.min(Number(r[2]), size - 1); } else start = Math.max(0, size - Number(r[2]));
        if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        status = 206;
      }
      const h = {
        'Content-Type': safe || 'application/octet-stream', 'Content-Length': Math.max(0, end - start + 1), 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${safe && inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'private, max-age=600',
        'Content-Security-Policy': ext === '.pdf' ? "frame-ancestors 'self'" : "default-src 'none'; style-src 'unsafe-inline'; sandbox", ...extra,
      };
      if (status === 206) h['Content-Range'] = `bytes ${start}-${end}/${size}`;
      res.writeHead(status, h);
      if (req.method === 'HEAD' || size === 0) return res.end();
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    });
  }

  // ---------- a chat's Files tab ----------
  api['GET /api/files/list'] = async (req, res, me, url) => {
    const chan = str(url.searchParams.get('chan'), 64); mustSee(me, chan);
    const t = treeOf(chan), all = [...chatFiles(chan).values()].sort((a, b) => b.mod - a.mod || b.shared - a.shared).slice(0, 5000);
    json(res, 200, { chan, folders: Object.values(t.folders).map(folderOut), files: all, canWrite: mayWrite(me, chan), isAdmin: isAdmin(me) });
  };
  // files uploaded (POST /api/upload) straight into the Files tab, optionally into a folder; no chat message is posted
  api['POST /api/files/add'] = async (req, res, me) => {
    const b = await body(req, 8192), chan = str(b.chan, 64); writer(me, chan);
    const folder = str(b.folder, 16), t = treeOf(chan, true); if (folder && !own(t.folders, folder)) fail(404, 'That folder is gone.');
    const ids = idList(b.ids, FILE_ID, 50); if (!ids.length) fail(400, 'Pick a file to upload.');
    for (const id of ids) { const r = rec(id); if (!r || r.by !== me.id || r.verOf || (r.home && r.home !== chan)) fail(400, 'A file in this upload is no longer available.'); }
    for (const id of ids) { rec(id).home = chan; if (folder) t.place[id] = folder; else delete t.place[id]; }
    store.save(); changed(chan); json(res, 200, { ok: true, ids });
  };
  api['POST /api/files/folder'] = async (req, res, me) => {
    const b = await body(req, 2048), chan = str(b.chan, 64), op = str(b.op, 10); writer(me, chan);
    const t = treeOf(chan, true), name = cleanName(b.name, 60);
    const clash = (parent, n, skip) => Object.values(t.folders).some((f) => (f.parent || '') === parent && f.id !== skip && f.name.toLowerCase() === n.toLowerCase());
    const unique = (parent, n, skip) => { let x = n; for (let i = 2; clash(parent, x, skip) && i < 100; i++) x = `${n} (${i})`; return x; };
    let f;
    if (op === 'add') {
      const parent = str(b.parent, 16); if (parent && !own(t.folders, parent)) fail(404, 'That folder is gone.');
      if (!name) fail(400, 'Give the folder a name.');
      if (folderPath(t, parent).length >= 8) fail(400, 'Folders can go 8 levels deep at most.');
      if (Object.keys(t.folders).length >= 300) fail(400, 'This chat has too many folders.');
      if (clash(parent, name)) fail(409, 'A folder with that name is already here.');
      f = { id: rid(6), name, parent, by: me.id, ts: Date.now() }; t.folders[f.id] = f;
    } else {
      const id = str(b.id, 16); if (!own(t.folders, id)) fail(404, 'That folder is gone.'); f = t.folders[id];
      if (f.by !== me.id && !isAdmin(me)) fail(403, 'Only the person who made this folder or an admin can change it.');
      if (op === 'rename') { if (!name) fail(400, 'Give the folder a name.'); if (clash(f.parent || '', name, f.id)) fail(409, 'A folder with that name is already here.'); f.name = name; }
      else if (op === 'delete') { // nothing is lost: what was inside moves up one level
        for (const x of Object.values(t.folders)) if (x.parent === f.id) { x.parent = f.parent || ''; x.name = unique(x.parent, x.name, x.id); }
        for (const [fid, p] of Object.entries(t.place)) if (p === f.id) { if (f.parent) t.place[fid] = f.parent; else delete t.place[fid]; }
        delete t.folders[f.id];
      } else fail(400, 'Bad operation');
    }
    store.save(); changed(chan); json(res, 200, { ok: true, folder: folderOut(f) });
  };
  // moving is organising: anyone who may post in the chat can do it (renaming and deleting a file is for its owner)
  api['POST /api/files/move'] = async (req, res, me) => {
    const b = await body(req, 32768), chan = str(b.chan, 64); writer(me, chan);
    const t = treeOf(chan, true), to = str(b.to, 16); if (to && !own(t.folders, to)) fail(404, 'That folder is gone.');
    const ids = idList(b.files, FILE_ID, 1000), fids = idList(b.folders, FOLDER_ID, 300); if (!ids.length && !fids.length) fail(400, 'Pick something to move.');
    const have = chatFiles(chan);
    for (const id of ids) if (!have.has(id)) fail(404, 'A file you picked is no longer in this chat.');
    for (const id of fids) { if (!own(t.folders, id)) fail(404, 'That folder is gone.'); if (inside(t, to, id)) fail(400, "A folder can't go inside itself."); }
    if (folderPath(t, to).length + (fids.length ? 1 : 0) > 8) fail(400, 'Folders can go 8 levels deep at most.');
    for (const id of ids) { if (to) t.place[id] = to; else delete t.place[id]; }
    for (const id of fids) { const f = t.folders[id]; f.parent = to; let n = f.name; for (let i = 2; Object.values(t.folders).some((x) => x.id !== id && (x.parent || '') === to && x.name.toLowerCase() === n.toLowerCase()) && i < 100; i++) n = `${f.name} (${i})`; f.name = n; }
    store.save(); changed(chan); json(res, 200, { ok: true });
  };

  // ---------- rename / delete (your own files; admins any) ----------
  api['POST /api/files/rename'] = async (req, res, me) => {
    const b = await body(req, 1024), r = editable(me, str(b.id, 24)), name = cleanName(b.name, 120);
    if (!name) fail(400, 'Give the file a name.');
    if (name !== r.name) { r.name = name; store.save(); syncMessages(r); }
    json(res, 200, { ok: true, file: fileOut(r) });
  };
  function dropVersions(id) { const V = versions(); for (const x of V[id] || []) { delete db.files[x.blob]; fs.unlink(path.join(P.uploads, x.blob), () => {}); } delete V[id]; }
  function removeFile(r, me) {
    const id = r.id, chats = new Set(), now = Date.now();
    for (const m of db.messages) {
      if (!m.files || !m.files.some((f) => f.id === id)) continue;
      const gone = m.files.filter((f) => f.id === id); m.files = m.files.filter((f) => f.id !== id); if (!m.files.length) delete m.files;
      m.filesDeleted = [...(m.filesDeleted || []), ...gone.map((f) => ({ name: f.name, by: me.id, ts: now }))].slice(-10);
      chats.add(m.chan); emit('update', msgOut(m), audience(m.chan));
    }
    for (const s of db.scheduled) if (s.files) s.files = s.files.filter((f) => f.id !== id);
    if (r.home) chats.add(r.home);
    for (const [chan, t] of Object.entries(trees())) if (own(t.place, id)) { delete t.place[id]; chats.add(chan); }
    const L = links(); for (const [lid, l] of Object.entries(L)) if (l.file === id) delete L[lid];
    dropVersions(id); delete db.files[id]; ctx.fileAccess.forEach((_, k) => { if (k.endsWith(':' + id)) ctx.fileAccess.delete(k); });
    fs.unlink(path.join(P.uploads, id), () => {});
    return chats;
  }
  api['POST /api/files/delete'] = async (req, res, me) => {
    const b = await body(req, 32768), ids = b.id ? idList([b.id], FILE_ID, 1) : idList(b.ids, FILE_ID, 200); if (!ids.length) fail(400, 'Pick a file.');
    const list = ids.map((id) => editable(me, id));
    for (const r of list) if (Object.values(db.users).some((u) => u.avatar === r.id) || Object.values(db.emojis).includes(r.id)) fail(400, `“${r.name}” is also used as a profile picture or custom emoji.`);
    const chats = new Set(); for (const r of list) for (const c of removeFile(r, me)) chats.add(c);
    store.save(); for (const c of chats) if (validChan(c)) changed(c);
    json(res, 200, { ok: true, deleted: list.length });
  };

  // ---------- versions ----------
  const busy = new Set(); // file ids being swapped right now
  async function swapIn(r, src, size, me) { // the current bytes become an old version; src becomes the current file
    const blob = rid(12), cur = path.join(P.uploads, r.id), old = path.join(P.uploads, blob);
    try { await fsp.rename(cur, old); } catch { fail(410, 'The current file is missing on the host computer.'); }
    try { await fsp.rename(src, cur); } catch (e) { await fsp.rename(old, cur).catch(() => {}); throw e; }
    const by = r.modBy || r.by, ts = r.mod || r.ts;
    db.files[blob] = { id: blob, name: r.name, size: r.size, by, ts, verOf: r.id };
    const V = versions(), list = (V[r.id] ||= []); list.push({ n: r.v || 1, blob, name: r.name, size: r.size, by, ts });
    while (list.length > MAX_VERSIONS) { const x = list.shift(); delete db.files[x.blob]; fs.unlink(path.join(P.uploads, x.blob), () => {}); }
    r.size = size; r.v = (r.v || 1) + 1; r.mod = Date.now(); r.modBy = me.id;
    ctx.fileAccess.forEach((_, k) => { if (k.endsWith(':' + blob)) ctx.fileAccess.delete(k); });
    store.save(); syncMessages(r);
  }
  const locked = async (id, fn) => { if (busy.has(id)) fail(409, 'Someone is saving a version of this file right now. Try again in a moment.'); busy.add(id); try { return await fn(); } finally { busy.delete(id); } };
  api['POST /api/files/version'] = async (req, res, me) => {
    const b = await body(req, 512), r = editable(me, str(b.id, 24)), up = rec(str(b.upload, 24));
    if (!up || up.by !== me.id || up.id === r.id || up.home || up.verOf || inMessages(up.id)) fail(400, 'Upload the new version first.');
    if (extOf(up.name) !== extOf(r.name)) fail(400, `The new version must be the same kind of file (${extOf(r.name) || 'no extension'}).`);
    await locked(r.id, async () => { await swapIn(r, path.join(P.uploads, up.id), up.size, me); delete db.files[up.id]; store.save(); });
    json(res, 200, { ok: true, file: fileOut(r) });
  };
  api['POST /api/files/restore'] = async (req, res, me) => {
    const b = await body(req, 512), r = editable(me, str(b.id, 24)), n = Number(b.n), v = (versions()[r.id] || []).find((x) => x.n === n);
    if (!v) fail(404, 'That version is gone.');
    const tmp = path.join(P.uploads, rid(12));
    await locked(r.id, async () => {
      try { await fsp.copyFile(path.join(P.uploads, v.blob), tmp); } catch { fail(410, 'That version is missing on the host computer.'); }
      try { await swapIn(r, tmp, v.size, me); } catch (e) { fs.unlink(tmp, () => {}); throw e; }
    });
    json(res, 200, { ok: true, file: fileOut(r) });
  };
  const versionsOut = (r) => (versions()[r.id] || []).map((x) => ({ n: x.n, name: x.name, size: x.size, by: x.by, ts: x.ts })).reverse();
  api['GET /api/files/versions'] = async (req, res, me, url) => {
    const r = readable(me, str(url.searchParams.get('id'), 24));
    json(res, 200, { file: fileOut(r), versions: versionsOut(r), canEdit: r.by === me.id || isAdmin(me) });
  };
  api['GET /api/files/vget'] = async (req, res, me, url) => { // download (or preview) an old version
    const q = url.searchParams, r = readable(me, str(q.get('id'), 24)), n = Number(q.get('n')), v = (versions()[r.id] || []).find((x) => x.n === n);
    if (!v) fail(404, 'That version is gone.');
    const ext = extOf(r.name), base = ext ? r.name.slice(0, -ext.length) : r.name;
    sendFile(req, res, path.join(P.uploads, v.blob), `${base} (version ${n})${ext}`, q.get('inline') === '1');
  };

  // ---------- details ----------
  api['GET /api/files/info'] = async (req, res, me, url) => {
    const r = readable(me, str(url.searchParams.get('id'), 24)), places = [];
    for (const m of db.messages) if (m.files && !m.deleted && m.files.some((f) => f.id === r.id) && !places.some((p) => p.chan === m.chan) && canSee(me, m.chan)) places.push({ chan: m.chan, msg: m.id, ts: m.ts });
    if (r.home && !places.some((p) => p.chan === r.home) && canSee(me, r.home)) places.push({ chan: r.home, msg: null, ts: r.ts });
    for (const p of places) { const t = treeOf(p.chan), fid = own(t.place, r.id) && own(t.folders, t.place[r.id]) ? t.place[r.id] : ''; p.folder = fid; p.path = folderPath(t, fid).map((x) => x.name); p.title = chatTitle(p.chan); }
    json(res, 200, { file: fileOut(r), places, versions: versionsOut(r), canEdit: r.by === me.id || isAdmin(me), links: linksFor(me, r) });
  };

  // ---------- zip downloads (only files the person may read) ----------
  const zipSafe = (n) => cleanName(n, 120).replace(/[:*?"<>|]/g, '_') || 'file';
  api['GET /api/files/zip'] = async (req, res, me, url) => {
    if (!rate('zip:' + me.id, 12, 60000)) fail(429, 'Too many downloads at once. Wait a moment.');
    const q = url.searchParams, chan = str(q.get('chan') || '', 64), split = (k, re) => (q.get(k) || '').split(',').filter((x) => re.test(x)).slice(0, 1000);
    const ids = split('ids', FILE_ID), fsel = split('folders', FOLDER_ID), folder = str(q.get('folder') || '', 16), picked = [];
    if (chan) {
      mustSee(me, chan);
      const t = treeOf(chan), have = chatFiles(chan), dirOf = (fid, from) => folderPath(t, fid).slice(from).map((x) => zipSafe(x.name)).join('/');
      const depthOf = (fid) => folderPath(t, fid).length;
      if (!ids.length && !fsel.length) { // a whole folder (or the whole chat): keep the folder structure
        if (folder && !own(t.folders, folder)) fail(404, 'That folder is gone.');
        const base = folder ? depthOf(folder) : 0;
        for (const f of have.values()) if (!folder || inside(t, f.folder, folder)) picked.push({ id: f.id, dir: dirOf(f.folder, base) });
      } else {
        for (const id of ids) if (have.has(id)) picked.push({ id, dir: '' });
        for (const fid of fsel) if (own(t.folders, fid)) { const base = depthOf(fid) - 1; for (const f of have.values()) if (inside(t, f.folder, fid)) picked.push({ id: f.id, dir: dirOf(f.folder, base) }); }
      }
    } else for (const id of ids) picked.push({ id, dir: '' });
    const seen = new Set(), names = new Set(), entries = []; let total = 0;
    for (const p of picked) {
      const r = rec(p.id); if (!r || r.verOf || seen.has(r.id) || !fileCanRead(me, r.id)) continue;
      const file = path.join(P.uploads, r.id); if (!fs.existsSync(file)) continue; seen.add(r.id);
      const ext = extOf(r.name), base = zipSafe(ext ? r.name.slice(0, -ext.length) : r.name) || 'file'; let n = (p.dir ? p.dir + '/' : '') + base + ext;
      for (let i = 2; names.has(n.toLowerCase()); i++) n = (p.dir ? p.dir + '/' : '') + `${base} (${i})${ext}`;
      names.add(n.toLowerCase()); total += r.size || 0; entries.push({ name: n, file, mtime: new Date(r.mod || r.ts) });
    }
    if (!entries.length) fail(404, 'There is nothing here you can download.');
    if (entries.length > 2000 || total > 3.9e9) fail(413, 'That is too much for one zip file (4 GB). Pick fewer files.');
    const zipName = zipSafe((chan ? chatTitle(chan).replace(/^#/, '') + (folder && own(treeOf(chan).folders, folder) ? ' - ' + treeOf(chan).folders[folder].name : '') : 'LANChat') + ' files') + '.zip';
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    // stop reading files as soon as the browser goes away (writeZip waits for "drain")
    const sink = { write: (buf) => { if (res.destroyed) throw new Error('closed'); return res.write(buf); }, once: (ev, cb) => { const done = () => { res.off('drain', done); res.off('close', done); cb(); }; res.on('drain', done); res.on('close', done); } };
    try { await writeZip(entries, sink); } catch (e) { if (e.message !== 'closed') console.error('zip download:', e.message); }
    res.end();
  };

  // ---------- share links that expire ----------
  const linkOut = (l) => { const r = rec(l.file); return { id: l.id, k: l.k, file: l.file, name: r ? r.name : '', by: l.by, ts: l.ts, exp: l.exp, scope: l.scope }; };
  const linksFor = (me, r) => Object.values(links()).filter((l) => l.file === r.id && l.exp > Date.now() && (l.by === me.id || r.by === me.id || isAdmin(me))).map(linkOut);
  api['POST /api/files/link'] = async (req, res, me) => {
    const b = await body(req, 512), r = readable(me, str(b.id, 24)), scope = b.scope === 'anyone' ? 'anyone' : 'members', ttl = Math.round(Number(b.ttl));
    if (scope === 'anyone' && r.by !== me.id && !isAdmin(me)) fail(403, 'Only the person who shared this file or an admin can make a link that works for anyone.');
    if (!Number.isFinite(ttl) || ttl < 300 || ttl > 30 * 86400) fail(400, 'Pick how long the link works (5 minutes to 30 days).');
    if (!rate('link:' + me.id, 30, 60000)) fail(429, 'You are making links too fast.');
    const L = links(); if (Object.values(L).filter((l) => l.by === me.id).length >= 200) fail(400, 'You have too many active links. Remove some first.');
    const l = { id: rid(6), k: rid(16), file: r.id, by: me.id, ts: Date.now(), exp: Date.now() + ttl * 1000, scope };
    L[l.id] = l; store.save(); emit('fl_links', { file: r.id }, [me.id]); json(res, 200, { link: linkOut(l) });
  };
  api['GET /api/files/links'] = async (req, res, me, url) => {
    const id = str(url.searchParams.get('file') || '', 24);
    if (id) return json(res, 200, { links: linksFor(me, readable(me, id)) });
    json(res, 200, { links: Object.values(links()).filter((l) => l.by === me.id && l.exp > Date.now() && rec(l.file)).sort((a, b) => a.exp - b.exp).map(linkOut) });
  };
  api['POST /api/files/link/revoke'] = async (req, res, me) => {
    const L = links(), id = str((await body(req, 256)).id, 16); if (!own(L, id)) fail(404, 'That link is already gone.');
    const l = L[id], r = rec(l.file); if (l.by !== me.id && !isAdmin(me) && !(r && r.by === me.id)) fail(403, 'Only the person who made the link, the file owner or an admin can remove it.');
    delete L[id]; store.save(); emit('fl_links', { file: l.file }, [...new Set([me.id, l.by])]); json(res, 200, { ok: true });
  };
  const findLink = (k) => (/^[a-f0-9]{32}$/.test(k) ? Object.values(links()).find((l) => safeEq(l.k, k)) : null);
  // a signed-in person opens a link (#fl=<secret>): members links need the same access the file already has
  api['GET /api/files/link/open'] = async (req, res, me, url) => {
    const l = findLink(str(url.searchParams.get('k'), 64)), r = l && l.exp > Date.now() ? rec(l.file) : null;
    if (!r || (l.scope !== 'anyone' && !fileCanRead(me, r.id))) fail(404, 'This link has expired or is no longer available.');
    json(res, 200, { file: fileOut(r), scope: l.scope, exp: l.exp, open: l.scope === 'anyone' ? { url: '/api/share?k=' + l.k } : null });
  };
  // "anyone on this network with the link": no sign-in; reveals nothing once expired or revoked
  ctx.publicRoutes.add('GET /api/share');
  api['GET /api/share'] = async (req, res, _me, url) => {
    const nope = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }); res.end(text); };
    if (!rate('share:' + ipOf(req), 60, 60000)) return nope(429, 'Too many requests. Wait a moment.');
    const l = findLink(str(url.searchParams.get('k'), 64)), r = l && l.scope === 'anyone' && l.exp > Date.now() ? rec(l.file) : null;
    if (!r) return nope(404, 'This link has expired or was removed.');
    sendFile(req, res, path.join(P.uploads, r.id), r.name, url.searchParams.get('download') !== '1', { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, true);
  };

  // ---------- the Files app: every file you can see ----------
  api['GET /api/files/all'] = async (req, res, me, url) => {
    const q = url.searchParams, view = str(q.get('view') || 'recent', 10), only = str(q.get('chan') || '', 64), type = str(q.get('type') || '', 10), text = str(q.get('q') || '', 100).toLowerCase().trim();
    if (only) mustSee(me, only);
    const vis = new Map(), see = (c) => { if (!vis.has(c)) vis.set(c, canSee(me, c)); return vis.get(c); }, out = new Map();
    for (let i = db.messages.length - 1; i >= 0; i--) {
      const m = db.messages[i]; if (m.deleted || !m.files || (only && m.chan !== only) || !see(m.chan)) continue;
      for (const f of m.files) { const r = rec(f.id); if (r && !r.verOf && !out.has(r.id)) out.set(r.id, { ...fileOut(r), chan: m.chan, msg: m.id, from: m.from, shared: m.ts }); }
    }
    for (const r of Object.values(db.files)) if (r.home && !r.verOf && !out.has(r.id) && (!only || r.home === only) && see(r.home)) out.set(r.id, { ...fileOut(r), chan: r.home, msg: null, from: r.by, shared: r.ts });
    let list = [...out.values()];
    for (const f of list) { const t = treeOf(f.chan), fid = own(t.place, f.id) && own(t.folders, t.place[f.id]) ? t.place[f.id] : ''; f.folder = fid; f.path = folderPath(t, fid).map((x) => x.name); }
    if (view === 'mine') list = list.filter((f) => f.by === me.id);
    if (type && type !== 'all') list = list.filter((f) => f.kind === type);
    if (text) list = list.filter((f) => f.name.toLowerCase().includes(text));
    const sort = str(q.get('sort') || 'date', 6), dir = q.get('dir') === 'asc' ? 1 : -1, last = (f) => Math.max(f.mod, f.shared || 0);
    list.sort(sort === 'name' ? (a, b) => dir * a.name.localeCompare(b.name) : sort === 'size' ? (a, b) => dir * (a.size - b.size) : (a, b) => dir * (last(a) - last(b)));
    json(res, 200, { files: list.slice(0, view === 'recent' && !text && !type ? 100 : 1000), total: list.length });
  };

  // ---------- housekeeping: expired links, versions of deleted files, folders of deleted chats ----------
  ctx.ticks.push({ every: 30000, fn: (now) => {
    let dirty = false;
    const L = links(); for (const [id, l] of Object.entries(L)) if (l.exp <= now || !rec(l.file)) { delete L[id]; dirty = true; }
    const V = versions(); for (const fid of Object.keys(V)) if (!rec(fid)) { dropVersions(fid); dirty = true; }
    const T = trees();
    for (const [chan, t] of Object.entries(T)) {
      if (!chatAlive(chan)) { delete T[chan]; dirty = true; continue; }
      for (const fid of Object.keys(t.place)) if (!rec(fid) || !own(t.folders, t.place[fid])) { delete t.place[fid]; dirty = true; }
    }
    const orphans = Object.values(db.files).filter((r) => r.home && !chatAlive(r.home)).map((r) => r.id);
    if (orphans.length) { for (const id of orphans) delete db.files[id].home; gcFiles(orphans); dirty = true; }
    if (dirty) store.save();
  } });
  // "Start fresh" deletes every file, including the ones kept in Files tabs
  const reset = api['POST /api/admin/reset'];
  if (reset) api['POST /api/admin/reset'] = async (req, res, me, url) => {
    await reset(req, res, me, url);
    if (res.statusCode !== 200) return;
    db.fileTree = {}; db.fileLinks = {}; for (const r of Object.values(db.files)) delete r.home;
    const ids = Object.keys(db.files); db.fileVersions = {}; gcFiles(ids); store.save();
  };

  ctx.files = { chatFiles, kindOf, cleanName, sendFile }; // for other areas (read-only helpers)
};
