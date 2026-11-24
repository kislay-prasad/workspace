'use strict';
// Panels: main menu, invite, settings, admin, chat info, new channel/group, saved, scheduled, emoji manager.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const field = (label, control, hint) => el('label', { class: 'field' }, el('span', { class: 'flabel', text: label }), control, hint ? el('span', { class: 'muted small', text: hint }) : null);
  const row = (...kids) => el('div', { class: 'rowline' }, ...kids);
  const toggle = (label, checked, fn, hint) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: !!checked, onchange: (e) => fn(e.target.checked) }), el('span', {}, label, hint ? el('small', { class: 'muted', text: ' — ' + hint }) : null));
  const select = (opts, value, fn, label) => { const s = el('select', { 'aria-label': label || '', onchange: (e) => fn(e.target.value) }, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = String(value); return s; };
  const swatches = ['#5b5fc7', '#0078d4', '#038387', '#498205', '#ca5010', '#d13438', '#c239b3', '#7a5af5', '#e3008c', '#4f4f4f'];
  const bytes = (n) => LC.fmtSize(n || 0);
  const fail = (e) => LC.toast(e.message || String(e));

  function tabbed(title, tabs, start, o = {}) {
    const body = el('div', { class: 'tabbody' }), bar = el('div', { class: 'tabsbar', role: 'tablist' }); let cur = null;
    const show = async (k) => { cur = k; [...bar.children].forEach((b) => { b.classList.toggle('on', b.dataset.k === k); b.setAttribute('aria-selected', b.dataset.k === k); }); body.replaceChildren(el('p', { class: 'muted', text: t('loading') })); try { const c = await tabs.find((x) => x.key === k).render(); if (cur === k) body.replaceChildren(c); } catch (e) { body.replaceChildren(el('p', { class: 'err', text: e.message })); } };
    for (const tb of tabs) bar.append(el('button', { 'data-k': tb.key, role: 'tab', class: 'tabbtn', onclick: () => show(tb.key) }, tb.icon ? tb.icon + ' ' : '', tb.label));
    LC.modal([el('div', { class: 'row-between' }, el('h2', { text: title, style: { margin: 0 } }), el('button', { class: 'icon', text: '✕', 'aria-label': t('close'), onclick: LC.closeModal })), bar, body], { wide: true, label: title, onClose: o.onClose });
    show(tabs.some((x) => x.key === start) ? start : tabs[0].key); return { show, current: () => cur };
  }

  // ---------- main (gear) menu ----------
  LC.mainMenu = (anchor) => {
    LC.menu(anchor, [
      { icon: '⚙', label: t('settings'), fn: () => LC.settingsPanel() }, { icon: '🔖', label: t('savedMsgs'), fn: () => LC.savedMessages() }, { icon: '🕑', label: t('scheduledMsgs'), fn: () => LC.scheduledList() }, { icon: '😀', label: t('customEmoji'), fn: () => LC.emojiManager() },
      { icon: '✔', label: t('markAllRead'), fn: () => Object.keys(S.unread).filter((c) => S.unread[c]).forEach((c) => LC.api('/api/read', { chan: c })) },
      LC.isAdmin() ? 'sep' : null, LC.isAdmin() ? { icon: '🛡', label: t('manage') + (S.pendingReqs.length ? ` (${S.pendingReqs.length})` : ''), fn: () => LC.adminPanel() } : null,
      'sep', { icon: '⌨', label: t('shortcuts'), fn: () => LC.shortcutsHelp() }, LC.native && LC.native.diagnostics ? { icon: '🩺', label: t('diagnostics'), fn: () => LC.native.diagnostics() } : null,
      { icon: '⎋', label: t('signOut'), fn: async () => { if (await LC.confirm(t('confirmSignOut'))) LC.signOut('manual'); } },
    ]);
  };

  // ---------- invite ----------
  function copyBtn(text) { return el('button', { type: 'button', class: 'secondary sm', text: t('copy'), onclick: async (ev) => { await LC.copy(text); ev.target.textContent = t('copied') + ' ✓'; } }); }
  LC.inviteDialog = async () => {
    let info; try { info = await LC.api('/api/info'); } catch (e) { return fail(e); }
    const body = [el('h2', { text: t('inviteTitle') })], best = info.urls[0];
    if (!best && !info.publicUrl) body.push(el('p', { class: 'muted', text: t('noNetwork') }));
    else if (best) {
      body.push(el('p', { class: 'muted small', text: t('inviteHelp') + (info.approval ? ' ' + t('inviteApproval') : '') + (info.passcode ? ' ' + t('invitePasscode') : '') }));
      try { const q = qrcode(0, 'M'); q.addData(best.url); q.make(); const box = el('div', { class: 'qr', 'aria-label': 'QR ' + best.url }); box.append(new DOMParser().parseFromString(q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }), 'image/svg+xml').documentElement); body.push(box); } catch {}
      if (info.publicUrl) body.push(el('div', { class: 'addr' }, el('span', { text: '🌐 ' + t('internetLink') }), el('code', { text: info.publicUrl }), copyBtn(info.publicUrl)));
      info.urls.forEach((u) => body.push(el('div', { class: 'addr' }, el('code', { text: u.url }), u.lan ? null : el('small', { text: ' ' + t('vpnMaybe') }), copyBtn(u.url))));
    }
    if (LC.isOwner() && info.passcode) { try { const { settings } = await LC.api('/api/admin/settings'); body.push(el('p', {}, t('passcodeIs') + ' ', el('code', { text: settings.passcode }))); } catch {} }
    body.push(el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('done'), onclick: LC.closeModal }))); LC.modal(body);
  };

  // ---------- settings ----------
  async function resizeToBlob(file, size, type, quality, cover) {
    const bmp = await createImageBitmap(file), c = document.createElement('canvas'); let w = bmp.width, h = bmp.height;
    if (cover) { c.width = c.height = size; const s = Math.max(size / w, size / h); c.getContext('2d').drawImage(bmp, (size - w * s) / 2, (size - h * s) / 2, w * s, h * s); }
    else { const k = Math.min(1, size / Math.max(w, h)); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); }
    return new Promise((r) => c.toBlob(r, type, quality));
  }
  LC.settingsPanel = (start = 'profile') => {
    const tabs = [
      { key: 'profile', icon: '👤', label: t('tabProfile'), render: () => {
        const me = S.me, name = el('input', { value: me.name, maxlength: 24 }), st = el('input', { value: me.statusText, maxlength: 80, placeholder: t('statusPlaceholder') }), se = el('input', { value: me.statusEmoji, maxlength: 4, class: 'emo', placeholder: '🙂', 'aria-label': t('statusEmoji') });
        const av = el('div', { class: 'avline' }, LC.avatar(me, 'lg', false), el('button', { class: 'secondary sm', text: t('uploadPhoto'), onclick: () => file.click() }), me.avatar ? el('button', { class: 'secondary sm', text: t('removePhoto'), onclick: () => LC.api('/api/profile', { avatar: null }).then(() => LC.settingsPanel('profile')).catch(fail) }) : null);
        const file = el('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const b = await resizeToBlob(f, 256, 'image/jpeg', 0.85, true), up = await LC.upload(b, 'avatar.jpg').promise; await LC.api('/api/profile', { avatar: up.id }); LC.settingsPanel('profile'); } catch (x) { fail(x); } } });
        const sw = el('div', { class: 'swatches' }, swatches.map((c) => el('button', { class: 'swatch' + (me.color === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => LC.api('/api/profile', { color: c }).then(() => LC.settingsPanel('profile')).catch(fail) })), el('input', { type: 'color', value: me.color, 'aria-label': t('customColor'), onchange: (e) => LC.api('/api/profile', { color: e.target.value }).then(() => LC.settingsPanel('profile')).catch(fail) }));
        return el('div', {}, av, file, field(t('displayName'), name), row(field(t('statusEmoji'), se), field(t('statusText'), st)), field(t('avatarColor'), sw),
          field(t('presence'), select([['auto', t('online')], ['away', t('away')], ['dnd', t('dnd')], ['invisible', t('invisible')]], me.presence, (v) => LC.api('/api/presence', { state: v }).catch(fail), t('presence')), t('presenceHelp')),
          el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('save'), onclick: async () => { try { await LC.api('/api/profile', { name: name.value, statusText: st.value, statusEmoji: se.value }); LC.toast(t('saved'), { ms: 1500 }); LC.settingsPanel('profile'); } catch (e) { fail(e); } } })));
      } },
      { key: 'appearance', icon: '🎨', label: t('tabAppearance'), render: () => {
        const u = LC.ui, acc = el('div', { class: 'swatches' }, swatches.map((c) => el('button', { class: 'swatch' + (u.accent === c ? ' on' : ''), style: { background: c }, 'aria-label': c, onclick: () => { LC.setUi({ accent: c }); LC.settingsPanel('appearance'); } })), el('input', { type: 'color', value: u.accent, 'aria-label': t('customColor'), onchange: (e) => LC.setUi({ accent: e.target.value }) }));
        return el('div', {}, field(t('theme'), select([['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')], ['hc', t('themeHC')]], u.theme, (v) => LC.setUi({ theme: v }), t('theme'))), field(t('accent'), acc),
          field(t('fontSize') + ` (${u.font}%)`, el('input', { type: 'range', min: 80, max: 150, step: 5, value: u.font, 'aria-label': t('fontSize'), oninput: (e) => LC.setUi({ font: Number(e.target.value) }), onchange: () => LC.settingsPanel('appearance') })),
          toggle(t('compactLayout'), u.compact, (v) => LC.setUi({ compact: v })), toggle(t('reduceMotion'), u.reduceMotion, (v) => LC.setUi({ reduceMotion: v })),
          field(t('wallpaper'), select([['none', t('wallNone')], ['dots', t('wallDots')], ['waves', t('wallWaves')], ['sunset', t('wallSunset')], ['forest', t('wallForest')], ['night', t('wallNight')]], u.wall, (v) => LC.setUi({ wall: v }), t('wallpaper'))),
          field(t('language'), select([['auto', t('langAuto')], ...Object.entries(LC.languages).map(([k, v]) => [k, v])], u.lang, (v) => { LC.setUi({ lang: v }); LC.settingsPanel('appearance'); }, t('language')), t('langNote')));
      } },
      { key: 'notifications', icon: '🔔', label: t('tabNotifications'), render: () => {
        const np = LC.prefs().notif || {}, q = LC.prefs().quiet || { on: false, from: '22:00', to: '07:00' }, setN = (k, v) => LC.setPrefs({ notif: { previews: np.previews !== false, sound: np.sound !== false, desktop: np.desktop !== false, mentionsOnly: !!np.mentionsOnly, ...{ [k]: v } } });
        const setQ = (patch) => LC.setPrefs({ quiet: { ...q, ...patch } }), custom = el('input', { type: 'file', accept: 'audio/*', class: 'hidden', onchange: (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 300000) return LC.toast(t('soundTooBig')); const r = new FileReader(); r.onload = () => { LC.setUi({ customSound: r.result, sound: 'custom' }); LC.playSound('custom'); LC.settingsPanel('notifications'); }; r.readAsDataURL(f); } });
        return el('div', {}, toggle(t('notifSound'), np.sound !== false, (v) => setN('sound', v)),
          row(field(t('soundChoice'), select([['chime', t('soundChime')], ['ping', t('soundPing')], ['pop', t('soundPop')], ['none', t('soundNone')], ...(LC.ui.customSound ? [['custom', t('soundCustom')]] : [])], LC.ui.sound, (v) => { LC.setUi({ sound: v }); LC.playSound(v); }, t('soundChoice'))), el('button', { class: 'secondary sm', text: '▶ ' + t('test'), onclick: () => LC.playSound() }), el('button', { class: 'secondary sm', text: t('uploadSound'), onclick: () => custom.click() })), custom,
          toggle(t('notifDesktop'), np.desktop !== false, (v) => { setN('desktop', v); if (v && !LC.native && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, LC.native ? '' : window.isSecureContext ? '' : t('notifInsecure')),
          toggle(t('notifPreviews'), np.previews !== false, (v) => setN('previews', v)), toggle(t('notifMentionsOnly'), np.mentionsOnly, (v) => setN('mentionsOnly', v)),
          el('h3', { text: t('quietHours') }), toggle(t('quietOn'), q.on, (v) => setQ({ on: v })), row(field(t('from'), el('input', { type: 'time', value: q.from, onchange: (e) => setQ({ from: e.target.value }) })), field(t('to'), el('input', { type: 'time', value: q.to, onchange: (e) => setQ({ to: e.target.value }) }))),
          el('h3', { text: t('privacy') }), toggle(t('readReceipts'), LC.prefs().readReceipts !== false, (v) => LC.setPrefs({ readReceipts: v }), t('readReceiptsHint')));
      } },
      { key: 'people', icon: '⭐', label: t('tabFriends'), render: () => {
        const nn = LC.prefs().nicknames || {}, favs = new Set(LC.prefs().favorites || []), users = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed);
        return el('div', {}, el('p', { class: 'muted small', text: t('nickHelp') }), ...users.map((u) => { const inp = el('input', { value: nn[u.id] || '', maxlength: 24, placeholder: u.name, 'aria-label': t('nicknameFor', { name: u.name }), onchange: (e) => { const n = { ...(LC.prefs().nicknames || {}) }; if (e.target.value.trim()) n[u.id] = e.target.value.trim(); else delete n[u.id]; LC.setPrefs({ nicknames: n }); } }); return row(LC.avatar(u, 'sm', true), el('span', { class: 'grow', text: u.name }), inp, el('button', { class: 'icon', text: favs.has(u.id) ? '⭐' : '☆', 'aria-label': t('favorite'), onclick: (e) => { LC.toggleFavorite(u.id); e.target.textContent = favs.has(u.id) ? '☆' : '⭐'; } })); }));
      } },
      { key: 'emoji', icon: '😀', label: t('customEmoji'), render: () => emojiPane() },
      { key: 'about', icon: 'ⓘ', label: t('tabAbout'), render: () => el('div', {}, el('p', {}, el('b', { text: S.chatName }), ' · LANChat'), el('p', { class: 'muted', text: t('aboutText') }), el('p', { class: 'muted small', text: t('yourRole', { role: t('role_' + S.me.role) }) }), el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('shortcuts'), onclick: () => LC.shortcutsHelp() }), el('button', { class: 'secondary', text: t('signOut'), onclick: async () => { if (await LC.confirm(t('confirmSignOut'))) LC.signOut('manual'); } })), el('h3', { text: t('myAccount') }), LC.isOwner() ? el('p', { class: 'muted small', text: t('ownerCantDelete') }) : el('div', {}, el('p', { class: 'muted small', text: t('deleteMyAccountHelp') }), el('div', { class: 'acts' }, el('button', { class: 'secondary danger', text: t('deleteMyAccount'), onclick: async () => { if (!(await LC.confirm(t('confirmDeleteAccount'), { danger: true, ok: t('delete') }))) return; const purge = await LC.confirm(t('confirmDeleteAccountMsgs'), { ok: t('alsoDeleteMsgs'), cancel: t('keepMsgs') }); LC.api('/api/account/delete', { purge }).then(() => LC.signOut('deleted')).catch(fail); } })))) },
    ];
    tabbed('⚙ ' + t('settings'), tabs, start);
  };

  // ---------- custom emoji ----------
  function emojiPane() {
    const names = Object.keys(S.emojis).sort(), nm = el('input', { placeholder: t('emojiName'), maxlength: 20, 'aria-label': t('emojiName') }), file = el('input', { type: 'file', accept: 'image/*', 'aria-label': t('emojiImage') });
    return el('div', {}, el('p', { class: 'muted small', text: t('emojiHelp') }), names.length ? el('div', { class: 'emojigrid' }, names.map((n) => el('div', { class: 'emojicell' }, el('img', { class: 'cemoji big', src: LC.fileUrl({ id: S.emojis[n], name: n + '.png' }, true), alt: ':' + n + ':' }), el('code', { text: ':' + n + ':' }), LC.isAdmin() || true ? el('button', { class: 'icon', text: '🗑', 'aria-label': t('delete'), title: t('delete'), onclick: async () => { try { await LC.api('/api/emoji/remove', { name: n }); LC.settingsPanel('emoji'); } catch (e) { fail(e); } } }) : null))) : el('p', { class: 'muted', text: t('noCustomEmoji') }),
      el('h3', { text: t('addEmoji') }), row(nm, file, el('button', { class: 'primary sm', text: t('add'), onclick: async () => { const f = file.files[0]; if (!f || !nm.value.trim()) return LC.toast(t('emojiNeeds')); try { const b = await resizeToBlob(f, 128, 'image/png', 1, false), up = await LC.upload(b, 'emoji.png').promise; await LC.api('/api/emoji/add', { name: nm.value.trim(), file: up.id }); LC.settingsPanel('emoji'); } catch (e) { fail(e); } } })));
  }
  LC.emojiManager = () => LC.settingsPanel('emoji');

  // ---------- saved & scheduled ----------
  LC.savedMessages = async () => {
    const out = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('loading') })); LC.modal([el('h2', { text: '🔖 ' + t('savedMsgs') }), out, el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
    try { const ids = LC.prefs().saved || [], { messages } = ids.length ? await LC.api('/api/messages/byids', { ids }) : { messages: [] };
      out.replaceChildren(...(messages.length ? messages.map((m) => el('div', { class: 'hit row-between' }, el('button', { class: 'plain', onclick: () => { LC.closeModal(); LC.jumpToMessage(m.chan, m.id); } }, el('small', { text: `${LC.uname(m.from)} · ${LC.chanInfo(m.chan).title} · ${LC.fmtDateTime(m.ts)}` }), el('div', { text: LC.snippet(m) })), el('button', { class: 'secondary sm', text: t('unsave'), onclick: () => { LC.setPrefs({ saved: ids.filter((x) => x !== m.id) }).then(() => LC.savedMessages()); } }))) : [el('p', { class: 'muted', text: t('noSaved') })])); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };
  LC.scheduledList = async () => {
    const out = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('loading') })); LC.modal([el('h2', { text: '🕑 ' + t('scheduledMsgs') }), out, el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
    try { const { scheduled } = await LC.api('/api/scheduled'); out.replaceChildren(...(scheduled.length ? scheduled.map((s) => el('div', { class: 'hit row-between' }, el('div', {}, el('small', { text: `${LC.chanInfo(s.chan).title} · ${LC.fmtDateTime(s.sendAt)}` }), el('div', { text: s.text || '📎' })), el('button', { class: 'secondary sm', text: t('cancelSend'), onclick: () => LC.api('/api/scheduled/cancel', { id: s.id }).then(() => LC.scheduledList()).catch(fail) }))) : [el('p', { class: 'muted', text: t('noScheduled') })])); } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };

  // ---------- new channel / group ----------
  LC.newChannelDialog = () => {
    let group = false; const picks = new Set(), others = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed), canCh = LC.isAdmin() || S.settings.membersCanCreateChannels, canGr = LC.isAdmin() || S.settings.membersCanCreateGroups;
    if (!canCh && !canGr) return LC.toast(t('noCreateRights')); if (!canCh) group = true;
    const name = el('input', { placeholder: t('channelName'), maxlength: 30, 'aria-label': t('name') }), topic = el('input', { placeholder: t('topicOptional'), maxlength: 100 }), cat = el('input', { placeholder: t('categoryOptional'), maxlength: 30, list: 'catlist' }), ro = el('input', { type: 'checkbox' }), err = el('div', { class: 'err', role: 'alert' });
    const people = el('div', { class: 'people' }, others.length ? others.map((u) => el('label', { class: 'pick' }, el('input', { type: 'checkbox', onchange: (e) => (e.target.checked ? picks.add(u.id) : picks.delete(u.id)) }), LC.avatar(u, 'sm', false), LC.uname(u.id))) : el('div', { class: 'muted', text: t('noFriendsYet') }));
    const cats = el('datalist', { id: 'catlist' }, [...new Set([...S.channels.values()].map((c) => c.category).filter(Boolean))].map((c) => el('option', { value: c })));
    const adv = el('div', {}, topic, cat, cats, LC.isAdmin() ? el('label', { class: 'check' }, ro, ' ' + t('readonlyOption')) : null);
    const segs = [[t('chanTab'), false, canCh], [t('groupTab'), true, canGr]].filter((s) => s[2]).map(([lab, g]) => el('button', { type: 'button', class: 'seg' + (g === group ? ' on' : ''), text: lab, onclick: () => { group = g; segs.forEach((b, i) => b.classList.toggle('on', segs.length > 1 ? (i === 1) === g : true)); people.classList.toggle('hidden', !g); adv.classList.toggle('hidden', g); name.placeholder = g ? t('groupName') : t('channelName'); } }));
    people.classList.toggle('hidden', !group); adv.classList.toggle('hidden', group); name.placeholder = group ? t('groupName') : t('channelName');
    const go = async (e) => { e.preventDefault(); try { const c = await LC.api('/api/channel', group ? { name: name.value, members: [...picks] } : { name: name.value, topic: topic.value, category: cat.value, readonly: ro.checked }); S.channels.set(c.id, c); LC.closeModal(); LC.openChat(c.id); } catch (x) { err.textContent = x.message; } };
    LC.modal(el('form', { onsubmit: go }, el('h2', { text: t('createNew') }), el('div', { class: 'segs' }, segs), name, adv, people, err, el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', type: 'submit', text: t('create') }))));
  };

  // ---------- chat info ----------
  LC.chatInfo = (chan) => {
    const i = LC.chanInfo(chan); const body = [];
    if (i.kind === 'dm') {
      const u = i.peer, ttl = S.dmTtl[chan] || 0;
      body.push(el('div', { class: 'profile' }, LC.avatar(u, 'lg', true), el('div', {}, el('h2', { text: LC.realName(u.id), style: { margin: 0 } }), el('div', { class: 'muted', text: (u.statusEmoji || '') + ' ' + (u.statusText || t(u.presence)) }), u.role !== 'member' ? el('span', { class: 'role ' + u.role, text: t('role_' + u.role) }) : null)),
        field(t('disappearing'), select(ttlOptions(), ttl, (v) => LC.api('/api/chat/ttl', { chan, ttl: Number(v) }).catch(fail), t('disappearing')), t('disappearingHelp')),
        row(el('button', { class: 'secondary', text: '🏷 ' + t('setNickname'), onclick: () => LC.nicknameDialog(u.id) }), el('button', { class: 'secondary', text: '⭐ ' + ((LC.prefs().favorites || []).includes(u.id) ? t('unfavorite') : t('favorite')), onclick: () => { LC.toggleFavorite(u.id); LC.closeModal(); } }), el('button', { class: 'secondary', text: '📁 ' + t('tabFiles'), onclick: () => { LC.closeModal(); LC.setTab('files'); } })));
    } else if (i.c) {
      const c = i.c, canManage = LC.isAdmin() || (c.members && c.by === S.me.id), nm = el('input', { value: c.name, maxlength: 30, disabled: !canManage }), tp = el('input', { value: c.topic || '', maxlength: 100, disabled: !canManage }), ct = el('input', { value: c.category || '', maxlength: 30, disabled: !canManage });
      body.push(el('h2', { text: i.title }), field(t('name'), nm), field(t('topic'), tp), !c.members ? field(t('category'), ct) : null);
      if (canManage) {
        body.push(!c.members || true ? toggle(t('readonlyOption'), c.readonly, (v) => LC.api('/api/channel/update', { id: c.id, readonly: v }).catch(fail)) : null,
          field(t('slowModeLabel'), select([[0, t('off')], [5, '5 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [3600, '1 h']], c.slow || 0, (v) => LC.api('/api/channel/update', { id: c.id, slow: Number(v) }).catch(fail), t('slowModeLabel'))),
          field(t('disappearing'), select(ttlOptions(), c.ttl || 0, (v) => LC.api('/api/channel/update', { id: c.id, ttl: Number(v) }).catch(fail), t('disappearing')), t('disappearingHelp')),
          el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('save'), onclick: () => LC.api('/api/channel/update', { id: c.id, name: nm.value, topic: tp.value, category: ct.value }).then(() => { LC.toast(t('saved'), { ms: 1500 }); }).catch(fail) })));
      }
      if (c.members) {
        body.push(el('h3', { text: t('members') + ` (${c.members.length})` }), ...c.members.map((id) => row(LC.avatar(S.users.get(id), 'sm', true), el('span', { class: 'grow', text: LC.uname(id) }), canManage && id !== S.me.id ? el('button', { class: 'secondary sm', text: t('remove'), onclick: async () => { if (await LC.confirm(t('confirmRemoveMember', { name: LC.uname(id) }))) LC.api('/api/channel/members', { id: c.id, remove: [id] }).then(() => LC.chatInfo(chan)).catch(fail); } }) : null)));
        const add = [...S.users.values()].filter((u) => !u.removed && !c.members.includes(u.id));
        if (canManage && add.length) { const sel = el('select', { 'aria-label': t('addPeople') }, el('option', { value: '', text: t('addPeople') }), add.map((u) => el('option', { value: u.id, text: LC.uname(u.id) }))); body.push(row(sel, el('button', { class: 'secondary sm', text: t('add'), onclick: () => sel.value && LC.api('/api/channel/members', { id: c.id, add: [sel.value] }).then(() => LC.chatInfo(chan)).catch(fail) }))); }
        body.push(el('div', { class: 'acts' }, el('button', { class: 'secondary danger', text: t('leaveGroup'), onclick: async () => { if (await LC.confirm(t('confirmLeave'), { danger: true })) LC.api('/api/channel/members', { id: c.id, remove: [S.me.id] }).then(() => { LC.closeModal(); }).catch(fail); } })));
      } else body.push(el('p', { class: 'muted small', text: t('everyoneCanSee', { n: S.users.size }) }));
      if (canManage && c.id !== 'general') body.push(el('div', { class: 'acts' }, el('button', { class: 'secondary danger', text: '🗑 ' + t('deleteChat'), onclick: async () => { if (await LC.confirm(t('confirmDeleteChat', { name: c.name }), { danger: true, ok: t('delete') })) LC.api('/api/channel/delete', { id: c.id }).then(() => LC.closeModal()).catch(fail); } })));
    }
      { const mine = el('button', { class: 'secondary', text: '🧹 ' + t('deleteMyMsgs'), onclick: async () => { if (await LC.confirm(t('confirmDeleteMine'), { danger: true, ok: t('delete') })) LC.api('/api/chat/clear', { chan, scope: 'mine' }).then((r) => { LC.toast(t('cleanupDone', { n: r.removed }), { ms: 2000 }); }).catch(fail); } }); const all = (i.c && (LC.isAdmin() || (i.c.members && i.c.by === S.me.id))) ? el('button', { class: 'secondary danger', text: '🧹 ' + t('clearAll'), onclick: async () => { if (await LC.confirm(t('confirmClearAll'), { danger: true, ok: t('delete') })) LC.api('/api/chat/clear', { chan, scope: 'all' }).then(() => LC.closeModal()).catch(fail); } }) : null; body.push(el('div', { class: 'acts' }, mine, all)); }
    body.push(el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }))); LC.modal(body, { wide: true });
  };
  const ttlOptions = () => [[0, t('off')], [60, '1 min'], [300, '5 min'], [3600, '1 h'], [86400, '1 ' + t('day')], [604800, '1 ' + t('week')], [2592000, '30 ' + t('days')]];

  // ---------- admin ----------
  let adminTabs = null;
  LC.adminPanel = (start = LC.isOwner() ? 'requests' : 'requests', focusUser) => {
    const owner = LC.isOwner();
    const tabs = [
      { key: 'requests', icon: '🚪', label: t('adminRequests') + (S.pendingReqs.length ? ` (${S.pendingReqs.length})` : ''), render: async () => {
        const { requests } = await LC.api('/api/admin/requests'); S.pendingReqs = requests;
        const decide = async (r, decision) => { try { await LC.api('/api/admin/requests/decide', { id: r.id, decision }); S.pendingReqs = S.pendingReqs.filter((x) => x.id !== r.id); adminTabs.show('requests'); LC.renderNav(); } catch (e) { fail(e); adminTabs.show('requests'); } };
        return el('div', {}, el('p', { class: 'muted small', text: S.settings.requireApproval ? t('approvalOn') : t('approvalOff') }), requests.length ? requests.map((r) => el('div', { class: 'req' }, el('div', { class: 'grow' }, el('b', { text: r.name }), r.existing ? el('span', { class: 'pill', text: t('existingAcct') }) : el('span', { class: 'pill new', text: t('newPerson') }), el('div', { class: 'muted small', text: `${LC.ago(r.ts)} · ${r.ip || ''}` })), el('button', { class: 'primary sm', text: t('approve'), onclick: () => decide(r, 'approve') }), el('button', { class: 'secondary sm', text: t('deny'), onclick: () => decide(r, 'deny') }), el('button', { class: 'secondary sm danger', text: t('block'), onclick: async () => { if (await LC.confirm(t('confirmBlock', { name: r.name }), { danger: true, ok: t('block') })) decide(r, 'block'); } }))) : el('p', { class: 'empty', text: t('noRequests') }));
      } },
      { key: 'people', icon: '👥', label: t('adminPeople'), render: async () => {
        const { users } = await LC.api('/api/admin/users'); const showRem = !!adminTabs.showRemoved; const act = (path, body, msg) => LC.api(path, body).then(() => { if (msg) LC.toast(msg, { ms: 1800 }); adminTabs.show('people'); }).catch(fail);
        return el('div', {}, toggle(t('showRemoved'), showRem, (v) => { adminTabs.showRemoved = v; adminTabs.show('people'); }), el('div', { class: 'tablewrap' }, el('table', { class: 'table' }, el('thead', {}, el('tr', {}, ...['person', 'role', 'activity', 'storage', 'actions'].map((h) => el('th', { text: t('col_' + h) })))), el('tbody', {}, users.filter((u) => showRem || !u.removed || u.id === focusUser).map((u) => {
          const me = u.id === S.me.id, muted = u.muted, ownerRow = u.role === 'owner';
          const menu = (a) => LC.menu(a, [
            owner && !ownerRow && u.role !== 'admin' ? { icon: '🛡', label: t('makeAdmin'), fn: () => act('/api/admin/user/role', { id: u.id, role: 'admin' }) } : null, owner && u.role === 'admin' ? { icon: '👤', label: t('removeAdmin'), fn: () => act('/api/admin/user/role', { id: u.id, role: 'member' }) } : null,
            !ownerRow ? { icon: '🔇', label: t('timeout10'), fn: () => act('/api/admin/user/mute', { id: u.id, minutes: 10 }) } : null, !ownerRow ? { icon: '🔇', label: t('timeout1h'), fn: () => act('/api/admin/user/mute', { id: u.id, minutes: 60 }) } : null, !ownerRow ? { icon: '🔇', label: t('timeout1d'), fn: () => act('/api/admin/user/mute', { id: u.id, minutes: 1440 }) } : null, !ownerRow ? { icon: '🔇', label: t('timeoutForever'), fn: () => act('/api/admin/user/mute', { id: u.id, minutes: -1 }) } : null, muted ? { icon: '🔊', label: t('unmuteUser'), fn: () => act('/api/admin/user/mute', { id: u.id, minutes: 0 }) } : null,
            !ownerRow && !me ? 'sep' : null, !ownerRow && !me && !u.removed ? { icon: '🚪', label: t('removeUser'), danger: true, fn: () => removeDialog(u) } : null, !ownerRow && !me && (owner || u.role !== 'admin') ? { icon: '🗑', label: t('deleteAccountPerm'), danger: true, fn: () => deleteDialog(u) } : null]);
          return el('tr', { class: u.id === focusUser ? 'focus' : '' }, el('td', {}, el('div', { class: 'rowline' }, LC.avatar(u, 'sm', true), el('div', {}, el('b', { text: u.name }), me ? el('small', { text: ' (' + t('you') + ')' }) : null, u.removed ? el('span', { class: 'pill', text: t('removedPill') }) : null, muted ? el('span', { class: 'pill', text: '🔇' }) : null))), el('td', { text: t('role_' + u.role) }),
            el('td', { class: 'small', text: `${t(u.presence)}${u.presence === 'offline' && u.lastSeen ? ' · ' + LC.ago(u.lastSeen) : ''} · ${u.messages} ${t('msgsShort')}` }), el('td', { class: 'small', text: bytes(u.bytes) }), el('td', {}, ownerRow ? null : el('button', { class: 'secondary sm', text: '⋯ ' + t('actions'), onclick: (e) => menu(e.currentTarget) })));
        })))));
        function deleteDialog(u) { const purge = el('input', { type: 'checkbox' }); LC.modal([el('h2', { text: t('deleteAccountPerm') + ': ' + u.name }), el('p', { text: t('deleteAccountHelp') }), el('label', { class: 'check' }, purge, ' ' + t('alsoDeleteMsgs')), el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('people') }), el('button', { class: 'primary danger', text: t('deleteAccountPerm'), onclick: () => LC.api('/api/admin/user/delete', { id: u.id, purge: purge.checked }).then(() => LC.adminPanel('people')).catch(fail) }))]); }
        function removeDialog(u) { const block = el('input', { type: 'checkbox' }), purge = el('input', { type: 'checkbox' }); LC.modal([el('h2', { text: t('removeUser') + ': ' + u.name }), el('p', { text: t('removeUserHelp') }), el('label', { class: 'check' }, block, ' ' + t('alsoBlock')), el('label', { class: 'check' }, purge, ' ' + t('alsoPurge')), el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('people') }), el('button', { class: 'primary danger', text: t('removeUser'), onclick: () => LC.api('/api/admin/user/remove', { id: u.id, block: block.checked, purge: purge.checked }).then(() => LC.adminPanel('people')).catch(fail) }))]); }
      } },
      { key: 'settings', icon: '⚙', label: t('adminSettings'), render: async () => {
        const { settings: s } = await LC.api('/api/admin/settings'), set = (patch) => LC.api('/api/admin/settings', patch).then(() => LC.toast(t('saved'), { ms: 1200 })).catch((e) => { fail(e); adminTabs.show('settings'); }), ro = !owner;
        const pc = el('input', { value: s.passcode || '', maxlength: 64, placeholder: t('noPasscode'), disabled: ro, onchange: (e) => set({ passcode: e.target.value }) }), nm = el('input', { value: S.chatName, maxlength: 40, disabled: ro });
        const tg = (label, key, hint) => { const c = toggle(label, s[key], (v) => set({ [key]: v }), hint); if (ro) c.querySelector('input').disabled = true; return c; };
        return el('div', {}, ro ? el('p', { class: 'muted small', text: t('ownerOnly') }) : null,
          el('h3', { text: t('whoCanJoin') }), toggle(t('requireApproval'), s.requireApproval, async (v) => { if (!v && !(await LC.confirm(t('confirmOpenJoin'), { danger: true }))) return adminTabs.show('settings'); set({ requireApproval: v }); }, t('requireApprovalHint')), field(t('passcodeLabel'), row(pc, ro ? null : el('button', { class: 'secondary sm', text: t('generate'), onclick: () => { pc.value = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 6); set({ passcode: pc.value }); } })), t('passcodeHint')),
          el('h3', { text: t('sessionName') }), row(nm, ro ? null : el('button', { class: 'secondary sm', text: t('rename'), onclick: () => LC.api('/api/admin/name', { name: nm.value }).then(() => LC.toast(t('saved'), { ms: 1200 })).catch(fail) })),
          el('h3', { text: t('memberPowers') }), tg(t('mCreateChannels'), 'membersCanCreateChannels'), tg(t('mCreateGroups'), 'membersCanCreateGroups'), tg(t('mEveryone'), 'membersCanEveryone'), tg(t('mEmoji'), 'membersCanAddEmoji'),
          el('h3', { text: t('content') }), tg(t('linkPreviews'), 'linkPreviews', t('linkPreviewsHint')),
          field(t('defaultDisappear'), Object.assign(select(ttlOptions(), s.defaultTtl, (v) => set({ defaultTtl: Number(v) }), t('defaultDisappear')), { disabled: ro })), field(t('retention'), Object.assign(select([[0, t('keepForever')], [7, '7 ' + t('days')], [30, '30 ' + t('days')], [90, '90 ' + t('days')], [365, '1 ' + t('year')]], s.retentionDays, (v) => set({ retentionDays: Number(v) }), t('retention')), { disabled: ro }), t('retentionHint')),
          field(t('maxUpload') + ' (MB)', el('input', { type: 'number', min: 1, max: 4096, value: s.maxUploadMB, disabled: ro, onchange: (e) => set({ maxUploadMB: Number(e.target.value) }) })),
          owner ? el('div', { class: 'acts' }, el('button', { class: 'secondary', text: '🧹 ' + t('runCleanup'), onclick: async () => { if (await LC.confirm(t('confirmCleanup'), { danger: true })) LC.api('/api/admin/retention/run', {}).then((r) => LC.toast(t('cleanedN', { n: r.removed }))).catch(fail); } })) : null);
      } },
      { key: 'storage', icon: '💾', label: t('adminStorage'), render: async () => {
        const s = await LC.api('/api/admin/storage'), pct = s.disk ? Math.round(((s.disk.total - s.disk.free) / s.disk.total) * 100) : 0, tbl = (cols, rows) => el('table', { class: 'table small' }, el('thead', {}, el('tr', {}, cols.map((c) => el('th', { text: c })))), el('tbody', {}, rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: c }))))));
        return el('div', {}, row(stat(bytes(s.fileBytes), t('statFiles', { n: s.files })), stat(bytes(s.dbBytes), t('statHistory', { n: s.messages })), s.disk ? stat(bytes(s.disk.free), t('statFree')) : null), s.disk ? el('div', { class: 'meter', 'aria-label': t('diskUsed', { n: pct }) }, el('i', { style: { width: pct + '%' } })) : null,
          el('h3', { text: t('perPerson') }), tbl([t('col_person'), t('col_storage'), t('statFilesShort')], s.perUser.map((u) => [u.name, bytes(u.bytes), u.files])), el('h3', { text: t('perChat') }), tbl([t('chat'), t('col_messages'), t('col_storage')], s.perChat.map((c) => [c.name, c.messages, bytes(c.bytes)])), el('h3', { text: t('largestFiles') }), tbl([t('file'), t('col_storage'), t('by')], s.largest.map((f) => [f.name, bytes(f.size), f.by])));
        function stat(big, small) { return el('div', { class: 'stat' }, el('b', { text: big }), el('small', { text: small })); }
      } },
      { key: 'security', icon: '🔐', label: t('adminSecurity'), render: async () => {
        if (!owner) return el('p', { class: 'muted', text: t('ownerOnly') });
        const st = await LC.api('/api/admin/storage'), enc = st.encrypted, file = el('input', { type: 'file', accept: '.zip', 'aria-label': t('restoreFile') }), bp = el('input', { type: 'password', placeholder: t('backupPass'), autocomplete: 'off' }), p1 = el('input', { type: 'password', placeholder: t('passphrase'), autocomplete: 'new-password' }), p2 = el('input', { type: 'password', placeholder: t('passphrase2'), autocomplete: 'new-password' }), cur = el('input', { type: 'password', placeholder: t('currentPassphrase'), autocomplete: 'off' });
        return el('div', {}, el('h3', { text: '💾 ' + t('backup') }), el('p', { class: 'muted small', text: t('backupHelp') }), el('a', { class: 'primary btn', href: `/api/admin/backup?token=${encodeURIComponent(S.token)}`, download: '', text: '⬇ ' + t('downloadBackup') }),
          el('h3', { text: '♻ ' + t('restore') }), el('p', { class: 'muted small', text: t('restoreHelp') }), file, bp, el('div', { class: 'acts' }, el('button', { class: 'secondary danger', text: t('restoreBtn'), onclick: async () => {
            const f = file.files[0]; if (!f) return LC.toast(t('pickBackup')); if (!(await LC.confirm(t('confirmRestore'), { danger: true, ok: t('restoreBtn') }))) return;
            try { LC.toast(t('restoring'), { ms: 8000 }); const r = await fetch('/api/admin/restore', { method: 'POST', headers: { 'x-token': S.token, 'x-backup-pass': bp.value }, body: f }); const d = await r.json(); if (!r.ok) throw new Error(d.error); LC.toast(t('restored', { n: d.messages }), { ms: 6000 }); setTimeout(() => location.reload(), 1500); } catch (e) { fail(e); } } })),
          el('h3', { text: '🔐 ' + t('encryption') }), el('p', { class: 'muted small', text: enc ? t('encOn') : t('encOff') }), el('p', { class: 'muted small', text: t('encWarn') }),
          enc ? el('div', {}, cur, el('div', { class: 'acts' }, el('button', { class: 'secondary danger', text: t('encDisable'), onclick: () => LC.api('/api/admin/encryption', { enable: false, current: cur.value }).then(() => { LC.toast(t('saved')); adminTabs.show('security'); }).catch(fail) }))) : el('div', {}, p1, p2, el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('encEnable'), onclick: () => { if (p1.value !== p2.value) return LC.toast(t('passMismatch')); LC.api('/api/admin/encryption', { enable: true, passphrase: p1.value }).then(() => { LC.toast(t('saved')); adminTabs.show('security'); }).catch(fail); } }))));
      } },
      owner ? { key: 'cleanup', icon: '🧹', label: t('adminCleanup'), render: () => {
        const days = select([[1, '1 ' + t('day')], [7, '7 ' + t('days')], [30, '30 ' + t('days')], [90, '90 ' + t('days')], [180, '180 ' + t('days')], [365, '365 ' + t('days')], [0, t('allMessages')]], 30, () => {}, t('olderThan'));
        const chans = [['', t('allChats')], ...[...S.channels.values()].filter((c) => c.id.slice(0, 3) !== 'dm:').map((c) => [c.id, (c.members ? '👥 ' : '# ') + c.name])];
        const scope = select(chans, '', () => {}, t('whichChats')), keep = el('input', { type: 'checkbox', checked: true }), out = el('p', { class: 'muted small', role: 'status' });
        const req = (dryRun) => LC.api('/api/admin/cleanup', { days: Number(days.value), chan: scope.value || undefined, keepPinned: keep.checked, dryRun });
        const reset = el('input', { placeholder: 'RESET', 'aria-label': t('typeReset'), autocomplete: 'off' });
        return el('div', {}, el('h3', { text: t('deleteOld') }), el('p', { class: 'muted small', text: t('cleanupHelp') }), field(t('olderThan'), days), field(t('whichChats'), scope), el('label', { class: 'check' }, keep, ' ' + t('keepPinned')),
          el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('previewDelete'), onclick: () => req(true).then((r) => { out.textContent = t('cleanupPreview', { n: r.count, files: r.files, size: bytes(r.bytes) }); }).catch(fail) }),
            el('button', { class: 'primary danger', text: '🧹 ' + t('delete'), onclick: async () => { try { const r = await req(true); if (!r.count) { out.textContent = t('nothingToDelete'); return; } if (!(await LC.confirm(t('cleanupConfirm', { n: r.count, size: bytes(r.bytes) }), { danger: true, ok: t('delete') }))) return; const d = await req(false); out.textContent = t('cleanupDone', { n: d.removed }); } catch (e) { fail(e); } } })), out,
          el('h3', { text: t('startFresh') }), el('p', { class: 'muted small', text: t('startFreshHelp') }), field(t('typeReset'), reset),
          el('div', { class: 'acts' }, el('button', { class: 'primary danger', text: '⚠ ' + t('startFresh'), onclick: () => { if (reset.value !== 'RESET') return LC.toast(t('typeReset')); LC.api('/api/admin/reset', { confirm: 'RESET' }).then(() => location.reload()).catch(fail); } })));
      } } : null,
      { key: 'blocked', icon: '⛔', label: t('adminBlocked'), render: async () => {
        const b = await LC.api('/api/admin/bans'), un = (kind, value) => LC.api('/api/admin/unban', { kind, value }).then(() => adminTabs.show('blocked')).catch(fail), list = (title, kind, arr) => arr.length ? el('div', {}, el('h3', { text: title }), ...arr.map((v) => row(el('code', { class: 'grow', text: v.length > 40 ? v.slice(0, 40) + '…' : v }), el('button', { class: 'secondary sm', text: t('unblock'), onclick: () => un(kind, v) })))) : null;
        return el('div', {}, list(t('blockedNames'), 'name', b.names), list(t('blockedDevices'), 'device', b.devices), list(t('blockedIps'), 'ip', b.ips), !b.names.length && !b.devices.length && !b.ips.length ? el('p', { class: 'empty', text: t('noBlocked') }) : el('p', { class: 'muted small', text: t('blockNote') }));
      } },
    ];
    adminTabs = tabbed('🛡 ' + t('manage'), tabs.filter(Boolean), focusUser ? 'people' : start);
  };
  const refreshAdmin = () => { if (adminTabs && !$('#modal').classList.contains('hidden') && adminTabs.current() === 'requests') adminTabs.show('requests'); };
  LC.on('joinrequest', refreshAdmin); LC.on('joindecided', refreshAdmin);
})();

// Desktop menu -> web panels
(() => {
  const LC = window.LC;
  LC.openPanel = (name) => {
    if (!LC.S.me) return; const t = (k) => LC.t(k);
    if (name === 'invite') return LC.inviteDialog();
    if (name === 'shortcuts') return LC.shortcutsHelp();
    if (name === 'settings') return LC.settingsPanel();
    if (name.startsWith('admin:')) { if (!LC.isAdmin()) return LC.toast(t('ownerOnly')); return LC.adminPanel(name.slice(6)); }
  };
  if (LC.native && LC.native.onPanel) LC.native.onPanel((n) => LC.openPanel(String(n)));
})();
