'use strict';
// Calls area: recording. The recorder's app draws the stage (the shared screen or whiteboard, otherwise everyone's video in a
// grid with names) onto a canvas, mixes all audio with WebAudio and records it with MediaRecorder. Long recordings are split
// into parts (every 30 minutes, or sooner near the upload size limit) so memory stays bounded; each part is uploaded and
// posted in the call's chat as a recording message (m.recording = true, the video in m.files). Everyone sees a notice.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), X = LC._cx; if (!X) return;
  LC.addStrings('en', {
    cl_startRec: 'Start recording', cl_stopRec: 'Stop recording', cl_recSaving: 'Saving the recording…', cl_recSaved: 'The recording is in the chat', cl_recFailed: 'Could not save the recording ({why}). Download it instead?',
    cl_download: 'Download', cl_recUnsupported: 'This browser can’t record meetings.', cl_recPdf: 'Presenting {name} · page {n}', cl_recBoard: 'Whiteboard',
  });
  LC.addStrings('hi', { cl_startRec: 'रिकॉर्डिंग शुरू करें', cl_stopRec: 'रिकॉर्डिंग रोकें' });
  LC.addStrings('es', { cl_startRec: 'Iniciar grabación', cl_stopRec: 'Detener grabación' });
  const PART_MS = 30 * 60000, W = 1280, H = 720;
  const budget = () => Math.max(5, Number(S.settings.maxUploadMB || 100) * 0.9) * 1048576; // stay under the session's upload limit
  let rec = null, pending = 0, autoTried = '', starting = false;
  const mayRecord = (st) => { const p = st.recPolicy || 'everyone'; return p === 'everyone' || (p === 'organizers' && X.isOrg()); };

  async function start() {
    const c = X.call; if (!c || rec) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return LC.toast(t('cl_recUnsupported'));
    starting = true; try { await LC.api('/api/call/record', { chan: c.chan, ep: c.ep, on: true }); } catch (e) { starting = false; return LC.toast(e.message); }
    starting = false; if (X.call === c) begin(c);
  }
  function begin(c) {
    const cv = el('canvas', { width: W, height: H }), ac = new (window.AudioContext || window.webkitAudioContext)(), dest = ac.createMediaStreamDestination(), hold = el('div', { class: 'hidden', 'aria-hidden': 'true' });
    document.body.append(hold); ac.resume().catch(() => {});
    rec = { chan: c.chan, callId: c.id, cv, g: cv.getContext('2d'), ac, dest, sources: new Map(), vids: new Map(), hold, part: 0, startedAt: Date.now(), cur: null };
    rec.stopTick = X.ticker(66, () => { try { syncAudio(); draw(); } catch (e) { console.error('recording frame', e); } });
    nextPart(); X.drawSoon();
  }
  // every voice once: your microphone (silent while muted), everyone else, computer sound from a share
  function syncAudio() {
    const c = X.call; if (!c || !rec) return; const want = new Map(), mic = c.mixed ? c.mixed.track : c.local.getAudioTracks()[0];
    if (mic) want.set('me:' + mic.id, mic);
    for (const p of c.peers.values()) { const a = p.aud && p.aud.getAudioTracks()[0]; if (a) want.set(p.ep + ':' + a.id, a); }
    for (const [k, s] of rec.sources) if (!want.has(k)) { try { s.disconnect(); } catch {} rec.sources.delete(k); }
    for (const [k, tr] of want) if (!rec.sources.has(k)) { try { const s = rec.ac.createMediaStreamSource(new MediaStream([tr])); s.connect(rec.dest); rec.sources.set(k, s); } catch {} }
  }
  // hidden players of their own, so recording keeps going whatever the meeting window shows (or when it is minimized)
  function vid(key, stream) {
    let v = rec.vids.get(key); const tr = stream && stream.getVideoTracks()[0];
    if (!tr) { if (v) { v.remove(); rec.vids.delete(key); } return null; }
    if (!v) { v = el('video', { muted: true, playsinline: true, autoplay: true }); v.muted = true; rec.hold.append(v); rec.vids.set(key, v); }
    if (!v.srcObject || v.srcObject.getVideoTracks()[0] !== tr) { v.srcObject = new MediaStream([tr]); v.play().catch(() => {}); }
    return v.videoWidth ? v : null;
  }
  const fit = (g, src, x, y, w, h, cover) => { const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height; if (!sw || !sh) return; const s = cover ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh), dw = sw * s, dh = sh * s; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); g.restore(); };
  function label(g, text, x, y) { g.font = '600 16px system-ui,sans-serif'; const w = g.measureText(text).width + 16; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x, y - 24, w, 24); g.fillStyle = '#fff'; g.fillText(text, x + 8, y - 7); }
  function person(g, ep, x, y, w, h) {
    const c = X.call, uid = X.uidOf(ep), u = S.users.get(uid) || { name: '?', color: '#888' }, md = X.mediaOfEp(ep) || {}, p = c.peers.get(ep);
    const stream = ep === c.ep ? (c.me.cam ? new MediaStream([c.camOut || c.local.getVideoTracks()[0]].filter(Boolean)) : null) : p && md.cam !== false ? p.cam : null, v = stream ? vid(ep, stream) : (vid(ep, null), null);
    g.fillStyle = '#3d3d3d'; g.fillRect(x, y, w, h);
    if (v) fit(g, v, x, y, w, h, true);
    else { const r = Math.min(w, h) * 0.22; g.fillStyle = u.color || '#6264a7'; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `600 ${Math.round(r)}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((u.name.trim()[0] || '?').toUpperCase(), x + w / 2, y + h / 2); g.textAlign = 'start'; g.textBaseline = 'alphabetic'; }
    if (c.tiles.get(ep) && c.tiles.get(ep).classList.contains('speaking')) { g.strokeStyle = '#7f85f5'; g.lineWidth = 4; g.strokeRect(x + 2, y + 2, w - 4, h - 4); }
    label(g, (ep === c.ep ? S.me.name : LC.uname(uid)) + (md.mic === false ? ' 🔇' : ''), x + 8, y + h - 8);
  }
  function draw() {
    const c = X.call; if (!c || !rec) return; const { g } = rec, st = X.state(), content = X.contentOf(st), eps = X.order().filter((ep) => !LC.ui.clHideSelf || ep !== c.ep || true);
    g.fillStyle = '#1f1f1f'; g.fillRect(0, 0, W, H);
    if (content) {
      const side = 260, cw = W - side - 16;
      if (content.kind === 'screen') { const v = content.mine ? vid('screen', c.screen ? new MediaStream([c.scrOut || c.screen.getVideoTracks()[0]]) : null) : vid('screen', (([...c.peers.values()].find((p) => p.uid === content.sharer && p.screen) || {}).screen) || null); if (v) fit(g, v, 8, 8, cw, H - 16, false); }
      else if (content.kind === 'board') { const b = [...document.querySelectorAll('#callUI .cl-boardhost canvas')].sort((a, z) => z.width * z.height - a.width * a.height)[0]; g.fillStyle = '#fff'; g.fillRect(8, 8, cw, H - 16); if (b) fit(g, b, 8, 8, cw, H - 16, false); else label(g, t('cl_recBoard'), 24, 48); }
      else if (content.kind === 'pdf') { g.fillStyle = '#2b2b2b'; g.fillRect(8, 8, cw, H - 16); g.fillStyle = '#fff'; g.font = '600 26px system-ui,sans-serif'; g.fillText(t('cl_recPdf', { name: (content.share.file || {}).name || 'PDF', n: content.share.page || 1 }), 40, H / 2); }
      const strip = eps.slice(0, 4), th = Math.min(160, (H - 16 - (strip.length - 1) * 8) / Math.max(1, strip.length)); strip.forEach((ep, i) => person(g, ep, W - side - 8 + 16, 8 + i * (th + 8), side - 8, th));
    } else {
      const shown = eps.slice(0, 9), n = shown.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols) || 1, gw = (W - 8 * (cols + 1)) / cols, gh = (H - 8 * (rows + 1)) / rows;
      shown.forEach((ep, i) => person(g, ep, 8 + (i % cols) * (gw + 8), 8 + Math.floor(i / cols) * (gh + 8), gw, gh));
    }
    for (const [k] of rec.vids) if (k !== 'screen' && !eps.includes(k)) vid(k, null);
  }
  function nextPart() {
    const mt = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].find((x) => MediaRecorder.isTypeSupported(x));
    const stream = new MediaStream([rec.cv.captureStream(15).getVideoTracks()[0], rec.dest.stream.getAudioTracks()[0]]), r = rec;
    const mr = new MediaRecorder(stream, { ...(mt ? { mimeType: mt } : {}), videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 });
    const part = { n: ++r.part, chunks: [], bytes: 0, t0: Date.now(), mr, type: mr.mimeType || mt || 'video/webm' };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) { part.chunks.push(e.data); part.bytes += e.data.size; if (rec === r && r.cur === part && (part.bytes > budget() || Date.now() - part.t0 > PART_MS)) rotate(); } };
    mr.onstop = () => { stream.getVideoTracks().forEach((x) => x.stop()); part.t1 = Date.now(); upload(part, r); };
    mr.start(2000); r.cur = part;
  }
  function rotate() { const old = rec.cur; nextPart(); try { old.mr.stop(); } catch {} }
  async function upload(part, r) {
    if (!part.chunks.length) return; const blob = new Blob(part.chunks, { type: part.type }), ext = /mp4/.test(part.type) ? 'mp4' : 'webm', d = new Date(r.startedAt), pad = (n) => String(n).padStart(2, '0');
    const name = `Meeting recording ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}${r.part > 1 || part.n > 1 ? ' part ' + part.n : ''}.${ext}`;
    pending++; X.drawSoon();
    try { const up = await LC.upload(blob, name).promise; await LC.api('/api/call/recpost', { chan: r.chan, file: up.id, part: part.n, dur: Math.round((part.t1 - part.t0) / 1000), start: part.t0 + (S.serverSkew || 0), call: r.callId }); LC.toast(t('cl_recSaved'), { ms: 3000 }); }
    catch (e) { const url = URL.createObjectURL(blob); LC.toast(t('cl_recFailed', { why: e.message }), { ms: 60000, action: { label: t('cl_download'), fn: () => { const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); } } }); }
    finally { pending--; X.drawSoon(); }
  }
  function stop(silent) {
    if (!rec) return; const r = rec; rec = null; r.stopTick();
    try { if (r.cur.mr.state !== 'inactive') r.cur.mr.stop(); } catch {}
    setTimeout(() => { try { r.ac.close(); } catch {} r.hold.remove(); }, 2500);
    const c = X.call; if (!silent && c) LC.api('/api/call/record', { chan: r.chan, ep: c.ep, on: false }).catch(() => {});
    X.drawSoon();
  }
  LC.callRecorder = { start, stop: () => stop(false), active: () => !!rec };

  X.moreItems.push((st) => {
    if (rec) return [{ icon: 'record_stop', label: t('cl_stopRec'), fn: () => stop(false) }];
    if (st.rec && st.rec.by !== S.me.id) return X.isOrg() ? [{ icon: 'record_stop', label: t('cl_stopRec'), fn: () => LC.api('/api/call/record', { chan: X.call.chan, ep: X.call.ep, on: false }).catch((e) => LC.toast(e.message)) }] : [];
    return mayRecord(st) ? [{ icon: 'record', label: t('cl_startRec'), fn: start }] : [];
  });
  X.banners.push(() => (pending ? el('div', { class: 'cl-banner', role: 'status' }, LC.icon('record'), el('span', { text: t('cl_recSaving') })) : null));
  X.onCmd.push((c) => { if (c.action === 'stoprec') stop(true); });
  X.onEnd.push(() => stop(true));
  X.onState.push((st) => {
    const c = X.call; if (!c) return;
    if (st.rec && st.rec.by === S.me.id && !rec && !starting && Date.now() - c.joinedAt > 3000) LC.api('/api/call/record', { chan: c.chan, ep: c.ep, on: false }).catch(() => {}); // the app reloaded while recording
    if (!st.rec && rec && Date.now() - rec.startedAt > 4000) stop(true);
    // record automatically: the meeting option, or "Record my meetings automatically" for calls you organize
    const auto = st.autoRec || (LC.callPrefs && LC.callPrefs().autoRecord && X.isOrg() && st.participants.length > 1);
    if (auto && !st.rec && !rec && X.isOrg() && mayRecord(st) && autoTried !== c.id + c.chan) { autoTried = c.id + c.chan; setTimeout(() => { const s2 = X.state(); if (X.call && !s2.rec && !rec) start(); }, 1200); }
  });
})();
