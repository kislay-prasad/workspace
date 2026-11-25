'use strict';
// Built-in apps (section 10). This file: helpers shared by public/js/apps-*.js (LC.apps), the per-chat tab list
// ("+" Add a tab gallery, rename / remove / reorder, stored on the server), the app bar ("Apps" store, "More apps",
// pinned apps), website tabs and the cards the apps post into chats. Owned by the "apps" area (docs/EXTENDING.md).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const A = (LC.apps = { tabCfg: {}, user: {}, catalog: [], cardKinds: {} });
  LC.addEvents('ap_tabs', 'ap_user', 'ap_task', 'ap_plan', 'ap_nb', 'ap_list', 'ap_shifts', 'ap_bookings', 'ap_checkins');
  LC.addStrings('en', {
    ap_addTab: 'Add a tab', ap_tabsHere: 'Tabs in this chat', ap_added: 'Added', ap_add: 'Add', ap_open: 'Open', ap_rename: 'Rename', ap_remove: 'Remove', ap_moveLeft: 'Move left', ap_moveRight: 'Move right',
    ap_resetTabs: 'Reset to the default tabs', ap_confirmReset: 'Go back to the default tabs for everyone in this chat?', ap_renameTab: 'Rename tab', ap_confirmRemoveTab: 'Remove the “{name}” tab for everyone in this chat? Its content stays and comes back if you add the tab again.',
    ap_searchApps: 'Search apps', ap_noApps: 'No apps match.', ap_tabOptions: 'Tab options', ap_cantChange: 'You can look, but you can’t change tabs here.',
    ap_apps: 'Apps', ap_moreApps: 'More apps', ap_allApps: 'All apps', ap_pin: 'Pin to the app bar', ap_unpin: 'Unpin from the app bar', ap_addToChat: 'Add to a chat', ap_pickChat: 'Pick a chat', ap_appsIntro: 'Apps built into LANChat. Open one from here, pin it to the app bar, or add it as a tab to a chat.',
    ap_inAppBar: 'In the app bar', ap_asTab: 'Tabs for chats', ap_otherApps: 'More from LANChat', ap_addedTo: 'Added to {where}',
    ap_desc_files: 'Files shared in this chat.', ap_desc_notes: 'One shared note everyone here can edit.', ap_desc_calendar: 'Events and reminders for this chat.', ap_desc_other: 'A tab for this chat.',
    ap_website: 'Website', ap_desc_web: 'Show a web page (for example an intranet page on your network) as a tab.', ap_webName: 'Tab name', ap_webUrl: 'Web address', ap_webUrlHint: 'For example http://192.168.1.10:8080/wiki',
    ap_openBrowser: 'Open in browser', ap_reload: 'Reload', ap_editTab: 'Change address', ap_webChecking: 'Checking the page…', ap_webNoFrame: 'This site doesn’t allow being shown inside other apps. Open it in your browser instead.',
    ap_webMixed: 'LANChat is on a secure (https) page, so your browser won’t show this http:// page inside it. Open it in your browser instead.', ap_webSame: 'LANChat pages can’t be shown as a website tab.',
    ap_webUnreach: 'The host computer can’t reach this page. It may still work for you — if the box below stays empty, open it in your browser.', ap_webSlow: 'Still loading… If nothing appears, the site may not allow being shown here.',
    ap_saved: 'Saved', ap_saving: 'Saving…', ap_delete: 'Delete', ap_edit: 'Edit', ap_cancel: 'Cancel', ap_save: 'Save', ap_close: 'Close', ap_done: 'Done', ap_new: 'New', ap_more: 'More options', ap_search: 'Search',
    ap_today: 'Today', ap_tomorrow: 'Tomorrow', ap_none: 'None', ap_everyone: 'Everyone', ap_unassigned: 'Unassigned', ap_assign: 'Assign', ap_people: 'People', ap_filter: 'Filter', ap_clearFilter: 'Clear filters', ap_groupBy: 'Group by', ap_sort: 'Sort',
    ap_exportCsv: 'Export to CSV', ap_loading: 'Loading…', ap_readonly: 'You can look, but you can’t change things here.', ap_retry: 'Try again', ap_chat: 'Chat', ap_personal: 'Just me', ap_inChat: 'in {where}', ap_where: 'Where',
    ap_pd_activity: 'Mentions, replies, reactions and other updates for you.', ap_pd_chat: 'Your chats, channels and people.', ap_pd_calls: 'Calls, call history and voicemail.', ap_pd_saved: 'Messages you saved for later.', ap_pd_people: 'Everyone in this session, their status and contact cards.', ap_pd_meet: 'Meetings: schedule, join and recap.', ap_pd_walkie: 'Push to talk with the people in a channel.',
    ap_live: 'Live', ap_card: 'Card', ap_by: 'by {name}', ap_justNow: 'just now', ap_n: '{n}', ap_details: 'Details', ap_title: 'Title', ap_name: 'Name', ap_description: 'Description', ap_optional: 'optional', ap_back: 'Back',
  });
  LC.addStrings('hi', { ap_addTab: 'टैब जोड़ें', ap_apps: 'ऐप्स', ap_moreApps: 'और ऐप्स', ap_open: 'खोलें', ap_add: 'जोड़ें', ap_added: 'जोड़ा गया', ap_remove: 'हटाएँ', ap_rename: 'नाम बदलें', ap_website: 'वेबसाइट', ap_openBrowser: 'ब्राउज़र में खोलें', ap_save: 'सहेजें', ap_cancel: 'रद्द करें', ap_delete: 'मिटाएँ', ap_close: 'बंद करें', ap_saved: 'सहेजा गया', ap_saving: 'सहेज रहे हैं…', ap_pin: 'ऐप बार पर पिन करें', ap_unpin: 'ऐप बार से हटाएँ', ap_addToChat: 'चैट में जोड़ें', ap_search: 'खोजें', ap_filter: 'फ़िल्टर', ap_today: 'आज', ap_assign: 'सौंपें', ap_loading: 'लोड हो रहा है…' });
  LC.addStrings('es', { ap_addTab: 'Agregar una pestaña', ap_apps: 'Aplicaciones', ap_moreApps: 'Más aplicaciones', ap_open: 'Abrir', ap_add: 'Agregar', ap_added: 'Agregada', ap_remove: 'Quitar', ap_rename: 'Cambiar nombre', ap_website: 'Sitio web', ap_openBrowser: 'Abrir en el navegador', ap_save: 'Guardar', ap_cancel: 'Cancelar', ap_delete: 'Eliminar', ap_close: 'Cerrar', ap_saved: 'Guardado', ap_saving: 'Guardando…', ap_pin: 'Anclar a la barra de aplicaciones', ap_unpin: 'Desanclar', ap_addToChat: 'Agregar a un chat', ap_search: 'Buscar', ap_filter: 'Filtrar', ap_today: 'Hoy', ap_assign: 'Asignar', ap_loading: 'Cargando…' });

  // ---------- helpers ----------
  A.t = t;
  // replaceChildren() would print null / false as text: the apps build children with optional parts
  A.put = (node, ...kids) => { node.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false)); return node; };
  A.fail = (e) => LC.toast((e && e.message) || String(e));
  A.call = async (path, body) => { try { return await LC.api(path, body); } catch (e) { A.fail(e); return null; } };
  A.lbl = (x) => (typeof x === 'function' ? x() : x);
  A.writable = (chan) => { if (!S.me || !chan) return false; const c = S.channels.get(chan); return !(S.me.mutedUntil > Date.now()) && !(c && c.readonly && !LC.isAdmin()); };
  A.isManager = (chan) => { const c = S.channels.get(chan); return LC.isAdmin() || chan.startsWith('dm:') || !!(c && c.members && c.by === S.me.id); };
  A.members = (chan) => { const c = S.channels.get(chan); return [...S.users.values()].filter((u) => !u.removed && !u.deleted && (!chan ? true : chan.startsWith('dm:') ? chan.split(':').includes(u.id) : !c || !c.members || c.members.includes(u.id))).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id))); };
  A.everyone = () => [...S.users.values()].filter((u) => !u.removed && !u.deleted).sort((a, b) => LC.uname(a.id).localeCompare(LC.uname(b.id)));
  A.chatTitle = (chan) => LC.chanInfo(chan).title || chan;
  A.allChats = () => { const e = LC.chatEntries ? LC.chatEntries() : { chans: [], people: [] }; return [...e.chans.map((x) => ({ id: x.id, label: LC.chanInfo(x.id).title })), ...e.people.map((x) => ({ id: x.id, label: LC.uname(x.u.id) }))]; };
  const pad = (n) => String(n).padStart(2, '0');
  A.pad = pad;
  const lang = () => (LC.ui.lang === 'auto' ? undefined : LC.ui.lang);
  A.lang = lang;
  A.dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  A.fromDay = (s) => (s ? new Date(s + 'T00:00:00').getTime() : 0);
  A.dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  A.addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  A.weekStart = (ts) => { const d = new Date(A.dayStart(ts)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }; // Monday
  A.hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  A.fmtDay = (ts, o) => new Date(ts).toLocaleDateString(lang(), o || { weekday: 'short', day: 'numeric', month: 'short' });
  A.fmtTime = (ts) => LC.fmtTime(ts);
  A.fmtDue = (ts) => { const today = A.dayStart(Date.now()), d = A.dayStart(ts); return d === today ? t('ap_today') : d === A.addDays(today, 1) ? t('ap_tomorrow') : A.fmtDay(ts, { day: 'numeric', month: 'numeric' }); };
  A.dateInput = (ts, label) => el('input', { type: 'date', value: ts ? A.dayKey(ts) : '', 'aria-label': label });
  A.download = (blob, name) => { const u = URL.createObjectURL(blob), a = el('a', { href: u, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  A.csv = (rows) => '﻿' + rows.map((r) => r.map((v) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n\r;]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
  A.saveCsv = (rows, name) => A.download(new Blob([A.csv(rows)], { type: 'text/csv;charset=utf-8' }), name.replace(/[\\/:*?"<>|]+/g, '_') + '.csv');
  A.head = (icon, title, ...right) => el('div', { class: 'tabhead ap-head' }, el('h2', {}, LC.icon(icon), ' ', title), el('div', { class: 'ap-headr' }, ...right));
  A.empty = (icon, title, text, action) => el('div', { class: 'ap-empty' }, el('div', { class: 'ap-emptyic', 'aria-hidden': 'true' }, LC.icon(icon)), el('h3', { text: title }), text ? el('p', { class: 'muted', text }) : null, action || null);
  A.avatars = (ids, max = 3) => { const shown = ids.slice(0, max); return el('span', { class: 'ap-avs', title: ids.map(LC.uname).join(', ') }, ...shown.map((id) => LC.avatar(S.users.get(id), 'xs')), ids.length > max ? el('span', { class: 'ap-avmore', text: '+' + (ids.length - max) }) : null); };
  A.btn = (icon, text, fn, cls = 'secondary') => { const b = LC.btn(icon, text, fn, cls); return b; };
  A.seg = (opts, value, onChange, label) => el('div', { class: 'ap-seg', role: 'group', 'aria-label': label }, ...opts.map(([v, text, icon]) => el('button', { type: 'button', class: v === value ? 'on' : '', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, icon ? LC.icon(icon) : null, el('span', { text }))));
  A.field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  A.select = (opts, value, onChange, label) => { const s = el('select', { 'aria-label': label || '', onchange: (e) => onChange && onChange(e.target.value) }, ...opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = value === undefined || value === null ? '' : String(value); return s; };
  A.modal = (title, icon, body, acts, o = {}) => LC.modal([el('div', { class: 'row-between' }, el('h2', { style: { margin: 0 } }, icon ? LC.icon(icon) : null, icon ? ' ' : '', title), LC.ibtn('dismiss', t('ap_close'), LC.closeModal)), ...(Array.isArray(body) ? body : [body]), acts ? el('div', { class: 'acts' }, ...acts) : null], { wide: o.wide !== false, label: title, onClose: o.onClose });
  A.uid = () => Math.random().toString(16).slice(2, 14).padEnd(12, '0');
  // live events for a view: the listener goes away once its root node is no longer on the page
  const listeners = new Map();
  A.on = (name, fn, root) => { let set = listeners.get(name); if (!set) { set = new Set(); listeners.set(name, set); LC.on(name, (d) => { for (const l of [...set]) { if (l.root && !l.root.isConnected) { set.delete(l); continue; } try { l.fn(d); } catch (e) { console.error('apps listener', name, e); } } }); } set.add({ fn, root }); };

  // a small popover next to a button (people pickers, filters)
  let popEl = null;
  A.closePop = () => { if (popEl) { const p = popEl; popEl = null; p.remove(); if (p._back && p._back.focus) try { p._back.focus(); } catch {} } };
  A.pop = (anchor, content, o = {}) => {
    A.closePop(); const p = el('div', { class: 'ap-pop', role: 'dialog', 'aria-label': o.label || '' }, content); p._back = anchor; document.body.append(p); popEl = p;
    const r = anchor.getBoundingClientRect(), w = p.offsetWidth, h = p.offsetHeight;
    p.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px'; p.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
    const f = p.querySelector('input, button, select, textarea'); if (f) f.focus();
    return p;
  };
  document.addEventListener('mousedown', (e) => { if (popEl && !popEl.contains(e.target) && !(popEl._back && popEl._back.contains(e.target))) A.closePop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popEl) { e.stopPropagation(); A.closePop(); } }, true);
  // people picker: a button that shows who is picked; opens a searchable list with checkboxes
  A.peoplePick = (o) => {
    let value = [...(o.value || [])];
    const b = el('button', { type: 'button', class: 'ap-pick secondary sm', 'aria-haspopup': 'dialog', 'aria-label': (o.label || t('ap_assign')) + (value.length ? ': ' + value.map(LC.uname).join(', ') : ''), disabled: !!o.disabled });
    const draw = () => { A.put(b, ...(value.length ? [A.avatars(value, 4), value.length === 1 ? el('span', { text: LC.uname(value[0]) }) : null] : [LC.icon('person_add'), el('span', { text: o.placeholder || t('ap_assign') })])); b.setAttribute('aria-label', (o.label || t('ap_assign')) + (value.length ? ': ' + value.map(LC.uname).join(', ') : '')); };
    b.onclick = () => {
      const q = el('input', { type: 'search', placeholder: t('ap_search'), 'aria-label': t('ap_search') }), list = el('div', { class: 'ap-plist', role: 'group', 'aria-label': o.label || t('ap_people') });
      const rows = () => A.put(list, ...(o.people || A.everyone()).filter((u) => LC.uname(u.id).toLowerCase().includes(q.value.toLowerCase())).map((u) => el('label', { class: 'ap-prow' }, el('input', { type: o.multi === false ? 'radio' : 'checkbox', name: 'ap-pp', checked: value.includes(u.id), onchange: (e) => { if (o.multi === false) value = e.target.checked ? [u.id] : []; else value = e.target.checked ? [...value, u.id] : value.filter((x) => x !== u.id); draw(); o.onChange && o.onChange(value); if (o.multi === false) A.closePop(); } }), LC.avatar(u, 'sm', true), el('span', { text: LC.uname(u.id) }))));
      q.addEventListener('input', rows); rows();
      A.pop(b, [q, list, o.multi === false && value.length ? el('button', { class: 'link', text: t('ap_unassigned'), onclick: () => { value = []; draw(); o.onChange && o.onChange(value); A.closePop(); } }) : null], { label: o.label || t('ap_people') });
    };
    draw(); b.get = () => value; b.set = (v) => { value = [...v]; draw(); }; return b;
  };

  // ---------- simple SVG charts ----------
  const NS = 'http://www.w3.org/2000/svg', svg = (tag, attrs, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) if (v !== undefined && v !== null) n.setAttribute(k, v); for (const k of kids.flat()) if (k) n.append(k.nodeType ? k : document.createTextNode(String(k))); return n; };
  A.svg = svg;
  A.PALETTE = ['#5b5fc7', '#038387', '#ca5010', '#c239b3', '#498205', '#0078d4', '#986f0b', '#d13438', '#8764b8', '#69797e'];
  // horizontal bars: [{ label, value, color }] ; stacked: [{ label, parts: [{ value, color, name }] }]
  A.bars = (items, o = {}) => {
    const max = Math.max(1, ...items.map((x) => (x.parts ? x.parts.reduce((a, p) => a + p.value, 0) : x.value))), rowH = 28, w = 360, lw = 120, H = items.length * rowH + 4;
    const s = svg('svg', { viewBox: `0 0 ${w} ${H}`, class: 'ap-chart', role: 'img', 'aria-label': o.label || items.map((x) => `${x.label}: ${x.parts ? x.parts.map((p) => p.value).join('/') : x.value}`).join(', ') });
    items.forEach((x, i) => {
      const y = i * rowH + 4; s.append(svg('text', { x: lw - 6, y: y + 15, 'text-anchor': 'end', class: 'ap-cl' }, x.label.length > 18 ? x.label.slice(0, 17) + '…' : x.label));
      let off = lw; const parts = x.parts || [{ value: x.value, color: x.color || A.PALETTE[i % A.PALETTE.length] }], total = parts.reduce((a, p) => a + p.value, 0);
      for (const p of parts) { const bw = (p.value / max) * (w - lw - 40); if (bw > 0) s.append(svg('rect', { x: off, y: y + 3, width: Math.max(bw, 2), height: rowH - 10, rx: 3, fill: p.color }, svg('title', {}, `${x.label}${p.name ? ' · ' + p.name : ''}: ${p.value}`))); off += bw; }
      s.append(svg('text', { x: off + 6, y: y + 15, class: 'ap-cv' }, String(total)));
    });
    return s;
  };
  A.donut = (items, o = {}) => {
    const total = items.reduce((a, x) => a + x.value, 0), r = 52, c = 2 * Math.PI * r; let off = 0;
    const s = svg('svg', { viewBox: '0 0 140 140', class: 'ap-donut', role: 'img', 'aria-label': o.label || items.map((x) => `${x.label}: ${x.value}`).join(', ') }, svg('circle', { cx: 70, cy: 70, r, fill: 'none', class: 'ap-dbg', 'stroke-width': 18 }));
    for (const x of items) { if (!x.value) continue; const len = (x.value / Math.max(total, 1)) * c; s.append(svg('circle', { cx: 70, cy: 70, r, fill: 'none', stroke: x.color, 'stroke-width': 18, 'stroke-dasharray': `${len} ${c - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }, svg('title', {}, `${x.label}: ${x.value}`))); off += len; }
    s.append(svg('text', { x: 70, y: 68, 'text-anchor': 'middle', class: 'ap-dn' }, String(total)), svg('text', { x: 70, y: 86, 'text-anchor': 'middle', class: 'ap-dl' }, o.center || ''));
    return el('div', { class: 'ap-donutw' }, s, el('ul', { class: 'ap-legend' }, ...items.map((x) => el('li', {}, el('i', { style: { background: x.color } }), el('span', { text: `${x.label}` }), el('b', { text: String(x.value) })))));
  };

  // ---------- opening an app from an activity item (people area: LC.apps.open(item.app, item)) ----------
  A.openers = {};
  A.open = (app, item) => { const f = A.openers[app]; if (f) return f(item || {}); if (item && item.chan) return LC.openChat(item.chan); };
  const actOpen = (a) => (a.app ? A.open(a.app, a) : a.chan ? LC.jumpToMessage && a.msg ? LC.jumpToMessage(a.chan, a.msg) : LC.openChat(a.chan) : null);
  LC.ext.activityTypes = LC.ext.activityTypes || {};
  LC.addStrings('en', { ap_a_task: 'assigned you a task', ap_a_approval: 'needs your approval', ap_a_form: 'sent you a form', ap_a_booking: 'Booking update', ap_a_checkin: 'Time for a check-in', ap_a_shift: 'Shift update' });
  const actTypes = { task: ['task_list_ltr', 'task', 'ap_a_task'], approval: ['clipboard_task', 'apps', 'ap_a_approval'], form: ['form', 'apps', 'ap_a_form'], booking: ['calendar_checkmark', 'apps', 'ap_a_booking'], checkin: ['people_checkmark', 'apps', 'ap_a_checkin'], shift: ['person_clock', 'apps', 'ap_a_shift'] };
  for (const [type, [icon, filter, key]] of Object.entries(actTypes)) LC.ext.activityTypes[type] ||= { icon, filter, text: () => t(key), open: actOpen }; // the people area already opens task/approval/form items through item.app

  // ---------- cards posted by the apps (m.apCard) ----------
  A.card = (kind, fn) => { A.cardKinds[kind] = fn; };
  LC.ext.msgParts.push((m, o) => { const c = m.apCard; if (!c || !A.cardKinds[c.kind]) return null; try { return A.cardKinds[c.kind](m, o); } catch (e) { console.error('apps card', e); return null; } });

  // ---------- tab registry + per-chat tab list ----------
  // A.tab({ key, icon, label, desc, order, optIn, multi, render(host, chan, inst) }): optIn tabs only show once added
  // with "+"; multi tabs (websites) can be added several times, each with its own settings (inst).
  A.tab = (def) => { LC.ext.tabs.push(def); return def; };
  A.inst = (chan, key) => { const cfg = A.tabCfg[chan], [type, id] = key.split(':'); return cfg && id ? cfg.added.find((x) => x.type === type && x.id === id) || null : null; };
  const defOf = (key) => LC.ext.tabs.find((x) => x.key === key.split(':')[0]);
  const baseTabsFor = LC.tabsFor;
  LC.tabsFor = (chan) => {
    const base = baseTabsFor(chan), cfg = A.tabCfg[chan], hidden = new Set(cfg ? cfg.hidden : []), added = cfg ? cfg.added : [], names = (cfg && cfg.names) || {}, out = [];
    for (const x of base) {
      const d = defOf(x.key);
      if (x.key !== 'chat') { if (d && d.multi) continue; if (d && d.optIn ? !added.some((a) => a.id === x.key) : hidden.has(x.key)) continue; }
      out.push({ ...x, label: names[x.key] || x.label });
    }
    added.forEach((a, i) => { if (a.type === a.id) return; const d = defOf(a.type); if (!d) return; const key = a.type + ':' + a.id; if (!hidden.has(key)) out.push({ key, icon: d.icon, label: names[key] || a.name || A.lbl(d.label), order: 400 + i }); });
    if (cfg && cfg.order && cfg.order.length) { const pos = new Map(cfg.order.map((k, i) => [k, i])), rank = (x) => (x.key === 'chat' ? -1 : pos.has(x.key) ? pos.get(x.key) : 1000 + (x.order ?? 100)); out.sort((a, b) => rank(a) - rank(b)); }
    out.push({ key: 'ap_add', icon: 'add', label: t('ap_addTab') });
    return out;
  };
  const baseSetTab = LC.setTab;
  LC.setTab = (tab) => { if (tab === 'ap_add') return A.tabGallery(S.chan); if (tab !== S.tab) A.leaveTab(); return baseSetTab(tab); };
  // redraw just the tab strip (same markup as chat.js) when the list changes
  A.redrawTabs = () => {
    if (!S.chan || S.app) return; const tabs = LC.tabsFor(S.chan);
    if (S.tab !== 'chat' && !tabs.some((x) => x.key === S.tab)) return LC.setTab('chat');
    A.put($('#tabs'), ...tabs.map(({ key: k, icon: ic, label }) => el('button', { class: 'tab' + (S.tab === k ? ' on' : ''), role: 'tab', 'aria-selected': String(S.tab === k), 'data-tab': k, onclick: () => LC.setTab(k) }, LC.icon(ic, { filled: S.tab === k }), el('span', { text: label }))));
  };
  const tabOp = async (chan, body) => { const r = await A.call('/api/ap/tabs', { chan, ...body }); if (r && r.cfg) { A.tabCfg[chan] = r.cfg; if (chan === S.chan) A.redrawTabs(); } return r; };
  A.addTab = async (chan, type, extra = {}) => { const r = await tabOp(chan, { op: 'add', type, ...extra }); if (r && chan === S.chan) LC.setTab(r.key); return r; };
  LC.on('init', (d) => { A.tabCfg = d.apTabs || {}; A.user = d.apUser || {}; });
  LC.on('ap_tabs', (e) => { if (e.cfg) A.tabCfg[e.chan] = e.cfg; else delete A.tabCfg[e.chan]; if (e.chan === S.chan) A.redrawTabs(); });
  LC.on('ap_user', (u) => { A.user = u; LC.renderRail && LC.renderRail(); });

  const BUILTIN_DESC = { files: 'ap_desc_files', notes: 'ap_desc_notes', calendar: 'ap_desc_calendar' };
  const tabName = (chan, key) => (LC.tabsFor(chan).find((x) => x.key === key) || {}).label || key;
  async function renameTab(chan, key) { const v = await LC.prompt(t('ap_renameTab'), { value: tabName(chan, key), max: 30 }); if (v !== null) await tabOp(chan, { op: 'rename', key, name: v }); }
  async function removeTab(chan, key) { if (await LC.confirm(t('ap_confirmRemoveTab', { name: tabName(chan, key) }), { danger: true, ok: t('ap_remove') })) { await tabOp(chan, { op: 'remove', key }); } }
  async function moveTab(chan, key, d) {
    const keys = LC.tabsFor(chan).map((x) => x.key).filter((k) => k !== 'chat' && k !== 'ap_add'), i = keys.indexOf(key), j = i + d; if (i < 0 || j < 0 || j >= keys.length) return;
    keys.splice(i, 1); keys.splice(j, 0, key); await tabOp(chan, { op: 'order', keys });
  }
  function tabMenu(anchor, chan, key) {
    if (key === 'chat' || key === 'ap_add') return; const can = A.writable(chan), mgr = A.isManager(chan), keys = LC.tabsFor(chan).map((x) => x.key).filter((k) => k !== 'chat' && k !== 'ap_add'), i = keys.indexOf(key);
    const inst = A.inst(chan, key), mine = inst && inst.by === S.me.id, change = can && (mgr || mine);
    LC.menu(anchor, [
      { icon: 'edit', label: t('ap_rename'), fn: () => renameTab(chan, key), disabled: !change },
      inst && inst.url !== undefined ? { icon: 'link', label: t('ap_editTab'), fn: () => websiteDialog(chan, inst), disabled: !change } : null,
      { icon: 'arrow_left', label: t('ap_moveLeft'), fn: () => moveTab(chan, key, -1), disabled: !can || !mgr || i <= 0 },
      { icon: 'arrow_right', label: t('ap_moveRight'), fn: () => moveTab(chan, key, 1), disabled: !can || !mgr || i >= keys.length - 1 }, 'sep',
      { icon: 'delete', label: t('ap_remove'), danger: true, fn: () => removeTab(chan, key), disabled: !change },
    ]);
  }
  // right-click / Shift+F10 on a tab: rename, move, remove; tabs can also be dragged to a new place
  document.addEventListener('DOMContentLoaded', () => {
    const box = $('#tabs'); let dragKey = null;
    box.addEventListener('contextmenu', (e) => { const b = e.target.closest('.tab'); if (!b || !S.chan) return; e.preventDefault(); tabMenu({ x: e.clientX, y: e.clientY }, S.chan, b.dataset.tab); });
    box.addEventListener('keydown', (e) => { const b = e.target.closest('.tab'); if (b && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); tabMenu(b, S.chan, b.dataset.tab); } });
    new MutationObserver(() => { for (const b of box.querySelectorAll('.tab')) { const k = b.dataset.tab; b.draggable = k !== 'chat' && k !== 'ap_add' && A.isManager(S.chan || 'general') && A.writable(S.chan); if (k === 'ap_add') { b.title = t('ap_addTab'); b.classList.add('ap-addtab'); } } }).observe(box, { childList: true });
    box.addEventListener('dragstart', (e) => { const b = e.target.closest('.tab'); if (!b || !b.draggable) return; dragKey = b.dataset.tab; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); });
    box.addEventListener('dragover', (e) => { if (dragKey) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    box.addEventListener('drop', (e) => {
      if (!dragKey) return; e.preventDefault(); const b = e.target.closest('.tab'), from = dragKey; dragKey = null; if (!b || b.dataset.tab === from) return;
      const keys = LC.tabsFor(S.chan).map((x) => x.key).filter((k) => k !== 'chat' && k !== 'ap_add'), i = keys.indexOf(from); let j = keys.indexOf(b.dataset.tab); if (b.dataset.tab === 'chat') j = 0; if (b.dataset.tab === 'ap_add') j = keys.length - 1; if (i < 0 || j < 0) return;
      keys.splice(i, 1); keys.splice(j, 0, from); tabOp(S.chan, { op: 'order', keys });
    });
    box.addEventListener('dragend', () => { dragKey = null; });
  });

  // ---------- "+" Add a tab gallery ----------
  A.tabGallery = (chan) => {
    if (!chan) return; const can = A.writable(chan), q = el('input', { type: 'search', placeholder: t('ap_searchApps'), 'aria-label': t('ap_searchApps') }), grid = el('div', { class: 'ap-gallery' }), manage = el('div', { class: 'ap-tablist' });
    const types = () => {
      const shown = new Set(LC.tabsFor(chan).map((x) => x.key));
      const seen = new Set(), list = [];
      const add = (key, icon, label, desc, multi) => { if (seen.has(key) || key === 'chat' || key === 'ap_add') return; seen.add(key); list.push({ key, icon, label, desc, multi, on: !multi && shown.has(key) }); };
      for (const d of [...LC.ext.tabs].sort((a, b) => (a.order ?? 100) - (b.order ?? 100))) if (!d.when || d.multi || d.optIn || d.when(chan)) add(d.key, d.icon, A.lbl(d.label), A.lbl(d.desc) || t('ap_desc_other'), !!d.multi);
      for (const x of baseTabsFor(chan)) add(x.key, x.icon, x.label, BUILTIN_DESC[x.key] ? t(BUILTIN_DESC[x.key]) : t('ap_desc_other'), false);
      return list;
    };
    const drawGrid = () => {
      const f = q.value.trim().toLowerCase(), list = types().filter((x) => !f || (x.label + ' ' + x.desc).toLowerCase().includes(f));
      A.put(grid, ...(list.length ? list.map((x) => el('div', { class: 'ap-gcard' }, el('div', { class: 'ap-gicon', 'aria-hidden': 'true' }, LC.icon(x.icon)), el('div', { class: 'ap-gtext' }, el('b', { text: x.label }), el('span', { class: 'muted small', text: x.desc })),
        x.on ? el('span', { class: 'ap-gon' }, LC.icon('checkmark'), t('ap_added')) : el('button', { class: 'primary sm', text: t('ap_add'), disabled: !can, 'aria-label': t('ap_add') + ': ' + x.label, onclick: async () => { if (x.multi) return x.key === 'ap_web' ? websiteDialog(chan) : null; LC.closeModal(); await A.addTab(chan, x.key); } }))) : [el('p', { class: 'muted', text: t('ap_noApps') })]));
    };
    const drawManage = () => {
      const tabs = LC.tabsFor(chan).filter((x) => x.key !== 'ap_add'), mgr = A.isManager(chan);
      A.put(manage, ...tabs.map((x, i) => { const inst = A.inst(chan, x.key), change = can && x.key !== 'chat' && (mgr || (inst && inst.by === S.me.id));
        return el('div', { class: 'ap-trow' }, LC.icon(x.icon), el('span', { class: 'grow', text: x.label }),
          x.key === 'chat' ? el('span', { class: 'muted small', text: t('ap_chat') }) : [
            LC.ibtn('edit', t('ap_rename') + ': ' + x.label, () => renameTab(chan, x.key).then(drawAll), { disabled: !change }),
            LC.ibtn('arrow_up', t('ap_moveLeft') + ': ' + x.label, () => moveTab(chan, x.key, -1).then(drawAll), { disabled: !can || !mgr || i <= 1 }),
            LC.ibtn('arrow_down', t('ap_moveRight') + ': ' + x.label, () => moveTab(chan, x.key, 1).then(drawAll), { disabled: !can || !mgr || i >= tabs.length - 1 }),
            LC.ibtn('delete', t('ap_remove') + ': ' + x.label, () => removeTab(chan, x.key).then(drawAll), { disabled: !change })]); }));
    };
    const drawAll = () => { drawGrid(); drawManage(); };
    q.addEventListener('input', drawGrid); drawAll();
    A.modal(t('ap_addTab'), 'tab_add', [can ? null : el('p', { class: 'notice', text: t('ap_cantChange') }), q, grid, el('h3', { text: t('ap_tabsHere') }), manage],
      [A.isManager(chan) && can && A.tabCfg[chan] ? el('button', { class: 'secondary', text: t('ap_resetTabs'), onclick: async () => { if (await LC.confirm(t('ap_confirmReset'))) { const r = await A.call('/api/ap/tabs/reset', { chan }); if (r) { delete A.tabCfg[chan]; A.redrawTabs(); drawAll(); } } } }) : null, el('button', { class: 'primary', text: t('ap_done'), onclick: LC.closeModal })]);
  };

  // ---------- website tabs ----------
  function websiteDialog(chan, inst) {
    const name = el('input', { value: inst ? inst.name || '' : '', maxlength: 30, placeholder: t('ap_website') }), url = el('input', { type: 'url', value: inst ? inst.url : 'http://', maxlength: 1000, placeholder: 'http://' });
    const go = async () => {
      const u = url.value.trim(); if (!/^https?:\/\/\S+$/i.test(u)) return LC.toast(t('ap_webUrlHint'));
      if (inst) { const key = inst.type + ':' + inst.id; if (await tabOp(chan, { op: 'url', key, url: u })) { if (name.value.trim() && name.value.trim() !== inst.name) await tabOp(chan, { op: 'rename', key, name: name.value }); LC.closeModal(); if (S.tab === key) LC.renderTab(key); } return; }
      const r = await tabOp(chan, { op: 'add', type: 'ap_web', multi: true, name: name.value || new URL(u).hostname, url: u }); if (r) { LC.closeModal(); LC.setTab(r.key); }
    };
    A.modal(inst ? t('ap_editTab') : t('ap_website'), 'globe', [el('p', { class: 'muted small', text: t('ap_desc_web') }), A.field(t('ap_webName'), name), A.field(t('ap_webUrl'), url, t('ap_webUrlHint'))], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: inst ? t('ap_save') : t('ap_add'), onclick: go })], { wide: false });
    setTimeout(() => url.focus(), 40);
  }
  A.tab({ key: 'ap_web', icon: 'globe', label: () => t('ap_website'), desc: () => t('ap_desc_web'), order: 400, multi: true, when: () => false,
    render(host, chan, inst) {
      if (!inst) return A.put(host, el('p', { class: 'err pad', text: t('ap_webNoFrame') }));
      let u; try { u = new URL(inst.url); } catch { u = null; }
      const note = el('div', { class: 'ap-webnote hidden', role: 'status' }), frameBox = el('div', { class: 'ap-webframe' }), open = el('a', { class: 'secondary sm withicon', href: inst.url, target: '_blank', rel: 'noopener noreferrer' }, LC.icon('open'), el('span', { text: t('ap_openBrowser') }));
      const say = (text, warn) => { A.put(note, LC.icon(warn ? 'warning' : 'info'), el('span', { text }), open.cloneNode(true)); note.classList.remove('hidden'); note.classList.toggle('warn', !!warn); };
      const frame = () => {
        const same = u && u.origin === location.origin;
        const f = el('iframe', { class: 'ap-web', src: inst.url, title: inst.name || inst.url, referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals' + (same ? '' : ' allow-same-origin'), allow: 'fullscreen; clipboard-write' });
        let loaded = false; f.addEventListener('load', () => { loaded = true; }); setTimeout(() => { if (!loaded && f.isConnected) say(t('ap_webSlow')); }, 8000);
        A.put(frameBox, f);
      };
      A.put(host, el('div', { class: 'ap-fillbox ap-webtab' }, el('div', { class: 'ap-webbar' }, LC.icon('globe'), el('span', { class: 'ap-weburl', text: inst.url, title: inst.url }), LC.ibtn('arrow_sync', t('ap_reload'), () => frame()), open, A.writable(chan) ? LC.ibtn('more_horizontal', t('ap_tabOptions'), (e) => tabMenu(e.currentTarget, chan, inst.type + ':' + inst.id), { menu: true }) : null), note, frameBox));
      if (!u) return say(t('ap_webNoFrame'), true);
      if (u.origin === location.origin) return say(t('ap_webSame'), true);
      if (location.protocol === 'https:' && u.protocol === 'http:') return say(t('ap_webMixed'), true);
      say(t('ap_webChecking'));
      LC.api('/api/ap/web/check?url=' + encodeURIComponent(inst.url)).then((r) => {
        if (!host.isConnected) return;
        if (r.frame === 'no') return say(t('ap_webNoFrame'), true);
        if (!r.reach) say(t('ap_webUnreach')); else note.classList.add('hidden');
        frame();
      }).catch(() => { note.classList.add('hidden'); frame(); });
    } });
  // full-height apps (website, whiteboard, notebook) put their content in a .ap-fillbox (CSS gives it the whole tab area);
  // LC.renderTab (collab.js) calls host._apLeave (flush unsaved work) when another tab opens; Chat or another chat do the same here
  A.leaveTab = () => { const h = $('#tabView'); if (h && h._apLeave) { const f = h._apLeave; h._apLeave = null; try { f(); } catch (e) { console.error(e); } } };
  LC.on('cx:chat', (e) => { if (e && e.changed) A.leaveTab(); });

  // ---------- app bar: Apps store, More apps, pinned apps ----------
  // A.app({ key, icon, color, name, desc, tab?: tabKey, pane?: { render, main, ... } }) — every app in the store
  const DEFAULT_PINS = ['ap_tasks'];
  A.pins = () => (Array.isArray(A.user.pins) ? A.user.pins : DEFAULT_PINS);
  A.isPinned = (key) => A.pins().includes(key);
  A.setPin = async (key, on) => { const pins = A.pins().filter((k) => k !== key); if (on) pins.push(key); A.user = { ...A.user, pins }; LC.renderRail && LC.renderRail(); await A.call('/api/ap/me', { pins }); };
  A.app = (def) => {
    A.catalog.push(def);
    if (def.pane) LC.ext.panes[def.key] = { icon: def.icon, label: () => A.lbl(def.name), order: def.order || 70, hidden: () => !A.isPinned(def.key) && S.pane !== def.key, title: () => A.lbl(def.name),
      headerActions: () => [el('button', { class: 'secondary sm withicon', onclick: () => A.setPin(def.key, !A.isPinned(def.key)).then(() => LC.openApp(def.key)) }, LC.icon(A.isPinned(def.key) ? 'pin_off' : 'pin'), el('span', { text: A.isPinned(def.key) ? t('ap_unpin') : t('ap_pin') }))], ...def.pane };
    return def;
  };
  A.openApp = (key) => { if (LC.ext.panes[key]) LC.setPane(key); };
  function moreMenu() {
    const anchor = $('.rbtn[data-pane="ap_more"]') || $('#rail');
    LC.menu(anchor, [...A.catalog.filter((x) => x.pane).map((x) => ({ icon: x.icon, label: A.lbl(x.name), fn: () => A.openApp(x.key) })), 'sep', { icon: 'apps', label: t('ap_allApps'), fn: () => LC.setPane('ap_store') }]);
  }
  LC.ext.panes.ap_more = { icon: 'more_horizontal', label: () => t('ap_moreApps'), order: 99, action: moreMenu };
  LC.ext.panes.ap_store = { icon: 'apps', label: () => t('ap_apps'), order: 880, bottom: true, title: () => t('ap_apps'), render: (nav) => renderStoreNav(nav), main: (host) => renderStore(host) };
  let storeFilter = '';
  function renderStoreNav(nav) {
    A.put(nav, el('div', { class: 'ap-navsec', text: t('ap_inAppBar') }), ...A.catalog.filter((x) => x.pane).map((x) => el('button', { class: 'ap-navitem', onclick: () => A.openApp(x.key) }, el('span', { class: 'ap-navic', style: { background: x.color }, 'aria-hidden': 'true' }, LC.icon(x.icon)), el('span', { class: 'grow', text: A.lbl(x.name) }), A.isPinned(x.key) ? LC.icon('pin', { cls: 'ap-pinned', label: t('ap_pin') }) : null)),
      el('div', { class: 'ap-navsec', text: t('ap_asTab') }), ...A.catalog.filter((x) => x.tab && !x.pane).map((x) => el('button', { class: 'ap-navitem', onclick: () => storeDetails(x) }, el('span', { class: 'ap-navic', style: { background: x.color }, 'aria-hidden': 'true' }, LC.icon(x.icon)), el('span', { class: 'grow', text: A.lbl(x.name) }))));
  }
  function addToChatDialog(app) {
    const sel = A.select([['', t('ap_pickChat')], ...A.allChats().map((c) => [c.id, c.label])], '', null, t('ap_pickChat'));
    A.modal(t('ap_addToChat') + ': ' + A.lbl(app.name), app.icon, [A.field(t('ap_pickChat'), sel)], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_add'), onclick: async () => {
      const chan = sel.value; if (!chan) return LC.toast(t('ap_pickChat')); LC.closeModal();
      if (app.tab === 'ap_web') { await LC.openChat(chan); return websiteDialog(chan); }
      const r = await tabOp(chan, { op: 'add', type: app.tab }); if (r) { LC.toast(t('ap_addedTo', { where: A.chatTitle(chan) })); await LC.openChat(chan); LC.setTab(r.key); }
    } })], { wide: false });
  }
  function storeDetails(app) {
    A.modal(A.lbl(app.name), app.icon, [el('div', { class: 'ap-sdet' }, el('div', { class: 'ap-sicon', style: { background: app.color }, 'aria-hidden': 'true' }, LC.icon(app.icon)), el('p', { text: A.lbl(app.long || app.desc) }))],
      [app.pane ? el('button', { class: 'secondary', text: A.isPinned(app.key) ? t('ap_unpin') : t('ap_pin'), onclick: () => { A.setPin(app.key, !A.isPinned(app.key)); LC.closeModal(); } }) : null, app.tab ? el('button', { class: app.pane ? 'secondary' : 'primary', text: t('ap_addToChat'), onclick: () => addToChatDialog(app) }) : null, app.pane ? el('button', { class: 'primary', text: t('ap_open'), onclick: () => { LC.closeModal(); A.openApp(app.key); } }) : null], { wide: false });
  }
  function renderStore(host) {
    const q = el('input', { type: 'search', placeholder: t('ap_searchApps'), 'aria-label': t('ap_searchApps'), value: storeFilter }), grid = el('div', { class: 'ap-store' });
    const draw = () => {
      storeFilter = q.value; const f = q.value.trim().toLowerCase();
      const others = Object.entries(LC.ext.panes).filter(([k, p]) => !k.startsWith('ap_') && !p.bottom && !p.action && (!p.hidden || !p.hidden())).map(([k, p]) => ({ key: k, icon: p.icon, name: p.label, desc: p.desc || (LC.t('ap_pd_' + k) !== 'ap_pd_' + k ? LC.t('ap_pd_' + k) : ''), color: '#69797e', other: true }));
      const list = [...A.catalog, ...others].filter((x) => !f || (A.lbl(x.name) + ' ' + A.lbl(x.desc)).toLowerCase().includes(f));
      A.put(grid, ...(list.length ? list.map((x) => el('div', { class: 'ap-scard' },
        el('button', { class: 'ap-shead', onclick: () => (x.other ? LC.setPane(x.key) : storeDetails(x)), 'aria-label': A.lbl(x.name) }, el('span', { class: 'ap-sicon', style: { background: x.color }, 'aria-hidden': 'true' }, LC.icon(x.icon)), el('span', { class: 'ap-sname', text: A.lbl(x.name) })),
        el('p', { class: 'muted small', text: A.lbl(x.desc) || (x.other ? t('ap_otherApps') : '') }),
        el('div', { class: 'ap-sacts' }, x.pane || x.other ? el('button', { class: 'primary sm', text: t('ap_open'), onclick: () => (x.other ? LC.setPane(x.key) : A.openApp(x.key)) }) : null, x.tab ? el('button', { class: 'secondary sm', text: t('ap_addToChat'), onclick: () => addToChatDialog(x) }) : null,
          x.pane ? LC.ibtn(A.isPinned(x.key) ? 'pin_off' : 'pin', (A.isPinned(x.key) ? t('ap_unpin') : t('ap_pin')) + ': ' + A.lbl(x.name), () => A.setPin(x.key, !A.isPinned(x.key)).then(draw), { pressed: A.isPinned(x.key) }) : null))) : [el('p', { class: 'muted', text: t('ap_noApps') })]));
    };
    q.addEventListener('input', draw); draw();
    A.put(host, el('div', { class: 'ap-page' }, el('p', { class: 'muted', text: t('ap_appsIntro') }), q, grid));
  }
  A.app({ key: 'ap_webapp', icon: 'globe', color: '#0078d4', name: () => t('ap_website'), desc: () => t('ap_desc_web'), tab: 'ap_web' });
})();
