'use strict';
// Calls area, desktop app: while you share your screen, a red frame around the shared screen (click-through, always on top,
// kept out of the capture where the OS allows it) that also shows people's laser pointer, pen strokes and remote pointer,
// and a small always-on-top presenter toolbar at the top of that screen (timer, pause, mic, camera, give/take control, stop).
// Renderer side: public/js/calls-share.js (LC.native.invoke('x:calls:present'), send('x:calls:toolbarState' | 'x:calls:ink')).
module.exports = (api) => {
  const { BrowserWindow, screen, desktopCapturer } = api;
  let frame = null, bar = null, last = {};
  const alive = (w) => w && !w.isDestroyed();
  const js = (w, code) => { if (alive(w)) w.webContents.executeJavaScript(code).catch(() => {}); };
  const page = (html) => 'data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'">' + html);
  const base = { frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } };
  const FRAME = `<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}#b{position:fixed;inset:0;border:4px solid #e5383b;box-sizing:border-box}canvas{position:fixed;inset:0;width:100%;height:100%}</style><div id="b"></div><canvas id="c"></canvas><script>
    const cv = document.getElementById('c'), g = cv.getContext('2d'), strokes = [], lasers = new Map(), ptrs = new Map(); let raf = 0;
    const fit = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; draw(); }; addEventListener('resize', fit);
    function draw() { raf = 0; const w = cv.width, h = cv.height, d = devicePixelRatio, now = Date.now(); g.clearRect(0, 0, w, h); g.lineCap = g.lineJoin = 'round';
      for (const s of strokes) { g.strokeStyle = s.c; g.lineWidth = s.w * d * 1.5; g.beginPath(); for (let i = 0; i < s.pts.length; i += 2) { const x = s.pts[i] / 10000 * w, y = s.pts[i + 1] / 10000 * h; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      let more = false; for (const [, l] of lasers) { l.trail = l.trail.filter((p) => now - p.at < 700); l.trail.forEach((p, i) => { g.fillStyle = 'rgba(255,40,40,' + (0.2 + 0.7 * i / l.trail.length) + ')'; g.beginPath(); g.arc(p.x / 10000 * w, p.y / 10000 * h, (4 + 6 * i / l.trail.length) * d, 0, 7); g.fill(); }); if (l.trail.length) more = true; }
      for (const [k, p] of ptrs) { if (now - p.at > 8000) { ptrs.delete(k); continue; } more = true; const x = p.x / 10000 * w, y = p.y / 10000 * h; g.fillStyle = '#0a84ff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 * d, y + 34 * d); g.lineTo(x + 20 * d, y + 20 * d); g.lineTo(x + 34 * d, y + 14 * d); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2 * d; g.stroke(); g.font = 14 * d + 'px system-ui,sans-serif'; const tw = g.measureText(p.name).width; g.fillRect(x + 22 * d, y + 30 * d, tw + 12 * d, 20 * d); g.fillStyle = '#fff'; g.fillText(p.name, x + 28 * d, y + 45 * d); }
      if (more && !raf) raf = requestAnimationFrame(draw); }
    window.ink = (m) => { if (m.k === 'pen') strokes.push(m); else if (m.k === 'clr') { if (m.all) strokes.length = 0; else for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].from === m.from) strokes.splice(i, 1); } else if (m.k === 'laser') { const l = lasers.get(m.from) || { trail: [] }; l.trail.push({ x: m.x, y: m.y, at: Date.now() }); if (l.trail.length > 40) l.trail.shift(); lasers.set(m.from, l); } else if (m.k === 'ptr') ptrs.set(m.from, { x: m.x, y: m.y, at: Date.now(), name: m.name || '' }); if (!raf) raf = requestAnimationFrame(draw); window.inkCount = (window.inkCount || 0) + 1; };
    fit();</script>`;
  const BAR = `<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent;font:13px "Segoe UI",system-ui,sans-serif;color:#fff;user-select:none}
    #t{height:100%;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:0 6px;background:#1b1b1b;border:1px solid #525252;border-radius:8px}
    #t b{font-weight:600;padding:0 6px}#tm{font-variant-numeric:tabular-nums;color:#c8c8c8;margin-right:6px}#dot{width:9px;height:9px;border-radius:50%;background:#e5383b;margin-left:4px}
    button,select{height:32px;border:0;border-radius:4px;background:transparent;color:#fff;font:inherit;padding:0 10px;cursor:pointer}button:hover,select:hover{background:#3d3d3d}button:focus-visible,select:focus-visible{outline:2px solid #a6a8ff}
    button.on{color:#c8caff}#stop{background:#c4314b;font-weight:600}#ctl{max-width:180px;color:#c8caff}select option{color:#000}</style>
    <div id="t" role="toolbar"><span id="dot"></span><b id="lbl"></b><span id="tm">0:00</span><button id="pause"></button><button id="mic"></button><button id="cam"></button><select id="give"></select><button id="take" hidden></button><button id="stop"></button></div><script>
    let st = { since: Date.now(), labels: {} }; const $ = (i) => document.getElementById(i), go = (a) => window.open('lctb:' + a);
    $('pause').onclick = () => go('pause'); $('mic').onclick = () => go('mic'); $('cam').onclick = () => go('cam'); $('stop').onclick = () => go('stop'); $('take').onclick = () => go('take');
    $('give').onchange = (e) => { if (e.target.value) go('give:' + e.target.value); e.target.value = ''; };
    const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0'); };
    setInterval(() => { $('tm').textContent = fmt(Date.now() - st.since); }, 1000);
    window.setState = (s) => { st = s; const L = s.labels || {};
      $('lbl').textContent = L.presenting || ''; $('pause').textContent = s.paused ? (L.resume || 'Resume') : (L.pause || 'Pause'); $('stop').textContent = L.stop || 'Stop';
      $('mic').textContent = (s.mic ? '● ' : '○ ') + (L.mic || 'Mic'); $('mic').className = s.mic ? 'on' : ''; $('mic').setAttribute('aria-pressed', String(!!s.mic));
      $('cam').textContent = (s.cam ? '● ' : '○ ') + (L.cam || 'Camera'); $('cam').className = s.cam ? 'on' : ''; $('cam').setAttribute('aria-pressed', String(!!s.cam));
      const g = $('give'); g.hidden = !!s.ctl; g.replaceChildren(new Option(L.give || 'Give control', ''), ...(s.people || []).map((p) => new Option(p.name, p.id)));
      $('take').hidden = !s.ctl; $('take').textContent = (L.has || '') + ' · ' + (L.take || 'Take back'); $('tm').textContent = fmt(Date.now() - st.since); };</script>`;

  async function displayFor(source) {
    const win = api.getWin();
    if (source && String(source).startsWith('screen:')) {
      try { const srcs = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } }), s = srcs.find((x) => x.id === source); if (s) { const d = screen.getAllDisplays().find((x) => String(x.id) === String(s.display_id)); if (d) return d; } } catch {}
    }
    return alive(win) ? screen.getDisplayMatching(win.getBounds()) : screen.getPrimaryDisplay();
  }
  function hide() { for (const w of [frame, bar]) if (alive(w)) w.destroy(); frame = bar = null; }
  async function show(o) {
    hide(); const d = await displayFor(o.source), b = d.bounds, wa = d.workArea, isScreen = !String(o.source || '').startsWith('window:');
    if (isScreen) {
      frame = new BrowserWindow({ ...base, x: b.x, y: b.y, width: b.width, height: b.height, focusable: false, title: 'LANChat sharing frame' });
      frame.setIgnoreMouseEvents(true); frame.setAlwaysOnTop(true, 'screen-saver'); try { frame.setVisibleOnAllWorkspaces(true); } catch {} try { frame.setContentProtection(true); } catch {}
      frame.loadURL(page(FRAME)).then(() => { if (alive(frame)) frame.showInactive(); }).catch(() => {});
    }
    const W = 760, H = 46;
    bar = new BrowserWindow({ ...base, x: Math.round(wa.x + (wa.width - W) / 2), y: wa.y + 6, width: W, height: H, title: 'LANChat presenter toolbar' });
    bar.setAlwaysOnTop(true, 'screen-saver'); try { bar.setVisibleOnAllWorkspaces(true); } catch {} try { bar.setContentProtection(true); } catch {}
    bar.webContents.setWindowOpenHandler(({ url }) => { const m = /^lctb:(\w+)(?::([\w-]{1,40}))?$/.exec(url); if (m) api.sendToWin('calls:toolbar', { action: m[1], uid: m[2] || '' }); return { action: 'deny' }; });
    bar.webContents.on('will-navigate', (e) => e.preventDefault());
    bar.loadURL(page(BAR)).then(() => { if (!alive(bar)) return; js(bar, 'window.setState(' + JSON.stringify(last) + ')'); bar.showInactive(); }).catch(() => {});
  }
  api.handle('calls:present', async (e, o) => { if (o && o.on) await show(o); else hide(); return { frame: alive(frame), bar: alive(bar) }; });
  api.on('calls:toolbarState', (e, s) => { if (!s || typeof s !== 'object') return; last = s; js(bar, 'window.setState(' + JSON.stringify(s) + ')'); });
  api.on('calls:ink', (e, m) => { if (!m || typeof m !== 'object' || !['pen', 'laser', 'ptr', 'clr'].includes(m.k)) return; const n = (v) => Math.max(0, Math.min(10000, Number(v) || 0)); const out = { k: m.k, from: String(m.from || '').slice(0, 40), name: String(m.name || '').slice(0, 40), x: n(m.x), y: n(m.y), c: /^#[0-9a-f]{6}$/i.test(m.c) ? m.c : '#ff3b30', w: Math.max(1, Math.min(12, Number(m.w) || 3)), all: !!m.all, pts: Array.isArray(m.pts) ? m.pts.slice(0, 400).map(n) : [] }; js(frame, 'window.ink(' + JSON.stringify(out) + ')'); });
  api.onWindow((win) => { win.on('closed', hide); win.webContents.on('did-navigate', hide); }); // the page went away (reload, another session)
};
