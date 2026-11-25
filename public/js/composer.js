'use strict';
// Message composer (used by the main chat and the thread panel), emoji picker, uploads, recorders, outbox.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), $ = LC.$;
  LC.composers = {};

  // ---------- emoji picker: LC.openPicker lives in chatux-emoji.js (search, skin tones, stickers, My GIFs) ----------
  LC.ext.composerSetup = LC.ext.composerSetup || []; // (composer) => void : chatux compose features (format box, subject, priority…)

  // ---------- uploads ----------
  LC.upload = (blob, name, onProgress) => {
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.open('POST', '/api/upload?name=' + encodeURIComponent(name)); xhr.setRequestHeader('x-token', S.token);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => { let d = {}; try { d = JSON.parse(xhr.responseText); } catch {} xhr.status === 200 ? resolve(d) : reject(new Error(d.error || t('uploadFailed'))); };
      xhr.onerror = () => reject(new Error(t('offlineErr'))); xhr.onabort = () => reject(Object.assign(new Error('aborted'), { aborted: true }));
      xhr.send(blob);
    });
    return { promise, abort: () => xhr.abort() };
  };
  function compressImage(file) {
    return new Promise((resolve) => {
      if (!LC.ui.compress || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5e6) return resolve(file);
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url); const k = Math.min(1, 2048 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => resolve(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); }; img.src = url;
    });
  }
  async function readEntries(items) { // dropped folders -> zip
    const files = []; let total = 0;
    const walk = async (entry, prefix) => {
      if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); total += f.size; if (total > 200e6) throw new Error(t('folderTooBig')); files.push({ name: prefix + entry.name, data: new Uint8Array(await f.arrayBuffer()) }); }
      else if (entry.isDirectory) { const rd = entry.createReader(); let batch; do { batch = await new Promise((res, rej) => rd.readEntries(res, rej)); for (const e of batch) await walk(e, prefix + entry.name + '/'); } while (batch.length); }
    };
    let rootName = 'folder'; for (const it of items) { const e = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (e && e.isDirectory) { rootName = e.name; await walk(e, ''); } }
    return { name: rootName + '.zip', blob: LC.zip(files) };
  }
  LC.canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  // ---------- outbox (messages that could not be sent while offline) ----------
  LC.outboxAdd = (body) => { S.outbox.push({ tmp: Math.random().toString(36).slice(2), body, ts: Date.now() }); LC.ls.set('lc_outbox', S.outbox); LC.renderOutbox && LC.renderOutbox(); };
  let flushing = false;
  LC.outboxFlush = async () => {
    if (flushing || !S.token) return; flushing = true;
    try {
      for (const item of [...S.outbox]) {
        try { await LC.api('/api/send', item.body); S.outbox = S.outbox.filter((x) => x !== item); }
        catch (e) { if (e.offline) break; S.outbox = S.outbox.filter((x) => x !== item); LC.toast(t('outboxDropped', { why: e.message })); }
      }
      LC.ls.set('lc_outbox', S.outbox); LC.renderOutbox && LC.renderOutbox();
    } finally { flushing = false; }
  };
  window.addEventListener('online', () => { if (S.outbox.length) LC.outboxFlush(); });
  setInterval(() => { if (S.outbox.length) LC.outboxFlush(); }, 8000);
  S.outbox = LC.ls.get('lc_outbox', []);
  LC.on('init', () => { if (S.outbox.length) LC.outboxFlush(); });

  // ---------- composer ----------
  LC.makeComposer = (cfg) => {
    const key = () => 'lc_draft:' + cfg.chan() + ':' + (cfg.thread() || '');
    let files = [], replyTo = null, editing = null, ttlChoice, recorder = null, acItems = [], acIdx = 0, lastTyping = 0, busy = false;
    const api = {}; // filled in below; handed to extensions (LC.ext.composer*)
    const ta = el('textarea', { rows: 1, maxlength: 8000, placeholder: cfg.compact ? t('replyPlaceholder') : t('typeMessage'), 'aria-label': t('typeMessage'), spellcheck: 'true', autocapitalize: 'sentences' });
    const refreshHooks = [], sentHooks = [];
    const chips = el('div', { class: 'chips' }), ctx = el('div', { class: 'ctx hidden' }), notice = el('div', { class: 'notice hidden' }), recbar = el('div', { class: 'recbar hidden' }), ac = el('div', { class: 'ac hidden', role: 'listbox' });
    const fileIn = el('input', { type: 'file', multiple: true, class: 'hidden', onchange: (e) => { addFiles([...e.target.files]); e.target.value = ''; } });
    const sendBtn = el('button', { class: 'send', title: t('send'), 'aria-label': t('send'), onclick: () => send() }, LC.icon('send', { filled: true }));
    const ttlDot = el('span', { class: 'ttldot hidden' }, LC.icon('timer'));
    const btn = (icon, title, fn, cls = '') => el('button', { class: 'icon ' + cls, title, 'aria-label': title, type: 'button', onclick: fn }, LC.icon(icon));
    const micBtn = btn('mic', t('voiceNote'), () => toggleVoice(), 'mic'), emojiBtn = btn('emoji', t('emoji'), (e) => LC.openPicker(e.currentTarget, (em) => insert(em), { stickers: !cfg.compact, composer: api }), 'emojibtn');
    const moreBtn = btn('more_horizontal', t('moreOptions'), (e) => moreMenu(e.currentTarget), 'morebtn'); moreBtn.append(ttlDot);
    const row = el('div', { class: 'row' }, ta, el('div', { class: 'ctools' }, emojiBtn, btn('attach', t('attach'), (e) => attachMenu(e.currentTarget), 'attachbtn'), micBtn, moreBtn, el('span', { class: 'csep', 'aria-hidden': 'true' }), sendBtn));
    const banner = el('div', { class: 'cbanner hidden' }); // LC.ext.composerBanner: e.g. "Ana is out of office"
    const root = el('div', { class: 'composer' + (cfg.compact ? ' compact' : ''), 'data-composer': cfg.compact ? 'thread' : 'main' }, banner, notice, ctx, chips, recbar, row, ac, fileIn);
    const renderBanner = () => { const chan = cfg.chan(); const nodes = chan && S.me ? LC.extItems(LC.ext.composerBanner, chan, api).filter((n) => n && n.nodeType) : []; banner.replaceChildren(...nodes); banner.classList.toggle('hidden', !nodes.length); };

    const autosize = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    const insert = (s) => { ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end'); ta.focus(); autosize(); saveDraft(); };
    const saveDraft = LC.debounce(() => { if (editing) return; const v = ta.value; if (v) LC.ls.set(key(), v); else LC.ls.del(key()); LC.emitLocal('cx:draft', { chan: cfg.chan() }); }, 300);
    const renderCtx = () => {
      ctx.replaceChildren();
      if (editing) ctx.append(el('span', {}, LC.icon('edit'), ' ' + t('editingMsg')), LC.ibtn('dismiss', t('cancel'), cancelCtx));
      else if (replyTo) ctx.append(el('span', {}, LC.icon('arrow_reply'), ' ' + t('replyingTo') + ' ', el('b', { text: LC.uname(replyTo.from) }), el('span', { class: 'muted', text: ' — ' + LC.snippet(replyTo).slice(0, 60) })), LC.ibtn('dismiss', t('cancel'), cancelCtx));
      ctx.classList.toggle('hidden', !editing && !replyTo);
    };
    const cancelCtx = () => { if (editing) { ta.value = LC.ls.get(key(), ''); } editing = null; replyTo = null; renderCtx(); autosize(); };
    const renderChips = () => {
      chips.replaceChildren(...files.map((f) => el('div', { class: 'chip' + (f.status === 'error' ? ' err' : '') }, f.status === 'error' ? LC.icon('warning') : f.status === 'done' ? LC.icon('checkmark_circle', { filled: true, cls: 'ok' }) : LC.icon('document'), el('span', { class: 'cn', text: f.name + ' · ' + LC.fmtSize(f.size) }), f.status === 'uploading' ? el('span', { class: 'progress', role: 'progressbar', 'aria-valuenow': Math.round(f.pct * 100) }, el('i', { style: { width: Math.round(f.pct * 100) + '%' } })) : null, f.status === 'error' ? el('span', { class: 'small', text: f.err }) : null, LC.ibtn('dismiss', t('remove'), () => { if (f.up) f.up.abort(); files = files.filter((x) => x !== f); renderChips(); update(); }))));
      chips.classList.toggle('hidden', !files.length);
    };
    const uploading = () => files.some((f) => f.status === 'uploading');
    const update = () => { const can = !busy && !uploading() && (ta.value.trim() || files.some((f) => f.status === 'done')); sendBtn.disabled = !can; sendBtn.classList.toggle('ready', !!can); };
    const guard = () => { // muted / read-only
      if (!S.me || !cfg.chan()) return true;
      const c = S.channels.get(cfg.chan()); let msg = '';
      if (S.me.mutedUntil > Date.now()) msg = t('youAreMuted'); else if (c && c.readonly && !LC.isAdmin()) msg = t('readonlyNotice');
      else if (cfg.chan().startsWith('dm:') && (S.users.get(LC.peerOf(cfg.chan())) || {}).removed) msg = t('personGone');
      notice.textContent = msg; notice.classList.toggle('hidden', !msg); row.classList.toggle('disabled', !!msg); ta.disabled = !!msg; return !msg;
    };

    async function addFiles(list) {
      if (!guard()) return;
      for (const raw of list) {
        if (files.length >= 10) { LC.toast(t('maxFiles')); break; }
        if (S.settings.maxUploadMB && raw.size > S.settings.maxUploadMB * 1048576) { LC.toast(t('fileTooBig', { n: S.settings.maxUploadMB, name: raw.name })); continue; }
        const entry = { name: raw.name || 'file', size: raw.size, pct: 0, status: 'uploading' }; files.push(entry); renderChips(); update();
        compressImage(raw).then((file) => {
          entry.name = file.name || entry.name; entry.size = file.size; entry.up = LC.upload(file, entry.name, (p) => { entry.pct = p; renderChips(); });
          return entry.up.promise;
        }).then((d) => { Object.assign(entry, { id: d.id, name: d.name, size: d.size, status: 'done' }); }).catch((e) => { if (e.aborted) return; entry.status = 'error'; entry.err = e.message; }).finally(() => { renderChips(); update(); if (entry.autoSend && entry.status === 'done') send(); });
      }
    }
    async function addDropped(dt) {
      const items = [...(dt.items || [])]; const hasDir = items.some((i) => { const e = i.webkitGetAsEntry && i.webkitGetAsEntry(); return e && e.isDirectory; });
      if (hasDir) { try { LC.toast(t('zipping')); const z = await readEntries(items); addFiles([new File([z.blob], z.name, { type: 'application/zip' })]); } catch (e) { LC.toast(e.message); } }
      else addFiles([...dt.files]);
    }

    // ----- sending -----
    async function send(o = {}) {
      if (busy || !guard()) return; const text = o.force ? (o.text || '') : ta.value;
      if (editing) {
        if (!text.trim() && !(editing.files || []).length) return; const id = editing.id; busy = true;
        try { await LC.api('/api/edit', { id, text }); editing = null; ta.value = LC.ls.get(key(), ''); renderCtx(); autosize(); } catch (e) { LC.toast(e.message); } busy = false; update(); return;
      }
      if (!o.force && LC.isCommand && LC.isCommand(text)) { ta.value = ''; LC.ls.del(key()); autosize(); update(); closeAc(); LC.runCommand(text); return; } // /away, /goto …
      const done = files.filter((f) => f.status === 'done');
      if (!text.trim() && !done.length && !o.poll && !o.game && !o.extra) return; if (uploading() && !o.force) return;
      const body = { chan: cfg.chan(), text, files: (o.extra ? [] : done).map(({ id, name, size }) => ({ id, name, size })), replyTo: replyTo ? replyTo.id : undefined, thread: cfg.thread() || undefined, ttl: ttlChoice, sendAt: o.sendAt, poll: o.poll, game: o.game, ...(o.extra || {}) };
      for (const f of LC.ext.beforeSend) { try { f(body, api, o); } catch (e) { console.error('beforeSend', e); } }
      busy = true; update();
      const snapshot = { text: ta.value, files: [...files], replyTo };
      if (!o.force) { ta.value = ''; files = []; replyTo = null; renderChips(); renderCtx(); autosize(); LC.ls.del(key()); }
      try {
        const r = await LC.api('/api/send', body);
        if (r.scheduled) LC.toast(t('scheduledFor', { when: LC.fmtDateTime(r.scheduled.sendAt) }), { action: { label: t('view'), fn: () => LC.scheduledList() } });
        ttlChoice = undefined; refreshTtl(); for (const f of sentHooks) { try { f(body, o); } catch (x) { console.error('composer sent hook', x); } }
      } catch (e) {
        if (e.offline) { LC.outboxAdd(body); LC.toast(t('queuedOffline')); for (const f of sentHooks) { try { f(body, o); } catch {} } }
        else { LC.toast(e.message); if (!o.force) { ta.value = snapshot.text; files = snapshot.files; replyTo = snapshot.replyTo; renderChips(); renderCtx(); autosize(); } }
      }
      busy = false; update(); if (!cfg.noFocus) ta.focus();
    }

    // ----- autocomplete (@mentions, :custom emoji:) -----
    function audienceUsers() {
      const chan = cfg.chan(), c = S.channels.get(chan);
      return [...S.users.values()].filter((u) => !u.removed && u.id !== S.me.id && (chan.startsWith('dm:') ? u.id === LC.peerOf(chan) : !c || !c.members || c.members.includes(u.id)));
    }
    function closeAc() { ac.classList.add('hidden'); acItems = []; }
    function updateAc() {
      const pos = ta.selectionStart, before = ta.value.slice(0, pos); let m;
      if (!editing && LC.commandList && (m = /^\/([\w-]{0,20})$/.exec(before)) && ta.value.indexOf('\n') < 0) return showAc(LC.commandList(m[1]).slice(0, 12).map((c) => ({ label: c.name + (c.args ? ' ' + c.args : ''), sub: c.help, icon: 'slash_forward', ins: c.name + ' ', cmd: c.name, args: !!c.args })), 0);
      if ((m = /(^|\s)@([^\s@]{0,24})$/.exec(before))) {
        const q = m[2].toLowerCase(), list = audienceUsers().filter((u) => u.name.toLowerCase().startsWith(q) || u.name.toLowerCase().split(' ').some((w) => w.startsWith(q))).slice(0, 6).map((u) => ({ label: u.name, av: u, ins: '@' + u.name + ' ' }));
        if (!cfg.chan().startsWith('dm:') && (LC.isAdmin() || S.settings.membersCanEveryone)) for (const k of ['everyone', 'here']) if (k.startsWith(q)) list.push({ label: '@' + k, ins: '@' + k + ' ' });
        for (const it of LC.extItems(LC.ext.mentionSources, q, cfg.chan())) if (list.length < 10) list.push({ label: it.label, ins: it.insert, icon: it.icon });
        return showAc(list, pos - m[2].length - 1);
      }
      if ((m = /(^|\s):([a-z0-9_]{2,20})$/.exec(before))) { const q = m[2].toLowerCase(); return showAc(Object.keys(S.emojis).filter((n) => n.startsWith(q)).slice(0, 6).map((n) => ({ label: ':' + n + ':', img: S.emojis[n], ins: ':' + n + ': ' })), pos - m[2].length - 1); }
      closeAc();
    }
    function showAc(list, start) {
      if (!list.length) return closeAc(); clearTimeout(ac._t); acItems = list; acIdx = 0; ac._start = start;
      ac.replaceChildren(...list.map((it, i) => el('button', { role: 'option', class: i === 0 ? 'on' : '', 'aria-selected': String(i === 0), onmousedown: (e) => { e.preventDefault(); pickAc(i); } }, it.av ? LC.avatar(it.av, 'sm', false) : it.img ? el('img', { class: 'cemoji', src: LC.fileUrl({ id: it.img, name: 'e.png' }, true), alt: '' }) : it.icon ? LC.icon(it.icon) : null, el('span', { text: it.label }), it.sub ? el('small', { class: 'muted cx-acsub', text: it.sub }) : null)));
      ac.classList.remove('hidden');
    }
    function pickAc(i) {
      const it = acItems[i]; if (!it) return;
      if (it.cmd && !it.args) { ta.value = ''; closeAc(); autosize(); saveDraft(); update(); LC.runCommand(it.cmd); return; } // commands without a name to type run at once
      ta.setRangeText(it.ins, ac._start, ta.selectionStart, 'end'); closeAc(); autosize(); saveDraft(); update(); ta.focus();
    }

    ta.addEventListener('input', () => {
      autosize(); saveDraft(); update(); updateAc();
      if (ta.value && !editing && Date.now() - lastTyping > 2500) { lastTyping = Date.now(); LC.api('/api/typing', { chan: cfg.chan(), thread: cfg.thread() || undefined }).catch(() => {}); }
    });
    ta.addEventListener('keydown', (e) => {
      if (!ac.classList.contains('hidden') && acItems.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + acItems.length) % acItems.length; [...ac.children].forEach((c, i) => { c.classList.toggle('on', i === acIdx); c.setAttribute('aria-selected', String(i === acIdx)); }); e.preventDefault(); return; }
        if (e.key === 'Enter' || e.key === 'Tab') { pickAc(acIdx); e.preventDefault(); return; } if (e.key === 'Escape') { closeAc(); e.preventDefault(); return; }
      }
      if (e.key === 'Enter' && !e.isComposing) {
        const expanded = root.classList.contains('cx-expanded'), ctrlMode = LC.prefs().sendKey === 'ctrl', coarse = matchMedia('(pointer:coarse)').matches;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); send(); return; }
        if (!e.shiftKey && !expanded && !ctrlMode && !coarse) { e.preventDefault(); send(); return; }
        if (LC.continueList && LC.continueList(ta)) { e.preventDefault(); autosize(); saveDraft(); update(); } // a new line in a list starts the next item
        return;
      }
      if (e.key === 'Escape' && (editing || replyTo)) { cancelCtx(); }
      else if (e.key === 'ArrowUp' && !ta.value && !cfg.compact) { const w = S.win[cfg.chan()]; const mine = w && [...w.msgs].reverse().find((m) => m.from === S.me.id && !m.deleted && m.text && !m.poll && !m.game); if (mine) { edit(mine); e.preventDefault(); } }
    });
    let acTimer; ta.addEventListener('blur', () => { clearTimeout(acTimer); acTimer = setTimeout(closeAc, 150); }); ta.addEventListener('focus', () => clearTimeout(acTimer));
    ta.addEventListener('paste', (e) => { const fl = [...((e.clipboardData && e.clipboardData.files) || [])]; if (fl.length) { e.preventDefault(); addFiles(fl); } });

    // ----- menus & creators -----
    function attachMenu(anchor) {
      LC.menu(anchor, [{ icon: 'document', label: t('attachFiles'), fn: () => fileIn.click() }, { icon: 'image', label: t('attachPhoto'), fn: () => { fileIn.accept = 'image/*,video/*'; fileIn.click(); fileIn.accept = ''; } }, { icon: 'desktop', label: t('recordScreen'), fn: () => recordClip('screen') }, { icon: 'camera', label: t('recordCamera'), fn: () => recordClip('camera') }, ...LC.extItems(LC.ext.attachMenu, api)]);
    }
    function moreMenu(anchor) {
      const ttls = [[undefined, t('ttlDefault')], [0, t('ttlOff')], [60, t('ttl1m')], [3600, t('ttl1h')], [86400, t('ttl1d')], [604800, t('ttl1w')]];
      LC.menu(anchor, [
        !cfg.compact ? { icon: 'poll', label: t('createPoll'), fn: () => pollDialog(false) } : null, !cfg.compact ? { icon: 'lightbulb', label: t('createQuiz'), fn: () => pollDialog(true) } : null,
        !cfg.compact ? { icon: 'games', label: t('startGame'), fn: () => send({ game: { type: 'ttt' }, force: true }) } : null, !cfg.compact ? 'sep' : null,
        { icon: 'send_clock', label: t('scheduleSend'), fn: () => scheduleDialog() }, { icon: 'calendar_clock', label: t('scheduledMsgs'), fn: () => LC.scheduledList() }, 'sep',
        ...ttls.map(([v, label]) => ({ icon: v === undefined ? 'timer' : '', label, checked: ttlChoice === v, fn: () => { ttlChoice = v; refreshTtl(); } })), 'sep',
        { icon: 'image', label: t('compressImages'), checked: !!LC.ui.compress, fn: () => LC.setUi({ compress: !LC.ui.compress }) },
        ...LC.extItems(LC.ext.composerMore, api),
      ]);
    }
    const refreshTtl = () => { ttlDot.classList.toggle('hidden', ttlChoice === undefined); ttlDot.title = ttlChoice === undefined ? '' : ttlChoice ? t('ttlTitle', { t: LC.ttlLabel(ttlChoice) }) : t('ttlOff'); };
    function scheduleDialog() {
      const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); const pad = (n) => String(n).padStart(2, '0');
      const inp = el('input', { type: 'datetime-local', value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`, 'aria-label': t('scheduleSend') });
      LC.modal([el('h2', {}, LC.icon('send_clock'), ' ' + t('scheduleSend')), el('p', { class: 'muted small', text: t('scheduleHelp') }), inp, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('schedule'), onclick: () => { const at = new Date(inp.value).getTime(); if (!at || at < Date.now() + 10000) return LC.toast(t('pickFuture')); LC.closeModal(); send({ sendAt: at }); } }))]);
    }
    function pollDialog(quiz) {
      let correct = 0; const q = el('input', { placeholder: quiz ? t('quizQuestion') : t('pollQuestion'), maxlength: 200, 'aria-label': t('pollQuestion') }), list = el('div', { class: 'optlist' }), multi = el('input', { type: 'checkbox' });
      const rows = []; const addRow = (v = '') => { if (rows.length >= 10) return; const i = rows.length, inp = el('input', { placeholder: t('optionN', { n: i + 1 }), maxlength: 100, value: v }); const r = el('div', { class: 'optrow' }, quiz ? el('input', { type: 'radio', name: 'correct', checked: i === 0, 'aria-label': t('correctAnswer'), title: t('correctAnswer'), onchange: () => { correct = rows.findIndex((x) => x.r === r); } }) : null, inp); rows.push({ r, inp }); list.append(r); };
      addRow(); addRow();
      LC.modal([el('h2', {}, LC.icon(quiz ? 'lightbulb' : 'poll'), ' ' + (quiz ? t('createQuiz') : t('createPoll'))), q, list, el('button', { class: 'secondary sm withicon', onclick: () => addRow() }, LC.icon('add'), t('addOption')), quiz ? el('p', { class: 'muted small', text: t('quizPickCorrect') }) : el('label', { class: 'check' }, multi, ' ' + t('allowMultiple')),
        el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('post'), onclick: () => { const options = rows.map((x) => x.inp.value.trim()); const kept = options.map((v, i) => [v, i]).filter(([v]) => v); if (!q.value.trim() || kept.length < 2) return LC.toast(t('pollNeeds')); LC.closeModal(); send({ poll: { q: q.value, options: kept.map(([v]) => v), multi: multi.checked, correct: quiz ? kept.findIndex(([, i]) => i === correct) : undefined }, force: true }); } }))]);
    }

    // ----- recorders -----
    async function toggleVoice() {
      if (recorder) return stopRecording(true);
      if (!LC.canRecord()) return LC.needSecure();
      if (!guard()) return;
      try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); startRecording(stream, 'voice'); } catch (e) { LC.toast(t('micDenied')); }
    }
    async function recordClip(kind) {
      if (!LC.canRecord() || (kind === 'screen' && !navigator.mediaDevices.getDisplayMedia)) return LC.needSecure(); if (!guard()) return;
      try { const stream = kind === 'screen' ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }) : await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); startRecording(stream, 'clip'); } catch (e) { LC.toast(t('captureDenied')); }
    }
    function startRecording(stream, kind) {
      const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].filter((x) => (kind === 'voice') === x.startsWith('audio') && MediaRecorder.isTypeSupported(x))[0];
      const rec = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined), chunks = []; const t0 = Date.now();
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const timer = el('b', { text: '0:00' }), tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= (kind === 'voice' ? 600 : 180)) stopRecording(true); }, 500);
      recorder = { rec, stream, kind, tick, cancelled: false }; rec.start(500);
      recbar.replaceChildren(el('span', { class: 'recdot', 'aria-hidden': 'true' }), el('span', { text: (kind === 'voice' ? t('recording') : t('recordingClip')) + ' ' }), timer, el('button', { class: 'secondary sm', text: t('cancel'), onclick: () => stopRecording(false) }), el('button', { class: 'primary sm', text: kind === 'voice' ? t('sendVoice') : t('attachClip'), onclick: () => stopRecording(true) }));
      recbar.classList.remove('hidden'); micBtn.classList.add('live');
      stream.getTracks().forEach((tr) => { tr.onended = () => recorder && stopRecording(true); });
      rec.onstop = () => {
        clearInterval(tick); stream.getTracks().forEach((tr) => tr.stop()); const r = recorder; recorder = null; recbar.classList.add('hidden'); micBtn.classList.remove('live');
        if (r.cancelled || !chunks.length) return; const type = rec.mimeType || mt || '', ext = r.kind === 'voice' ? (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'weba') : (/mp4/.test(type) ? 'mp4' : 'webm');
        const f = new File([new Blob(chunks, { type })], `${r.kind === 'voice' ? 'voice' : 'clip'}-${Date.now()}.${ext}`, { type }); addFiles([f]);
        if (r.kind === 'voice') setTimeout(() => { const e = files[files.length - 1]; if (e) { e.autoSend = true; if (e.status === 'done') send(); } }, 0);
      };
    }
    function stopRecording(keep) { if (!recorder) return; recorder.cancelled = !keep; try { recorder.rec.stop(); } catch {} }

    function refresh() { // chat/thread changed
      closeAc(); if (editing) { editing = null; } replyTo = null; renderCtx(); files = []; renderChips(); ta.value = LC.ls.get(key(), ''); autosize(); ttlChoice = undefined; refreshTtl(); guard(); update(); renderBanner();
      ta.placeholder = cfg.compact ? t('replyPlaceholder') : t('typeMessage');
      for (const f of refreshHooks) { try { f(); } catch (e) { console.error('composer refresh hook', e); } }
    }
    function reply(m) { editing = null; replyTo = m; renderCtx(); ta.focus(); }
    function edit(m) { replyTo = null; editing = m; ta.value = m.text || ''; renderCtx(); autosize(); ta.focus(); update(); }
    Object.assign(api, { el: root, focus: () => ta.focus(), refresh, reply, edit, addFiles, addDropped, insert, guard, ta, cfg, send: (o) => send(o || {}), row, root, renderBanner,
      autosize, update, saveDraft, editing: () => editing, onRefresh: (f) => refreshHooks.push(f), onSent: (f) => sentHooks.push(f), moreMenu: (a) => moreMenu(a) });
    for (const f of LC.ext.composerSetup) { try { f(api); } catch (e) { console.error('composerSetup', e); } }
    for (const n of LC.extItems(LC.ext.composerTools, api)) if (n && n.nodeType) row.querySelector('.ctools').insertBefore(n, row.querySelector('.ctools .csep'));
    LC.on('me', () => guard()); LC.on('channel', () => guard()); LC.on('user', () => renderBanner()); LC.on('lang', () => { ta.placeholder = cfg.compact ? t('replyPlaceholder') : t('typeMessage'); });
    refresh(); return api;
  };
})();
