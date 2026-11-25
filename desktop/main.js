'use strict';
// LANChat desktop shell. A "session" is one chat server. You can host several on this computer and join friends' sessions.
const { app, BrowserWindow, Menu, Tray, Notification, dialog, clipboard, shell, ipcMain, nativeImage, session, desktopCapturer, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const dgram = require('dgram');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');

app.setName('LANChat');
app.setAppUserModelId('LANChat');
const ROOT = fs.existsSync(path.join(__dirname, 'lib')) ? __dirname : path.join(__dirname, '..'); // packaged layout vs repo layout
const { createApp } = require(path.join(ROOT, 'lib', 'app'));
const PUBLIC = path.join(ROOT, 'public');
app.setPath('userData', path.join(app.getPath('appData'), 'LANChat'));
const USER = app.getPath('userData'), CFG = path.join(USER, 'config.json'), DISC_PORT = 41234;
const rid = (n = 6) => crypto.randomBytes(n).toString('hex');
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);
const defaultName = () => cleanName(os.hostname() + '’s session');
const hiddenStart = process.argv.includes('--hidden');

// ---------- config ----------
function loadCfg() {
  let raw = {}; try { raw = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch {}
  if (raw.sessions) return { closeToTray: true, startWithWindows: false, active: null, ...raw };
  const c = { version: 4, sessions: [], active: null, closeToTray: true, startWithWindows: false };
  if (raw.mode === 'host') { const s = { id: 'default', kind: 'host', name: raw.chatName || defaultName(), dir: path.join(USER, 'data'), adminKey: rid(24), autoStart: true }; c.sessions.push(s); c.active = s.id; }
  else if (raw.mode === 'join' && raw.joinUrl) { const s = { id: rid(4), kind: 'join', name: raw.joinUrl, url: raw.joinUrl }; c.sessions.push(s); c.active = s.id; }
  return c;
}
let cfg = loadCfg();
const save = () => { try { fs.mkdirSync(USER, { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(cfg, null, 1), { mode: 0o600 }); } catch {} };
const joinOrigins = () => cfg.sessions.filter((s) => s.kind === 'join').map((s) => { try { return new URL(s.url).origin; } catch { return null; } }).filter(Boolean);
const startupOrigins = new Set(joinOrigins());
if (startupOrigins.size) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', [...startupOrigins].join(',')); // lets calls/recording work on friends' http:// LAN sessions

// ---------- tiny PNG generator (app icon, tray, taskbar badge) ----------
const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let x = 0xFFFFFFFF; for (const v of b) x = crcT[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const c = pixel(x / size * 512, y / size * 512) || [0, 0, 0, 0], o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3]; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(size, 0); ih.writeUInt32BE(size, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const inRR = (x, y, x0, y0, x1, y1, r) => { if (x < x0 || x > x1 || y < y0 || y > y1) return false; const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
const iconPx = (X, Y) => { let c = inRR(X, Y, 0, 0, 511, 511, 112) ? [Math.round(123 - (X + Y) / 1024 * 44), Math.round(131 - (X + Y) / 1024 * 49), Math.round(235 - (X + Y) / 1024 * 57), 255] : null; if (inRR(X, Y, 104, 150, 408, 334, 24) || (X >= 176 && X <= 252 && Y >= 320 && Y <= 400 && (Y - 320) <= (X - 176) * 1.05 + 8 && (Y - 320) <= (252 - X) * 3 + 80)) c = [255, 255, 255, 255]; for (const cx of [196, 256, 316]) if ((X - cx) ** 2 + (Y - 242) ** 2 <= 400) c = [91, 95, 199, 255]; return c; };
const appIcon = () => nativeImage.createFromBuffer(png(256, iconPx));
const trayIcon = () => nativeImage.createFromBuffer(png(32, iconPx));
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111', '+': '000010111010000' };
function badgeImage(n) { // red circle with the number (9+ for more)
  const txt = n > 9 ? '9+' : String(n), cell = 5, w = txt.length * 4 - 1, ox = (32 - w * cell) / 2, oy = (32 - 5 * cell) / 2;
  return nativeImage.createFromBuffer(png(32, (X, Y) => { const x = X / 16, y = Y / 16; if ((x - 16) ** 2 + (y - 16) ** 2 > 15.5 ** 2) return null; const lx = Math.floor((x - ox) / cell), ly = Math.floor((y - oy) / cell); if (ly >= 0 && ly < 5 && lx >= 0 && lx < w) { const ch = txt[Math.floor(lx / 4)], gx = lx % 4; if (gx < 3 && DIGITS[ch][ly * 3 + gx] === '1') return [255, 255, 255, 255]; } return [224, 36, 94, 255]; }));
}

// ---------- state ----------
let win = null, sessionsWin = null, diagWin = null, tray = null, quitting = false, beaconSock = null, beaconTimer = null, listener = null, activeUrl = '', hintedTray = false, lastNotify = [];
const running = new Map();   // sessionId -> { app, port, tunnel?, publicUrl? }
const found = new Map();     // discovered sessions
const hostSession = () => cfg.sessions.find((s) => s.id === cfg.active && s.kind === 'host');

// ---------- LAN discovery ----------
const broadcastAddrs = () => { const out = new Set(['255.255.255.255', '127.0.0.1']); for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal && i.netmask) { const ip = i.address.split('.').map(Number), m = i.netmask.split('.').map(Number); out.add(ip.map((b, k) => (b & m[k]) | (~m[k] & 255)).join('.')); } return [...out]; };
function ensureBeacon() {
  if (!running.size) { clearInterval(beaconTimer); beaconTimer = null; try { beaconSock && beaconSock.close(); } catch {} beaconSock = null; return; }
  if (beaconSock) return; beaconSock = dgram.createSocket('udp4'); beaconSock.on('error', () => {});
  beaconSock.bind(0, () => { try { beaconSock.setBroadcast(true); } catch {} const send = () => { for (const r of running.values()) { const msg = Buffer.from(JSON.stringify({ app: 'lanchat', v: 4, port: r.port, name: r.app.getName() })); for (const a of broadcastAddrs()) try { beaconSock.send(msg, DISC_PORT, a, () => {}); } catch {} } }; send(); beaconTimer = setInterval(send, 2000); });
}
function startListener() {
  if (listener) return; listener = dgram.createSocket({ type: 'udp4', reuseAddr: true }); listener.on('error', () => { try { listener.close(); } catch {} listener = null; });
  listener.on('message', (buf, rinfo) => { try { const m = JSON.parse(buf.toString()); if (m.app === 'lanchat' && Number.isInteger(m.port) && m.port > 0 && m.port < 65536) found.set(rinfo.address + ':' + m.port, { name: String(m.name || '').slice(0, 40), url: `http://${rinfo.address}:${m.port}`, seen: Date.now(), port: m.port, addr: rinfo.address }); } catch {} });
  try { listener.bind(DISC_PORT); } catch { listener = null; }
}
const stopListener = () => { try { listener && listener.close(); } catch {} listener = null; found.clear(); };
const isLocalAddr = (a) => a === '127.0.0.1' || Object.values(os.networkInterfaces()).flat().some((i) => i && i.address === a);

// ---------- hosting ----------
function askPassphrase(title, bad) {
  return new Promise((resolve) => {
    const id = rid(4), w = new BrowserWindow({ parent: win || undefined, modal: !!win, width: 440, height: 270, resizable: false, title, autoHideMenuBar: true, icon: appIcon(), webPreferences: { nodeIntegration: true, contextIsolation: false } }); // loads only our own local file
    w.setMenu(null); w.loadFile(path.join(__dirname, 'passphrase.html'), { query: { title, bad: bad ? '1' : '', id } });
    const ch = 'pp:' + id; ipcMain.once(ch, (e, v) => { if (e.sender !== w.webContents) return; resolve(typeof v === 'string' ? v : null); w.destroy(); });
    w.on('closed', () => { ipcMain.removeAllListeners(ch); resolve(null); });
  });
}
async function startSession(s, passphrase) {
  if (running.has(s.id)) return running.get(s.id);
  fs.mkdirSync(s.dir, { recursive: true });
  let inst;
  try { inst = createApp({ dataDir: s.dir, name: s.name, adminKey: s.adminKey, passphrase, publicDir: PUBLIC, onEvent: (n, p) => onServerEvent(s, n, p) }); }
  catch (e) { if (e.code === 'LOCKED' || e.code === 'BAD_PASSPHRASE') return { needPass: true, bad: e.code === 'BAD_PASSPHRASE' }; throw e; }
  const port = await inst.start(3000), r = { app: inst, port };
  running.set(s.id, r); s.name = inst.getName(); save(); ensureBeacon(); buildMenu(); return r;
}
async function ensureRunning(s) {
  if (running.has(s.id)) return running.get(s.id);
  let pass, bad = false;
  for (;;) {
    let r; try { r = await startSession(s, pass); } catch (e) { dialog.showErrorBox('LANChat could not start this session', String(e.message || e)); return null; }
    if (!r.needPass) return r;
    pass = await askPassphrase(s.name + ' — passphrase', bad); if (pass === null) return null; bad = true;
  }
}
function stopSession(id) {
  const r = running.get(id); if (!r) return; stopTunnel(id); try { r.app.stop(); } catch {} running.delete(id); ensureBeacon();
  if (cfg.active === id && win) { win.loadURL('about:blank'); activeUrl = ''; showSessions(); } buildMenu();
}
function onServerEvent(s, name, p) {
  if (name === 'joinrequest' && win) { const n = new Notification({ title: 'LANChat', body: `${p.name} wants to join “${s.name}”` }); n.on('click', () => { showMain(); win.webContents.send('open-panel', 'admin:requests'); }); n.show(); win.flashFrame(true); }
  else if (name === 'renamed') { s.name = p; save(); buildMenu(); }
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({ width: 1180, height: 780, minWidth: 380, minHeight: 500, title: 'LANChat ' + app.getVersion(), icon: appIcon(), backgroundColor: '#f5f5f5', show: false, webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js') } });
  win.once('ready-to-show', () => { if (!hiddenStart) win.show(); });
  for (const f of ext.onWindow) { try { f(win); } catch (e) { console.error('ext window hook', e.message); } }
  win.setTitle('LANChat ' + app.getVersion()); win.on('page-title-updated', (e, title) => { e.preventDefault(); win.setTitle(`${title} — LANChat ${app.getVersion()}`); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { let same = false; try { same = new URL(url).origin === new URL(win.webContents.getURL()).origin; } catch {} if (!same) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => { if (!isMain || code === -3 || url === 'about:blank') return; dialog.showMessageBox(win, { type: 'error', title: 'Could not connect', message: 'Could not reach the session.', detail: `${url}\n\n${desc}\n\nCheck you are on the same Wi-Fi as the host, that the host has LANChat open, and that the address is right.`, buttons: ['Choose another session'] }).then(() => showSessions()); });
  win.on('focus', () => win && win.flashFrame(false));
  win.on('close', (e) => {
    if (quitting) return;
    if (cfg.closeToTray && running.size && tray) { e.preventDefault(); win.hide(); if (!hintedTray) { hintedTray = true; new Notification({ title: 'LANChat is still running', body: 'Your sessions stay online. Click the tray icon to open it, or choose Quit from its menu.' }).show(); } return; }
    if (!win.forceClose && friendsOnline() > 0) { e.preventDefault(); confirmQuit().then((ok) => { if (ok) { win.forceClose = true; doQuit(); } }); }
  });
  win.on('closed', () => { win = null; if (!quitting && !running.size && !sessionsWin) doQuit(); });
}
const friendsOnline = () => [...running.values()].reduce((a, r) => a + Math.max(0, r.app.onlineCount() - 1), 0); // your own window counts as one
const confirmQuit = () => dialog.showMessageBox(win || undefined, { type: 'question', buttons: ['Keep chatting', 'Quit'], defaultId: 0, cancelId: 0, title: 'Quit LANChat?', message: 'Friends are connected.', detail: 'If you quit, every session you host goes offline and everybody is disconnected. Tip: close the window to keep running in the tray.' }).then((r) => r.response === 1);
function doQuit() { quitting = true; for (const id of [...running.keys()]) { stopTunnel(id); try { running.get(id).app.stop(); } catch {} } app.quit(); }
function showMain() { if (!win) return openMain(activeUrl || 'about:blank'); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function openMain(url) { if (!win) createWindow(); activeUrl = url; win.loadURL(url); win.show(); win.focus(); buildMenu(); }

async function openSession(id) {
  const s = cfg.sessions.find((x) => x.id === id); if (!s) return;
  let url;
  if (s.kind === 'host') { const r = await ensureRunning(s); if (!r) return; url = `http://localhost:${r.port}/#k=${s.adminKey}`; }
  else { url = s.url; try { if (!startupOrigins.has(new URL(s.url).origin)) offerRestart(); } catch {} checkHostVersion(s); }
  cfg.active = s.id; save(); if (sessionsWin) sessionsWin.close(); openMain(url);
}
function offerRestart() {
  dialog.showMessageBox(win || undefined, { type: 'info', title: 'One-time restart', message: 'Restart LANChat to enable calls and recording for this session?', detail: 'Chatting works right away. Voice/video calls, voice messages and screen sharing need LANChat to restart once for this session.', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1 }).then((r) => { if (r.response === 0) { quitting = true; app.relaunch(); app.exit(0); } });
}
const privateHost = (h) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(h) || h === 'localhost' || /\.local$/i.test(h);
// LAN sessions answer http:// and https:// on the same port; the app uses http:// (it unlocks calls itself), so a pasted https:// LAN link is switched over
function normalizeUrl(raw) { try { const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw); if (!/^https?:$/.test(u.protocol) || !u.hostname) return null; if (u.protocol === 'https:' && u.port && privateHost(u.hostname)) u.protocol = 'http:'; if (!u.port && u.protocol === 'http:') u.port = '3000'; return u.origin; } catch { return null; } }
// The look and features of a session come from the computer that HOSTS it, so a host on an older LANChat means the old look.
async function checkHostVersion(s) {
  const c = await fetchConfig(s.url), theirs = (c && c.app) || '';
  if (!c || (theirs && !newer(app.getVersion(), theirs)) || s.warnedVersion === (theirs || 'old')) return;
  s.warnedVersion = theirs || 'old'; save();
  dialog.showMessageBox(win || undefined, { type: 'info', title: 'Older LANChat on the host', message: `“${s.name}” is hosted with an older LANChat${theirs ? ' (' + theirs + ')' : ''}.`, detail: `You'll see the old look and features in this session until its host updates to LANChat ${app.getVersion()} (send them the same zip). Your own sessions use the new version.`, buttons: ['OK'] }).catch(() => {});
}
function fetchConfig(url) { return new Promise((resolve) => { const lib = url.startsWith('https') ? https : http; const req = lib.get(url + '/api/config', { timeout: 2500 }, (res) => { let b = ''; res.on('data', (c) => { if (b.length < 4000) b += c; }); res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } }); }); req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); }); }); }
function fetchName(url) { return new Promise((resolve) => { const lib = url.startsWith('https') ? https : http; const req = lib.get(url + '/api/config', { timeout: 2500 }, (res) => { let b = ''; res.on('data', (c) => { if (b.length < 2000) b += c; }); res.on('end', () => { try { resolve(String(JSON.parse(b).name || '').slice(0, 40)); } catch { resolve(''); } }); }); req.on('error', () => resolve('')); req.on('timeout', () => { req.destroy(); resolve(''); }); }); }

// ---------- sessions window ----------
function showSessions() {
  if (sessionsWin) return sessionsWin.focus(); startListener();
  sessionsWin = new BrowserWindow({ parent: win && win.isVisible() ? win : undefined, modal: !!(win && win.isVisible()), width: 620, height: 760, title: 'LANChat sessions', icon: appIcon(), autoHideMenuBar: true, webPreferences: { nodeIntegration: true, contextIsolation: false } }); // loads only our own local file
  sessionsWin.setMenu(null); sessionsWin.loadFile(path.join(__dirname, 'sessions.html'));
  sessionsWin.on('closed', () => { sessionsWin = null; stopListener(); if (!win && !quitting && !running.size) doQuit(); });
}
const fromSessions = (e) => sessionsWin && e.sender === sessionsWin.webContents;
ipcMain.handle('sessions:list', (e) => {
  if (!fromSessions(e)) return {};
  const mine = (a, p) => [...running.values()].some((r) => r.port === p && isLocalAddr(a));
  return {
    version: app.getVersion(),
    active: cfg.active,
    hosted: cfg.sessions.filter((s) => s.kind === 'host').map((s) => ({ id: s.id, name: s.name, running: running.has(s.id), port: running.get(s.id) && running.get(s.id).port, encrypted: running.has(s.id) ? running.get(s.id).app.encrypted() : fs.existsSync(path.join(s.dir, 'db.enc')) })),
    joined: cfg.sessions.filter((s) => s.kind === 'join').map((s) => ({ id: s.id, name: s.name, url: s.url })),
    discovered: [...found.values()].filter((f) => Date.now() - f.seen < 7000).filter((f) => !cfg.sessions.some((s) => s.kind === 'join' && s.url === f.url)).map((f) => ({ name: f.name, url: f.url, self: mine(f.addr, f.port) })),
  };
});
ipcMain.handle('sessions:create', async (e, { name, passphrase }) => {
  if (!fromSessions(e)) return; const n = cleanName(name); if (!n) return { error: 'Give the session a name.' };
  if (passphrase && passphrase.length < 8) return { error: 'Use a passphrase of at least 8 characters.' };
  const id = rid(4), s = { id, kind: 'host', name: n, dir: path.join(USER, 'sessions', id, 'data'), adminKey: rid(24), autoStart: true };
  cfg.sessions.push(s); save(); const r = await startSession(s); if (!r || r.needPass) return { error: 'Could not start the session.' };
  if (passphrase) r.app.store.setPassphrase(passphrase); openSession(id);
});
ipcMain.handle('sessions:open', (e, id) => { if (fromSessions(e)) openSession(id); });
ipcMain.handle('sessions:start', async (e, id) => { if (!fromSessions(e)) return; const s = cfg.sessions.find((x) => x.id === id); if (s) await ensureRunning(s); });
ipcMain.handle('sessions:stop', (e, id) => { if (fromSessions(e)) stopSession(id); });
ipcMain.handle('sessions:forget', (e, id) => { if (!fromSessions(e)) return; cfg.sessions = cfg.sessions.filter((s) => s.id !== id); if (cfg.active === id) cfg.active = null; save(); });
ipcMain.handle('sessions:delete', async (e, id) => {
  if (!fromSessions(e)) return; const s = cfg.sessions.find((x) => x.id === id && x.kind === 'host'); if (!s) return;
  const r = await dialog.showMessageBox(sessionsWin, { type: 'warning', buttons: ['Cancel', 'Remove from list (keep chat history files)', 'Delete everything'], defaultId: 0, cancelId: 0, title: 'Delete session', message: `Delete “${s.name}”?`, detail: '“Delete everything” permanently erases this session’s messages and files from this computer.' });
  if (r.response === 0) return; stopSession(id); cfg.sessions = cfg.sessions.filter((x) => x.id !== id); if (cfg.active === id) cfg.active = null; save();
  if (r.response === 2) { try { fs.rmSync(s.id === 'default' ? s.dir : path.dirname(s.dir), { recursive: true, force: true }); } catch {} }
});
ipcMain.handle('sessions:join', async (e, raw) => {
  if (!fromSessions(e)) return; const url = normalizeUrl(String(raw || '')); if (!url) return { error: 'That address does not look right. Example: 192.168.1.23:3000' };
  let s = cfg.sessions.find((x) => x.kind === 'join' && x.url === url);
  if (!s) { s = { id: rid(4), kind: 'join', url, name: (await fetchName(url)) || url }; cfg.sessions.push(s); save(); }
  openSession(s.id);
});

// ---------- permissions (camera/mic/screen) ----------
const trusted = (url) => { try { const o = new URL(url).origin; return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o) || joinOrigins().includes(o); } catch { return false; } };
function setupSecurity() {
  const ses = session.defaultSession, OK = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'audioCapture', 'videoCapture']);
  ses.setPermissionRequestHandler((wc, perm, cb, details) => cb(OK.has(perm) && trusted((details && details.requestingUrl) || wc.getURL())));
  ses.setPermissionCheckHandler((wc, perm, origin) => OK.has(perm) && trusted(origin || (wc && wc.getURL()) || ''));
  // Screen sharing shares the whole screen LANChat is on, straight away (like Teams). The meeting window's ⌄ button
  // lists screens and windows with thumbnails and tells us which one to use next (plus computer sound on Windows).
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      if (!trusted(req.securityOrigin || (req.frame && req.frame.url) || '')) return cb({});
      const pick = sharePick && Date.now() - sharePick.at < 20000 ? sharePick : null; sharePick = null;
      const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }); if (!srcs.length) return cb({});
      let src = pick && pick.id !== 'auto' ? srcs.find((s) => s.id === pick.id) : null;
      if (!src) { const d = win && !win.isDestroyed() ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay(); src = srcs.find((s) => s.id.startsWith('screen:') && String(s.display_id) === String(d.id)) || srcs.find((s) => s.id.startsWith('screen:')) || srcs[0]; }
      const out = { video: src }; if (pick && pick.audio && req.audioRequested && process.platform === 'win32') out.audio = 'loopback';
      cb(out);
    } catch { cb({}); }
  });
}
let sharePick = null;
ipcMain.handle('screens:list', async (e) => {
  if (!win || e.sender !== win.webContents) return [];
  const srcs = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
  const screens = srcs.filter((s) => s.id.startsWith('screen:')), multi = screens.length > 1;
  return srcs.filter((s) => s.id.startsWith('screen:') || (s.name && s.name !== win.getTitle())).slice(0, 30).map((s) => ({ id: s.id, kind: s.id.startsWith('screen:') ? 'screen' : 'window', name: s.id.startsWith('screen:') ? (multi ? 'Screen ' + (screens.indexOf(s) + 1) : 'Entire screen') : s.name.slice(0, 80), thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '' }));
});
ipcMain.on('screens:pick', (e, p) => { if (!win || e.sender !== win.webContents || !p) return; sharePick = { id: String(p.id || 'auto').slice(0, 200), audio: !!p.audio, at: Date.now() }; });

