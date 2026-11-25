'use strict';
// Shell area (window and look, settings, accessibility, desktop and phone): signed-in devices, per-person shell
// preferences, and the app update that friends' desktop apps download from the host. See docs/features-shell.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Writable } = require('stream');
const { writeZip } = require('./zip');

module.exports = (ctx) => {
  const { api, json, body, fail, str, isObj, rate, store, userById, sha, S } = ctx;
  const KEY = /^[A-Za-z0-9_-]{1,40}$/;

  // ---------- preferences owned by the shell area (POST /api/prefs ignores keys it doesn't know) ----------
  // signers: sign-language view (docs/EXTENDING.md "Calls"), apps: app bar order + unpinned apps,
  // shTour: first-run tour done, shNotes: id of the "What's new" notes this person has seen.
  const keyList = (v, max) => { if (!Array.isArray(v)) fail(400, 'Bad app list'); return [...new Set(v.filter((x) => typeof x === 'string' && KEY.test(x)))].slice(0, max); };
  const prefsRoute = api['POST /api/prefs'];
  api['POST /api/prefs'] = async (req, res, me, url) => {
    const b = await body(req, 32768); me.prefs ||= {};
    if (b.signers !== undefined) {
      if (!Array.isArray(b.signers)) fail(400, 'Bad signers');
      const ids = [...new Set(b.signers.filter((x) => typeof x === 'string' && x.length <= 64))].filter((id) => { const u = userById(id); return u && id !== me.id && !u.removed && !u.deleted; });
      if (ids.length > 2) fail(400, 'Choose up to 2 signers');
      me.prefs.signers = ids;
    }
    if (b.apps !== undefined) {
      if (b.apps !== null && !isObj(b.apps)) fail(400, 'Bad app bar settings');
      me.prefs.apps = b.apps ? { order: keyList(b.apps.order || [], 60), unpinned: keyList(b.apps.unpinned || [], 60) } : { order: [], unpinned: [] };
    }
    if (b.shTour !== undefined) me.prefs.shTour = !!b.shTour;
    if (b.shNotes !== undefined) { const v = str(b.shNotes, 40); if (v && !/^[\w.-]+$/.test(v)) fail(400, 'Bad notes id'); me.prefs.shNotes = v; }
    return prefsRoute(req, res, me, url); // saves, and sends the "me" event with the full prefs
  };

  // the client shows the first-run tour only to people who are new
  ctx.hooks.initExtra.push((u) => ({ shell: { created: u.created || 0 } }));

  // ---------- signed-in devices (one entry per sign-in token) ----------
  const tokenOf = (req, url) => str(req.headers['x-token'], 200) || str(url.searchParams.get('token'), 200);
  const pid = (t) => sha('device:' + t.h).slice(0, 16); // public id; never reveals the token hash
  const describe = (ua) => {
    ua = String(ua || '');
    const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
    const browser = /Electron\//.test(ua) ? 'app' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    return { os, browser };
  };
  api['POST /api/devices/hello'] = async (req, res, me, url) => {
    if (!rate('devhello:' + me.id, 30, 60000)) fail(429, 'Slow down');
    const h = sha(tokenOf(req, url)), t = me.tokens.find((x) => x.h === h); if (!t) fail(401, 'Not signed in');
    const b = await body(req, 1024), now = Date.now();
    const ua = str(req.headers['user-agent'], 300).replace(/[\u0000-\u001f\u007f]/g, ''), app = str(b.app, 40).replace(/[^\w .()-]/g, '');
    const changed = t.ua !== ua || (app && t.app !== app) || now - (t.last || 0) > 60000;
    t.ua = ua; if (app) t.app = app; t.last = now; t.ip = ctx.ipOf(req);
    if (changed) store.save();
    json(res, 200, { ok: true });
  };
  api['GET /api/devices'] = async (req, res, me, url) => {
    const h = sha(tokenOf(req, url));
    const devices = me.tokens.map((t) => ({ id: pid(t), ...describe(t.ua), app: t.app || '', created: t.created || 0, last: t.last || t.created || 0, ip: t.ip || '', current: t.h === h })).sort((a, b) => b.current - a.current || b.last - a.last);
    json(res, 200, { devices });
  };
  // { id } signs out one device; { others: true } signs out every device except this one
  api['POST /api/devices/signout'] = async (req, res, me, url) => {
    if (!rate('devout:' + me.id, 20, 60000)) fail(429, 'Slow down');
    const b = await body(req, 512), h = sha(tokenOf(req, url));
    let gone;
    if (b.others === true) gone = me.tokens.filter((t) => t.h !== h);
    else { const id = str(b.id, 32); if (!/^[a-f0-9]{16}$/.test(id)) fail(400, 'Bad device'); gone = me.tokens.filter((t) => pid(t) === id); if (!gone.length) fail(404, 'That device is already signed out.'); }
    const drop = new Set(gone.map((t) => t.h));
    me.tokens = me.tokens.filter((t) => !drop.has(t.h)); ctx.rebuildIndexes(); store.save();
    // close their live connections right away, so a signed-out device stops receiving messages
    for (const r of [...(ctx.clients.get(me.id) || [])]) {
      let tok = ''; try { tok = new URL((r.req && r.req.url) || '', 'http://x').searchParams.get('token') || ''; } catch {}
      if (drop.has(sha(tok))) { try { r.write('event: shsignedout\ndata: {}\n\n'); r.end(); } catch {} }
    }
    json(res, 200, { ok: true, removed: gone.length });
  };

  // ---------- app update for friends' desktop apps: the host offers its own app code (never any data) ----------
  const ROOT = path.join(__dirname, '..');
  const FIXED = new Date(2024, 0, 1); // fixed dates: the same files always give the same zip (and sha256)
  function appFiles() {
    const desktopLayout = fs.existsSync(path.join(ROOT, 'main.js')) && fs.existsSync(path.join(ROOT, 'preload.js')); // packaged app folder vs the repository
    const top = desktopLayout ? ROOT : path.join(ROOT, 'desktop');
    if (!fs.existsSync(path.join(top, 'main.js')) || !fs.existsSync(path.join(top, 'package.json'))) return null;
    const out = [];
    for (const f of fs.readdirSync(top).sort()) { const p = path.join(top, f), st = fs.lstatSync(p); if (st.isFile() && /^[\w.-]+\.(js|html|json)$/.test(f)) out.push({ name: f, file: p, size: st.size, mtime: st.mtimeMs }); }
    const walk = (dir, rel) => {
      for (const f of fs.readdirSync(dir).sort()) {
        if (f.startsWith('.') || f === 'node_modules' || /\.test\.js$/.test(f)) continue;
        const p = path.join(dir, f), st = fs.lstatSync(p), r = rel + '/' + f;
        if (st.isDirectory()) walk(p, r); else if (st.isFile() && st.size < 30 * 1048576) out.push({ name: r, file: p, size: st.size, mtime: st.mtimeMs });
      }
    };
    walk(path.join(ROOT, 'lib'), 'lib'); walk(path.join(ROOT, 'public'), 'public');
    let version = ''; try { version = String(JSON.parse(fs.readFileSync(path.join(top, 'package.json'), 'utf8')).version || ''); } catch {}
    return { files: out, version };
  }
  let cached = null, building = null;
  async function appZip() {
    const a = appFiles(); if (!a || !a.version) fail(404, 'This host has no desktop app files to share.');
    const sig = JSON.stringify(a.files.map((f) => [f.name, f.size, f.mtime]));
    if (cached && cached.sig === sig) return cached;
    if (building) return building;
    building = (async () => {
      const chunks = []; const out = new Writable({ write(c, _e, cb) { chunks.push(c); cb(); } });
      await writeZip(a.files.map((f) => ({ name: f.name, file: f.file, mtime: FIXED })), out);
      const buf = Buffer.concat(chunks);
      cached = { sig, buf, version: a.version, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
      return cached;
    })().finally(() => { building = null; });
    return building;
  }
  api['GET /api/update/info'] = async (req, res) => {
    const z = await appZip(); json(res, 200, { version: z.version, sha256: z.sha256, size: z.size, name: S.name });
  };
  api['GET /api/update/app.zip'] = async (req, res, me) => {
    if (!rate('updzip:' + me.id, 6, 600000)) fail(429, 'Too many update downloads. Try again later.');
    const z = await appZip();
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': z.size, 'Content-Disposition': `attachment; filename="lanchat-app-${z.version}.zip"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'X-LANChat-Version': z.version, 'X-LANChat-Sha256': z.sha256 });
    res.end(z.buf);
  };
};
