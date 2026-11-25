'use strict';
// Calls area: sharing and presenting in the meeting window (calls.js). The share tray (screen, window, browser tab,
// whiteboard, PDF slides; computer sound; optimize for video; presenter modes), pause, the presenter toolbar and the red
// "you're sharing" frame (in the app; on the shared screen itself in the desktop app, see desktop/ext-calls.js), zoom and
// pan for viewers, laser pointer and pen over shared content, request / give / take control (a remote pointer everyone
// sees), the whiteboard and PDF slides with page sync on the stage, and the watermark session rule.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), X = LC._cx; if (!X) return;
  LC.addStrings('en', {
    cl_shareTray: 'Share content', cl_screen: 'Screen', cl_window: 'Window', cl_tab: 'Browser tab', cl_tabHelp: 'Pick a tab in the next step', cl_screenHelp: 'Your whole screen', cl_windowHelp: 'One app window',
    cl_present: 'Present', cl_whiteboard: 'Whiteboard', cl_whiteboardHelp: 'This chat’s whiteboard, for everyone', cl_pdf: 'PDF slides', cl_pdfHelp: 'Everyone follows your page', cl_options: 'Options',
    cl_sound: 'Include computer sound', cl_optimize: 'Optimize for video (smooth motion)', cl_mode: 'Presenter mode', cl_modeContent: 'Content only', cl_modeStandout: 'Standout (you over your content)', cl_modeSide: 'Side-by-side',
    cl_pickPdf: 'Pick a PDF', cl_pickPdfHelp: 'PDFs shared in this chat. A new one is posted to the chat first, so everyone can open it.', cl_uploadPdf: 'Upload a PDF…', cl_noPdfs: 'No PDFs in this chat yet.',
    cl_presenting: 'You’re presenting', cl_pause: 'Pause sharing', cl_resumeShare: 'Resume sharing', cl_paused: 'Paused', cl_pausedBy: '{name} paused sharing', cl_stopPresenting: 'Stop presenting', cl_giveControl: 'Give control',
    cl_takeBack: 'Take back control', cl_hasControl: '{name} has control (pointer)', cl_youHaveControl: 'You have control: move your pointer over the screen to point things out.', cl_release: 'Release control', cl_requestControl: 'Request control',
    cl_wantsControl: '{name} is asking for control', cl_give: 'Give control', cl_deny: 'Deny', cl_controlDenied: '{name} said no to control', cl_controlGiven: '{name} gave you control', cl_controlTaken: '{name} took back control', cl_requested: 'Request sent',
    cl_laser: 'Laser pointer', cl_pen: 'Pen', cl_clearInk: 'Clear drawings', cl_annotate: 'Annotate', cl_letAnnotate: 'Let everyone annotate', cl_zoomIn: 'Zoom in', cl_zoomOut: 'Zoom out', cl_zoomReset: 'Reset zoom',
    cl_prevSlide: 'Previous page', cl_nextSlide: 'Next page', cl_slideN: 'Page {n}', cl_syncPresenter: 'Sync to presenter', cl_lookAhead: 'You’re looking ahead privately', cl_boardUnavailable: 'The whiteboard is not available.',
    cl_youShare: 'You’re sharing', cl_shareStopped: 'Sharing stopped', cl_presentingWhat: 'Presenting: {what}', cl_previewOwn: 'What others see',
  });
  LC.addStrings('hi', { cl_shareTray: 'कंटेंट शेयर करें', cl_whiteboard: 'व्हाइटबोर्ड', cl_pause: 'शेयर रोकें', cl_paused: 'रुका हुआ', cl_stopPresenting: 'प्रेज़ेंट करना बंद करें', cl_laser: 'लेज़र पॉइंटर', cl_pen: 'पेन' });
  LC.addStrings('es', { cl_shareTray: 'Compartir contenido', cl_whiteboard: 'Pizarra', cl_pause: 'Pausar', cl_paused: 'En pausa', cl_stopPresenting: 'Dejar de presentar', cl_laser: 'Puntero láser', cl_pen: 'Lápiz', cl_syncPresenter: 'Sincronizar con el presentador' });
  const call = () => X.call, st = () => X.state();
  const capi = (path, body) => LC.api(path, { chan: call().chan, ep: call().ep, ...(body || {}) });
  const fail = (e) => LC.toast(e.message);
  const canScreen = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !matchMedia('(pointer:coarse)').matches;
  // a steady clock that keeps going in background tabs (shared with calls-record.js)
  X.ticker = (ms, fn) => { let w = null, h = null; try { w = new Worker('js/calls-tick.js'); w.onmessage = fn; w.postMessage(ms); } catch { h = setInterval(fn, ms); } return () => { if (w) { try { w.postMessage(0); w.terminate(); } catch {} } clearInterval(h); }; };

  // ---------- the share tray ----------
  X.shareMenu = () => openTray();
  async function openTray() {
    const c = call(); if (!c) return; const mod = X.isMod(), desk = !!(LC.native && LC.native.screens);
    const opt = (key, label) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!LC.ui[key], onchange: (e) => LC.setUi({ [key]: e.target.checked }) }), ' ' + label);
    const mode = LC.ui.clPresMode || 'content', modes = el('div', { class: 'cl-modes', role: 'radiogroup', 'aria-label': t('cl_mode') }, ['content', 'standout', 'side'].map((m) => el('label', { class: 'check' }, el('input', { type: 'radio', name: 'clmode', checked: mode === m, onchange: () => setMode(m) }), ' ' + t('cl_mode' + m[0].toUpperCase() + m.slice(1)))));
    const card = (icon, label, sub, fn, thumb) => el('button', { class: 'cl-sharecard', type: 'button', disabled: !mod, onclick: () => { LC.closeModal(); fn(); } }, thumb ? el('img', { src: thumb, alt: '' }) : el('span', { class: 'cl-shareico' }, LC.icon(icon)), el('b', { text: label }), sub ? el('small', { text: sub }) : null);
    let screens = [];
    if (desk) { let list = []; try { list = await LC.native.screens(); } catch {} screens = list.map((s) => card(s.kind === 'screen' ? 'desktop' : 'window', s.name || t('entireScreen'), s.kind === 'screen' ? t('cl_screen') : t('cl_window'), () => X.startScreen({ pick: { id: s.id, audio: !!LC.ui.clShareSound }, video: !!LC.ui.clShareVideo }), s.thumb)); }
    else if (canScreen()) screens = [card('desktop', t('cl_screen'), t('cl_screenHelp'), () => X.startScreen({ surface: 'monitor' })), card('window', t('cl_window'), t('cl_windowHelp'), () => X.startScreen({ surface: 'window' })), card('tab_desktop', t('cl_tab'), t('cl_tabHelp'), () => X.startScreen({ surface: 'browser' }))];
    LC.modal([el('h2', {}, LC.icon('share_screen_start'), ' ' + t('cl_shareTray')), mod ? null : el('p', { class: 'notice', text: t('cl_onlyPresenters') }),
      screens.length ? el('div', { class: 'cl-sharegrid' }, screens) : null,
      el('h3', { text: t('cl_present') }), el('div', { class: 'cl-sharegrid' }, card('whiteboard', t('cl_whiteboard'), t('cl_whiteboardHelp'), startBoard), card('document_pdf', t('cl_pdf'), t('cl_pdfHelp'), pdfPicker)),
      el('h3', { text: t('cl_options') }), opt('clShareSound', t('cl_sound')), opt('clShareVideo', t('cl_optimize')), el('div', { class: 'small muted', text: t('cl_mode') }), modes,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }))], { wide: true, label: t('cl_shareTray') });
  }
  async function startKind(kind, extra) { const c = call(); if (!c) return; if (c.screen) X.stopScreen(true); try { await capi('/api/call/share', { on: true, kind, ...extra }); } catch (e) { fail(e); } }
  const startBoard = () => startKind('board');
  async function pdfPicker() {
    const c = call(); if (!c) return; const chan = c.chan, list = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('loading') }));
    const file = el('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'hidden', onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; LC.closeModal();
      try { const up = await LC.upload(f, f.name.replace(/\.pdf$/i, '') + '.pdf').promise; await LC.api('/api/send', { chan, text: '', files: [{ id: up.id, name: up.name, size: up.size }] }); startKind('pdf', { file: up.id, page: 1 }); } catch (x) { fail(x); }
    } });
    LC.modal([el('h2', {}, LC.icon('document_pdf'), ' ' + t('cl_pickPdf')), el('p', { class: 'muted small', text: t('cl_pickPdfHelp') }), list, file, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary withicon', onclick: () => file.click() }, LC.icon('add'), t('cl_uploadPdf')))], { wide: true });
    try { const { files } = await LC.api(`/api/files?chan=${encodeURIComponent(chan)}&kind=doc`); const pdfs = files.filter((f) => /\.pdf$/i.test(f.name)); list.replaceChildren(...(pdfs.length ? pdfs.map((f) => el('button', { class: 'hit row-between', onclick: () => { LC.closeModal(); startKind('pdf', { file: f.id, page: 1 }); } }, el('span', {}, LC.icon('document_pdf'), ' ' + f.name), el('small', { class: 'muted', text: LC.fmtSize(f.size) + ' · ' + LC.uname(f.from) }))) : [el('p', { class: 'muted', text: t('cl_noPdfs') })])); } catch (e) { list.replaceChildren(el('p', { class: 'err', text: e.message })); }
  }
  function setMode(m) {
    LC.setUi({ clPresMode: m }); const c = call(); if (!c || !c.screen) return;
    if (c.scrFx) { try { c.scrFx.stop(); } catch {} c.scrFx = null; } c.scrOut = null;
    const r = X.screenPipe(c.screen.getVideoTracks()[0]); if (r) { c.scrFx = r; c.scrOut = r.track; }
    X.updateSenders(); capi('/api/call/sharestate', { mode: m }).catch(() => {}); X.drawSoon();
  }

  // ---------- presenter modes: your camera composited onto the shared screen before sending ----------
  X.screenPipe = (scr) => { const mode = LC.ui.clPresMode || 'content'; return mode === 'content' ? null : composite(scr, mode); };
  function composite(scr, mode) {
    const s = scr.getSettings ? scr.getSettings() : {}, k = Math.min(1, 1920 / (s.width || 1920)), W = Math.round((s.width || 1280) * k) & ~1, H = Math.round((s.height || 720) * k) & ~1;
    const cv = el('canvas', { width: W, height: H }), g = cv.getContext('2d'), sv = el('video', { muted: true, playsinline: true, autoplay: true }), cam = el('video', { muted: true, playsinline: true, autoplay: true });
    sv.muted = cam.muted = true; sv.srcObject = new MediaStream([scr]); sv.play().catch(() => {});
    const camTrack = () => { const c = call(); return c && c.me.cam ? c.camOut || c.local.getVideoTracks()[0] : null; };
    const round = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const cover = (v, x, y, w, h) => { const vw = v.videoWidth, vh = v.videoHeight; if (!vw) return; const s2 = Math.max(w / vw, h / vh), sw = w / s2, sh = h / s2; g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, w, h); };
    const draw = () => {
      const ct = camTrack(); if (ct && (!cam.srcObject || cam.srcObject.getVideoTracks()[0] !== ct)) { cam.srcObject = new MediaStream([ct]); cam.play().catch(() => {}); } else if (!ct && cam.srcObject) cam.srcObject = null;
      g.fillStyle = '#111'; g.fillRect(0, 0, W, H); const camOn = !!(ct && cam.videoWidth);
      if (mode === 'side' && camOn) {
        const cw = Math.round(W * 0.7), vw = sv.videoWidth || 16, vh = sv.videoHeight || 9, s2 = Math.min(cw / vw, H / vh); g.drawImage(sv, (cw - vw * s2) / 2, (H - vh * s2) / 2, vw * s2, vh * s2);
        const pw = W - cw - 24, ph = Math.min(H - 48, pw * 4 / 3); g.save(); round(cw + 12, (H - ph) / 2, pw, ph, 18); g.clip(); cover(cam, cw + 12, (H - ph) / 2, pw, ph); g.restore();
      } else {
        if (sv.videoWidth) g.drawImage(sv, 0, 0, W, H);
        if (camOn) { const w = Math.round(W * 0.22), h = Math.round(w * 9 / 16), x = W - w - Math.round(W * 0.025), y = H - h - Math.round(H * 0.04); g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 18; round(x, y, w, h, 14); g.fillStyle = '#000'; g.fill(); g.restore(); g.save(); round(x, y, w, h, 14); g.clip(); cover(cam, x, y, w, h); g.restore(); }
      }
    };
    const stopTick = X.ticker(66, draw), out = cv.captureStream(15).getVideoTracks()[0];
    try { out.contentHint = scr.contentHint || 'detail'; } catch {}
    return { track: out, mode, stop() { stopTick(); try { out.stop(); } catch {} sv.srcObject = null; cam.srcObject = null; } };
  }

  // ---------- per-share state: zoom, annotations, PDF page, control requests ----------
  const keyOf = (s) => (s && s.sharing ? s.sharing + ':' + ((s.share && s.share.at) || '') : '');
  let ink = { key: '', strokes: [], ptrs: new Map(), lasers: new Map(), overlays: new Set() }, zoom = { key: '', z: 1, x: 0, y: 0 }, pdfv = { key: '', page: 0, follow: true }, tool = null, reqs = new Map(), lastPage = 0;
  const reset = (s) => { const k = keyOf(s); if (ink.key !== k) { ink = { key: k, strokes: [], ptrs: new Map(), lasers: new Map(), overlays: ink.overlays }; zoom = { key: k, z: 1, x: 0, y: 0 }; pdfv = { key: k, page: 0, follow: true }; tool = null; reqs.clear(); } };
  X.onState.push((s) => { reset(s); const c = call(); if (c && s.share && s.share.kind === 'pdf' && s.share.page !== lastPage) { lastPage = s.share.page; } if (!s.sharing) for (const o of ink.overlays) o.paint(); deskState(); });
  const amPresenter = () => { const s = st(); return s.sharing === S.me.id; };
  const mayInk = () => { const s = st(); return amPresenter() || s.inkAll; };
  const hasCtl = () => { const s = st(); return !!(s.ctl && s.ctl.to === S.me.id); };

  // ---------- annotations: laser pointer, pen, remote pointer (coordinates 0..10000 of the shared content) ----------
  const COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#ffffff'];
  let penColor = COLORS[0], sid = '', pts = [], lastSend = 0;
  function overlay(host, media) {
    const cv = el('canvas', { class: 'cl-ink', 'aria-hidden': 'true' }), g = cv.getContext('2d');
    const place = () => { if (!cv.isConnected) return; const r = contentRect(host, media); Object.assign(cv.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); const d = devicePixelRatio || 1; cv.width = Math.max(1, Math.round(r.w * d)); cv.height = Math.max(1, Math.round(r.h * d)); o.paint(); };
    const o = { cv, place, paint() {
      if (!cv.isConnected) { ink.overlays.delete(o); return; } const w = cv.width, h = cv.height, d = devicePixelRatio || 1, now = Date.now(); g.clearRect(0, 0, w, h); g.lineCap = g.lineJoin = 'round';
      for (const s of ink.strokes) { g.strokeStyle = s.c; g.lineWidth = s.w * d; g.beginPath(); for (let i = 0; i < s.pts.length; i += 2) { const x = (s.pts[i] / 10000) * w, y = (s.pts[i + 1] / 10000) * h; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
      for (const [, l] of ink.lasers) { const trail = l.trail.filter((p) => now - p.at < 700); l.trail = trail; trail.forEach((p, i) => { g.fillStyle = `rgba(255,40,40,${0.15 + 0.6 * (i / trail.length)})`; g.beginPath(); g.arc((p.x / 10000) * w, (p.y / 10000) * h, (3 + 4 * (i / trail.length)) * d, 0, 7); g.fill(); }); }
      for (const [uid, p] of ink.ptrs) { if (now - p.at > 8000) { ink.ptrs.delete(uid); continue; } const x = (p.x / 10000) * w, y = (p.y / 10000) * h; g.fillStyle = '#0a84ff'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 12 * d, y + 30 * d); g.lineTo(x + 18 * d, y + 18 * d); g.lineTo(x + 30 * d, y + 12 * d); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.5 * d; g.stroke(); g.font = `${12 * d}px system-ui,sans-serif`; const nm = LC.uname(uid), tw = g.measureText(nm).width; g.fillStyle = '#0a84ff'; g.fillRect(x + 20 * d, y + 26 * d, tw + 10 * d, 18 * d); g.fillStyle = '#fff'; g.fillText(nm, x + 25 * d, y + 39 * d); }
    } };
    ink.overlays.add(o); new ResizeObserver(place).observe(host); if (media && media.tagName === 'VIDEO') media.addEventListener('resize', place); requestAnimationFrame(place);
    // drawing with your own pointer
    const norm = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(10000, Math.round(((e.clientX - r.left) / r.width) * 10000))), Math.max(0, Math.min(10000, Math.round(((e.clientY - r.top) / r.height) * 10000)))]; };
    cv.addEventListener('pointerdown', (e) => { if (!tool || e.button > 0) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x, y] = norm(e); if (tool === 'pen') { sid = Math.random().toString(36).slice(2, 10); pts = [x, y]; } else laserAt(S.me.id, x, y, true); });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = norm(e);
      if (tool === 'pen' && pts.length && e.buttons) { pts.push(x, y); const s = ink.strokes.find((q) => q.sid === sid); if (s) s.pts = pts.slice(); else ink.strokes.push({ sid, from: S.me.id, c: penColor, w: 3, pts: pts.slice() }); paintAll(); if (pts.length >= 380) penUp(); }
      else if (tool === 'laser' && e.buttons !== undefined) laserAt(S.me.id, x, y, true);
      else if (!tool && hasCtl()) pointerAt(x, y);
    });
    const penUp = () => { if (tool === 'pen' && pts.length >= 4) capi('/api/call/ink', { k: 'pen', pts, c: penColor, w: 3, sid }).catch(() => {}); pts = []; };
    cv.addEventListener('pointerup', penUp); cv.addEventListener('pointercancel', penUp);
    host.addEventListener('pointermove', (e) => { if (!tool && hasCtl() && e.target !== cv) { const r = cv.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) { const [x, y] = norm(e); pointerAt(x, y); } } });
    cv.classList.toggle('cl-active', !!tool); return o;
  }
  function contentRect(host, m) {
    const hw = host.clientWidth, hh = host.clientHeight;
    if (m && m.tagName === 'VIDEO' && m.videoWidth) { const s = Math.min(hw / m.videoWidth, hh / m.videoHeight), w = m.videoWidth * s, h = m.videoHeight * s; return { x: (hw - w) / 2, y: (hh - h) / 2, w, h }; }
    if (m && m.tagName !== 'VIDEO') { const r = m.getBoundingClientRect(), hr = host.getBoundingClientRect(), sc = hr.width / (hw || 1) || 1; return { x: (r.left - hr.left) / sc, y: (r.top - hr.top) / sc, w: r.width / sc, h: r.height / sc }; }
    return { x: 0, y: 0, w: hw, h: hh };
  }
  let painting = false;
  const paintAll = () => { if (painting) return; painting = true; requestAnimationFrame(() => { painting = false; for (const o of [...ink.overlays]) o.paint(); if (ink.lasers.size || ink.ptrs.size) paintAll(); }); };
  function laserAt(uid, x, y, send) { const l = ink.lasers.get(uid) || { trail: [] }; l.trail.push({ x, y, at: Date.now() }); if (l.trail.length > 40) l.trail.shift(); ink.lasers.set(uid, l); paintAll(); if (send && Date.now() - lastSend > 45) { lastSend = Date.now(); capi('/api/call/ink', { k: 'laser', x, y }).catch(() => {}); } deskInk({ k: 'laser', from: uid, x, y }); }
  function pointerAt(x, y) { ink.ptrs.set(S.me.id, { x, y, at: Date.now() }); paintAll(); if (Date.now() - lastSend > 60) { lastSend = Date.now(); capi('/api/call/ink', { k: 'ptr', x, y }).catch(() => {}); } }
  LC.on('callink', (m) => {
    const c = call(); if (!c || m.chan !== c.chan) return;
    if (m.k === 'pen') ink.strokes.push({ sid: m.sid, from: m.from, c: m.c, w: m.w, pts: m.pts });
    else if (m.k === 'clr') ink.strokes = m.all ? [] : ink.strokes.filter((s) => s.from !== m.from);
    else if (m.k === 'laser') { laserAt(m.from, m.x, m.y, false); return; }
    else if (m.k === 'ptr') ink.ptrs.set(m.from, { x: m.x, y: m.y, at: Date.now() });
    deskInk(m); paintAll();
  });
  const clearInk = () => { ink.strokes = amPresenter() ? [] : ink.strokes.filter((s) => s.from !== S.me.id); paintAll(); deskInk({ k: 'clr', all: amPresenter() }); capi('/api/call/ink', { k: 'clr' }).catch(() => {}); };
  function inkBar(box) {
    if (!mayInk()) return null; const b = (k, icon, label) => el('button', { class: 'icon' + (tool === k ? ' on' : ''), type: 'button', 'aria-pressed': String(tool === k), title: label, 'aria-label': label, 'data-k': 'ink:' + k, onclick: () => { tool = tool === k ? null : k; X.drawSoon(); } }, LC.icon(icon));
    return el('div', { class: 'cl-inkbar', role: 'toolbar', 'aria-label': t('cl_annotate') }, b('laser', 'laser_tool', t('cl_laser')), b('pen', 'pen', t('cl_pen')),
      tool === 'pen' ? COLORS.map((c) => el('button', { class: 'cl-swatch' + (penColor === c ? ' on' : ''), type: 'button', style: { background: c }, 'aria-label': c, 'aria-pressed': String(penColor === c), onclick: () => { penColor = c; X.drawSoon(); } })) : null,
      el('button', { class: 'icon', type: 'button', title: t('cl_clearInk'), 'aria-label': t('cl_clearInk'), 'data-k': 'ink:clr', onclick: clearInk }, LC.icon('eraser')), void box);
  }

  // ---------- zoom and pan for viewers (Ctrl+wheel, buttons, pinch, drag) ----------
  function zoomable(box, wrap) {
    const apply = () => { wrap.style.transform = `translate(${zoom.x}px,${zoom.y}px) scale(${zoom.z})`; box.classList.toggle('cl-zoomed', zoom.z > 1); for (const o of ink.overlays) o.paint(); };
    const clamp = () => { const w = box.clientWidth, h = box.clientHeight; zoom.z = Math.max(1, Math.min(6, zoom.z)); zoom.x = Math.min(0, Math.max(w - w * zoom.z, zoom.x)); zoom.y = Math.min(0, Math.max(h - h * zoom.z, zoom.y)); if (zoom.z === 1) zoom.x = zoom.y = 0; };
    const at = (f, cx, cy) => { const r = box.getBoundingClientRect(), px = cx - r.left, py = cy - r.top, nz = Math.max(1, Math.min(6, zoom.z * f)); zoom.x = px - ((px - zoom.x) * nz) / zoom.z; zoom.y = py - ((py - zoom.y) * nz) / zoom.z; zoom.z = nz; clamp(); apply(); };
    box.addEventListener('wheel', (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); at(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
    const ptrs = new Map(); let pinch = 0, drag = null;
    box.addEventListener('pointerdown', (e) => { if (tool || e.target.closest('button,.cl-ink.cl-active')) return; ptrs.set(e.pointerId, e); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); } else if (zoom.z > 1) { drag = { x: e.clientX - zoom.x, y: e.clientY - zoom.y }; box.setPointerCapture(e.pointerId); } });
    box.addEventListener('pointermove', (e) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, e); if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); at(d / pinch, (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2); pinch = d; } else if (drag) { zoom.x = e.clientX - drag.x; zoom.y = e.clientY - drag.y; clamp(); apply(); } });
    const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (!ptrs.size) drag = null; };
    box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    apply();
    const btn = (icon, label, fn, k) => el('button', { class: 'icon', type: 'button', title: label, 'aria-label': label, 'data-k': k, onclick: fn }, LC.icon(icon));
    const r = () => box.getBoundingClientRect();
    return el('div', { class: 'cl-zoombar', role: 'group', 'aria-label': t('cl_zoomIn') }, btn('zoom_out', t('cl_zoomOut'), () => at(1 / 1.25, r().left + r().width / 2, r().top + r().height / 2), 'zoom:out'), btn('zoom_in', t('cl_zoomIn'), () => at(1.25, r().left + r().width / 2, r().top + r().height / 2), 'zoom:in'), btn('arrow_reset', t('cl_zoomReset'), () => { zoom.z = 1; clamp(); apply(); }, 'zoom:reset'));
  }

  // ---------- decorating the shared content on the stage ----------
  X.decorate.push((box, s, c) => {
    reset(s); const media = box.querySelector('video, iframe, canvas.boardcv, .cl-boardhost canvas');
    if (c.kind === 'screen') {
      const vid = box.querySelector('video'); if (vid) { const wrap = el('div', { class: 'cl-zoomwrap' }); vid.replaceWith(wrap); wrap.append(vid); const o = overlay(wrap, vid); wrap.append(o.cv); box.append(zoomable(box, wrap)); }
      if (s.paused) box.append(pausedLayer(box, vid, c));
    } else if (media) { const o = overlay(box, media); box.append(o.cv); }
    const bar = inkBar(box); if (bar) box.append(bar);
    if (!c.mine && c.kind === 'screen' && !hasCtl() && X.mediaOfEp && !(s.ctl && s.ctl.to)) box.append(el('button', { class: 'secondary sm cl-reqctl withicon', type: 'button', 'data-k': 'reqctl', onclick: () => capi('/api/call/control', { action: 'request' }).then(() => LC.toast(t('cl_requested'), { ms: 1500 })).catch(fail) }, LC.icon('cursor'), t('cl_requestControl')));
    const rules = (S.settings && S.settings.meetingRules) || {}; if (rules.watermark) box.append(watermark());
  });
  function pausedLayer(box, vid, c) {
    const layer = el('div', { class: 'cl-pausedlayer' });
    try { if (vid && vid.videoWidth) { const cv = el('canvas', { width: vid.videoWidth, height: vid.videoHeight, class: 'cl-freeze' }); cv.getContext('2d').drawImage(vid, 0, 0); layer.append(cv); } } catch {}
    layer.append(el('div', { class: 'cl-pausedpill' }, LC.icon('pause'), el('span', { text: c.mine ? t('cl_paused') : t('cl_pausedBy', { name: LC.uname(c.sharer) }) })));
    return layer;
  }
  function watermark() { const n = S.me.name + ' · ' + new Date().toLocaleDateString(); return el('div', { class: 'cl-watermark', 'aria-hidden': 'true' }, Array.from({ length: 24 }, () => el('span', { text: n }))); }

  // the presenter's own view of a screen share: a preview with the annotations, so they see what people draw
  X.selfShare.push((panel, s) => {
    const c = call(); if (!c || !c.screen) return; reset(s);
    const v = el('video', { autoplay: true, playsinline: true, muted: true }); v.muted = true; v.srcObject = new MediaStream([c.scrOut || c.screen.getVideoTracks()[0]]); v.play().catch(() => {});
    const wrap = el('div', { class: 'cl-selfprev', role: 'img', 'aria-label': t('cl_previewOwn') }, v); const o = overlay(wrap, v); wrap.append(o.cv);
    panel.append(el('small', { class: 'muted', text: t('cl_previewOwn') }), wrap);
    const bar = inkBar(wrap); if (bar) wrap.append(bar);
  });

  // ---------- whiteboard and PDF slides on the stage ----------
  X.content.board = (box, s) => {
    const c = call(); const host = el('div', { class: 'cl-boardhost' }); box.append(host);
    if (boardView && boardView.chan === c.chan && boardView.key === keyOf(s)) { host.append(boardView.node); return; }
    const ext = (LC.ext.tabs || []).find((x) => x.key === 'board' && (!x.when || x.when(c.chan)));
    if (ext) { const node = el('div', { class: 'cl-boardext' }); boardView = { chan: c.chan, key: keyOf(s), node }; host.append(node); try { ext.render(node, c.chan); } catch (e) { node.replaceChildren(el('p', { class: 'err', text: t('cl_boardUnavailable') })); } return; }
    boardView = { chan: c.chan, key: keyOf(s), node: stageBoard(c.chan) }; host.append(boardView.node);
  };
  let boardView = null;
  // the chat's whiteboard (same data, same live events as the Whiteboard tab in collab.js)
  function stageBoard(chan) {
    const cv = el('canvas', { class: 'boardcv', width: 1000, height: 700, 'aria-label': t('cl_whiteboard') }), g = cv.getContext('2d'), live = new Map(); let strokes = [], drawing = null, sid2 = '', sent = 0, lastSent = 0, color = '#111111';
    const paint = (s) => { g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s.w * 1.4; g.globalCompositeOperation = s.c === 'erase' ? 'destination-out' : 'source-over'; g.strokeStyle = s.c === 'erase' ? '#000' : s.c; g.beginPath(); const p = s.pts; g.moveTo(p[0], p[1]); if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); g.restore(); };
    const redraw = () => { g.clearRect(0, 0, 1000, 700); strokes.forEach(paint); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 700)]; };
    const can = () => !(S.me.mutedUntil > Date.now()) && !tool;
    const flush = (force) => { if (!drawing || (drawing.pts.length - sent < 4 && !force)) return; const seg = { c: drawing.c, w: drawing.w, pts: drawing.pts.slice(Math.max(0, sent - 2)) }; sent = drawing.pts.length; if (seg.pts.length >= 2) LC.api('/api/board/live', { chan, sid: sid2, seg }).catch(() => {}); };
    cv.addEventListener('pointerdown', (e) => { if (!can() || e.button > 0) return; cv.setPointerCapture(e.pointerId); sid2 = Math.random().toString(36).slice(2, 10); sent = 0; drawing = { c: color, w: 4, pts: pos(e) }; paint({ ...drawing, pts: [...drawing.pts] }); e.preventDefault(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e), n = drawing.pts.length, a = drawing.pts[n - 2], b = drawing.pts[n - 1]; if (Math.abs(p[0] - a) + Math.abs(p[1] - b) < 2) return; paint({ c: drawing.c, w: drawing.w, pts: [a, b, p[0], p[1]] }); drawing.pts.push(p[0], p[1]); if (drawing.pts.length > 3900) done(); else if (Date.now() - lastSent > 120) { lastSent = Date.now(); flush(); } });
    const done = () => { if (!drawing) return; const s = drawing; drawing = null; flush(true); LC.api('/api/board/stroke', { chan, stroke: { c: s.c, w: s.w, pts: s.pts } }).catch(fail); };
    cv.addEventListener('pointerup', done); cv.addEventListener('pointercancel', done);
    const sw = el('div', { class: 'cl-boardtools', role: 'toolbar', 'aria-label': t('cl_whiteboard') }, ['#111111', '#d13438', '#0078d4', '#498205', '#e3b200'].map((c) => el('button', { class: 'swatch', type: 'button', style: { background: c }, 'aria-label': c, onclick: (e) => { color = c; sw.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === e.currentTarget)); } })),
      LC.ibtn('arrow_undo', t('undo'), () => LC.api('/api/board/undo', { chan }).catch(fail)), LC.ibtn('eraser', t('eraser'), () => { color = color === 'erase' ? '#111111' : 'erase'; }));
    const node = el('div', { class: 'cl-board' }, el('div', { class: 'boardwrap' }, cv), sw);
    LC.api('/api/collab?chan=' + encodeURIComponent(chan)).then((d) => { strokes = d.board || []; redraw(); }).catch(() => {});
    node._board = { chan, event(e) { if (e.op === 'add') { if (!strokes.some((s) => s.id === e.stroke.id)) strokes.push(e.stroke); } else if (e.op === 'del') strokes = strokes.filter((s) => s.id !== e.id); else if (e.op === 'clear') strokes = []; redraw(); }, live(e) { if (e.by !== S.me.id) { paint(e.seg); live.set(e.sid, Date.now()); } } };
    return node;
  }
  LC.on('board', (e) => { if (boardView && boardView.node._board && boardView.node._board.chan === e.chan) boardView.node._board.event(e); });
  LC.on('boardlive', (e) => { if (boardView && boardView.node._board && boardView.node._board.chan === e.chan) boardView.node._board.live(e); });
  X.onEnd.push(() => { boardView = null; tool = null; deskShow(false); });

  X.content.pdf = (box, s, c) => {
    const sh = s.share || {}; if (!sh.file) return; reset(s);
    const presenterPage = sh.page || 1, mine = c.mine; if (pdfv.follow || mine) pdfv.page = presenterPage; const page = mine ? presenterPage : pdfv.page;
    const frame = el('iframe', { class: 'cl-pdf', src: LC.fileUrl(sh.file, true) + '#page=' + page + '&toolbar=0&navpanes=0', title: sh.file.name });
    const go = (d) => { if (mine) capi('/api/call/sharestate', { page: Math.max(1, presenterPage + d) }).catch(fail); else { pdfv.follow = false; pdfv.page = Math.max(1, page + d); X.drawSoon(); } };
    const nav = el('div', { class: 'cl-pdfnav', role: 'toolbar', 'aria-label': sh.file.name }, LC.ibtn('arrow_previous', t('cl_prevSlide'), () => go(-1), { disabled: page <= 1 }), el('span', { class: 'cl-pdfpage', 'aria-live': 'polite', text: t('cl_slideN', { n: page }) }), LC.ibtn('arrow_next', t('cl_nextSlide'), () => go(1)),
      !mine && page !== presenterPage ? el('button', { class: 'secondary sm', type: 'button', 'data-k': 'pdfsync', text: t('cl_syncPresenter'), onclick: () => { pdfv.follow = true; X.drawSoon(); } }) : null);
    box.append(el('div', { class: 'cl-pdfhost' }, frame), nav, !mine && page !== presenterPage ? el('div', { class: 'cl-pdfnote', text: t('cl_lookAhead') }) : null);
  };

  // ---------- presenter toolbar (in the meeting window), control requests, the red frame ----------
  X.banners.push((s) => {
    const c = call(); if (!c) return null; const sh = s.sharing === S.me.id ? s.share || {} : null;
    const ctlNote = s.ctl && s.ctl.to === S.me.id ? el('div', { class: 'cl-banner', role: 'status' }, LC.icon('cursor'), el('span', { class: 'grow', text: t('cl_youHaveControl') }), el('button', { class: 'secondary sm', 'data-k': 'release', text: t('cl_release'), onclick: () => capi('/api/call/control', { action: 'release' }).catch(fail) })) : null;
    if (!sh) return ctlNote;
    const req = [...reqs.keys()].filter((u) => s.participants.includes(u));
    const tb = (k, icon, label, fn, o = {}) => el('button', { class: 'cl-ptbtn' + (o.on ? ' on' : '') + (o.danger ? ' danger' : ''), type: 'button', title: label, 'aria-label': label, 'aria-pressed': o.pressed === undefined ? null : String(!!o.pressed), 'data-k': 'pt:' + k, onclick: fn }, LC.icon(icon, { filled: !!o.on }), o.text ? el('span', { text: o.text }) : null);
    const what = sh.kind === 'board' ? t('cl_whiteboard') : sh.kind === 'pdf' ? (sh.file && sh.file.name) || t('cl_pdf') : t('cl_screen');
    return el('div', { class: 'cl-ptool', role: 'toolbar', 'aria-label': t('cl_presenting') },
      el('span', { class: 'cl-ptitle' }, el('span', { class: 'cl-recdot cl-live', 'aria-hidden': 'true' }), el('b', { text: t('cl_presenting') }), el('small', { class: 'muted', text: what }), el('span', { class: 'ctimer', text: X.fmtDur(Date.now() - (sh.at || Date.now()) + (S.serverSkew || 0) * 0) })),
      sh.kind === 'screen' ? tb('pause', c.paused ? 'play' : 'pause', c.paused ? t('cl_resumeShare') : t('cl_pause'), togglePause, { pressed: c.paused }) : null,
      c.companion ? null : tb('mic', c.me.mic ? 'mic' : 'mic_off', c.me.mic ? t('mute') : t('unmuteMic'), () => LC.callApi.toggleMic(), { pressed: c.me.mic }),
      tb('cam', c.me.cam ? 'video' : 'video_off', c.me.cam ? t('turnCameraOff') : t('turnCameraOn'), () => LC.callApi.toggleCam(), { pressed: c.me.cam }),
      sh.kind === 'screen' ? (s.ctl ? tb('take', 'cursor', t('cl_takeBack'), () => capi('/api/call/control', { action: 'take' }).catch(fail), { text: t('cl_hasControl', { name: LC.uname(s.ctl.to) }), on: true }) : tb('give', 'person_arrow_right', t('cl_giveControl'), (e) => giveMenu(e.currentTarget))) : null,
      tb('ink', 'pen', t('cl_letAnnotate'), () => capi('/api/call/sharestate', { inkAll: !s.inkAll }).catch(fail), { pressed: !!s.inkAll, on: !!s.inkAll }),
      sh.kind === 'screen' ? tb('mode', LC.ui.clPresMode === 'standout' ? 'share_screen_person_overlay' : LC.ui.clPresMode === 'side' ? 'layout_column_two' : 'share_screen_start', t('cl_mode'), (e) => LC.menu(e.currentTarget, ['content', 'standout', 'side'].map((m) => ({ label: t('cl_mode' + m[0].toUpperCase() + m.slice(1)), checked: (LC.ui.clPresMode || 'content') === m, fn: () => setMode(m) })))) : null,
      tb('stop', 'share_screen_stop', t('cl_stopPresenting'), () => X.stopAnyShare(), { danger: true, text: t('cl_stopPresenting') }),
      ...req.map((u) => el('span', { class: 'cl-ptreq' }, el('span', { text: t('cl_wantsControl', { name: LC.uname(u) }) }), el('button', { class: 'primary sm', type: 'button', 'data-k': 'give:' + u, text: t('cl_give'), onclick: () => { reqs.delete(u); capi('/api/call/control', { action: 'give', uid: u }).catch(fail); } }), el('button', { class: 'secondary sm', type: 'button', text: t('cl_deny'), onclick: () => { reqs.delete(u); capi('/api/call/control', { action: 'deny', uid: u }).catch(fail); X.drawSoon(); } }))));
  });
  function giveMenu(anchor) { const s = st(); LC.menu(anchor, s.participants.filter((u) => u !== S.me.id).map((u) => ({ icon: 'person', label: LC.uname(u), fn: () => capi('/api/call/control', { action: 'give', uid: u }).catch(fail) }))); }
  function togglePause() {
    const c = call(); if (!c || !c.screen) return; c.paused = !c.paused; X.updateSenders();
    capi('/api/call/sharestate', { paused: c.paused }).catch(fail); deskState(); X.drawSoon();
  }
  LC.on('callctl', (m) => {
    const c = call(); if (!c || m.chan !== c.chan) return;
    if (m.type === 'request') { reqs.set(m.from, Date.now()); LC.playSound('ping'); X.drawSoon(); }
    else if (m.type === 'given') LC.toast(t('cl_controlGiven', { name: LC.uname(m.by) }));
    else if (m.type === 'denied') LC.toast(t('cl_controlDenied', { name: LC.uname(m.by) }));
    else if (m.type === 'taken') LC.toast(t('cl_controlTaken', { name: LC.uname(m.by) }));
  });

  // ---------- desktop app: red frame + presenter toolbar on the shared screen, annotations drawn there too ----------
  const desk = () => !!(LC.native && LC.native.invoke);
  let deskOn = false, deskKey = '';
  function deskShow(on, info) { if (!desk()) return; if (!on && !deskOn) return; deskOn = on; deskKey = ''; LC.native.invoke('x:calls:present', on ? { on: true, source: info && info.pick ? info.pick.id : 'auto', surface: (info && info.surface) || 'monitor' } : { on: false }).catch(() => {}); if (on) deskState(); }
  function deskState() {
    if (!desk() || !deskOn) return; const c = call(), s = st(); if (!c) return;
    const o = { mic: !!c.me.mic, cam: !!c.me.cam, paused: !!c.paused, since: (s.share && s.share.at) ? s.share.at - (S.serverSkew || 0) : Date.now(), ctl: s.ctl ? LC.uname(s.ctl.to) : '', labels: { stop: t('cl_stopPresenting'), pause: t('cl_pause'), resume: t('cl_resumeShare'), mic: t('mic'), cam: t('camera'), give: t('cl_giveControl'), take: t('cl_takeBack'), presenting: t('cl_presenting'), has: s.ctl ? t('cl_hasControl', { name: LC.uname(s.ctl.to) }) : '' }, people: s.participants.filter((u) => u !== S.me.id).map((u) => ({ id: u, name: LC.uname(u) })) };
    const k = JSON.stringify(o); if (k === deskKey) return; deskKey = k; LC.native.send('x:calls:toolbarState', o);
  }
  function deskInk(m) { if (desk() && deskOn) LC.native.send('x:calls:ink', { k: m.k, from: m.from, name: LC.uname(m.from), x: m.x, y: m.y, pts: m.pts, c: m.c, w: m.w, all: m.all }); }
  X.onShare.push((on, info) => deskShow(on, info));
  if (desk() && LC.native.on) LC.native.on('x:calls:toolbar', (a) => {
    const c = call(); if (!c || !a) return; const act = typeof a === 'string' ? a : a.action;
    if (act === 'stop') X.stopAnyShare(); else if (act === 'pause') togglePause(); else if (act === 'mic') LC.callApi.toggleMic(); else if (act === 'cam') LC.callApi.toggleCam();
    else if (act === 'take') capi('/api/call/control', { action: 'take' }).catch(fail); else if (act === 'give' && a.uid) capi('/api/call/control', { action: 'give', uid: String(a.uid) }).catch(fail);
  });
  LC.on('call:drawn', () => deskState());
})();