// ---------- native bridge ----------
ipcMain.on('notify', (e, n) => {
  if (!win || e.sender !== win.webContents || !n || typeof n.title !== 'string' || typeof n.body !== 'string' || !Notification.isSupported()) return;
  const now = Date.now(); lastNotify = lastNotify.filter((t) => now - t < 60000); if (lastNotify.length >= 12) return; lastNotify.push(now);
  const note = new Notification({ title: n.title.slice(0, 100), body: n.body.slice(0, 300) });
  note.on('click', () => { showMain(); if (n.chan) win.webContents.send('open-chat', String(n.chan)); }); note.show(); win.flashFrame(true);
});
ipcMain.on('badge', (e, b) => {
  if (!win || e.sender !== win.webContents) return; const n = Math.max(0, Math.min(Math.floor(b.n) || 0, 999));
  try { app.setBadgeCount(n); } catch {}
  try { win.setOverlayIcon(n ? badgeImage(n) : null, n ? `${n} unread` : ''); } catch {}
  if (tray) tray.setToolTip(n ? `LANChat — ${n} unread` : 'LANChat');
});
ipcMain.on('open-diag', (e) => { if (win && e.sender === win.webContents) showDiag(); });

// ---------- diagnostics ----------
function probe(url) { return new Promise((resolve) => { const req = http.get(url + '/api/config', { timeout: 2500 }, (res) => { res.resume(); resolve(res.statusCode === 200); }); req.on('error', () => resolve(false)); req.on('timeout', () => { req.destroy(); resolve(false); }); }); }
function showDiag() { if (diagWin) return diagWin.focus(); diagWin = new BrowserWindow({ width: 620, height: 640, title: 'Connection help', icon: appIcon(), autoHideMenuBar: true, webPreferences: { nodeIntegration: true, contextIsolation: false } }); diagWin.setMenu(null); diagWin.loadFile(path.join(__dirname, 'diag.html')); diagWin.on('closed', () => { diagWin = null; }); }
ipcMain.handle('diag:run', async (e) => {
  if (!diagWin || e.sender !== diagWin.webContents) return { checks: [], tips: [], raw: '' };
  const checks = [], tips = [], lines = [`LANChat ${app.getVersion()} on ${process.platform} ${os.release()}`];
  if (!running.size) { checks.push({ ok: false, text: 'You are not hosting a session right now. (Joining a friend? Ask them to run this check on their computer.)' }); tips.push('Open Sessions and create or start a session to host one.'); }
  for (const [id, r] of running) {
    const s = cfg.sessions.find((x) => x.id === id), local = await probe(`http://127.0.0.1:${r.port}`);
    checks.push({ ok: local, text: `“${s.name}” is running on port ${r.port}${local ? '' : ' but is not answering'}` }); lines.push(`${s.name}: port ${r.port} local=${local}`);
    const lan = r.app.lanAddresses().filter((a) => a.lan); if (!lan.length) { checks.push({ ok: false, text: 'No Wi-Fi/LAN address found on this computer.' }); tips.push('Connect this computer to your Wi-Fi (or plug in a network cable).'); }
    for (const a of lan) { const ok = await probe(a.url); checks.push({ ok, text: `This computer can reach itself at ${a.url}` }); lines.push(`${a.url} reachable=${ok}`); if (!ok) tips.push(process.platform === 'win32' ? 'Windows Firewall is probably blocking LANChat. Open Windows Security → Firewall → "Allow an app", tick LANChat for Private networks. Also check the Wi-Fi is set to "Private".' : 'A firewall on this computer may be blocking port ' + r.port + '.'); }
    if (lan.length) tips.push('Friends must be on the SAME Wi-Fi (not mobile data or a guest network) and use: ' + lan[0].url);
  }
  checks.push({ ok: !!beaconSock, text: 'Automatic discovery (UDP broadcast) is ' + (beaconSock ? 'sending' : 'idle') }); tips.push('If your friend cannot see your session in the list, they can type the address above instead. Some routers block device-to-device traffic ("AP/client isolation") — try your phone\'s hotspot to test.');
  return { checks, tips: [...new Set(tips)], raw: lines.join('\n') + '\n' + checks.map((c) => (c.ok ? '[ok] ' : '[!!] ') + c.text).join('\n') };
});

