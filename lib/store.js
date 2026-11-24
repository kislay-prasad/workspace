'use strict';
// Persistent store: one JSON snapshot, optionally encrypted at rest (AES-256-GCM, key from scrypt).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAGIC = Buffer.from('LCE1');
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const codeErr = (code, msg) => Object.assign(new Error(msg || code), { code });

const DEFAULT_SETTINGS = {
  name: '', requireApproval: true, passcode: '', retentionDays: 0, defaultTtl: 0, linkPreviews: false,
  membersCanCreateChannels: true, membersCanCreateGroups: true, membersCanEveryone: false, membersCanAddEmoji: true, maxUploadMB: 100,
};

const deriveKey = (pass, salt) => crypto.scryptSync(String(pass), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
function encrypt(key, salt, plain) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), ct]);
}
function decrypt(pass, buf) {
  if (buf.length < 48 || !buf.subarray(0, 4).equals(MAGIC)) throw codeErr('CORRUPT', 'Encrypted file is corrupt');
  const salt = Buffer.from(buf.subarray(4, 20)), iv = buf.subarray(20, 32), tag = buf.subarray(32, 48), ct = buf.subarray(48);
  const key = deriveKey(pass, salt);
  try { const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return { key, salt, plain: Buffer.concat([d.update(ct), d.final()]) }; }
  catch { throw codeErr('BAD_PASSPHRASE', 'Wrong passphrase'); }
}

function migrate(db) {
  const legacy = !db.v || db.v < 2;
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  for (const k of ['users', 'channels', 'files', 'emojis', 'extras', 'dmTtl']) db[k] ||= {};
  db.messages ||= []; db.scheduled ||= [];
  db.bans ||= { names: [], devices: [], ips: [] };
  if (!db.channels.general) db.channels.general = { id: 'general', name: 'general', topic: 'Everyone is here', created: Date.now() };
  // messages: seq cursors, multi-file
  let seq = db.seq || 0;
  db.messages.sort((a, b) => (a.seq || 0) - (b.seq || 0) || a.ts - b.ts);
  const needSeq = db.messages.some((m) => !m.seq);
  if (needSeq) { db.messages.sort((a, b) => a.ts - b.ts); seq = 0; for (const m of db.messages) m.seq = ++seq; }
  else for (const m of db.messages) seq = Math.max(seq, m.seq);
  db.seq = seq;
  for (const m of db.messages) {
    if (m.file && !m.files) { m.files = [m.file]; delete m.file; }
    if (m.files) for (const f of m.files) if (!db.files[f.id]) db.files[f.id] = { id: f.id, name: f.name, size: f.size || 0, by: m.from, ts: m.ts };
    m.reactions ||= {};
  }
  for (const u of Object.values(db.users)) {
    if (u.token) { u.tokens = [{ h: sha(u.token), created: u.created || Date.now(), last: 0 }]; delete u.token; }
    u.tokens ||= []; u.role ||= 'member'; u.seen ||= {}; u.delivered ||= {}; u.prefs ||= {}; u.presence ||= 'auto';
    u.statusText ||= ''; u.statusEmoji ||= ''; u.mutedUntil ||= 0; u.baseSeq ||= 0;
    u.read ||= {};
    if (legacy) for (const [chan, ts] of Object.entries(u.read)) { // old read pointers were timestamps
      let last = 0; for (const m of db.messages) if (m.chan === chan && m.ts <= ts) last = Math.max(last, m.seq);
      u.read[chan] = last;
    }
  }
  db.v = 2;
  return db;
}

function openStore(dir, passphrase) {
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const P = { dir, plain: path.join(dir, 'db.json'), enc: path.join(dir, 'db.enc'), uploads: path.join(dir, 'uploads') };
  let key = null, salt = null, db = null, timer = null, lastBak = 0;

  function readEncrypted(file) { const r = decrypt(passphrase, fs.readFileSync(file)); key = r.key; salt = r.salt; return JSON.parse(r.plain.toString('utf8')); }
  if (fs.existsSync(P.enc)) {
    if (!passphrase) throw codeErr('LOCKED', 'This session is encrypted. A passphrase is required.');
    try { db = readEncrypted(P.enc); }
    catch (e) { if (e.code === 'BAD_PASSPHRASE' || !fs.existsSync(P.enc + '.bak')) throw e; db = readEncrypted(P.enc + '.bak'); }
  } else {
    for (const f of [P.plain, P.plain + '.bak']) {
      try { db = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch (e) { if (e.code !== 'ENOENT' && f === P.plain) console.error('db.json unreadable, trying backup:', e.message); }
    }
  }
  db = migrate(db || {});

  function writeNow() {
    clearTimeout(timer); timer = null;
    const json = Buffer.from(JSON.stringify(db));
    const file = key ? P.enc : P.plain, tmp = file + '.tmp';
    fs.writeFileSync(tmp, key ? encrypt(key, salt, json) : json);
    if (Date.now() - lastBak > 600000 && fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); lastBak = Date.now(); } catch {} }
    try { fs.renameSync(tmp, file); } catch { try { fs.copyFileSync(tmp, file); fs.unlinkSync(tmp); } catch {} }
  }
  const shred = (f) => { try { const n = fs.statSync(f).size; fs.writeFileSync(f, crypto.randomBytes(Math.min(n, 1 << 26))); } catch {} try { fs.unlinkSync(f); } catch {} };

  return {
    db, paths: P,
    save() { if (!timer) timer = setTimeout(writeNow, 800); },
    flush() { try { writeNow(); } catch (e) { console.error('save failed:', e.message); } },
    isEncrypted: () => !!key,
    checkPassphrase: (p) => !!key && typeof p === 'string' && p.length === passphrase.length && crypto.timingSafeEqual(Buffer.from(p), Buffer.from(passphrase)),
    setPassphrase(p) { // p = string to encrypt, or null/'' to go back to plain
      if (p) { salt = crypto.randomBytes(16); key = deriveKey(p, salt); passphrase = p; writeNow(); shred(P.plain); shred(P.plain + '.bak'); }
      else { key = null; salt = null; passphrase = ''; writeNow(); shred(P.enc); shred(P.enc + '.bak'); }
    },
    // Replace the whole in-memory database (used by restore). Keeps the same object identity.
    replace(newDb) { for (const k of Object.keys(db)) delete db[k]; Object.assign(db, migrate(newDb)); writeNow(); },
    close() { clearTimeout(timer); timer = null; },
  };
}

// Parses a plain or encrypted db blob (used by restore). Throws BAD_PASSPHRASE / CORRUPT.
function parseDbBlob(buf, pass) {
  if (buf.subarray(0, 4).equals(MAGIC)) return JSON.parse(decrypt(pass, buf).plain.toString('utf8'));
  return JSON.parse(buf.toString('utf8'));
}

module.exports = { openStore, parseDbBlob, DEFAULT_SETTINGS, sha, codeErr, migrate };
