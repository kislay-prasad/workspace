'use strict';
// LANChat client core: state, helpers, API, live connection, dialogs, themes, sounds.
(() => {
  const LC = (window.LC = Object.assign(window.LC || {}, { handlers: {}, native: window.lanchatNative || null }));
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  LC.$ = $; LC.$$ = $$;
  const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'open', 'indeterminate']);
  LC.el = function el(tag, props, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return e;
  };
  const el = LC.el, t = (k, v) => LC.t(k, v);

  // ---------- extension registries: feature files plug into the UI here (docs/EXTENDING.md) ----------
  LC.ext = {
    panes: {},          // key -> { icon, label, order, badge(), render(nav), actions(), main(host), bottom, admin } : left app bar items
    tabs: [],           // { key, icon, label, order, when(chan), render(host, chan) } : tabs above a chat
    msgParts: [],       // (m, o) => node | null : extra content inside a message bubble
    msgMenu: [],        // (m, o) => [menu items] : message "More" menu
    chatMenu: [],       // (entry) => [items] : chat list item menu (entry = { id, kind, c?, u? })
    userMenu: [],       // (uid) => [items]
    mainMenu: [],       // () => [items] : top bar "Settings and more" menu
    profileMenu: [],    // () => [items] : avatar menu
    headerActions: [],  // (chan) => [buttons] : chat header, left of "More"
    headerMenu: [],     // (chan) => [items] : chat header "More" menu
    composerMore: [],   // (composer) => [items] : composer "More options" menu
    attachMenu: [],     // (composer) => [items] : paperclip menu
    composerTools: [],  // (composer) => node | null : buttons next to Send
    beforeSend: [],     // (body, composer) => void : add fields to an outgoing message
    settingsTabs: [],   // { key, icon, label, order, render() }
    settingsSections: [], // { tab, order, render() } : extra section at the end of an existing Settings tab (profile, appearance, notifications, people, ...)
    adminTabs: [],      // { key, icon, label, order, ownerOnly, render() }
    adminSections: [],  // { tab, order, ownerOnly, render() } : extra section in an existing Manage tab (requests, people, settings, ...)
    composerBanner: [], // (chan) => node | null : a strip above the message box (peer's status message, out of office, ...)
    commands: {},       // '/name' -> { help, run(args) } : slash commands in the search box
    mentionSources: [], // (query) => [{ label, insert, icon?, sub? }] : extra @mention suggestions (tags, @team...)
    callPanels: [],     // { key, icon, label, short?, order, when?(call), render(host, call) } : meeting side panels + toolbar buttons
    callToolbar: [],    // (call) => [buttons] : extra meeting toolbar buttons
    callMore: [],       // (call) => [menu items] : meeting "More" menu
    beforeCall: [],     // async ({ chan, mode, joining }) => false | { micId, camId, cam, muted, ...extra body } : e.g. "before you join" screen
    rail: [],           // (railNode) => void : after the left app bar is drawn
  };
  LC.extItems = (list, ...args) => list.flatMap((f) => { try { const r = f(...args); return Array.isArray(r) ? r : r ? [r] : []; } catch (e) { console.error('extension error', e); return []; } });

  // ---------- storage ----------
  const ls = (LC.ls = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  });

  // ---------- state ----------
  const S = (LC.S = {
    token: ls.get('lc_token'), deviceId: ls.get('lc_device'), me: null, users: new Map(), channels: new Map(), chan: null, chatName: 'LANChat', settings: {}, emojis: {}, dmTtl: {},
    unread: {}, mentions: {}, read: {}, readAt: {}, peers: {}, win: {}, typing: {}, calls: {}, pendingReqs: [], tab: 'chat', thread: null, es: null, lastEv: 0, serverSkew: 0, outbox: [], last: {}, pane: 'chat',
  });
  if (!S.deviceId) { S.deviceId = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); ls.set('lc_device', S.deviceId); }
  LC.prefs = () => (S.me && S.me.prefs) || {};
  LC.isAdmin = () => !!S.me && (S.me.role === 'owner' || S.me.role === 'admin');
  LC.isOwner = () => !!S.me && S.me.role === 'owner';

  // ---------- helpers ----------
  LC.user = (id) => S.users.get(id);
  LC.realName = (id) => (S.users.get(id) ? S.users.get(id).name : t('unknown'));
  LC.uname = (id) => { const n = LC.prefs().nicknames; return (n && n[id]) || LC.realName(id); };
  LC.dmId = (a, b) => 'dm:' + [a, b].sort().join(':');
  LC.peerOf = (chan) => chan.split(':').slice(1).find((i) => i !== S.me.id) || S.me.id; // dm:me:me = notes to self
  LC.chanInfo = (chan) => {
    if (!chan) return { kind: 'none', title: '' };
    if (chan.startsWith('dm:')) { const u = S.users.get(LC.peerOf(chan)); return { kind: 'dm', title: LC.uname(LC.peerOf(chan)), peer: u, icon: '' }; }
    const c = S.channels.get(chan); if (!c) return { kind: 'channel', title: chan };
    return { kind: c.members ? 'group' : 'channel', title: (c.members ? '' : '#') + c.name, c, topic: c.topic, icon: c.members ? 'people' : '#' };
  };
  LC.fileUrl = (f, inline) => `/files/${f.id}/${encodeURIComponent(f.name)}?token=${encodeURIComponent(S.token)}${inline ? '&inline=1' : ''}`;
  LC.extOf = (n) => (n.split('.').pop() || '').toLowerCase();
  LC.isImage = (n) => /^(png|jpe?g|gif|webp)$/.test(LC.extOf(n));
  LC.fmtSize = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B');
  const lang = () => LC.ui.lang === 'auto' ? undefined : LC.ui.lang;
  LC.fmtTime = (ts) => new Date(ts).toLocaleTimeString(lang(), { hour: 'numeric', minute: '2-digit' });
  LC.fmtDateTime = (ts) => new Date(ts).toLocaleString(lang(), { dateStyle: 'medium', timeStyle: 'short' });
  LC.dayLabel = (ts) => {
    const d = new Date(ts), n = new Date(), y = new Date(); y.setDate(n.getDate() - 1);
    if (d.toDateString() === n.toDateString()) return t('today'); if (d.toDateString() === y.toDateString()) return t('yesterday');
    return d.toLocaleDateString(lang(), { weekday: 'long', month: 'long', day: 'numeric' });
  };
  LC.ago = (ts) => { const s = Math.max(0, (Date.now() - ts) / 1000); return s < 60 ? t('justNow') : s < 3600 ? t('minAgo', { n: Math.floor(s / 60) }) : s < 86400 ? t('hrAgo', { n: Math.floor(s / 3600) }) : t('dayAgo', { n: Math.floor(s / 86400) }); };
  LC.ttlLabel = (s) => (s < 120 ? s + 's' : s < 7200 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d');
  LC.sr = (text) => { const n = $('#sr'); if (n) { n.textContent = ''; setTimeout(() => { n.textContent = text; }, 30); } };
  LC.debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
  LC.visible = () => document.visibilityState === 'visible' && document.hasFocus();
  LC.copy = async (text) => {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
    const ta = el('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  };

  // ---------- avatars ----------
  const PRES = { online: t('online'), away: t('away'), dnd: t('dnd'), offline: t('offline'), invisible: t('invisible') };
  LC.avatar = (u, cls = '', dot = false) => {
    u = u || { name: '?', color: '#888', presence: 'offline' };
    const inner = u.avatar ? el('img', { src: LC.fileUrl({ id: u.avatar, name: 'a.png' }, true), alt: '', loading: 'lazy' }) : (u.name.trim()[0] || '?').toUpperCase();
    return el('div', { class: 'av ' + cls, style: `background:${u.color}`, title: u.name, 'aria-hidden': 'true' }, inner, dot ? LC.presenceDot(u.presence) : null);
  };
  // presence look: the people area extends these (states: docs/EXTENDING.md "Presence states")
  LC.PRES_ICON = { online: 'presence_available', away: 'presence_away', brb: 'presence_away', dnd: 'presence_dnd', busy: 'presence_busy', call: 'presence_busy', meeting: 'presence_busy', presenting: 'presence_dnd', oof: 'presence_offline', offline: 'presence_offline', invisible: 'presence_offline' };
  LC.presenceLabel = (p) => t(p || 'offline');
  LC.presenceDot = (p) => el('span', { class: 'dot ' + (p || 'offline'), title: LC.presenceLabel(p) }, LC.icon(LC.PRES_ICON[p] || 'presence_offline'));
  // icon-only button (always has an accessible name) and icon + text button
  LC.ibtn = (icon, label, onclick, o = {}) => el('button', { class: o.cls || 'icon', title: label, 'aria-label': label, onclick, type: 'button', 'aria-haspopup': o.menu ? 'menu' : null, 'aria-pressed': o.pressed === undefined ? null : String(!!o.pressed), disabled: o.disabled }, LC.icon(icon, { filled: o.filled }));
  LC.btn = (icon, text, onclick, cls = 'secondary') => el('button', { class: cls + ' withicon', onclick, type: 'button' }, LC.icon(icon), el('span', { text }));
  void PRES;

  // ---------- API ----------
  LC.api = async (path, body, opts = {}) => {
    let r;
    try { r = await fetch(path, { method: opts.method || (body === undefined ? 'GET' : 'POST'), headers: { 'x-token': S.token || '', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: opts.signal }); }
    catch (e) { throw Object.assign(new Error(t('offlineErr')), { offline: true }); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status === 401 && S.token && !opts.noSignOut) LC.signOut('expired'); throw Object.assign(new Error(d.error || r.statusText), { status: r.status, data: d }); }
    return d;
  };
  LC.signOut = (reason) => { try { if (S.token && reason === 'manual') fetch('/api/signout', { method: 'POST', headers: { 'x-token': S.token }, body: '{}', keepalive: true }); } catch {} ls.del('lc_token'); if (reason && reason !== 'manual') ls.set('lc_notice', reason); S.token = null; if (S.es) S.es.close(); location.reload(); };
  LC.setPrefs = (patch) => LC.api('/api/prefs', patch).catch((e) => LC.toast(e.message));

  // ---------- live connection ----------
  const EVENTS = ['activity', 'activityread', 'init', 'user', 'channel', 'channel_removed', 'channel_deleted', 'message', 'update', 'purge', 'typing', 'seen', 'delivered', 'readstate', 'settings', 'emoji', 'me', 'joinrequest', 'joindecided', 'kicked', 'meta', 'note', 'board', 'boardlive', 'todos', 'events', 'callstate', 'callring', 'callsig', 'callreact', 'reminder', 'dmttl', 'schedulefail', 'ping'];
  LC.on = (name, fn) => { (LC.handlers[name] ||= []).push(fn); };
  // feature files register extra live-event names before the app connects (see docs/EXTENDING.md)
  LC.addEvents = (...names) => { for (const n of names.flat()) if (typeof n === 'string' && !EVENTS.includes(n)) EVENTS.push(n); };
  LC.emitLocal = (name, d) => dispatch(name, d);
  const dispatch = (name, d) => { for (const fn of LC.handlers[name] || []) { try { fn(d); } catch (e) { console.error('handler error for', name, e); } } };
  LC.connect = () => {
    if (S.es) S.es.close();
    const es = new EventSource('/api/events?token=' + encodeURIComponent(S.token)); S.es = es; S.lastEv = Date.now();
    es.onopen = () => { LC.banner(null); };
    es.onerror = () => { LC.banner(t('reconnecting')); if (es.readyState === 2) setTimeout(async () => { try { await LC.api('/api/info'); LC.connect(); } catch (e) { if (!e.status) setTimeout(LC.connect, 4000); } }, 1500); };
    for (const name of EVENTS) es.addEventListener(name, (e) => { S.lastEv = Date.now(); if (name === 'ping') return; let d; try { d = JSON.parse(e.data); } catch { return; } dispatch(name, d); });
  };
  setInterval(() => { if (S.token && S.es && Date.now() - S.lastEv > 70000) LC.connect(); }, 15000);
  const revive = () => { if (S.token && S.es && S.es.readyState !== 1) LC.connect(); };
  window.addEventListener('online', revive); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revive(); });
  LC.banner = (text) => { const b = $('#banner'); if (!b) return; if (text) { b.textContent = text; b.classList.remove('hidden'); } else b.classList.add('hidden'); };

  // core state updates (registered first, so every later handler sees fresh state)
  LC.on('init', (d) => {
    S.chatName = d.chatName; S.me = d.me; S.users = new Map(d.users.map((u) => [u.id, u])); S.channels = new Map(d.channels.map((c) => [c.id, c]));
    S.unread = d.unread; S.mentions = d.mentions; S.read = d.read; S.peers = d.peers; S.settings = d.settings; S.emojis = d.emojis; S.dmTtl = d.dmTtl || {};
    S.serverSkew = d.serverTime - Date.now(); S.pendingReqs = d.pending || []; S.calls = {}; for (const c of d.calls || []) S.calls[c.chan] = c.call;
    S.win = {}; S.typing = {}; LC.mentionRe = null; S.last = d.last || {};
  });
  LC.on('user', (u) => { S.users.set(u.id, u); LC.mentionRe = null; if (S.me && u.id === S.me.id) Object.assign(S.me, u, { prefs: S.me.prefs }); });
  LC.on('me', (m) => { S.me = m; });
  LC.on('channel', (c) => { S.channels.set(c.id, c); });
  LC.on('channel_removed', (c) => { S.channels.delete(c.id); delete S.win[c.id]; });
  LC.on('channel_deleted', (c) => { S.channels.delete(c.id); delete S.win[c.id]; delete S.unread[c.id]; });
  LC.on('settings', (s) => { S.settings = s; });
  LC.on('emoji', (e) => { if (e.id) S.emojis[e.name] = e.id; else delete S.emojis[e.name]; LC.emojiRe = null; });
  LC.on('meta', (m) => { S.chatName = m.name; });
  LC.on('dmttl', (e) => { if (e.ttl) S.dmTtl[e.chan] = e.ttl; else delete S.dmTtl[e.chan]; });
  LC.on('kicked', () => { LC.signOut('kicked'); });
  LC.on('callstate', (e) => { if (e.call) S.calls[e.chan] = e.call; else delete S.calls[e.chan]; });
  LC.on('joinrequest', (r) => { if (!S.pendingReqs.some((x) => x.id === r.id)) S.pendingReqs.push(r); });
  LC.on('joindecided', (r) => { S.pendingReqs = S.pendingReqs.filter((x) => x.id !== r.id); });

  // ---------- toasts / modal / dialogs / menus ----------
  LC.toast = (text, o = {}) => {
    const box = $('#toasts'), n = el('div', { class: 'toast' }, el('span', { text }), o.action ? el('button', { text: o.action.label, onclick: () => { o.action.fn(); n.remove(); } }) : null);
    box.append(n); setTimeout(() => n.remove(), o.ms || 5000); return n;
  };
  let lastFocus = null;
  LC.modal = (content, o = {}) => {
    const m = $('#modal'); if (m.classList.contains('hidden')) lastFocus = document.activeElement;
    m._onClose = o.onClose || null;
    const card = el('div', { class: 'card' + (o.wide ? ' wide' : '') }, content); m.replaceChildren(card); m.classList.remove('hidden');
    const hd = card.querySelector('h3,h2'); m.setAttribute('aria-label', o.label || (hd && hd.textContent) || 'Dialog');
    m.onmousedown = (e) => { if (e.target === m) LC.closeModal(); };
    const f = m.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), textarea, button.primary'); if (f) { f.focus(); setTimeout(() => f.focus(), 30); }
    return { close: LC.closeModal, el: m };
  };
  LC.closeModal = () => { const m = $('#modal'); if (m.classList.contains('hidden')) return; m.classList.add('hidden'); m.replaceChildren(); const cb = m._onClose; m._onClose = null; if (cb) cb(); if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch {} } };
  const layer = (content) => { const l = el('div', { class: 'modal top', role: 'alertdialog', 'aria-modal': 'true' }, el('div', { class: 'card small' }, content)); document.body.append(l); return l; };
  LC.confirm = (message, o = {}) => new Promise((resolve) => {
    let l; const done = (v) => { l.remove(); resolve(v); };
    l = layer([el('p', { text: message, style: { margin: 0 } }), el('div', { class: 'acts' }, el('button', { class: 'secondary', text: o.cancel || t('cancel'), onclick: () => done(false) }), el('button', { class: o.danger ? 'primary danger' : 'primary', text: o.ok || t('ok'), onclick: () => done(true), autofocus: true }))]);
    l.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); }); setTimeout(() => l.querySelector('.primary').focus(), 20);
  });
  LC.prompt = (title, o = {}) => new Promise((resolve) => {
    let l; const done = (v) => { l.remove(); resolve(v); }; const inp = el('input', { value: o.value || '', placeholder: o.placeholder || '', maxlength: o.max || 100, type: o.type || 'text' });
    l = layer(el('form', { onsubmit: (e) => { e.preventDefault(); done(inp.value); } }, el('h2', { text: title, style: { margin: '0 0 8px' } }), inp, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: () => done(null) }), el('button', { class: 'primary', type: 'submit', text: o.ok || t('ok') }))));
    l.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); }); setTimeout(() => { inp.focus(); inp.select(); }, 20);
  });
  const menuEl = () => $('#menu');
  LC.closeMenu = () => { const m = menuEl(); m.classList.add('hidden'); m.replaceChildren(); };
  LC.menu = (anchor, items) => {
    const m = menuEl(); m.replaceChildren(); let first = null;
    for (const it of items) {
      if (!it) continue; if (it === 'sep') { m.append(el('hr')); continue; }
      const ic = it.icon && LC.hasIcon(it.icon) ? LC.icon(it.icon, { cls: it.iconCls }) : it.icon ? it.icon : it.checked ? LC.icon('checkmark') : '';
      const b = el('button', { role: it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem', 'aria-checked': it.checked !== undefined ? String(!!it.checked) : null, class: it.danger ? 'danger' : '', disabled: !!it.disabled, onclick: () => { LC.closeMenu(); it.fn && it.fn(); } }, el('span', { class: 'mi' }, ic), el('span', { class: 'ml', text: it.label }), it.checked && it.icon ? LC.icon('checkmark', { cls: 'mcheck' }) : null);
      m.append(b); first ||= b;
    }
    m.classList.remove('hidden'); m.style.visibility = 'hidden';
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    m.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px'; m.style.visibility = ''; if (first) first.focus();
  };
  document.addEventListener('mousedown', (e) => { const m = menuEl(); if (!m.classList.contains('hidden') && !m.contains(e.target)) LC.closeMenu(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!menuEl().classList.contains('hidden')) { LC.closeMenu(); return; } const top = $('.modal.top'); if (top) return; if (!$('#lightbox').classList.contains('hidden')) return; if (!$('#picker').classList.contains('hidden')) { $('#picker').classList.add('hidden'); return; } LC.closeModal(); }
    const m = menuEl(); if (!m.classList.contains('hidden') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { const bs = $$('button:not([disabled])', m), i = bs.indexOf(document.activeElement); bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus(); e.preventDefault(); }
  });

  // ---------- appearance ----------
  const UI_DEFAULT = { theme: 'auto', accent: '#5b5fc7', font: 100, compact: false, wall: 'none', reduceMotion: false, lang: 'auto', sound: 'chime', compress: true, customSound: '' };
  LC.ui = { ...UI_DEFAULT, ...(ls.get('lc_ui') || {}) };
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, '0')).join('');
  LC.applyUi = () => {
    const u = LC.ui, r = document.documentElement;
    if (u.theme === 'auto') r.removeAttribute('data-theme'); else r.dataset.theme = u.theme;
    const acc = /^#[0-9a-f]{6}$/i.test(u.accent) ? u.accent : UI_DEFAULT.accent;
    if (u.theme === 'hc') for (const k of ['--brand', '--brand-d', '--on-brand']) r.style.removeProperty(k);
    else { r.style.setProperty('--brand', acc); r.style.setProperty('--brand-d', shade(acc, 0.85)); r.style.setProperty('--on-brand', lum(acc) > 0.45 ? '#111' : '#fff'); }
    r.style.setProperty('--fs', String(u.font / 100)); r.dataset.density = u.compact ? 'compact' : 'comfy'; r.dataset.wall = u.wall; r.dataset.motion = u.reduceMotion ? 'reduce' : 'full';
    r.lang = LC.langCode(); r.dir = LC.langDir();
  };
  LC.setUi = (patch) => { Object.assign(LC.ui, patch); ls.set('lc_ui', LC.ui); LC.applyUi(); if (patch.lang !== undefined) { LC.applyI18n(); dispatch('lang', {}); } dispatch('ui', patch); };
  LC.on('lang', () => {}); LC.on('ui', () => {});
  LC.applyUi();

  // ---------- sounds & alerts ----------
  let ac;
  const tone = (freq, start, dur, vol = 0.07, type = 'sine') => { const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, ac.currentTime + start); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur); o.connect(g); g.connect(ac.destination); o.start(ac.currentTime + start); o.stop(ac.currentTime + start + dur + 0.02); };
  LC.playSound = (kind) => {
    kind = kind || LC.ui.sound; if (kind === 'none') return;
    try {
      if (kind === 'custom' && LC.ui.customSound) { new Audio(LC.ui.customSound).play().catch(() => {}); return; }
      ac ||= new (window.AudioContext || window.webkitAudioContext)();
      if (kind === 'ping') tone(1320, 0, 0.18); else if (kind === 'pop') tone(300, 0, 0.1, 0.1, 'triangle'); else if (kind === 'ring') { tone(660, 0, 0.3); tone(880, 0.35, 0.3); tone(660, 1.1, 0.3); tone(880, 1.45, 0.3); } else { tone(880, 0, 0.14); tone(1175, 0.13, 0.22); }
    } catch {}
  };
  const inQuiet = () => { const q = LC.prefs().quiet; if (!q || !q.on) return false; const n = new Date(), m = n.getHours() * 60 + n.getMinutes(), [fh, fm] = q.from.split(':').map(Number), [th, tm] = q.to.split(':').map(Number), f = fh * 60 + fm, e = th * 60 + tm; return f <= e ? m >= f && m < e : m >= f || m < e; };
  LC.isMuted = (chan) => { const v = (LC.prefs().muted || {})[chan]; return v === true || (typeof v === 'number' && v > Date.now()); };
  // decides whether an incoming message should make a sound / pop a notification
  LC.shouldAlert = (m) => {
    if (!S.me || m.from === S.me.id || m.system) return false;
    const mention = !!(m.everyone || (m.mentions || []).includes(S.me.id)), np = LC.prefs().notif || {};
    if (S.me.presence === 'dnd' || inQuiet()) return false;
    if (LC.isMuted(m.chan) && !mention) return false;
    if (np.mentionsOnly && !mention && !m.chan.startsWith('dm:')) return false;
    return true;
  };
  LC.totalUnread = () => Object.entries(S.unread).reduce((a, [c, n]) => a + (LC.isMuted(c) ? 0 : n), 0);
  LC.updateBadge = () => {
    const n = LC.totalUnread(), ment = Object.values(S.mentions).reduce((a, b) => a + b, 0);
    document.title = (n ? `(${n > 99 ? '99+' : n}) ` : '') + S.chatName;
    if (LC.native && LC.native.badge) LC.native.badge(n, ment > 0);
  };
  LC.on('meta', () => LC.updateBadge());

  // ---------- zip (store-only) used to upload dropped folders ----------
  const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  LC.zip = (entries) => { // [{name, data:Uint8Array}] -> Blob
    const parts = [], central = []; let off = 0; const enc = new TextEncoder(), d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
    for (const e of entries) {
      const name = enc.encode(e.name), crc = crc32(e.data), lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(10, dt, true); lh.setUint16(12, dd, true); lh.setUint32(14, crc, true); lh.setUint32(18, e.data.length, true); lh.setUint32(22, e.data.length, true); lh.setUint16(26, name.length, true);
      central.push({ name, crc, size: e.data.length, off }); parts.push(lh.buffer, name, e.data); off += 30 + name.length + e.data.length;
    }
    const cdStart = off;
    for (const c of central) { const h = new DataView(new ArrayBuffer(46)); h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true); h.setUint16(12, dt, true); h.setUint16(14, dd, true); h.setUint32(16, c.crc, true); h.setUint32(20, c.size, true); h.setUint32(24, c.size, true); h.setUint16(28, c.name.length, true); h.setUint32(42, c.off, true); parts.push(h.buffer, c.name); off += 46 + c.name.length; }
    const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, central.length, true); end.setUint16(10, central.length, true); end.setUint32(12, off - cdStart, true); end.setUint32(16, cdStart, true); parts.push(end.buffer);
    return new Blob(parts, { type: 'application/zip' });
  };

  // ---------- keyboard-friendly list helper used by switcher/menus ----------
  LC.focusTrap = (root) => root.addEventListener('keydown', (e) => { if (e.key !== 'Tab') return; const f = $$('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex="0"]', root).filter((x) => x.offsetParent !== null); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } });
  document.addEventListener('DOMContentLoaded', () => LC.focusTrap($('#modal')));
})();