// ---------- internet sharing (optional, off by default): Cloudflare quick tunnel ----------
const CF = { version: '2026.11.2', win32: { file: 'cloudflared-windows-amd64.exe', sha256: '555b46c85582461d189cac30d14ad05480d612613801be9f110b8ce08c5b2113' }, linux: { file: 'cloudflared-linux-amd64', sha256: '56f13335143ec0e22772963290683a84a04114a35ec64cbc794a4d39ff9bb8cf' } };
function download(url, dest, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'user-agent': 'LANChat' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) { res.resume(); return resolve(download(new URL(res.headers.location, url).toString(), dest, hops + 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('Download failed (HTTP ' + res.statusCode + ')')); }
      const h = crypto.createHash('sha256'), out = fs.createWriteStream(dest); res.on('data', (c) => h.update(c)); res.pipe(out);
      out.on('finish', () => resolve(h.digest('hex'))); out.on('error', reject); res.on('error', reject);
    }).on('error', reject);
  });
}
async function ensureCloudflared() {
  const spec = CF[process.platform]; if (!spec) throw new Error('Internet sharing is available on Windows and Linux. On a Mac, install cloudflared with Homebrew and run it yourself.');
  const dir = path.join(USER, 'bin'), bin = path.join(dir, 'cloudflared' + (process.platform === 'win32' ? '.exe' : '')); fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(bin)) { const h = crypto.createHash('sha256').update(fs.readFileSync(bin)).digest('hex'); if (h === spec.sha256) return bin; fs.rmSync(bin, { force: true }); }
  if (win) win.setProgressBar(2); const tmp = bin + '.part';
  try { const hash = await download(`https://github.com/cloudflare/cloudflared/releases/download/${CF.version}/${spec.file}`, tmp); if (hash !== spec.sha256) { fs.rmSync(tmp, { force: true }); throw new Error('The downloaded file did not match the expected checksum, so it was discarded.'); } fs.renameSync(tmp, bin); fs.chmodSync(bin, 0o755); return bin; }
  finally { if (win) win.setProgressBar(-1); }
}
async function startTunnel(id) {
  const r = running.get(id); if (!r || r.tunnel) return;
  const ok = await dialog.showMessageBox(win || undefined, { type: 'warning', title: 'Share over the internet', message: 'Let friends join from anywhere?', detail: 'This creates a temporary public web address for this session using a free Cloudflare tunnel. Anyone with the link could ask to join, so LANChat will turn on host approval and a room passcode. The link changes every time and works only while LANChat is running.\n\nThe first time, a ~55 MB helper program (cloudflared) is downloaded from Cloudflare and checked against a known checksum.', buttons: ['Cancel', 'Share over the internet'], defaultId: 0, cancelId: 0 });
  if (ok.response !== 1) return;
  let bin; try { bin = await ensureCloudflared(); } catch (e) { return void dialog.showErrorBox('Could not set up internet sharing', String(e.message || e)); }
  r.app.setSetting('requireApproval', true); let pass = r.app.getSetting('passcode'); if (!pass) { pass = crypto.randomBytes(3).toString('hex'); r.app.setSetting('passcode', pass); }
  const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${r.port}`], { windowsHide: true }); r.tunnel = child; buildMenu();
  const done = (url) => { r.publicUrl = url; r.app.setTrustProxy(true); r.app.setPublicUrl(url); buildMenu(); clipboard.writeText(url); dialog.showMessageBox(win || undefined, { type: 'info', title: 'Internet link ready', message: url, detail: `The link is copied to your clipboard.\nRoom passcode for people joining: ${pass}\n\nYou will still be asked to approve each person. Stop sharing from the Chat menu at any time.`, buttons: ['OK'] }); };
  let buf = '', got = false; const onData = (d) => { buf += d.toString(); const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf); if (m && !got) { got = true; done(m[0]); } if (buf.length > 20000) buf = buf.slice(-5000); };
  child.stdout.on('data', onData); child.stderr.on('data', onData);
  const timer = setTimeout(() => { if (!got) { dialog.showErrorBox('Internet sharing', 'Could not get a public link (is this computer online? Some networks block the tunnel).'); stopTunnel(id); } }, 60000);
  child.on('exit', () => { clearTimeout(timer); if (r.tunnel === child) { r.tunnel = null; r.publicUrl = ''; try { r.app.setTrustProxy(false); r.app.setPublicUrl(''); } catch {} buildMenu(); } });
}
function stopTunnel(id) { const r = running.get(id); if (r && r.tunnel) { try { r.tunnel.kill(); } catch {} r.tunnel = null; r.publicUrl = ''; try { r.app.setTrustProxy(false); r.app.setPublicUrl(''); } catch {} } }

// ---------- updates (from a folder you choose) ----------
const verOf = (v) => String(v).split('.').map((x) => parseInt(x, 10) || 0);
const newer = (a, b) => { const x = verOf(a), y = verOf(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
async function updateFromFolder() {
  const pick = await dialog.showOpenDialog(win || undefined, { title: 'Choose the folder with the newer LANChat (the unzipped LANChat folder)', properties: ['openDirectory'] }); if (pick.canceled || !pick.filePaths[0]) return;
  const base = pick.filePaths[0]; const cand = [path.join(base, 'resources', 'app'), path.join(base, 'app'), base].find((d) => fs.existsSync(path.join(d, 'package.json')) && fs.existsSync(path.join(d, 'main.js')));
  if (!cand) return void dialog.showErrorBox('Update', 'That folder does not contain a LANChat app (no resources\\app\\main.js).');
  let their; try { their = JSON.parse(fs.readFileSync(path.join(cand, 'package.json'), 'utf8')); } catch { return void dialog.showErrorBox('Update', 'Could not read that app’s version.'); }
  if (their.name !== 'lanchat-desktop') return void dialog.showErrorBox('Update', 'That does not look like a LANChat app folder.');
  if (!newer(their.version, app.getVersion())) return void dialog.showMessageBox(win || undefined, { type: 'info', message: `You already have version ${app.getVersion()}.`, detail: `The folder you chose is version ${their.version}.` });
  const r = await dialog.showMessageBox(win || undefined, { type: 'question', title: 'Update LANChat', message: `Update ${app.getVersion()} → ${their.version}?`, detail: 'Only choose a folder you got from someone you trust: the update runs as part of LANChat. Your chats and settings are kept. LANChat will restart.', buttons: ['Cancel', 'Update and restart'], defaultId: 0, cancelId: 0 });
  if (r.response !== 1) return;
  try { fs.cpSync(cand, ROOT, { recursive: true, force: true, filter: (src) => !/node_modules|\.git/.test(src) }); quitting = true; app.relaunch(); app.exit(0); } catch (e) { dialog.showErrorBox('Update failed', String(e.message || e)); }
}

// ---------- tray + menu ----------
function createTray() {
  try { tray = new Tray(trayIcon()); tray.setToolTip('LANChat'); tray.on('click', () => (win && win.isVisible() ? win.hide() : showMain())); rebuildTray(); } catch { tray = null; }
}
// extension items (desktop/ext-*.js) go between "Sessions…" and "Quit"; call rebuildTray() after changing them
function rebuildTray() {
  if (!tray) return;
  const extra = ext.trayMenu.map((i) => (typeof i === 'function' ? i() : i)).flat().filter(Boolean);
  try { tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Open LANChat', click: showMain }, { label: 'Sessions…', click: showSessions }, { type: 'separator' }, ...extra, ...(extra.length ? [{ type: 'separator' }] : []), { label: 'Quit', click: async () => { if (friendsOnline() > 0 && !(await confirmQuit())) return; doQuit(); } }])); } catch (e) { console.error('tray menu', e.message); }
}
const panel = (name) => () => { showMain(); if (win) win.webContents.send('open-panel', name); };
function buildMenu() {
  const s = hostSession(), r = s && running.get(s.id), host = !!r;
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Chat', submenu: [
      { label: 'Sessions…', accelerator: 'CmdOrCtrl+Shift+S', click: showSessions }, { type: 'separator' },
      { label: 'Invite friends…', accelerator: 'CmdOrCtrl+I', click: panel('invite') },
      { label: 'Approve / manage people…', enabled: host, click: panel('admin:requests') }, { label: 'Session settings…', enabled: host, click: panel('admin:settings') }, { label: 'Backup, restore & encryption…', enabled: host, click: panel('admin:security') }, { type: 'separator' },
      { label: r && r.tunnel ? 'Stop sharing over the internet' : 'Share over the internet…', enabled: host, click: () => (r && r.tunnel ? stopTunnel(s.id) : startTunnel(s.id)) },
      { label: 'Open data folder', enabled: host, click: () => shell.openPath(s.dir) }, { type: 'separator' },
      { label: 'Close window to the tray', type: 'checkbox', checked: !!cfg.closeToTray, click: (m) => { cfg.closeToTray = m.checked; save(); } },
      { label: 'Start LANChat when I sign in', type: 'checkbox', checked: !!cfg.startWithWindows, click: (m) => { cfg.startWithWindows = m.checked; save(); try { app.setLoginItemSettings({ openAtLogin: m.checked, args: m.checked ? ['--hidden'] : [] }); } catch {} } }, { type: 'separator' },
      { label: 'Check for update from a folder…', click: updateFromFolder }, { type: 'separator' }, ...ext.menu, ...(ext.menu.length ? [{ type: 'separator' }] : []),
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: async () => { if (friendsOnline() > 0 && !(await confirmQuit())) return; doQuit(); } },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }] },
    { label: 'Help', submenu: [{ label: 'Keyboard shortcuts', click: panel('shortcuts') }, { label: 'Connection help…', click: showDiag }, { type: 'separator' }, { label: `LANChat ${app.getVersion()}`, enabled: false }] },
  ]));
}

// ---------- desktop feature modules: desktop/ext-*.js (see docs/EXTENDING.md) ----------
// Each module exports (api) => void. Renderer <-> main messages use channels named "x:<module>:<name>".
const ext = { onWindow: [], onArgs: [], menu: [], trayMenu: [] };
function loadExtensions() {
  const fromMain = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
  const api = {
    app, ipcMain, BrowserWindow, Menu, Tray, dialog, shell, screen, session, desktopCapturer, clipboard, nativeImage, Notification,
    getWin: () => win, getTray: () => tray, cfg: () => cfg, save, showMain, openSession, USER, ROOT, PUBLIC, appIcon,
    // handle('name', fn) answers lanchatNative.invoke('x:name', ...) from the main window only
    handle: (name, fn) => ipcMain.handle('x:' + name, (e, ...a) => (fromMain(e) ? fn(e, ...a) : null)),
    on: (name, fn) => ipcMain.on('x:' + name, (e, ...a) => { if (fromMain(e)) fn(e, ...a); }),
    sendToWin: (name, ...a) => { if (win && !win.isDestroyed()) win.webContents.send('x:' + name, ...a); },
    onWindow: (fn) => { ext.onWindow.push(fn); if (win) fn(win); }, onArgs: (fn) => ext.onArgs.push(fn),
    addMenuItems: (items) => { ext.menu.push(...items); buildMenu(); }, addTrayItems: (items) => { ext.trayMenu.push(...items); rebuildTray(); }, rebuildTray: () => rebuildTray(), rebuildMenu: () => buildMenu(),
  };
  for (const f of fs.readdirSync(__dirname).filter((n) => /^ext-[a-z0-9-]+\.js$/.test(n)).sort()) {
    try { require(path.join(__dirname, f))(api); } catch (e) { console.error('desktop extension failed:', f, e.message); }
  }
  for (const f of ext.onArgs) { try { f(process.argv, true); } catch {} }
}

// ---------- one LANChat at a time; a newer copy takes over from an older one ----------
// Closing the window keeps LANChat running in the tray, so after unzipping a new version the OLD one is often still running,
// and starting the new LANChat.exe would only bring the old window back. From 4.2.1 on, a running copy steps aside when a
// newer one starts; older copies don't know how, so the new copy finds them, asks, and closes them.
const LOCK = { app: 'lanchat', version: app.getVersion() };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('second-instance', (_e, _argv, _cwd, data) => {
  if (data && data.app === 'lanchat' && newer(String(data.version || ''), app.getVersion())) return stepAside();
  showMain(); for (const f of ext.onArgs) { try { f(_argv, false); } catch {} }
});
function stepAside() { quitting = true; for (const id of [...running.keys()]) { stopTunnel(id); try { running.get(id).app.stop(); } catch {} } app.exit(0); }
const verAt = (exe) => { for (const d of [path.join(path.dirname(exe), 'resources', 'app'), path.join(path.dirname(exe), '..', 'Resources', 'app')]) { try { return String(JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version || ''); } catch {} } return ''; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
function otherCopies() { // main processes of other LANChat copies: [{ pid, exe, version }]
  const name = path.basename(process.execPath), me = process.pid;
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const q = `Get-CimInstance Win32_Process -Filter "Name='${name.replace(/'/g, "''")}'" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress`;
      require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(q, 'utf16le').toString('base64')], { windowsHide: true, timeout: 20000 }, (err, out) => {
        let a = []; try { a = JSON.parse(String(out || '').trim() || '[]'); } catch {} if (!Array.isArray(a)) a = [a];
        resolve(a.filter((x) => x && x.ProcessId !== me && x.ExecutablePath && !/--type=/.test(x.CommandLine || '')).map((x) => ({ pid: x.ProcessId, exe: x.ExecutablePath })));
      });
    } else if (process.platform === 'linux') {
      const out = []; for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d) || Number(d) === me) continue; try { const exe = fs.readlinkSync(`/proc/${d}/exe`); if (path.basename(exe) !== name || /--type=/.test(fs.readFileSync(`/proc/${d}/cmdline`, 'utf8'))) continue; out.push({ pid: Number(d), exe }); } catch {} } resolve(out);
    } else resolve([]); // macOS keeps one copy of an app running by itself
  });
}
function closeCopy(pid) { if (process.platform === 'win32') spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); else { try { process.kill(pid, 'SIGTERM'); } catch {} setTimeout(() => { if (alive(pid)) try { process.kill(pid, 'SIGKILL'); } catch {} }, 2500); } }
// every running copy (4.2.1+) records its process id + version; a copy without a record is older than 4.2.1
const INSTANCE = path.join(USER, 'instance.json');
const writeInstance = () => { try { fs.mkdirSync(USER, { recursive: true }); fs.writeFileSync(INSTANCE, JSON.stringify({ pid: process.pid, version: app.getVersion(), exe: process.execPath })); } catch {} };
async function takeOver() {
  await sleep(1500); if (app.requestSingleInstanceLock(LOCK)) return true; // a copy from 4.2.1 on has stepped aside by itself
  let rec = null; try { rec = JSON.parse(fs.readFileSync(INSTANCE, 'utf8')); } catch {}
  const mine = path.resolve(process.execPath);
  // a copy unzipped over this same folder still runs the OLD code it started with, so its files on disk prove nothing
  const old = (await otherCopies()).map((o) => ({ ...o, version: rec && rec.pid === o.pid ? String(rec.version || '') : path.resolve(o.exe) === mine ? '' : verAt(o.exe) })).filter((o) => !o.version || newer(app.getVersion(), o.version));
  if (!old.length) return false; // the same (or a newer) LANChat is already running and has been brought to the front
  const ok = process.env.LANCHAT_REPLACE_OLDER === '1' || (await dialog.showMessageBox({ type: 'question', title: 'LANChat ' + app.getVersion(), message: `An older LANChat${old[0].version ? ' (' + old[0].version + ')' : ''} is still running.`, detail: `It is probably in the tray, near the clock: closing the window keeps LANChat running there.\n\nClose it and start the new version ${app.getVersion()}? Your chats and sessions are kept, and friends reconnect automatically.`, buttons: [`Close the old one and start ${app.getVersion()}`, 'Cancel'], defaultId: 0, cancelId: 1, noLink: true })).response === 0;
  if (!ok) return false;
  for (const o of old) closeCopy(o.pid);
  for (let i = 0; i < 30; i++) { await sleep(400); if (old.every((o) => !alive(o.pid)) && app.requestSingleInstanceLock(LOCK)) return true; }
  dialog.showErrorBox('LANChat', 'The older LANChat did not close. Right-click its tray icon (near the clock) > Quit, then start LANChat again.');
  return false;
}

// ---------- boot ----------
app.on('before-quit', () => { quitting = true; for (const r of running.values()) try { r.app.flush(); } catch {} });
app.on('window-all-closed', () => { if (quitting || !running.size) app.quit(); });
app.on('activate', showMain);

const firstLock = app.requestSingleInstanceLock(LOCK);
app.whenReady().then(async () => {
  if (!firstLock && !(await takeOver())) return app.quit();
  writeInstance();
  setupSecurity(); loadExtensions(); createTray(); buildMenu();
  try { if (cfg.startWithWindows) app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch {}
  for (const s of cfg.sessions.filter((x) => x.kind === 'host' && x.autoStart !== false)) { try { await startSession(s); } catch (e) { console.error('autostart failed', e.message); } }
  const active = cfg.sessions.find((x) => x.id === cfg.active);
  if (active) await openSession(active.id); else showSessions();
});
