'use strict';
// Whiteboard (chat tab "Whiteboard", also drawn on the meeting stage by the calls area): pens, highlighter, eraser, shapes,
// text boxes, sticky notes, pictures, select / move / resize / delete, zoom and pan, templates, undo / redo, save as a
// picture or a PDF. Objects live with the old pen strokes in db.extras[chan].board, so old boards keep loading.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_wb: 'Whiteboard', ap_wbDesc: 'Draw, add sticky notes, shapes, text and pictures together, live.', ap_wbSelect: 'Select', ap_wbPan: 'Move the view', ap_wbPen: 'Pen', ap_wbHl: 'Highlighter', ap_wbEraser: 'Eraser', ap_wbShapes: 'Shapes',
    ap_wbRect: 'Rectangle', ap_wbEllipse: 'Ellipse', ap_wbLine: 'Line', ap_wbArrow: 'Arrow', ap_wbText: 'Text', ap_wbSticky: 'Sticky note', ap_wbImage: 'Picture', ap_wbTemplates: 'Templates', ap_wbUndo: 'Undo', ap_wbRedo: 'Redo',
    ap_wbZoomIn: 'Zoom in', ap_wbZoomOut: 'Zoom out', ap_wbFit: 'Fit to screen', ap_wbZoom: 'Zoom {n}%', ap_wbExport: 'Save as', ap_wbPng: 'Picture (PNG)', ap_wbPdf: 'PDF', ap_wbClear: 'Clear the whiteboard', ap_wbColor: 'Colour {c}', ap_wbSize: 'Thickness',
    ap_wbFront: 'Bring to front', ap_wbBack: 'Send to back', ap_wbDup: 'Duplicate', ap_wbDelSel: 'Delete selected', ap_wbCanvas: 'Whiteboard canvas. Use the tools above; Delete removes what is selected, arrow keys move it.', ap_wbEmpty: 'Empty whiteboard',
    ap_wbTyping: 'Type here', ap_wbFull: 'This whiteboard is full.', ap_wbStickyColor: 'Sticky note colour', ap_wbFill: 'Fill', ap_wbNoFill: 'No fill', ap_wbReadonly: 'You can look, but you can’t draw here.',
    ap_tpl_brainstorm: 'Brainstorm', ap_tpl_retro: 'Retrospective', ap_tpl_kanban: 'Kanban', ap_tpl_swot: 'SWOT analysis', ap_tpl_mind: 'Mind map',
    ap_tpl_topic: 'Topic', ap_tpl_idea: 'Idea', ap_tpl_well: 'What went well', ap_tpl_better: 'What could be better', ap_tpl_actions: 'Action items', ap_tpl_todo: 'To do', ap_tpl_doing: 'Doing', ap_tpl_done: 'Done',
    ap_tpl_s: 'Strengths', ap_tpl_w: 'Weaknesses', ap_tpl_o: 'Opportunities', ap_tpl_t: 'Threats', ap_tpl_main: 'Main idea', ap_tpl_branch: 'Branch {n}', ap_wbSaving: 'Making the file…',
  });
  LC.addStrings('hi', { ap_wbPen: 'पेन', ap_wbEraser: 'रबड़', ap_wbShapes: 'आकार', ap_wbText: 'टेक्स्ट', ap_wbSticky: 'स्टिकी नोट', ap_wbImage: 'चित्र', ap_wbTemplates: 'टेम्पलेट', ap_wbUndo: 'पूर्ववत करें', ap_wbFit: 'स्क्रीन में फ़िट करें' });
  LC.addStrings('es', { ap_wbPen: 'Lápiz', ap_wbEraser: 'Borrador', ap_wbShapes: 'Formas', ap_wbText: 'Texto', ap_wbSticky: 'Nota adhesiva', ap_wbImage: 'Imagen', ap_wbTemplates: 'Plantillas', ap_wbUndo: 'Deshacer', ap_wbFit: 'Ajustar a la pantalla' });

  const COLORS = ['#242424', '#d13438', '#ca5010', '#e3b200', '#498205', '#038387', '#0078d4', '#5b5fc7', '#c239b3', '#ffffff'];
  const STICKY = ['#fff100', '#ffd8a8', '#ffc0cb', '#c7f2a4', '#a8e0ff', '#d6c7ff'];
  const FONT = '"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,Roboto,sans-serif';
  const boards = new Set(), IMG = new Map();
  const nid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
  const imgFor = (f) => {
    if (!f || !f.id) return null; let im = IMG.get(f.id);
    if (!im) { im = new Image(); im.onload = () => { for (const b of boards) b.redraw(); }; im.src = LC.fileUrl({ id: f.id, name: f.name || 'image.png' }, true); IMG.set(f.id, im); }
    return im;
  };
  LC.on('board', (e) => { for (const b of [...boards]) { if (!b.alive()) boards.delete(b); else if (b.chan === e.chan) b.event(e); } });
  LC.on('boardlive', (e) => { for (const b of boards) if (b.chan === e.chan) b.live(e); });

  // ---------- drawing ----------
  const wrap = (g, text, max) => { const out = []; for (const para of String(text || '').split('\n')) { let line = ''; for (const w of para.split(/(\s+)/)) { const test = line + w; if (line && g.measureText(test).width > max && w.trim()) { out.push(line.trimEnd()); line = w.trimStart(); } else line = test; } out.push(line); } return out; };
  function textIn(g, o, pad, color, fit) {
    let fs = o.fs || 24; const max = o.w - pad * 2;
    for (;;) { g.font = `${o.b ? '600 ' : ''}${fs}px ${FONT}`; const lines = wrap(g, o.text, max); if (!fit || lines.length * fs * 1.25 <= o.h - pad * 2 || fs <= 10) { g.fillStyle = color; g.textBaseline = 'top'; lines.forEach((l, i) => g.fillText(l, o.x + pad, o.y + pad + i * fs * 1.25)); return lines.length * fs * 1.25 + pad * 2; } fs -= 2; }
  }
  function paintObj(g, o) {
    g.save();
    if (!o.t || o.t === 'pen') {
      const p = o.pts; if (!p || p.length < 2) { g.restore(); return; }
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = (o.w || 3) * 1.4;
      if (o.c === 'erase') { g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; } else { g.strokeStyle = o.c || '#000'; if (o.a) g.globalAlpha = o.a; }
      g.beginPath(); g.moveTo(p[0], p[1]); if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke();
    } else if (o.t === 'rect' || o.t === 'ellipse') {
      g.beginPath(); if (o.t === 'rect') g.rect(o.x, o.y, o.w, o.h); else g.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
      if (o.f && o.f !== 'none') { g.fillStyle = o.f; g.fill(); }
      if (o.c !== 'none' && o.sw > 0) { g.strokeStyle = o.c; g.lineWidth = o.sw; g.stroke(); }
    } else if (o.t === 'line' || o.t === 'arrow') {
      const [x1, y1, x2, y2] = o.pts; g.strokeStyle = o.c; g.fillStyle = o.c; g.lineWidth = o.sw; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      if (o.t === 'arrow') { const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(14, o.sw * 4); g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - L * Math.cos(a - 0.42), y2 - L * Math.sin(a - 0.42)); g.lineTo(x2 - L * Math.cos(a + 0.42), y2 - L * Math.sin(a + 0.42)); g.closePath(); g.fill(); }
    } else if (o.t === 'text') textIn(g, o, 4, o.c, false);
    else if (o.t === 'sticky') {
      g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowBlur = 8; g.shadowOffsetY = 3; g.fillStyle = o.f; g.fillRect(o.x, o.y, o.w, o.h); g.shadowColor = 'transparent';
      textIn(g, o, 14, '#242424', true);
    } else if (o.t === 'image') {
      const im = imgFor(o.img);
      if (im && im.complete && im.naturalWidth) g.drawImage(im, o.x, o.y, o.w, o.h); else { g.fillStyle = '#f0f0f0'; g.fillRect(o.x, o.y, o.w, o.h); g.strokeStyle = '#c8c8c8'; g.lineWidth = 2; g.strokeRect(o.x, o.y, o.w, o.h); }
    }
    g.restore();
  }
  const bbox = (o) => {
    if ((o.t === 'line' || o.t === 'arrow') && o.pts) { const [x1, y1, x2, y2] = o.pts, m = (o.sw || 3) / 2 + 4; return { x: Math.min(x1, x2) - m, y: Math.min(y1, y2) - m, w: Math.abs(x2 - x1) + 2 * m, h: Math.abs(y2 - y1) + 2 * m }; }
    if (o.pts) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (let i = 0; i < o.pts.length; i += 2) { a = Math.min(a, o.pts[i]); c = Math.max(c, o.pts[i]); b = Math.min(b, o.pts[i + 1]); d = Math.max(d, o.pts[i + 1]); } const m = (o.w || 3) * 0.7 + 2; return { x: a - m, y: b - m, w: c - a + 2 * m, h: d - b + 2 * m }; }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  };
  const union = (list) => { if (!list.length) return null; let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const o of list) { const r = bbox(o); a = Math.min(a, r.x); b = Math.min(b, r.y); c = Math.max(c, r.x + r.w); d = Math.max(d, r.y + r.h); } return { x: a, y: b, w: c - a, h: d - b }; };
  const segDist = (px, py, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy; let k = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; k = Math.max(0, Math.min(1, k)); const ex = x1 + k * dx - px, ey = y1 + k * dy - py; return Math.sqrt(ex * ex + ey * ey); };
  const hit = (o, x, y, tol) => {
    const r = bbox(o); if (x < r.x - tol || y < r.y - tol || x > r.x + r.w + tol || y > r.y + r.h + tol) return false;
    if (o.t === 'line' || o.t === 'arrow') return segDist(x, y, ...o.pts) <= (o.sw || 3) / 2 + tol;
    if (!o.t || o.t === 'pen') { if (o.c === 'erase') return false; const p = o.pts, lim = (o.w || 3) * 0.7 + tol; if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= lim; for (let i = 2; i < p.length; i += 2) if (segDist(x, y, p[i - 2], p[i - 1], p[i], p[i + 1]) <= lim) return true; return false; }
    if (o.t === 'ellipse' && (!o.f || o.f === 'none')) { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, d = Math.hypot((x - cx) / (o.w / 2), (y - cy) / (o.h / 2)); return Math.abs(d - 1) * Math.min(o.w, o.h) / 2 <= tol + (o.sw || 3); }
    if (o.t === 'rect' && (!o.f || o.f === 'none')) return x < o.x + tol + o.sw || y < o.y + tol + o.sw || x > o.x + o.w - tol - o.sw || y > o.y + o.h - tol - o.sw;
    return true;
  };
  const moved = (o, dx, dy) => { const c = JSON.parse(JSON.stringify(o)); if (c.pts) c.pts = c.pts.map((v, i) => Math.round(v + (i % 2 ? dy : dx))); else { c.x = Math.round(c.x + dx); c.y = Math.round(c.y + dy); } return c; };
  const scaled = (o, from, to) => { // fit o from bounding box `from` into `to`
    const c = JSON.parse(JSON.stringify(o)), sx = to.w / Math.max(from.w, 1), sy = to.h / Math.max(from.h, 1);
    if (c.pts) c.pts = c.pts.map((v, i) => Math.round(i % 2 ? to.y + (v - from.y) * sy : to.x + (v - from.x) * sx)); else { c.x = Math.round(to.x + (c.x - from.x) * sx); c.y = Math.round(to.y + (c.y - from.y) * sy); c.w = Math.max(4, Math.round(c.w * sx)); c.h = Math.max(4, Math.round(c.h * sy)); }
    return c;
  };
  const wire = (o) => { const { id, t: ty, c, w, pts, a, x, y, h, f, sw, text, fs, b, img } = o; return { id, t: ty || 'pen', c, w, pts, a, x, y, h, f, sw, text, fs, b, img }; }; // what the server stores (no by / ts)

  // ---------- templates (placed around a point) ----------
  const TEMPLATES = {
    brainstorm: (cx, cy) => [{ t: 'text', x: cx - 300, y: cy - 330, w: 600, h: 60, text: t('ap_tpl_brainstorm'), fs: 44, b: true, c: '#242424' }, { t: 'sticky', x: cx - 110, y: cy - 110, w: 220, h: 220, f: '#ffd8a8', text: t('ap_tpl_topic'), fs: 32 },
      ...[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return { t: 'sticky', x: Math.round(cx + Math.cos(a) * 330 - 90), y: Math.round(cy + Math.sin(a) * 250 - 90), w: 180, h: 180, f: STICKY[i % STICKY.length], text: t('ap_tpl_idea'), fs: 24 }; })],
    retro: (cx, cy) => [[t('ap_tpl_well'), '#c7f2a4'], [t('ap_tpl_better'), '#ffc0cb'], [t('ap_tpl_actions'), '#a8e0ff']].flatMap(([h, col], i) => { const x = cx - 570 + i * 390; return [{ t: 'rect', x, y: cy - 300, w: 360, h: 600, c: '#8a8886', f: '#fafafa', sw: 2 }, { t: 'text', x: x + 16, y: cy - 290, w: 330, h: 50, text: h, fs: 30, b: true, c: '#242424' }, { t: 'sticky', x: x + 30, y: cy - 200, w: 140, h: 140, f: col, text: '', fs: 20 }, { t: 'sticky', x: x + 190, y: cy - 200, w: 140, h: 140, f: col, text: '', fs: 20 }]; }),
    kanban: (cx, cy) => [[t('ap_tpl_todo'), '#fff100'], [t('ap_tpl_doing'), '#ffd8a8'], [t('ap_tpl_done'), '#c7f2a4']].flatMap(([h, col], i) => { const x = cx - 540 + i * 360; return [{ t: 'rect', x, y: cy - 320, w: 340, h: 640, c: '#c8c6c4', f: '#f5f5f5', sw: 2 }, { t: 'text', x: x + 16, y: cy - 310, w: 300, h: 50, text: h, fs: 32, b: true, c: '#242424' }, { t: 'sticky', x: x + 60, y: cy - 230, w: 220, h: 140, f: col, text: '', fs: 22 }]; }),
    swot: (cx, cy) => [[t('ap_tpl_s'), '#dff6dd', 0, 0], [t('ap_tpl_w'), '#fde7e9', 1, 0], [t('ap_tpl_o'), '#deecf9', 0, 1], [t('ap_tpl_t'), '#fff4ce', 1, 1]].flatMap(([h, col, i, j]) => { const x = cx - 420 + i * 420, y = cy - 320 + j * 320; return [{ t: 'rect', x, y, w: 410, h: 310, c: '#8a8886', f: col, sw: 2 }, { t: 'text', x: x + 16, y: y + 10, w: 380, h: 50, text: h, fs: 32, b: true, c: '#242424' }]; }),
    mind: (cx, cy) => { const out = [{ t: 'ellipse', x: cx - 150, y: cy - 70, w: 300, h: 140, c: '#5b5fc7', f: '#e8e8ff', sw: 4 }, { t: 'text', x: cx - 120, y: cy - 22, w: 240, h: 50, text: t('ap_tpl_main'), fs: 30, b: true, c: '#242424' }];
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy], i) => { const x = cx + dx * 420, y = cy + dy * 230; out.push({ t: 'line', pts: [cx + dx * 120, cy + dy * 50, x - dx * 110, y - dy * 30], c: '#8a8886', sw: 4 }, { t: 'ellipse', x: x - 120, y: y - 50, w: 240, h: 100, c: A.PALETTE[i + 1], f: '#ffffff', sw: 3 }, { t: 'text', x: x - 100, y: y - 18, w: 200, h: 40, text: t('ap_tpl_branch', { n: i + 1 }), fs: 24, c: '#242424' }); });
      return out; },
  };

  // ---------- PDF: one page with the board as an embedded JPEG (no libraries) ----------
  A.pdfFromJpeg = (jpeg, w, h) => {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0; const add = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const pw = w >= h ? 842 : Math.round(842 * w / h), ph = w >= h ? Math.round(842 * h / w) : 842, content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'.replace(/[\u0080-ÿ]/g, (c) => c));
    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n${body}\nendobj\n`); };
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>`);
    offs[4] = len; add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`); add(jpeg); add('\nendstream\nendobj\n');
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xref = len; add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  };

  // ---------- one whiteboard view ----------
  function mount(host, chan) {
    const can = () => A.writable(chan);
    const W = { objs: [], z: 1, vx: 0, vy: 0, tool: can() ? 'pen' : 'select', color: '#242424', width: 4, sticky: STICKY[0], shape: 'rect', fill: 'none', sel: new Set(), undo: [], redo: [], live: new Map(), editing: null, loaded: false, fitted: false };
    const cv = el('canvas', { class: 'boardcv', tabindex: '0', role: 'application', 'aria-roledescription': t('ap_wb'), 'aria-label': t('ap_wbCanvas') }), g = cv.getContext('2d');
    const stage = el('div', { class: 'ap-wbstage' }, cv), bar = el('div', { class: 'ap-wbbar', role: 'toolbar', 'aria-label': t('ap_wb') }), zoomBar = el('div', { class: 'ap-wbzoom', role: 'toolbar', 'aria-label': t('ap_wbFit') });
    const root = el('div', { class: 'ap-fillbox ap-wb' }, bar, el('div', { class: 'ap-wbmain' }, stage, zoomBar));
    host.replaceChildren(root);
    let dpr = 1, cw = 0, ch = 0;
    const resize = () => { const r = stage.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; cw = Math.max(1, Math.round(r.width)); ch = Math.max(1, Math.round(r.height)); cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); if (!W.fitted && W.loaded) fit(true); redraw(); };
    const ro = new ResizeObserver(() => resize()); ro.observe(stage);
    const toWorld = (sx, sy) => [sx / W.z + W.vx, sy / W.z + W.vy];
    const toScreen = (wx, wy) => [(wx - W.vx) * W.z, (wy - W.vy) * W.z];
    const editingId = () => W.editing && W.editing.id;
    function redraw() {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
      g.setTransform(dpr * W.z, 0, 0, dpr * W.z, -W.vx * W.z * dpr, -W.vy * W.z * dpr);
      for (const o of W.objs) if (o.id !== editingId()) paintObj(g, o);
      if (W.draft) paintObj(g, W.draft);
      for (const [, l] of W.live) paintObj(g, l.seg);
      // selection frame + handles (screen space)
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sel = W.objs.filter((o) => W.sel.has(o.id));
      if (sel.length) {
        const r = union(sel), [x, y] = toScreen(r.x, r.y), w = r.w * W.z, h = r.h * W.z; g.strokeStyle = '#5b5fc7'; g.lineWidth = 1.5; g.setLineDash([5, 4]); g.strokeRect(x - 2, y - 2, w + 4, h + 4); g.setLineDash([]);
        for (const [hx, hy] of handles(sel)) { g.fillStyle = '#fff'; g.strokeStyle = '#5b5fc7'; g.lineWidth = 1.5; g.beginPath(); g.rect(hx - 5, hy - 5, 10, 10); g.fill(); g.stroke(); }
      }
      if (W.marquee) { const m = W.marquee, [x1, y1] = toScreen(m.x1, m.y1), [x2, y2] = toScreen(m.x2, m.y2); g.fillStyle = 'rgba(91,95,199,.08)'; g.strokeStyle = '#5b5fc7'; g.lineWidth = 1; g.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); }
      stage.style.backgroundSize = `${24 * W.z}px ${24 * W.z}px`; stage.style.backgroundPosition = `${-W.vx * W.z}px ${-W.vy * W.z}px`;
      drawZoom();
    }
    // resize handles: corners and edges for one box-like item, the two ends of a line, corners for a group or a pen stroke
    function handles(sel) {
      if (sel.length === 1 && (sel[0].t === 'line' || sel[0].t === 'arrow')) { const p = sel[0].pts; return [toScreen(p[0], p[1]), toScreen(p[2], p[3])]; }
      const r = union(sel), [x, y] = toScreen(r.x, r.y), w = r.w * W.z, h = r.h * W.z;
      return [[x - 2, y - 2], [x + w + 2, y - 2], [x - 2, y + h + 2], [x + w + 2, y + h + 2], ...(sel.length === 1 && sel[0].x !== undefined ? [[x + w / 2, y - 2], [x + w / 2, y + h + 2], [x - 2, y + h / 2], [x + w + 2, y + h / 2]] : [])];
    }
    function fit(init) {
      const r = union(W.objs.filter((o) => o.c !== 'erase')) || { x: 0, y: 0, w: 1000, h: 700 }, box = init && W.objs.every((o) => { const b = bbox(o); return b.x >= -20 && b.y >= -20 && b.x + b.w <= 1020 && b.y + b.h <= 720; }) ? { x: 0, y: 0, w: 1000, h: 700 } : r; // old boards keep their old framing
      const pad = 24, z = Math.max(0.05, Math.min(4, Math.min((cw - pad * 2) / Math.max(box.w, 1), (ch - pad * 2) / Math.max(box.h, 1))));
      W.z = z; W.vx = box.x - (cw / z - box.w) / 2; W.vy = box.y - (ch / z - box.h) / 2; W.fitted = true; redraw();
    }
    const zoomAt = (z, sx = cw / 2, sy = ch / 2) => { const [wx, wy] = toWorld(sx, sy); W.z = Math.max(0.05, Math.min(5, z)); W.vx = wx - sx / W.z; W.vy = wy - sy / W.z; redraw(); };
    function drawZoom() { const n = zoomBar.querySelector('.ap-wbzn'); if (n) n.textContent = Math.round(W.z * 100) + '%'; }
    zoomBar.append(LC.ibtn('zoom_out', t('ap_wbZoomOut'), () => zoomAt(W.z / 1.25)), el('button', { type: 'button', class: 'ap-wbzn', title: '100%', 'aria-label': t('ap_wbZoom', { n: 100 }), onclick: () => zoomAt(1) }, '100%'), LC.ibtn('zoom_in', t('ap_wbZoomIn'), () => zoomAt(W.z * 1.25)), LC.ibtn('zoom_fit', t('ap_wbFit'), () => fit(false)));

    // ----- server sync (optimistic, with my own undo/redo) -----
    const post = (body) => LC.api('/api/ap/board', { chan, ...body }).catch((e) => { A.fail(e); reload(); });
    const addObjs = (list, record = true) => { for (const o of list) { o.id ||= nid(); o.by ||= S.me.id; if (!W.objs.some((x) => x.id === o.id)) W.objs.push(o); } if (record) { W.undo.push({ type: 'add', objs: list.map((o) => ({ ...o })) }); W.redo = []; } redraw(); return post(list.length === 1 ? { op: 'add', obj: wire(list[0]) } : { op: 'addmany', objs: list.map(wire) }); };
    const updObjs = (before, after, record = true) => { for (const o of after) { const i = W.objs.findIndex((x) => x.id === o.id); if (i >= 0) W.objs[i] = o; } if (record) { W.undo.push({ type: 'upd', before, after }); W.redo = []; } redraw(); return post({ op: 'upd', objs: after.map(wire) }); };
    const delObjs = (list, record = true) => { const ids = new Set(list.map((o) => o.id)); W.objs = W.objs.filter((o) => !ids.has(o.id)); for (const i of ids) W.sel.delete(i); if (record) { W.undo.push({ type: 'del', objs: list }); W.redo = []; } redraw(); return post({ op: 'del', ids: [...ids] }); };
    const undo = () => { const a = W.undo.pop(); if (!a) return; W.redo.push(a); if (a.type === 'add') delObjs(a.objs, false); else if (a.type === 'del') addObjs(a.objs.map((o) => ({ ...o })), false); else updObjs(a.after, a.before, false); };
    const redo = () => { const a = W.redo.pop(); if (!a) return; W.undo.push(a); if (a.type === 'add') addObjs(a.objs.map((o) => ({ ...o })), false); else if (a.type === 'del') delObjs(a.objs, false); else updObjs(a.before, a.after, false); };
    async function reload() { try { const d = await LC.api('/api/collab?chan=' + encodeURIComponent(chan)); W.objs = d.board || []; W.loaded = true; if (!W.fitted && cw > 1) fit(true); redraw(); } catch (e) { stage.replaceChildren(el('p', { class: 'err pad', text: e.message })); } }

    // ----- live -----
    const api = {
      chan, root, alive: () => root.isConnected, redraw,
      event(e) {
        if (e.op === 'add' && e.stroke) { const i = W.objs.findIndex((o) => o.id === e.stroke.id); if (i >= 0) W.objs[i] = e.stroke; else W.objs.push(e.stroke); for (const [k, l] of W.live) if (l.by === e.stroke.by) W.live.delete(k); }
        else if (e.op === 'addmany') { for (const o of e.objs) { const i = W.objs.findIndex((x) => x.id === o.id); if (i >= 0) W.objs[i] = o; else W.objs.push(o); } }
        else if (e.op === 'upd') { for (const o of e.objs) { if (W.drag && W.drag.ids && W.drag.ids.has(o.id)) continue; const i = W.objs.findIndex((x) => x.id === o.id); if (i >= 0) W.objs[i] = o; } }
        else if (e.op === 'del') W.objs = W.objs.filter((o) => o.id !== e.id);
        else if (e.op === 'delmany') { const ids = new Set(e.ids); W.objs = W.objs.filter((o) => !ids.has(o.id)); for (const i of ids) W.sel.delete(i); }
        else if (e.op === 'clear') { W.objs = []; W.sel.clear(); W.undo = []; W.redo = []; }
        else if (e.op === 'order') { const pos = new Map(e.ids.map((id, i) => [id, i])); W.objs.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)); }
        redraw();
      },
      live(e) { if (e.by === S.me.id) return; const cur = W.live.get(e.sid); if (cur) { cur.seg.pts = cur.seg.pts.concat(e.seg.pts.slice(2)); cur.at = Date.now(); } else W.live.set(e.sid, { by: e.by, at: Date.now(), seg: { ...e.seg, t: 'pen' } }); redraw(); },
    };
    const liveGc = setInterval(() => { if (!root.isConnected) { clearInterval(liveGc); ro.disconnect(); return; } let n = 0; for (const [k, l] of W.live) if (Date.now() - l.at > 4000) { W.live.delete(k); n++; } if (n) redraw(); }, 2000);
    boards.add(api);

    // ----- pointer input -----
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const pointers = new Map(); let pinch = null, spaceDown = false, liveSid = '', liveSent = 0, lastLive = 0;
    const flushLive = (force) => { const d = W.draft; if (!d || d.t !== 'pen' || (d.pts.length - liveSent < 6 && !force)) return; const seg = { c: d.c, w: d.w, a: d.a, pts: d.pts.slice(Math.max(0, liveSent - 2)) }; liveSent = d.pts.length; if (seg.pts.length >= 4) LC.api('/api/ap/board/live', { chan, sid: liveSid, seg }).catch(() => {}); };
    const handleAt = (sx, sy) => { const sel = W.objs.filter((o) => W.sel.has(o.id)); if (!sel.length || !can()) return -1; return handles(sel).findIndex(([hx, hy]) => Math.abs(hx - sx) <= 8 && Math.abs(hy - sy) <= 8); };
    const topAt = (wx, wy) => { const tol = 6 / W.z; for (let i = W.objs.length - 1; i >= 0; i--) if (hit(W.objs[i], wx, wy, tol)) return W.objs[i]; return null; };
    cv.addEventListener('pointerdown', (e) => {
      if (W.editing) commitEdit();
      cv.focus({ preventScroll: true }); pointers.set(e.pointerId, pos(e));
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: W.z, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], vx: W.vx, vy: W.vy }; W.draft = null; W.drag = null; redraw(); return; }
      if (e.button > 1) return;
      const [sx, sy] = pos(e), [wx, wy] = toWorld(sx, sy); cv.setPointerCapture(e.pointerId); e.preventDefault();
      const tool = e.button === 1 || spaceDown ? 'pan' : W.tool;
      if (tool === 'pan' || (!can() && tool !== 'select')) { W.drag = { kind: 'pan', sx, sy, vx: W.vx, vy: W.vy }; return; }
      if (tool === 'select') {
        const h = handleAt(sx, sy);
        if (h >= 0) { const sel = W.objs.filter((o) => W.sel.has(o.id)); W.drag = { kind: 'resize', h, ids: new Set(sel.map((o) => o.id)), before: sel.map((o) => JSON.parse(JSON.stringify(o))), box: union(sel), sx, sy }; return; }
        const o = topAt(wx, wy);
        if (o) { if (e.shiftKey) { if (W.sel.has(o.id)) W.sel.delete(o.id); else W.sel.add(o.id); } else if (!W.sel.has(o.id)) { W.sel = new Set([o.id]); } drawSelBar(); if (!can()) return redraw(); const sel = W.objs.filter((x) => W.sel.has(x.id)); W.drag = { kind: 'move', ids: new Set(sel.map((x) => x.id)), before: sel.map((x) => JSON.parse(JSON.stringify(x))), wx, wy }; redraw(); return; }
        if (!e.shiftKey) W.sel.clear(); W.marquee = { x1: wx, y1: wy, x2: wx, y2: wy }; drawSelBar(); redraw(); return;
      }
      if (tool === 'eraser') { W.drag = { kind: 'erase', gone: [] }; eraseAt(wx, wy); return; }
      if (tool === 'pen' || tool === 'hl') { liveSid = nid(); liveSent = 0; W.draft = { id: nid(), t: 'pen', c: W.color, w: tool === 'hl' ? Math.max(12, W.width * 4) : W.width, a: tool === 'hl' ? 0.35 : undefined, pts: [Math.round(wx), Math.round(wy)] }; W.drag = { kind: 'draw' }; redraw(); return; }
      if (tool === 'shape') { W.draft = W.shape === 'line' || W.shape === 'arrow' ? { id: nid(), t: W.shape, pts: [Math.round(wx), Math.round(wy), Math.round(wx), Math.round(wy)], c: W.color, sw: W.width } : { id: nid(), t: W.shape, x: Math.round(wx), y: Math.round(wy), w: 1, h: 1, c: W.color, f: W.fill, sw: W.width }; W.drag = { kind: 'shape', wx, wy }; return; }
      if (tool === 'text') { const o = { id: nid(), t: 'text', x: Math.round(wx), y: Math.round(wy - 18), w: 320, h: 50, text: '', c: W.color === '#ffffff' ? '#242424' : W.color, fs: 28 }; W.tool = 'select'; drawBar(); startEdit(o, true); return; }
      if (tool === 'sticky') { const o = { id: nid(), t: 'sticky', x: Math.round(wx - 100), y: Math.round(wy - 100), w: 200, h: 200, f: W.sticky, text: '', fs: 24 }; W.tool = 'select'; drawBar(); startEdit(o, true); }
    });
    cv.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pos(e));
      if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const [wx, wy] = [pinch.mid[0] / pinch.z + pinch.vx, pinch.mid[1] / pinch.z + pinch.vy]; W.z = Math.max(0.05, Math.min(5, pinch.z * d / Math.max(pinch.d, 1))); W.vx = wx - mid[0] / W.z; W.vy = wy - mid[1] / W.z; redraw(); return; }
      const D = W.drag, [sx, sy] = pos(e), [wx, wy] = toWorld(sx, sy);
      if (!D) { cv.style.cursor = W.tool === 'select' ? (handleAt(sx, sy) >= 0 ? 'nwse-resize' : topAt(wx, wy) ? 'move' : 'default') : W.tool === 'pan' ? 'grab' : W.tool === 'text' ? 'text' : 'crosshair'; return; }
      if (D.kind === 'pan') { W.vx = D.vx - (sx - D.sx) / W.z; W.vy = D.vy - (sy - D.sy) / W.z; redraw(); }
      else if (D.kind === 'draw') { const p = W.draft.pts, n = p.length; if (Math.hypot(p[n - 2] - wx, p[n - 1] - wy) * W.z < 1.5) return; p.push(Math.round(wx), Math.round(wy)); if (p.length > 7900) finishDraw(); else { redraw(); if (Date.now() - lastLive > 120) { lastLive = Date.now(); flushLive(); } } }
      else if (D.kind === 'shape') {
        const d = W.draft; let x2 = wx, y2 = wy;
        if (e.shiftKey) { if (d.pts) { const a = Math.round(Math.atan2(wy - D.wy, wx - D.wx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(wx - D.wx, wy - D.wy); x2 = D.wx + Math.cos(a) * l; y2 = D.wy + Math.sin(a) * l; } else { const m = Math.max(Math.abs(wx - D.wx), Math.abs(wy - D.wy)); x2 = D.wx + Math.sign(wx - D.wx || 1) * m; y2 = D.wy + Math.sign(wy - D.wy || 1) * m; } }
        if (d.pts) { d.pts[2] = Math.round(x2); d.pts[3] = Math.round(y2); } else { d.x = Math.round(Math.min(D.wx, x2)); d.y = Math.round(Math.min(D.wy, y2)); d.w = Math.max(1, Math.round(Math.abs(x2 - D.wx))); d.h = Math.max(1, Math.round(Math.abs(y2 - D.wy))); }
        redraw();
      } else if (D.kind === 'move') { const dx = wx - D.wx, dy = wy - D.wy; for (const b of D.before) { const i = W.objs.findIndex((o) => o.id === b.id); if (i >= 0) W.objs[i] = moved(b, dx, dy); } D.moved = Math.hypot(dx, dy) * W.z > 2; redraw(); }
      else if (D.kind === 'resize') {
        const sel = D.before, one = sel.length === 1 ? sel[0] : null;
        if (one && (one.t === 'line' || one.t === 'arrow')) { const c = JSON.parse(JSON.stringify(one)); c.pts[D.h * 2] = Math.round(wx); c.pts[D.h * 2 + 1] = Math.round(wy); const i = W.objs.findIndex((o) => o.id === one.id); W.objs[i] = c; D.moved = true; return redraw(); }
        const b = D.box; let { x, y, w, h } = b; const [x2, y2] = [b.x + b.w, b.y + b.h];
        const left = [0, 2, 6].includes(D.h), right = [1, 3, 7].includes(D.h), top = [0, 1, 4].includes(D.h), bottom = [2, 3, 5].includes(D.h);
        if (left) { x = Math.min(wx, x2 - 8); w = x2 - x; } if (right) w = Math.max(8, wx - b.x); if (top) { y = Math.min(wy, y2 - 8); h = y2 - y; } if (bottom) h = Math.max(8, wy - b.y);
        if (e.shiftKey || (one && one.t === 'image')) { const k = b.w / Math.max(b.h, 1); if (left || right) h = w / k; else w = h * k; if (top) y = y2 - h; if (left) x = x2 - w; }
        for (const o of sel) { const i = W.objs.findIndex((z) => z.id === o.id); if (i >= 0) W.objs[i] = scaled(o, b, { x, y, w, h }); }
        D.moved = true; redraw();
      } else if (D.kind === 'erase') eraseAt(wx, wy);
      if (W.marquee) { W.marquee.x2 = wx; W.marquee.y2 = wy; redraw(); }
    });
    const up = (e) => {
      pointers.delete(e.pointerId); if (pinch) { if (pointers.size < 2) pinch = null; return; }
      const D = W.drag; W.drag = null;
      if (W.marquee) { const m = W.marquee, r = { x: Math.min(m.x1, m.x2), y: Math.min(m.y1, m.y2), w: Math.abs(m.x2 - m.x1), h: Math.abs(m.y2 - m.y1) }; W.marquee = null; if (r.w * W.z > 3 || r.h * W.z > 3) for (const o of W.objs) { const b = bbox(o); if (o.c !== 'erase' && b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) W.sel.add(o.id); } drawSelBar(); redraw(); return; }
      if (!D) return;
      if (D.kind === 'draw') finishDraw();
      else if (D.kind === 'shape') { const d = W.draft; W.draft = null; const tiny = d.pts ? Math.hypot(d.pts[2] - d.pts[0], d.pts[3] - d.pts[1]) < 4 : d.w < 4 && d.h < 4; if (tiny) { if (d.pts) { d.pts[2] = d.pts[0] + 160; } else { d.w = 160; d.h = 110; } } addObjs([d]); W.sel = new Set([d.id]); W.tool = 'select'; drawBar(); drawSelBar(); }
      else if ((D.kind === 'move' || D.kind === 'resize') && D.moved) updObjs(D.before, D.before.map((b) => W.objs.find((o) => o.id === b.id)).filter(Boolean));
      else if (D.kind === 'erase' && D.gone.length) { W.undo.push({ type: 'del', objs: D.gone }); W.redo = []; post({ op: 'del', ids: D.gone.map((o) => o.id) }); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function finishDraw() { const d = W.draft; W.draft = null; if (!d) return; flushLive(true); if (d.pts.length >= 2) addObjs([d]); }
    function eraseAt(wx, wy) { const tol = Math.max(8, W.width * 2) / W.z; for (let i = W.objs.length - 1; i >= 0; i--) { const o = W.objs[i]; if ((!o.t || o.t === 'pen') && hit(o, wx, wy, tol)) { W.drag.gone.push(o); W.objs.splice(i, 1); } } redraw(); }
    cv.addEventListener('dblclick', (e) => { if (!can()) return; const [sx, sy] = pos(e), [wx, wy] = toWorld(sx, sy), o = topAt(wx, wy); if (o && (o.t === 'text' || o.t === 'sticky')) startEdit(o, false); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = pos(e); if (e.ctrlKey || e.metaKey) zoomAt(W.z * Math.exp(-e.deltaY * 0.0025), sx, sy); else { W.vx += e.deltaX / W.z; W.vy += e.deltaY / W.z; redraw(); } }, { passive: false });
    cv.addEventListener('keydown', (e) => {
      if (W.editing) return; const mod = e.ctrlKey || e.metaKey, sel = W.objs.filter((o) => W.sel.has(o.id));
      if (e.key === ' ') { spaceDown = true; e.preventDefault(); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (can()) (e.shiftKey ? redo : undo)(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (can()) redo(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); W.sel = new Set(W.objs.filter((o) => o.c !== 'erase').map((o) => o.id)); drawSelBar(); redraw(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length && can()) { e.preventDefault(); delObjs(sel); drawSelBar(); return; }
      if (e.key === 'Escape' && sel.length) { e.stopPropagation(); W.sel.clear(); drawSelBar(); redraw(); return; }
      if (e.key.startsWith('Arrow') && sel.length && can()) { e.preventDefault(); const k = e.shiftKey ? 20 : 2, dx = e.key === 'ArrowLeft' ? -k : e.key === 'ArrowRight' ? k : 0, dy = e.key === 'ArrowUp' ? -k : e.key === 'ArrowDown' ? k : 0; updObjs(sel.map((o) => JSON.parse(JSON.stringify(o))), sel.map((o) => moved(o, dx, dy))); return; }
      if (e.key === 'Enter' && sel.length === 1 && (sel[0].t === 'text' || sel[0].t === 'sticky') && can()) { e.preventDefault(); startEdit(sel[0], false); return; }
      if (mod || e.altKey) return;
      const keys = { v: 'select', h: 'pan', p: 'pen', e: 'eraser', t: 'text', n: 'sticky' }, shapes = { r: 'rect', o: 'ellipse', l: 'line', a: 'arrow' }, k = e.key.toLowerCase();
      if (keys[k] && (can() || k === 'v' || k === 'h')) { W.tool = keys[k]; drawBar(); } else if (shapes[k] && can()) { W.tool = 'shape'; W.shape = shapes[k]; drawBar(); }
    });
    cv.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });

    // ----- text editing over the canvas -----
    function startEdit(o, isNew) {
      const ta = el('textarea', { class: 'ap-wbedit' + (o.t === 'sticky' ? ' sticky' : ''), 'aria-label': o.t === 'sticky' ? t('ap_wbSticky') : t('ap_wbText'), placeholder: t('ap_wbTyping'), maxlength: o.t === 'sticky' ? 1000 : 2000 }); ta.value = o.text || '';
      const place = () => { const [x, y] = toScreen(o.x, o.y); Object.assign(ta.style, { left: x + 'px', top: y + 'px', width: o.w * W.z + 'px', height: Math.max(o.h, 40) * W.z + 'px', fontSize: (o.fs || 24) * W.z + 'px', color: o.t === 'sticky' ? '#242424' : o.c, background: o.t === 'sticky' ? o.f : 'rgba(255,255,255,.85)', fontWeight: o.b ? '600' : '400', padding: (o.t === 'sticky' ? 14 : 4) * W.z + 'px' }); };
      W.editing = { id: o.id, o, isNew, ta, before: JSON.parse(JSON.stringify(o)) }; place(); stage.append(ta); redraw(); ta.focus();
      ta.addEventListener('input', () => { if (o.t === 'text') { const lines = ta.value.split('\n').length; o.h = Math.max(o.h, Math.round(lines * (o.fs || 24) * 1.25 + 8)); place(); } });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); e.stopPropagation(); commitEdit(); cv.focus(); } });
      ta.addEventListener('blur', () => setTimeout(() => { if (W.editing && W.editing.ta === ta) commitEdit(); }, 0));
    }
    function commitEdit() {
      const E = W.editing; if (!E) return; W.editing = null; E.ta.remove(); const text = E.ta.value.replace(/\s+$/, '');
      if (E.isNew) { if (text || E.o.t === 'sticky') { const o = { ...E.o, text }; addObjs([o]); W.sel = new Set([o.id]); drawSelBar(); } else redraw(); return; }
      if (text === (E.before.text || '') && E.o.h === E.before.h) return redraw();
      if (!text && E.o.t === 'text') { delObjs([E.before]); return; }
      updObjs([E.before], [{ ...E.o, text }]);
    }

    // ----- toolbar -----
    const fileIn = el('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) addImage(f); } });
    async function addImage(file) {
      if (!can()) return; try {
        const up = await LC.upload(file, file.name || 'picture.png').promise, im = new Image(), url = URL.createObjectURL(file);
        await new Promise((ok) => { im.onload = ok; im.onerror = ok; im.src = url; }); URL.revokeObjectURL(url);
        const k = Math.min(1, 480 / Math.max(im.naturalWidth || 480, im.naturalHeight || 360)), w = Math.round((im.naturalWidth || 480) * k), h = Math.round((im.naturalHeight || 360) * k), [cx, cy] = toWorld(cw / 2, ch / 2);
        const o = { id: nid(), t: 'image', x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, img: { id: up.id, name: up.name } }; addObjs([o]); W.sel = new Set([o.id]); W.tool = 'select'; drawBar(); drawSelBar();
      } catch (e) { A.fail(e); }
    }
    stage.addEventListener('paste', (e) => { const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type)); if (f && !W.editing) { e.preventDefault(); addImage(f); } });
    cv.addEventListener('paste', (e) => { const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); addImage(f); } });
    stage.addEventListener('dragover', (e) => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); e.stopPropagation(); } });
    stage.addEventListener('drop', (e) => { const f = [...(e.dataTransfer.files || [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); e.stopPropagation(); addImage(f); } });
    const tb = (tool, icon, label, extra) => el('button', { type: 'button', class: 'ap-wbt' + (W.tool === tool && (!extra || extra()) ? ' on' : ''), 'aria-pressed': String(W.tool === tool && (!extra || extra())), title: label, 'aria-label': label, onclick: () => { W.tool = tool; if (W.editing) commitEdit(); drawBar(); cv.focus(); } }, LC.icon(icon));
    const SHAPES = [['rect', 'rectangle_landscape', 'ap_wbRect'], ['ellipse', 'oval', 'ap_wbEllipse'], ['line', 'line_horizontal_1', 'ap_wbLine'], ['arrow', 'arrow_up_right', 'ap_wbArrow']];
    const selBar = el('div', { class: 'ap-wbsel', role: 'toolbar', 'aria-label': t('ap_wbSelect') });
    function applyColor(c) {
      W.color = c; const sel = W.objs.filter((o) => W.sel.has(o.id));
      if (sel.length && can()) { const before = sel.map((o) => JSON.parse(JSON.stringify(o))), after = sel.map((o) => (o.t === 'sticky' ? o : { ...JSON.parse(JSON.stringify(o)), c })); updObjs(before, after); }
      drawBar();
    }
    function drawBar() {
      if (!can()) { bar.replaceChildren(tb('select', 'cursor', t('ap_wbSelect')), tb('pan', 'hand_left', t('ap_wbPan')), el('span', { class: 'muted small ap-wbro', text: t('ap_wbReadonly') }), el('span', { class: 'grow' }), exportBtn()); return; }
      const shapeIcon = (SHAPES.find((s) => s[0] === W.shape) || SHAPES[0])[1];
      bar.replaceChildren(
        el('div', { class: 'ap-wbgrp' }, tb('select', 'cursor', t('ap_wbSelect') + ' (V)'), tb('pan', 'hand_left', t('ap_wbPan') + ' (H)')),
        el('div', { class: 'ap-wbgrp' }, tb('pen', 'pen', t('ap_wbPen') + ' (P)'), tb('hl', 'highlight', t('ap_wbHl')), tb('eraser', 'eraser', t('ap_wbEraser') + ' (E)')),
        el('div', { class: 'ap-wbgrp ap-wbcolors' }, ...COLORS.map((c) => el('button', { type: 'button', class: 'swatch' + (W.color === c ? ' on' : ''), style: { background: c }, 'aria-pressed': String(W.color === c), 'aria-label': t('ap_wbColor', { c }), title: t('ap_wbColor', { c }), onclick: () => applyColor(c) })),
          A.select([[2, '2'], [4, '4'], [8, '8'], [14, '14'], [24, '24']], W.width, (v) => { W.width = Number(v); }, t('ap_wbSize'))),
        el('div', { class: 'ap-wbgrp' },
          el('button', { type: 'button', class: 'ap-wbt' + (W.tool === 'shape' ? ' on' : ''), 'aria-pressed': String(W.tool === 'shape'), 'aria-haspopup': 'menu', 'aria-label': t('ap_wbShapes'), title: t('ap_wbShapes'), onclick: (e) => LC.menu(e.currentTarget, [...SHAPES.map(([k, icon, l]) => ({ icon, label: t(l), checked: W.tool === 'shape' && W.shape === k, fn: () => { W.tool = 'shape'; W.shape = k; drawBar(); } })), 'sep', { label: t('ap_wbNoFill'), checked: W.fill === 'none', fn: () => { W.fill = 'none'; } }, { label: t('ap_wbFill'), checked: W.fill !== 'none', fn: () => { W.fill = W.color === '#242424' ? '#deecf9' : W.color; } }]) }, LC.icon(shapeIcon)),
          tb('text', 'text_t', t('ap_wbText') + ' (T)'),
          el('button', { type: 'button', class: 'ap-wbt ap-wbstk' + (W.tool === 'sticky' ? ' on' : ''), 'aria-pressed': String(W.tool === 'sticky'), 'aria-label': t('ap_wbSticky') + ' (N)', title: t('ap_wbSticky'), onclick: () => { W.tool = 'sticky'; drawBar(); }, oncontextmenu: (e) => { e.preventDefault(); stickyMenu(e.currentTarget); } }, el('span', { class: 'ap-stkic', style: { background: W.sticky } }, LC.icon('note'))),
          LC.ibtn('chevron_down', t('ap_wbStickyColor'), (e) => stickyMenu(e.currentTarget), { cls: 'icon ap-wbmini', menu: true }),
          el('button', { type: 'button', class: 'ap-wbt', 'aria-label': t('ap_wbImage'), title: t('ap_wbImage'), onclick: () => fileIn.click() }, LC.icon('image_add')), fileIn,
          el('button', { type: 'button', class: 'secondary sm withicon', 'aria-haspopup': 'menu', onclick: (e) => LC.menu(e.currentTarget, Object.keys(TEMPLATES).map((k) => ({ icon: 'board', label: t('ap_tpl_' + k), fn: () => insertTemplate(k) }))) }, LC.icon('board'), el('span', { text: t('ap_wbTemplates') }))),
        el('div', { class: 'ap-wbgrp' }, LC.ibtn('arrow_undo', t('ap_wbUndo') + ' (Ctrl+Z)', undo, { disabled: !W.undo.length }), LC.ibtn('arrow_redo', t('ap_wbRedo') + ' (Ctrl+Y)', redo, { disabled: !W.redo.length })),
        el('span', { class: 'grow' }), selBar, exportBtn(),
        LC.ibtn('broom', t('ap_wbClear'), async () => { if (await LC.confirm(t('confirmClearBoard'), { danger: true })) { await LC.api('/api/board/clear', { chan }).catch(A.fail); } }));
      drawSelBar();
    }
    const stickyMenu = (anchor) => LC.menu(anchor, STICKY.map((c, i) => ({ icon: el('span', { class: 'ap-stkdot', style: { background: c } }), label: t('ap_wbSticky') + ' ' + (i + 1), checked: W.sticky === c, fn: () => { W.sticky = c; W.tool = 'sticky'; const sel = W.objs.filter((o) => W.sel.has(o.id) && o.t === 'sticky'); if (sel.length) updObjs(sel.map((o) => JSON.parse(JSON.stringify(o))), sel.map((o) => ({ ...JSON.parse(JSON.stringify(o)), f: c }))); drawBar(); } })));
    const exportBtn = () => LC.ibtn('arrow_download', t('ap_wbExport') + '…', (e) => LC.menu(e.currentTarget, [{ icon: 'image', label: t('ap_wbPng'), fn: () => exportAs('png') }, { icon: 'document_pdf', label: t('ap_wbPdf'), fn: () => exportAs('pdf') }]), { menu: true });
    function drawSelBar() {
      const sel = W.objs.filter((o) => W.sel.has(o.id));
      selBar.replaceChildren(...(sel.length && can() ? [LC.ibtn('copy_select', t('ap_wbDup'), () => { const copies = sel.map((o) => ({ ...moved(o, 24, 24), id: nid(), by: S.me.id })); addObjs(copies); W.sel = new Set(copies.map((o) => o.id)); drawSelBar(); redraw(); }),
        LC.ibtn('arrow_up', t('ap_wbFront'), () => { const ids = sel.map((o) => o.id); W.objs = [...W.objs.filter((o) => !W.sel.has(o.id)), ...sel]; redraw(); post({ op: 'front', ids }); }),
        LC.ibtn('arrow_down', t('ap_wbBack'), () => { const ids = sel.map((o) => o.id); W.objs = [...sel, ...W.objs.filter((o) => !W.sel.has(o.id))]; redraw(); post({ op: 'back', ids }); }),
        LC.ibtn('delete', t('ap_wbDelSel'), () => { delObjs(sel); drawSelBar(); })] : []));
    }
    function insertTemplate(k) { const [cx, cy] = toWorld(cw / 2, ch / 2), list = TEMPLATES[k](Math.round(cx), Math.round(cy)).map((o) => ({ ...o, id: nid(), by: S.me.id })); addObjs(list); W.sel = new Set(list.map((o) => o.id)); W.tool = 'select'; drawBar(); fit(false); }
    async function exportAs(kind) {
      const list = W.objs, r0 = union(list.filter((o) => o.c !== 'erase')) || { x: 0, y: 0, w: 1000, h: 700 }, m = 40, r = { x: r0.x - m, y: r0.y - m, w: r0.w + 2 * m, h: r0.h + 2 * m };
      const k = Math.min(3, 4000 / Math.max(r.w, r.h)), o = document.createElement('canvas'); o.width = Math.max(1, Math.round(r.w * k)); o.height = Math.max(1, Math.round(r.h * k));
      const layer = document.createElement('canvas'); layer.width = o.width; layer.height = o.height; const lg = layer.getContext('2d'); lg.setTransform(k, 0, 0, k, -r.x * k, -r.y * k); for (const x of list) paintObj(lg, x);
      const og = o.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, o.width, o.height); og.drawImage(layer, 0, 0);
      const name = (A.chatTitle(chan) + ' whiteboard').replace(/[\\/:*?"<>|#]+/g, '_');
      if (kind === 'png') return o.toBlob((b) => b && A.download(b, name + '.png'), 'image/png');
      LC.toast(t('ap_wbSaving'), { ms: 1500 });
      o.toBlob(async (b) => { if (!b) return; const jpeg = new Uint8Array(await b.arrayBuffer()); A.download(A.pdfFromJpeg(jpeg, o.width, o.height), name + '.pdf'); }, 'image/jpeg', 0.92);
    }
    drawBar(); reload(); requestAnimationFrame(resize);
    return api;
  }
  A.mountBoard = mount;
  // the chat tab; the calls area puts the same view on the meeting stage (LC.ext.tabs key 'board', render(host, chan))
  A.tab({ key: 'board', icon: 'whiteboard', label: () => t('tabBoard'), desc: () => t('ap_wbDesc'), order: 25, render: (host, chan) => { mount(host, chan); } });
  A.app({ key: 'ap_board', icon: 'whiteboard', color: '#ca5010', name: () => t('ap_wb'), desc: () => t('ap_wbDesc'), tab: 'board' });
})();
