'use strict';
// Host/admin controls: join approval, people, settings, storage, retention, backup/restore, encryption.
const fs = require('fs');
const path = require('path');
const { writeZip, readZipIndex, extractEntry } = require('./zip');
const { parseDbBlob } = require('./store');

module.exports = (ctx) => {
  const { api, db, S, store, P, pending, clients, json, body, fail, rid, str, rate, safeEq, userById, findByName, isOwner, isAdmin, online, adminIds, newToken, makeUser, sysMsg, emit, emitUser, pub, removeMessages, gcFiles, rebuildIndexes, chanOut, audience, sanitizeUserName, validChan, dmParts } = ctx;
  const needAdmin = (me) => { if (!isAdmin(me)) fail(403, 'Only the host or an admin can do that'); };
  const needOwner = (me) => { if (!isOwner(me)) fail(403, 'Only the host can do that'); };

  // ----- join requests -----
  api['GET /api/admin/requests'] = async (req, res, me) => { needAdmin(me); json(res, 200, { requests: [...pending.values()].filter((r) => r.status === 'pending').map(ctx.reqOut) }); };

  api['POST /api/admin/requests/decide'] = async (req, res, me) => {
    needAdmin(me);
    const b = await body(req, 1024), r = pending.get(str(b.id, 32));
    if (!r || r.status !== 'pending') fail(404, 'That request was already handled or has expired.');
    const decision = str(b.decision, 10);
    if (decision === 'approve') {
      let u = r.existingId ? userById(r.existingId) : null;
      if (u) u.removed = false;
      else { const clash = findByName(r.name); if (clash) fail(409, 'That name is now taken. Deny this request.'); u = makeUser(r.name); ctx.joined(u); }
      u.lastIp = r.ip; r.userId = u.id; r.token = newToken(u, r.dev); r.status = 'approved'; r.exp = Date.now() + 300000; emitUser(u);
    } else if (decision === 'deny' || decision === 'block') {
      r.status = 'denied'; r.reason = decision === 'block' ? 'blocked' : str(b.reason, 100); r.exp = Date.now() + 120000;
      if (decision === 'block') { db.bans.names.push(r.name.toLowerCase()); if (r.dev) db.bans.devices.push(r.dev); if (r.ip) db.bans.ips.push(r.ip); store.save(); }
    } else fail(400, 'Bad decision');
    emit('joindecided', { id: r.id, status: r.status, name: r.name, by: me.id }, adminIds());
    json(res, 200, { ok: true });
  };

  // ----- people -----
  api['GET /api/admin/users'] = async (req, res, me) => {
    needAdmin(me);
    const bytes = {}; for (const f of Object.values(db.files)) bytes[f.by] = (bytes[f.by] || 0) + f.size;
    const cnt = {}; for (const m of db.messages) if (m.from) cnt[m.from] = (cnt[m.from] || 0) + 1;
    json(res, 200, { users: Object.values(db.users).filter((u) => !u.deleted).map((u) => ({ ...pub(u, u), created: u.created, devices: u.tokens.length, ip: u.lastIp || '', mutedUntil: u.mutedUntil, messages: cnt[u.id] || 0, bytes: bytes[u.id] || 0 })) });
  };

  // sign a person out everywhere and take them out of private groups (shared by remove / delete)
  function retire(u, block) {
    const devs = u.tokens.map((t) => t.dev).filter(Boolean);
    u.tokens = []; u.removed = true; u.role = 'member'; rebuildIndexes();
    emit('kicked', { block: !!block }, [u.id]);
    const set = clients.get(u.id); if (set) { for (const r of set) { try { r.end(); } catch {} } clients.delete(u.id); }
    for (const c of Object.values(db.channels)) if (c.members && c.members.includes(u.id)) { c.members = c.members.filter((i) => i !== u.id); emit('channel', chanOut(c), c.members); }
    if (block) { db.bans.names.push(u.name.toLowerCase()); db.bans.devices.push(...devs); if (u.lastIp) db.bans.ips.push(u.lastIp); }
  }
  // permanent deletion: the account disappears (their name becomes free again), private chats with them are erased
  function deleteAccount(u, purge) {
    retire(u, false);
    const dms = db.messages.filter((m) => m.chan.startsWith('dm:') && dmParts(m.chan).includes(u.id)); let purged = removeMessages(dms);
    if (purge) purged += removeMessages(db.messages.filter((m) => m.from === u.id));
    const av = u.avatar; u.avatar = null; u.name = 'Deleted user'; u.deleted = true; u.statusText = ''; u.statusEmoji = ''; u.prefs = {}; u.lastIp = ''; u.read = {}; u.seen = {}; u.delivered = {};
    if (av) gcFiles([av]);
    store.save(); emitUser(u); return purged;
  }

  api['POST /api/admin/user/remove'] = async (req, res, me) => {
    needAdmin(me);
    const b = await body(req, 512), u = userById(str(b.id, 32));
    if (!u) fail(404, 'No such person');
    if (isOwner(u)) fail(403, "The host can't be removed.");
    if (u.id === me.id) fail(400, "You can't remove yourself.");
    if (isAdmin(u) && !isOwner(me)) fail(403, 'Only the host can remove an admin.');
    retire(u, b.block);
    let purged = 0; if (b.purge) purged = removeMessages(db.messages.filter((m) => m.from === u.id));
    store.save(); emitUser(u); json(res, 200, { ok: true, purged });
  };

  api['POST /api/admin/user/role'] = async (req, res, me) => {
    needOwner(me);
    const b = await body(req, 512), u = userById(str(b.id, 32));
    if (!u || u.removed) fail(404, 'No such person');
    if (isOwner(u)) fail(400, "The host's role can't be changed.");
    if (!['admin', 'member'].includes(b.role)) fail(400, 'Bad role');
    u.role = b.role; store.save(); emitUser(u); emit('me', ctx.meOut(u), [u.id]);
    sysMsg('general', b.role === 'admin' ? `${u.name} is now an admin` : `${u.name} is no longer an admin`); json(res, 200, { ok: true });
  };

  api['POST /api/admin/user/mute'] = async (req, res, me) => {
    needAdmin(me);
    const b = await body(req, 512), u = userById(str(b.id, 32));
    if (!u || u.removed) fail(404, 'No such person');
    if (isAdmin(u) && !isOwner(me)) fail(403, 'Only the host can mute an admin.');
    if (isOwner(u)) fail(403, "The host can't be muted.");
    const min = Number(b.minutes);
    u.mutedUntil = !min ? 0 : min < 0 ? Number.MAX_SAFE_INTEGER : Date.now() + Math.min(min, 525600) * 60000;
    store.save(); emitUser(u); emit('me', ctx.meOut(u), [u.id]); json(res, 200, { ok: true, mutedUntil: u.mutedUntil });
  };

  api['POST /api/admin/user/delete'] = async (req, res, me) => {
    needAdmin(me);
    const b = await body(req, 512), u = userById(str(b.id, 32));
    if (!u || u.deleted) fail(404, 'No such person');
    if (isOwner(u)) fail(403, "The host can't be deleted.");
    if (u.id === me.id) fail(400, 'Use "Delete my account" in Settings for yourself.');
    if (isAdmin(u) && !isOwner(me)) fail(403, 'Only the host can delete an admin.');
    json(res, 200, { ok: true, purged: deleteAccount(u, !!b.purge) });
  };
  api['POST /api/account/delete'] = async (req, res, me) => { // every person can delete their own account
    const b = await body(req, 256);
    if (isOwner(me)) fail(403, "The host can't delete their account. Delete the session from the Sessions window instead.");
    json(res, 200, { ok: true, purged: deleteAccount(me, !!b.purge) });
  };

  // ----- clean-up: delete old messages / clear everything -----
  api['POST /api/admin/cleanup'] = async (req, res, me) => {
    needOwner(me);
    const b = await body(req, 512), days = Number(b.days), chan = str(b.chan, 64);
    if (!Number.isFinite(days) || days < 0 || days > 36500) fail(400, 'Pick how old the messages must be.');
    if (chan && (chan.startsWith('dm:') || !validChan(chan))) fail(400, 'Pick a channel or group (private chats can only be cleaned for everyone at once).');
    const cut = days > 0 ? Date.now() - days * 86400000 : Infinity, keep = b.keepPinned !== false;
    const victims = db.messages.filter((m) => (!chan || m.chan === chan) && m.ts < cut && !(keep && m.pinned));
    if (b.dryRun) {
      const ids = new Set(); for (const m of victims) for (const f of m.files || []) ids.add(f.id);
      let bytes = 0; for (const id of ids) bytes += (db.files[id] && db.files[id].size) || 0;
      return json(res, 200, { ok: true, count: victims.length, files: ids.size, bytes });
    }
    json(res, 200, { ok: true, removed: removeMessages(victims) });
  };
  api['POST /api/admin/reset'] = async (req, res, me) => { // "start fresh": everything except the host's own account and settings
    needOwner(me);
    const b = await body(req, 256); if (b.confirm !== 'RESET') fail(400, 'Type RESET to confirm.');
    for (const u of Object.values(db.users)) if (u.id !== me.id) { emit('kicked', {}, [u.id]); const set = clients.get(u.id); if (set) { for (const r of set) { try { r.end(); } catch {} } clients.delete(u.id); } }
    const fileIds = Object.keys(db.files);
    db.users = { [me.id]: me }; db.messages = []; db.scheduled = []; db.extras = {}; db.emojis = {}; db.dmTtl = {};
    db.channels = { general: db.channels.general || { id: 'general', name: 'general', topic: 'Everyone is here', created: Date.now() } };
    me.read = {}; me.seen = {}; me.delivered = {}; me.prefs = {}; me.baseSeq = db.seq; pending.clear();
    rebuildIndexes(); gcFiles(fileIds); store.save(); json(res, 200, { ok: true });
  };

  api['GET /api/admin/bans'] = async (req, res, me) => { needAdmin(me); json(res, 200, db.bans); };
  api['POST /api/admin/unban'] = async (req, res, me) => {
    needAdmin(me);
    const b = await body(req, 512), kind = { name: 'names', device: 'devices', ip: 'ips' }[b.kind];
    if (!kind) fail(400, 'Bad kind');
    db.bans[kind] = db.bans[kind].filter((x) => x !== str(b.value, 100)); store.save(); json(res, 200, db.bans);
  };

  // ----- settings -----
  const bool = (v) => !!v, int = (lo, hi) => (v) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) fail(400, 'Number out of range'); return n; };
  const SPEC = {
    requireApproval: bool, passcode: (v) => str(v, 64), retentionDays: int(0, 3650), defaultTtl: int(0, 31536000), linkPreviews: bool,
    membersCanCreateChannels: bool, membersCanCreateGroups: bool, membersCanEveryone: bool, membersCanAddEmoji: bool, maxUploadMB: int(1, 4096),
  };
  api['GET /api/admin/settings'] = async (req, res, me) => { needAdmin(me); json(res, 200, { settings: { ...ctx.clientSettings(), passcode: isOwner(me) ? S.passcode : undefined } }); };
  api['POST /api/admin/settings'] = async (req, res, me) => {
    needOwner(me);
    const b = await body(req, 4096);
    for (const [k, v] of Object.entries(b)) if (Object.prototype.hasOwnProperty.call(SPEC, k)) S[k] = SPEC[k](v);
    store.save(); emit('settings', ctx.clientSettings()); json(res, 200, { ok: true, settings: { ...ctx.clientSettings(), passcode: S.passcode } });
  };
  api['POST /api/admin/name'] = async (req, res, me) => {
    needOwner(me);
    const n = str((await body(req, 512)).name, 200).replace(/\s+/g, ' ').trim().slice(0, 40); if (!n) fail(400, 'Give the session a name');
    S.name = n; store.save(); emit('meta', { name: n }); ctx.notifyHost('renamed', n); json(res, 200, { ok: true, name: n });
  };

  // ----- storage + retention -----
  api['GET /api/admin/storage'] = async (req, res, me) => {
    needAdmin(me);
    let dbBytes = 0; for (const f of [P.plain, P.enc]) { try { dbBytes += fs.statSync(f).size; } catch {} }
    const perUser = {}, perChat = {}; let fileBytes = 0;
    for (const f of Object.values(db.files)) { fileBytes += f.size; const x = (perUser[f.by] ||= { bytes: 0, files: 0 }); x.bytes += f.size; x.files++; }
    for (const m of db.messages) { const c = (perChat[m.chan] ||= { messages: 0, bytes: 0 }); c.messages++; for (const f of m.files || []) c.bytes += (db.files[f.id]?.size || 0); }
    const name = (id) => db.users[id]?.name || '(unknown)';
    const chatName = (c) => (c.startsWith('dm:') ? 'DM: ' + c.split(':').slice(1).map(name).join(' & ') : '#' + (db.channels[c]?.name || c));
    let disk = null; try { const s = fs.statfsSync(P.dir); disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize }; } catch {}
    json(res, 200, {
      dbBytes, fileBytes, files: Object.keys(db.files).length, messages: db.messages.length, disk, retentionDays: S.retentionDays, encrypted: store.isEncrypted(),
      perUser: Object.entries(perUser).map(([id, v]) => ({ id, name: name(id), ...v })).sort((a, b) => b.bytes - a.bytes),
      perChat: Object.entries(perChat).map(([c, v]) => ({ chan: c, name: chatName(c), ...v })).sort((a, b) => b.bytes - a.bytes || b.messages - a.messages).slice(0, 30),
      largest: Object.values(db.files).sort((a, b) => b.size - a.size).slice(0, 15).map((f) => ({ id: f.id, name: f.name, size: f.size, by: name(f.by), ts: f.ts })),
    });
  };

  function retentionSweep() {
    const days = S.retentionDays; if (!days) return 0;
    const cut = Date.now() - days * 86400000;
    return removeMessages(db.messages.filter((m) => m.ts < cut && !m.pinned));
  }
  function orphanSweep() {
    const old = Date.now() - 86400000;
    gcFiles(Object.values(db.files).filter((f) => f.ts < old).map((f) => f.id));
    try { for (const f of fs.readdirSync(P.uploads)) { if (db.files[f]) continue; const p = path.join(P.uploads, f); try { if (fs.statSync(p).mtimeMs < old) fs.unlinkSync(p); } catch {} } } catch {}
  }
  ctx.ticks.push({ every: 3600000, fn: () => { retentionSweep(); orphanSweep(); } });
  ctx.ticks.push({ every: 5000, fn: (now) => { for (const [id, r] of pending) if ((r.status === 'pending' && now - r.ts > 900000) || (r.exp && now > r.exp)) { pending.delete(id); if (r.status === 'pending') emit('joindecided', { id, status: 'expired' }, adminIds()); } } });
  ctx.ticks.push({ every: 60000, fn: (now) => { for (const [k, a] of ctx.hits) if (!a.length || a[a.length - 1] < now - 600000) ctx.hits.delete(k); } });
  api['POST /api/admin/retention/run'] = async (req, res, me) => { needOwner(me); const n = retentionSweep(); orphanSweep(); json(res, 200, { ok: true, removed: n }); };

  // ----- backup / restore -----
  api['GET /api/admin/backup'] = async (req, res, me) => {
    needOwner(me); store.flush();
    const entries = [{ name: 'meta.json', data: Buffer.from(JSON.stringify({ app: 'lanchat', version: 2, name: S.name, exportedAt: new Date().toISOString(), encrypted: store.isEncrypted() })) }];
    entries.push(store.isEncrypted() ? { name: 'db.enc', file: P.enc } : { name: 'db.json', file: P.plain });
    for (const f of fs.readdirSync(P.uploads)) if (/^[a-f0-9]{24}$/.test(f)) entries.push({ name: 'uploads/' + f, file: path.join(P.uploads, f) });
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="lanchat-backup-${new Date().toISOString().slice(0, 10)}.zip"`, 'Cache-Control': 'no-store' });
    try { await writeZip(entries, res); res.end(); } catch (e) { res.destroy(e); }
  };

  let restoring = false;
  api['POST /api/admin/restore'] = async (req, res, me) => {
    needOwner(me);
    if (restoring) fail(409, 'A restore is already running');
    if (!rate('restore', 5, 600000)) fail(429, 'Too many attempts');
    restoring = true;
    const stage = path.join(P.dir, 'restore-' + rid(4)), zipFile = stage + '.zip';
    try {
      let n = 0; const LIMIT = 8 * 1024 * 1024 * 1024; const out = fs.createWriteStream(zipFile);
      await new Promise((resolve, reject) => { req.on('data', (c) => { n += c.length; if (n > LIMIT) { reject(Object.assign(new Error('Backup too large'), { status: 413 })); req.destroy(); } }); req.pipe(out); out.on('finish', resolve); out.on('error', reject); req.on('error', reject); });
      let entries; try { entries = readZipIndex(zipFile); } catch (e) { fail(400, 'That is not a valid LANChat backup: ' + e.message); }
      const dbEntry = entries.find((e) => e.name === 'db.json' || e.name === 'db.enc');
      if (!dbEntry) fail(400, 'That is not a LANChat backup (no history file inside).');
      fs.mkdirSync(path.join(stage, 'uploads'), { recursive: true });
      await extractEntry(zipFile, dbEntry, path.join(stage, 'dbfile'));
      let newDb; try { newDb = parseDbBlob(fs.readFileSync(path.join(stage, 'dbfile')), str(req.headers['x-backup-pass'], 200)); }
      catch (e) { fail(400, e.code === 'BAD_PASSPHRASE' ? 'This backup is encrypted. Enter its passphrase to restore it.' : 'The history file in the backup is damaged.'); }
      if (!newDb || typeof newDb.users !== 'object' || !Array.isArray(newDb.messages)) fail(400, 'The history file in the backup is not valid.');
      for (const e of entries) { // only well-formed upload names are ever extracted (no path tricks)
        const m = /^uploads\/([a-f0-9]{24})$/.exec(e.name); if (m) await extractEntry(zipFile, e, path.join(stage, 'uploads', m[1]));
      }
      // swap in: keep the previous data next to it so a mistaken restore can be undone
      const keep = path.join(P.dir, 'before-restore-' + new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(keep); store.flush();
      for (const f of [P.plain, P.enc]) if (fs.existsSync(f)) fs.renameSync(f, path.join(keep, path.basename(f)));
      fs.renameSync(P.uploads, path.join(keep, 'uploads')); fs.renameSync(path.join(stage, 'uploads'), P.uploads);
      store.replace(newDb); rebuildIndexes(); ctx.fileAccess?.clear(); pending.clear();
      for (const set of clients.values()) for (const r of set) { try { r.end(); } catch {} } clients.clear();
      json(res, 200, { ok: true, users: Object.keys(db.users).length, messages: db.messages.length, previous: path.basename(keep) });
    } finally { restoring = false; fs.rmSync(stage, { recursive: true, force: true }); fs.rmSync(zipFile, { force: true }); }
  };

  // ----- encryption at rest -----
  api['POST /api/admin/encryption'] = async (req, res, me) => {
    needOwner(me);
    if (!rate('enc:' + me.id, 6, 60000)) fail(429, 'Too many attempts');
    const b = await body(req, 1024), enabled = store.isEncrypted();
    if (b.enable) {
      const p = str(b.passphrase, 200); if (p.length < 8) fail(400, 'Use a passphrase of at least 8 characters.');
      if (enabled && !store.checkPassphrase(str(b.current, 200))) fail(403, 'Current passphrase is wrong.');
      store.setPassphrase(p);
    } else {
      if (!enabled) fail(400, 'History is not encrypted.');
      if (!store.checkPassphrase(str(b.current, 200))) fail(403, 'Current passphrase is wrong.');
      store.setPassphrase(null);
    }
    json(res, 200, { ok: true, encrypted: store.isEncrypted() });
  };

  ctx.retentionSweep = retentionSweep;
};
