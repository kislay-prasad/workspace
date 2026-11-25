'use strict';
// Calls area: background effects and video filters for your camera, all offline (there is no AI model here). Background blur
// uses the browser's own blur when the camera supports it (getCapabilities().backgroundBlur); otherwise a "portrait" effect
// keeps a soft oval around the middle of the picture sharp and blurs the rest, or puts a picture behind that oval. Filters:
// brightness, soft focus, warm, cool, black & white. LC.callEffects is the picker other areas can show (before joining).
(() => {
  const LC = window.LC, { el } = LC, t = (k, v) => LC.t(k, v), X = LC._cx;
  LC.addStrings('en', {
    cl_effects: 'Video effects', cl_backgrounds: 'Backgrounds', cl_filters: 'Filters', cl_bgNone: 'None', cl_bgBlur: 'Blur', cl_bgCustom: 'My picture', cl_bgAdd: 'Add a picture',
    cl_bg_soft: 'Soft colours', cl_bg_sunset: 'Sunset', cl_bg_ocean: 'Ocean', cl_bg_night: 'Night sky', cl_bg_office: 'Office', cl_bg_bricks: 'Brick wall',
    cl_f_none: 'No filter', cl_f_bright: 'Brightness', cl_f_soft: 'Soft focus', cl_f_warm: 'Warm', cl_f_cool: 'Cool', cl_f_bw: 'Black & white',
    cl_fxNative: 'Your camera blurs the background itself.', cl_fxOval: 'Without person detection, the oval in the middle stays sharp: sit in the middle of the picture.', cl_fxPreview: 'Preview of your camera', cl_fxNoCam: 'Turn your camera on to see the preview.', cl_fxTooBig: 'Pick a smaller picture.',
  });
  LC.addStrings('hi', { cl_effects: 'वीडियो इफ़ेक्ट', cl_backgrounds: 'बैकग्राउंड', cl_filters: 'फ़िल्टर', cl_bgBlur: 'धुंधला', cl_bgNone: 'कोई नहीं' });
  LC.addStrings('es', { cl_effects: 'Efectos de vídeo', cl_backgrounds: 'Fondos', cl_filters: 'Filtros', cl_bgBlur: 'Desenfocar', cl_bgNone: 'Ninguno' });
  const FILTERS = { none: { css: '' }, bright: { css: 'brightness(1.16) contrast(1.06) saturate(1.06)' }, soft: { css: 'brightness(1.06) contrast(.9) saturate(.96) blur(.8px)' }, warm: { css: 'saturate(1.12)', tint: 'rgba(255,150,60,.16)' }, cool: { css: 'saturate(1.04)', tint: 'rgba(60,140,255,.16)' }, bw: { css: 'grayscale(1) contrast(1.12)' } };
  const IMAGES = ['soft', 'sunset', 'ocean', 'night', 'office', 'bricks'];
  const CUSTOM = 'lc_cl_bgimg';
  const cur = () => ({ bg: LC.ui.clBg || 'none', filter: FILTERS[LC.ui.clFilter] ? LC.ui.clFilter : 'none' });
  const canvas = (w, h) => { if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------- background pictures, drawn here (no files, no internet) ----------
  const imgs = {};
  function picture(key) {
    if (imgs[key]) return imgs[key];
    if (key === 'custom') { const url = LC.ls.get(CUSTOM, ''); if (!url) return null; const im = new Image(); im.src = url; imgs.custom = im; return im; }
    const W = 640, H = 360, c = canvas(W, H), g = c.getContext('2d'), lin = (stops, x1 = 0, y1 = 0, x2 = 0, y2 = H) => { const gr = g.createLinearGradient(x1, y1, x2, y2); stops.forEach(([o, col]) => gr.addColorStop(o, col)); return gr; };
    if (key === 'soft') { g.fillStyle = lin([[0, '#c3cfe2'], [1, '#f5d0e0']], 0, 0, W, H); g.fillRect(0, 0, W, H); for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,255,255,${0.12 + (i % 3) * 0.05})`; g.beginPath(); g.arc((i * 97) % W, (i * 61) % H, 40 + (i % 4) * 25, 0, 7); g.fill(); } }
    else if (key === 'sunset') { g.fillStyle = lin([[0, '#2b1055'], [0.45, '#d53369'], [0.7, '#f7a440'], [1, '#3b1d48']]); g.fillRect(0, 0, W, H); g.fillStyle = '#ffd36e'; g.beginPath(); g.arc(W * 0.7, H * 0.62, 46, 0, 7); g.fill(); g.fillStyle = '#2a1338'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 40) g.lineTo(x, H * 0.72 + Math.sin(x / 70) * 18); g.lineTo(W, H); g.fill(); }
    else if (key === 'ocean') { g.fillStyle = lin([[0, '#8fd3f4'], [0.55, '#84fab0'], [0.56, '#1e6fa8'], [1, '#0b3d5c']]); g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(255,255,255,.35)'; for (let y = H * 0.62; y < H; y += 18) { g.beginPath(); for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin((x + y) / 30) * 3); g.stroke(); } }
    else if (key === 'night') { g.fillStyle = lin([[0, '#0f2027'], [0.6, '#203a43'], [1, '#2c5364']]); g.fillRect(0, 0, W, H); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + ((i * 37) % 70) / 100})`; g.fillRect((i * 151) % W, (i * 89) % (H * 0.8), 1 + (i % 3 === 0), 1 + (i % 3 === 0)); } g.fillStyle = '#f4f1c9'; g.beginPath(); g.arc(W * 0.18, H * 0.22, 26, 0, 7); g.fill(); }
    else if (key === 'office') { g.fillStyle = '#e9e4dc'; g.fillRect(0, 0, W, H); g.fillStyle = '#bcd7e8'; g.fillRect(W * 0.08, H * 0.12, W * 0.34, H * 0.5); g.strokeStyle = '#8c7b6b'; g.lineWidth = 8; g.strokeRect(W * 0.08, H * 0.12, W * 0.34, H * 0.5); g.beginPath(); g.moveTo(W * 0.25, H * 0.12); g.lineTo(W * 0.25, H * 0.62); g.stroke(); g.fillStyle = '#7a5c43'; for (let k = 0; k < 3; k++) g.fillRect(W * 0.6, H * (0.2 + k * 0.2), W * 0.32, 8); const cols = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad']; for (let k = 0; k < 3; k++) for (let j = 0; j < 9; j++) { g.fillStyle = cols[(j + k) % 5]; g.fillRect(W * 0.61 + j * 21, H * (0.2 + k * 0.2) - 38 + (j % 3) * 4, 16, 38 - (j % 3) * 4); } g.fillStyle = '#5b8c3e'; g.beginPath(); g.arc(W * 0.5, H * 0.75, 30, 0, 7); g.fill(); g.fillStyle = '#8c6a4f'; g.fillRect(W * 0.47, H * 0.8, W * 0.06, H * 0.2); }
    else if (key === 'bricks') { g.fillStyle = '#7b3f2a'; g.fillRect(0, 0, W, H); g.fillStyle = '#9c5236'; for (let r = 0; r < 14; r++) for (let x = -1; x < 12; x++) g.fillRect(x * 60 + (r % 2) * 30 + 2, r * 26 + 2, 56, 22); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, W, H); }
    imgs[key] = c; return c;
  }

  // ---------- the effect itself ----------
  function painter(w, h) {
    const small = canvas(Math.max(16, w >> 3), Math.max(9, h >> 3)), sg = small.getContext('2d'), fg = canvas(w, h), fc = fg.getContext('2d'), mask = canvas(w, h), mc = mask.getContext('2d');
    // a soft oval around the middle (where people usually sit): opaque inside, fading out at the edge
    mc.save(); mc.translate(w / 2, h * 0.56); mc.scale((w * 0.3) / (h * 0.56), 1); const r = h * 0.56, gr = mc.createRadialGradient(0, 0, r * 0.72, 0, 0, r); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); mc.fillStyle = gr; mc.beginPath(); mc.arc(0, 0, r, 0, 7); mc.fill(); mc.restore();
    return (g, src, o) => {
      const f = FILTERS[o.filter] || FILTERS.none, css = f.css || 'none';
      if (o.bg === 'none' || o.native) { g.filter = css; g.drawImage(src, 0, 0, w, h); }
      else {
        if (o.bg === 'blur') { sg.drawImage(src, 0, 0, small.width, small.height); g.filter = (f.css ? f.css + ' ' : '') + 'blur(4px)'; g.drawImage(small, 0, 0, w, h); }
        else { const im = picture(o.bg.slice(4)); g.filter = 'none'; if (im && (im.width || im.naturalWidth)) { const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, s = Math.max(w / iw, h / ih); g.drawImage(im, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s); } else { g.fillStyle = '#444'; g.fillRect(0, 0, w, h); } }
        fc.globalCompositeOperation = 'source-over'; fc.filter = css; fc.drawImage(src, 0, 0, w, h); fc.filter = 'none'; fc.globalCompositeOperation = 'destination-in'; fc.drawImage(mask, 0, 0); fc.globalCompositeOperation = 'source-over';
        g.filter = 'none'; g.drawImage(fg, 0, 0);
      }
      g.filter = 'none'; if (f.tint) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = f.tint; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; }
    };
  }
  const nativeBlur = (track) => { try { const c = track.getCapabilities ? track.getCapabilities() : {}; return !!(c.backgroundBlur && [].concat(c.backgroundBlur).includes(true)); } catch { return false; } };
  // track -> { track, stop } with the current effect, or null when there is nothing to do
  function process(track, o = cur()) {
    if (!track || track.kind !== 'video' || track.readyState !== 'live') return null;
    const native = o.bg === 'blur' && nativeBlur(track);
    if (native) track.applyConstraints({ backgroundBlur: true }).catch(() => {});
    else if (nativeBlur(track)) track.applyConstraints({ backgroundBlur: false }).catch(() => {});
    if ((o.bg === 'none' || native) && o.filter === 'none') return native ? { track, native: true, stop() { track.applyConstraints({ backgroundBlur: false }).catch(() => {}); } } : null;
    const s = track.getSettings ? track.getSettings() : {}; let w = s.width || 640, h = s.height || 480, paint = painter(w, h), stopped = false; const opts = { ...o, native };
    if (window.MediaStreamTrackProcessor && window.MediaStreamTrackGenerator && typeof VideoFrame === 'function') {
      // insertable streams: every camera frame goes through the effect (keeps going in background tabs)
      const proc = new window.MediaStreamTrackProcessor({ track }), gen = new window.MediaStreamTrackGenerator({ kind: 'video' }); let cv = canvas(w, h), g = cv.getContext('2d');
      const ts = new TransformStream({ transform(frame, ctl) {
        try {
          if (stopped) return; const fw = frame.displayWidth, fh = frame.displayHeight;
          if (fw && fh && (fw !== w || fh !== h)) { w = fw; h = fh; cv = canvas(w, h); g = cv.getContext('2d'); paint = painter(w, h); }
          paint(g, frame, opts); ctl.enqueue(new VideoFrame(cv, { timestamp: frame.timestamp }));
        } catch (e) { console.error('effects frame', e); } finally { frame.close(); }
      } });
      proc.readable.pipeThrough(ts).pipeTo(gen.writable).catch(() => {});
      try { gen.contentHint = 'motion'; } catch {}
      return { track: gen, native, stop() { stopped = true; try { gen.stop(); } catch {} if (native) track.applyConstraints({ backgroundBlur: false }).catch(() => {}); } };
    }
    // fallback: a hidden video and a canvas stream
    const v = el('video', { muted: true, playsinline: true, autoplay: true }), cv = document.createElement('canvas'); v.muted = true; v.srcObject = new MediaStream([track]); v.play().catch(() => {}); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    const tick = () => { if (stopped || !v.videoWidth) return; if (v.videoWidth !== w || v.videoHeight !== h) { w = cv.width = v.videoWidth; h = cv.height = v.videoHeight; paint = painter(w, h); } paint(g, v, opts); };
    const stopTick = X && X.ticker ? X.ticker(41, tick) : ((h2) => () => clearInterval(h2))(setInterval(tick, 41)), out = cv.captureStream(24).getVideoTracks()[0];
    return { track: out, native, stop() { stopped = true; stopTick(); try { out.stop(); } catch {} v.srcObject = null; } };
  }

  // ---------- the picker (meeting side panel, Settings › Devices, a "before you join" screen) ----------
  function thumb(kind, key) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d');
    if (kind === 'bg') {
      if (key === 'none') { g.fillStyle = '#5c5c5c'; g.fillRect(0, 0, 96, 54); }
      else if (key === 'blur') { const gr = g.createLinearGradient(0, 0, 96, 54); gr.addColorStop(0, '#9aa6b8'); gr.addColorStop(1, '#c9b8a6'); g.fillStyle = gr; g.fillRect(0, 0, 96, 54); g.filter = 'blur(3px)'; g.fillStyle = '#6d7a8c'; g.fillRect(6, 8, 30, 20); g.fillRect(62, 26, 26, 22); g.filter = 'none'; }
      else { const im = picture(key.slice(4)); if (im) g.drawImage(im, 0, 0, 96, 54); }
      if (key !== 'none') { g.fillStyle = 'rgba(30,30,30,.9)'; g.beginPath(); g.arc(48, 24, 11, 0, 7); g.fill(); g.beginPath(); g.ellipse(48, 54, 22, 16, 0, 0, 7); g.fill(); }
    } else { const gr = g.createLinearGradient(0, 0, 96, 54); gr.addColorStop(0, '#e8a87c'); gr.addColorStop(1, '#85cdca'); g.fillStyle = gr; g.fillRect(0, 0, 96, 54); const f = FILTERS[key]; const c2 = document.createElement('canvas'); c2.width = 96; c2.height = 54; const g2 = c2.getContext('2d'); g2.filter = f.css || 'none'; g2.drawImage(c, 0, 0); if (f.tint) { g2.filter = 'none'; g2.globalCompositeOperation = 'soft-light'; g2.fillStyle = f.tint; g2.fillRect(0, 0, 96, 54); } return c2; }
    return c;
  }
  function picker(host, o = {}) {
    const box = el('div', { class: 'cl-fx' }), prev = el('video', { class: 'cl-fxprev', autoplay: true, playsinline: true, muted: true, 'aria-label': t('cl_fxPreview') }), note = el('p', { class: 'muted small' }); prev.muted = true;
    let own = null, fx = null; // the preview's own camera (when not in a call) and its effect
    const stopOwn = () => { if (fx) { fx.stop(); fx = null; } if (own) { own.getTracks().forEach((x) => x.stop()); own = null; } };
    const showPreview = async () => {
      if (!o.preview) return; const c = X && X.call;
      if (c) { stopOwn(); const tr = c.me.cam ? c.camOut || c.local.getVideoTracks()[0] : null; prev.srcObject = tr ? new MediaStream([tr]) : null; prev.classList.toggle('hidden', !tr); note.textContent = tr ? '' : t('cl_fxNoCam'); return; }
      try { if (!own) own = await (LC.callDevices ? LC.callDevices.getCam(LC.ui.camId) : navigator.mediaDevices.getUserMedia({ video: true })); } catch { note.textContent = t('noCamera'); return; }
      if (!box.isConnected && box.dataset.drawn) return stopOwn();
      if (fx) fx.stop(); fx = process(own.getVideoTracks()[0]); prev.srcObject = new MediaStream([fx ? fx.track : own.getVideoTracks()[0]]); prev.play().catch(() => {});
    };
    const opt = (kind, key, label) => { const on = (kind === 'bg' ? cur().bg : cur().filter) === key; return el('button', { class: 'cl-fxopt' + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), 'aria-label': label, title: label, onclick: () => { LC.callEffects.set(kind === 'bg' ? { bg: key } : { filter: key }); draw(); } }, thumb(kind, key), el('span', { text: label })); };
    const file = el('input', { type: 'file', accept: 'image/*', class: 'hidden', 'aria-label': t('cl_bgAdd'), onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; try { const bmp = await createImageBitmap(f), c = document.createElement('canvas'), k = Math.min(1, 960 / bmp.width, 540 / bmp.height); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.8); if (url.length > 900000) return LC.toast(t('cl_fxTooBig')); LC.ls.set(CUSTOM, url); delete imgs.custom; LC.callEffects.set({ bg: 'img:custom' }); draw(); } catch { LC.toast(t('cl_fxTooBig')); }
    } });
    const draw = () => {
      const c = cur(), hasCustom = !!LC.ls.get(CUSTOM, '');
      box.replaceChildren(...[o.preview ? el('div', { class: 'cl-fxprevwrap' }, prev) : null, note,
        el('h3', { class: 'cl-h3', text: t('cl_filters') }), el('div', { class: 'cl-fxgrid', role: 'group', 'aria-label': t('cl_filters') }, Object.keys(FILTERS).map((k) => opt('f', k, t('cl_f_' + k)))),
        el('h3', { class: 'cl-h3', text: t('cl_backgrounds') }), el('div', { class: 'cl-fxgrid', role: 'group', 'aria-label': t('cl_backgrounds') }, opt('bg', 'none', t('cl_bgNone')), opt('bg', 'blur', t('cl_bgBlur')), ...IMAGES.map((k) => opt('bg', 'img:' + k, t('cl_bg_' + k))), hasCustom ? opt('bg', 'img:custom', t('cl_bgCustom')) : null,
          el('button', { class: 'cl-fxopt cl-fxadd', type: 'button', 'aria-label': t('cl_bgAdd'), title: t('cl_bgAdd'), onclick: () => file.click() }, LC.icon('add'), el('span', { text: t('cl_bgAdd') }))), file,
        c.bg !== 'none' ? el('p', { class: 'muted small', text: c.bg === 'blur' && X && X.call && X.call.camFx && X.call.camFx.native ? t('cl_fxNative') : t('cl_fxOval') }) : null].filter(Boolean));
      box.dataset.drawn = '1'; showPreview();
    };
    host.append(box); draw();
    const watch = setInterval(() => { if (!box.isConnected) { clearInterval(watch); stopOwn(); } }, 1000);
    return { redraw: draw, stop: () => { clearInterval(watch); stopOwn(); } };
  }

  LC.callEffects = {
    list: () => ({ backgrounds: ['none', 'blur', ...IMAGES.map((k) => 'img:' + k), ...(LC.ls.get(CUSTOM, '') ? ['img:custom'] : [])], filters: Object.keys(FILTERS) }),
    get: () => cur(),
    // set({ bg, filter }) remembers the choice on this device and applies it to the camera in a call right away
    set: (p) => { const patch = {}; if (p.bg !== undefined) patch.clBg = String(p.bg); if (p.filter !== undefined) patch.clFilter = FILTERS[p.filter] ? p.filter : 'none'; LC.setUi(patch); if (X && X.call) { X.applyCamFx(); X.updateSenders(); X.drawSoon(); } LC.emitLocal('call:effects', cur()); },
    process: (track, o) => process(track, o ? { ...cur(), ...o } : cur()),
    picker: (host, o) => picker(host, o),
  };
  if (X) {
    X.camPipe = (track) => process(track);
    X.panels.effects = { keep: true, label: () => t('cl_effects'), render: (host) => picker(host, { preview: true }) };
  }
  // Ctrl+Shift+P: background blur on / off (as in Teams)
  document.addEventListener('keydown', (e) => { if (LC.inCall && LC.inCall() && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); LC.callEffects.set({ bg: cur().bg === 'blur' ? 'none' : 'blur' }); } });
  LC.on('call:drawn', () => { const p = X && X.panels.effects; if (p && p.node && p.node.isConnected && X.call) { const v = p.node.querySelector('.cl-fxprev'), tr = X.call.me.cam ? X.call.camOut || X.call.local.getVideoTracks()[0] : null; if (v && tr && (!v.srcObject || v.srcObject.getVideoTracks()[0] !== tr)) { v.srcObject = new MediaStream([tr]); v.classList.remove('hidden'); v.play().catch(() => {}); } } });
})();
