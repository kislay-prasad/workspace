'use strict';
// Bots and automation (section 11): rich cards in messages (m.card) and their buttons, Bot / Guest badges next to
// names, a channel's Connectors (incoming and outgoing webhooks), message extensions in the message box ⋯ menu
// ("Create a card", manual workflows), and the Manage tabs Bots, Workflows and Developer (API keys, developer guide).
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v), U = LC.tmUi;
  LC.addStrings('en', {
    tm_bot: 'Bot', tm_workflow: 'Workflow', tm_card: 'Card', tm_cardSent: 'Sent', tm_createCard: 'Create a card', tm_cardTitle: 'Title', tm_cardText: 'Text', tm_cardPic: 'Picture', tm_facts: 'Facts', tm_addFact: 'Add a fact', tm_factK: 'Name', tm_factV: 'Value',
    tm_buttons: 'Buttons', tm_addLink: 'Add a link button', tm_addReply: 'Add a reply button', tm_btnLabel: 'Button text', tm_btnUrl: 'Link (https://…)', tm_btnReply: 'Reply that is posted', tm_post: 'Post', tm_runFlow: 'Run', tm_flowsMenu: 'Workflow: {name}', tm_flowDone: 'Workflow ran',
    tm_conn: 'Connectors and webhooks', tm_inHooks: 'Incoming webhooks', tm_inHelp: 'Other programs post into this channel by sending JSON { "text", "title", "card" } to a secret address.', tm_outHooks: 'Outgoing webhooks', tm_outHelp: 'A bot for this channel: when someone @mentions its name, LANChat sends the message to your service (signed with HMAC-SHA256) and posts its answer as a reply. 5-second limit.',
    tm_newIn: 'New incoming webhook', tm_newOut: 'New outgoing webhook', tm_hookName: 'Name', tm_hookPic: 'Picture (optional)', tm_hookUrl: 'Callback address (http:// or https://)', tm_hookCreated: 'Copy it now — it is shown only once.', tm_hookAddr: 'Address', tm_hookSecret: 'Security token (HMAC key)', tm_regen: 'New secret', tm_on: 'On', tm_lastUsed: 'Last used {when}', tm_neverUsed: 'Not used yet', tm_noHooks: 'None yet.',
    tm_tryIt: 'Try it', tm_err2: 'Error: {msg}', tm_onlyOwnersOut: 'Only admins and team owners can add outgoing webhooks.',
    tm_admBots: 'Bots', tm_admFlows: 'Workflows', tm_admDev: 'Developer', tm_newBot: 'New bot', tm_botName: 'Bot name', tm_rules: 'Replies', tm_rulesHelp: 'When a message matches, the bot answers. Use {person} for the sender’s name.', tm_addRule: 'Add a reply', tm_kw: 'Contains a word', tm_rx: 'Matches a pattern (regex)', tm_kwPh: 'words, separated by commas', tm_reply: 'Reply',
    tm_where: 'Where', tm_whereAll: 'Every chat it is in', tm_whereDm: 'Its 1:1 chats only', tm_welcomeT: 'Welcome new people', tm_welGeneral: 'Post in #general', tm_welDm: 'Send them a 1:1 message', tm_welText: 'Welcome message', tm_runs: '{n} runs', tm_lastRun: 'Last run {when}', tm_noBots: 'No bots yet.', tm_allHooks: 'Webhooks in this session', tm_editBot: 'Edit bot',
    tm_newFlow: 'New workflow', tm_noFlows: 'No workflows yet.', tm_flowName: 'Name', tm_when2: 'When this happens', tm_then: 'Do this', tm_addStep: 'Add a step', tm_test: 'Run now', tm_vars: 'You can use {person}, {text}, {chat}, {team}, {emoji}, {date}, {time} and {input}.',
    tm_tr_message: 'A message is posted', tm_tr_join: 'Someone joins the session', tm_tr_teamJoin: 'Someone joins a team', tm_tr_reaction: 'A reaction is added', tm_tr_schedule: 'On a schedule', tm_tr_manual: 'Someone runs it from the message box ⋯',
    tm_ac_post: 'Post a message', tm_ac_card: 'Post a card', tm_ac_dm: 'Send a 1:1 message', tm_ac_addTeam: 'Add the person to a team', tm_ac_addChannel: 'Add the person to a channel or group', tm_ac_task: 'Create a task', tm_ac_webhook: 'Call a webhook',
    tm_anyChannel: 'Any channel', tm_triggerChat: 'The chat where it happened', tm_containing: 'Containing any of these words (optional)', tm_anyTeam: 'Any team', tm_emoji: 'Emoji (empty = any)', tm_daily: 'Every day', tm_weekly: 'On these days', tm_at: 'At', tm_inputLabel: 'Question to ask (optional)',
    tm_toPerson: 'The person who started it', tm_to: 'Send to', tm_chat: 'Chat', tm_team: 'Team', tm_url: 'Address', tm_flowOn: 'On', tm_dev: 'Developer', tm_devHelp: 'API keys let your own programs read and post as a bot, only in the chats the bot is in. Keys are shown once and stored hashed.',
    tm_guide: 'Developer guide', tm_keys: 'API keys', tm_newKey: 'New API key', tm_keyName: 'Key name', tm_actsAs: 'Acts as bot', tm_newBotNamed: 'A new bot named…', tm_scopes: 'Allowed', tm_scRead: 'Read messages', tm_scPost: 'Post messages', tm_keyShown: 'Your API key (copy it now; it is shown only once):', tm_revoked: 'Revoked', tm_active: 'Active', tm_noKeys: 'No API keys yet.',
    tm_sun: 'Sun', tm_mon: 'Mon', tm_tue: 'Tue', tm_wed: 'Wed', tm_thu: 'Thu', tm_fri: 'Fri', tm_sat: 'Sat', tm_input: 'Your answer',
  });
  LC.addStrings('hi', { tm_bot: 'बॉट', tm_createCard: 'कार्ड बनाएँ', tm_admBots: 'बॉट', tm_admFlows: 'वर्कफ़्लो' });
  LC.addStrings('es', { tm_bot: 'Bot', tm_createCard: 'Crear una tarjeta', tm_admBots: 'Bots', tm_admFlows: 'Flujos de trabajo' });
  const B = (LC.tmBots = {});
  const fmt = (ts) => (ts ? LC.fmtDateTime(ts) : '—');
  const refresh = (k) => LC.adminTabsApi && LC.adminTabsApi.show(k);
  const base = async () => { try { const i = await LC.api('/api/info'); const u = i.urls[0]; return u ? (i.https && u.secureUrl) || u.url : location.origin; } catch { return location.origin; } };
  const copyRow = (label, value) => el('div', { class: 'addr' }, el('span', { class: 'muted small', text: label }), el('code', { class: 'tm-secret', text: value }), el('button', { type: 'button', class: 'secondary sm', text: t('copy'), onclick: async (e) => { await LC.copy(value); e.target.textContent = t('copied'); } }));
  const uploadPic = async (file) => { const blob = await (await fetch(await U.imageData(file, 256, 'image/png', 0.9, 400000))).blob(); return (await LC.upload(blob, 'bot.png').promise).id; };

  // ---------- cards in messages ----------
  function btnEl(m, b, i) {
    if (b.url) return el('a', { class: 'secondary sm btn', href: b.url, target: '_blank', rel: 'noopener noreferrer' }, LC.icon('open'), ' ' + b.label);
    return el('button', { type: 'button', class: 'secondary sm', text: b.label, onclick: async (e) => {
      const btn = e.currentTarget; btn.disabled = true;
      try { if (b.action === 'reply') await LC.api('/api/send', { chan: m.chan, text: b.value, thread: m.thread || m.id }); else { const r = await LC.api('/api/tm/card/action', { id: m.id, button: i }); LC.toast(r.text || t('tm_cardSent'), { ms: 2500 }); } } catch (x) { U.fail(x); }
      btn.disabled = false;
    } });
  }
  function cardEl(m) {
    const c = m.card; if (!c || m.deleted) return null;
    return el('div', { class: 'tm-cardmsg', role: 'group', 'aria-label': c.title || t('tm_card') },
      c.image ? el('img', { class: 'tm-cardimg', src: c.image, alt: c.title || '', loading: 'lazy' }) : null,
      el('div', { class: 'tm-cardbody' }, c.title ? el('div', { class: 'tm-cardtitle', text: c.title }) : null, c.text ? el('div', { class: 'tm-cardtext' }, LC.renderText(c.text)) : null,
        c.facts && c.facts.length ? el('dl', { class: 'tm-facts' }, c.facts.flatMap((f) => [el('dt', { text: f.k }), el('dd', { text: f.v })])) : null,
        c.buttons && c.buttons.length ? el('div', { class: 'tm-cardbtns' }, c.buttons.map((b, i) => btnEl(m, b, i))) : null));
  }
  LC.ext.msgParts.push((m) => cardEl(m));
  // "Bot", "Workflow" or "Guest" next to the author's name (moved into the header once the bubble is built)
  LC.ext.msgParts.push((m) => {
    const u = S.users.get(m.from); if (!u || m.system || m.deleted) return null;
    const label = u.bot ? (m.bot && m.bot.kind === 'flow' ? t('tm_workflow') : t('tm_bot')) : u.role === 'guest' ? t('role_guest') : null; if (!label) return null;
    const b = el('span', { class: 'role tm-role ' + (u.bot ? 'bot' : 'guest'), text: label });
    queueMicrotask(() => { const body = b.parentElement, mh = body && body.querySelector(':scope > .mh'), who = mh && mh.querySelector('.who'); if (who) who.after(b); else b.remove(); });
    return b;
  });

  // ---------- message extensions (message box ⋯) ----------
  let manual = { at: 0, list: [] };
  const loadManual = async (chan) => { if (Date.now() - manual.at > 30000) { try { manual = { at: Date.now(), list: (await LC.api('/api/tm/flows/manual?chan=' + encodeURIComponent(chan || ''))).flows }; } catch { manual = { at: Date.now(), list: [] }; } } return manual.list; };
  LC.addEvents('tm_flows');
  LC.on('init', () => { manual.at = 0; if (S.me && S.me.role !== 'guest') loadManual(''); });
  LC.on('tm_flows', () => { manual.at = 0; if (S.me && S.me.role !== 'guest') loadManual(''); });
  LC.ext.composerMore.push((composer) => {
    const chan = composer.cfg.chan(); if (!chan) return [];
    return ['sep', { icon: 'card_ui', label: t('tm_createCard'), fn: () => cardDialog(composer) },
      ...(chan.startsWith('dm:') ? [] : manual.list.map((f) => ({ icon: 'flow', label: t('tm_flowsMenu', { name: f.name }), fn: () => runManual(f, chan) })))];
  });
  async function runManual(f, chan) {
    let input = '';
    if (f.input) { const v = await LC.prompt(f.input, { max: 1000, ok: t('tm_runFlow'), placeholder: t('tm_input') }); if (v === null) return; input = v; }
    try { const r = await LC.api('/api/tm/flows/run', { id: f.id, chan, input }); LC.toast(r.error ? t('tm_err2', { msg: r.error }) : t('tm_flowDone'), { ms: 2500 }); } catch (e) { U.fail(e); }
  }
  function cardDialog(composer) {
    const title = el('input', { maxlength: 200, 'aria-label': t('tm_cardTitle') }), text = el('textarea', { rows: 3, maxlength: 4000, 'aria-label': t('tm_cardText') }), facts = el('div'), btns = el('div'); let image = '';
    const factRow = () => facts.append(el('div', { class: 'tm-factrow' }, el('input', { maxlength: 60, placeholder: t('tm_factK'), 'aria-label': t('tm_factK') }), el('input', { maxlength: 300, placeholder: t('tm_factV'), 'aria-label': t('tm_factV') }), LC.ibtn('dismiss', t('tm_remove'), (e) => e.currentTarget.parentElement.remove())));
    const btnRow = (kind) => btns.append(el('div', { class: 'tm-factrow', 'data-kind': kind }, el('input', { maxlength: 40, placeholder: t('tm_btnLabel'), 'aria-label': t('tm_btnLabel') }), el('input', { maxlength: kind === 'url' ? 500 : 500, placeholder: kind === 'url' ? t('tm_btnUrl') : t('tm_btnReply'), 'aria-label': kind === 'url' ? t('tm_btnUrl') : t('tm_btnReply') }), LC.ibtn('dismiss', t('tm_remove'), (e) => e.currentTarget.parentElement.remove())));
    const collect = () => ({ title: title.value, text: text.value, image: image || undefined,
      facts: [...facts.children].map((r) => { const [k, v] = r.querySelectorAll('input'); return { k: k.value, v: v.value }; }).filter((f) => f.k || f.v),
      buttons: [...btns.children].map((r) => { const [l, v] = r.querySelectorAll('input'); return r.dataset.kind === 'url' ? { label: l.value, url: v.value } : { label: l.value, action: 'reply', value: v.value }; }).filter((b) => b.label) });
    LC.modal([el('h2', {}, LC.icon('card_ui'), ' ' + t('tm_createCard')), U.field(t('tm_cardTitle'), title), U.field(t('tm_cardText'), text),
      U.group(t('tm_cardPic'), U.pictureInput('', (v) => { image = v; }, { size: 480, type: 'image/jpeg', max: 42000, label: t('tm_cardPic') })),
      U.group(t('tm_facts'), facts, el('button', { type: 'button', class: 'link', text: t('tm_addFact'), onclick: factRow })),
      U.group(t('tm_buttons'), btns, el('div', { class: 'rowline' }, el('button', { type: 'button', class: 'link', text: t('tm_addLink'), onclick: () => btnRow('url') }), el('button', { type: 'button', class: 'link', text: t('tm_addReply'), onclick: () => btnRow('reply') }))),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('tm_post'), onclick: () => { const card = collect(); if (!card.title.trim() && !card.text.trim() && !card.image) return LC.toast(t('tm_cardTitle')); LC.closeModal(); composer.send({ force: true, text: '', extra: { card } }); } }))], { wide: true });
    title.focus();
  }
  B.cardDialog = cardDialog;

  // ---------- Connectors on a channel: incoming and outgoing webhooks ----------
  B.connectors = async (chan) => {
    let data; try { data = await LC.api('/api/tm/hooks?chan=' + encodeURIComponent(chan)); } catch (e) { return U.fail(e); }
    const origin = await base(), redraw = () => B.connectors(chan);
    const row = (h) => el('div', { class: 'req' }, LC.icon(h.kind === 'in' ? 'arrow_import' : 'arrow_export'), el('div', { class: 'grow' }, el('b', { text: h.name }), el('div', { class: 'muted small', text: (h.lastUsed ? t('tm_lastUsed', { when: LC.ago(h.lastUsed) }) : t('tm_neverUsed')) + (h.count ? ` · ${h.count}×` : '') + (h.url ? ' · ' + h.url : '') }), h.lastError ? el('div', { class: 'err small', text: t('tm_err2', { msg: h.lastError }) + ' · ' + LC.ago(h.lastErrorAt) }) : null),
      U.toggle(t('tm_on'), !h.off, (v) => LC.api('/api/tm/hooks/update', { id: h.id, off: !v }).catch(U.fail)),
      el('button', { class: 'secondary sm', text: t('tm_regen'), onclick: () => LC.api('/api/tm/hooks/regen', { id: h.id }).then((r) => shown(h.kind, r)).catch(U.fail) }),
      LC.ibtn('delete', t('delete') + ' ' + h.name, async () => { if (await LC.confirm(t('delete') + ' ' + h.name + '?', { danger: true, ok: t('delete') })) LC.api('/api/tm/hooks/remove', { id: h.id }).then(redraw).catch(U.fail); }));
    const shown = (kind, r) => LC.modal([el('h2', {}, LC.icon('key'), ' ' + r.hook.name), el('p', { class: 'muted small', text: t('tm_hookCreated') }),
      kind === 'in' ? copyRow(t('tm_hookAddr'), origin + r.url) : copyRow(t('tm_hookSecret'), r.secret),
      kind === 'in' ? el('div', {}, el('p', { class: 'small', text: t('tm_tryIt') + ':' }), el('pre', { class: 'tm-pre' }, el('code', { text: `curl -k -X POST '${origin}${r.url}' \\\n  -H 'content-type: application/json' \\\n  -d '{"title":"Hello","text":"It works"}'` }))) : el('p', { class: 'muted small', text: t('tm_outHelp') }),
      el('div', { class: 'acts' }, el('button', { class: 'primary', text: t('tm_done'), onclick: redraw }))], { wide: true });
    const create = (kind) => {
      const name = el('input', { maxlength: 24, 'aria-label': t('tm_hookName') }), url = el('input', { type: 'url', maxlength: 500, placeholder: 'http://192.168.1.20:8080/hook', 'aria-label': t('tm_hookUrl') }), pic = el('input', { type: 'file', accept: 'image/*', 'aria-label': t('tm_hookPic') });
      LC.modal(el('form', { onsubmit: async (e) => { e.preventDefault(); try { const picture = pic.files[0] ? await uploadPic(pic.files[0]) : undefined; const r = await LC.api('/api/tm/hooks/create', { chan, kind, name: name.value, url: url.value, picture }); shown(kind, r); } catch (x) { U.fail(x); } } },
        el('h2', {}, LC.icon(kind === 'in' ? 'arrow_import' : 'arrow_export'), ' ' + t(kind === 'in' ? 'tm_newIn' : 'tm_newOut')), U.field(t('tm_hookName'), name), kind === 'out' ? U.field(t('tm_hookUrl'), url) : null, U.field(t('tm_hookPic'), pic),
        el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: redraw }), el('button', { class: 'primary', type: 'submit', text: t('tm_create') }))));
      name.focus();
    };
    const ins = data.hooks.filter((h) => h.kind === 'in'), outs = data.hooks.filter((h) => h.kind === 'out');
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('plug_connected'), ' ' + t('tm_conn') + ' · ' + (LC.chanInfo(chan).title || '')), LC.ibtn('dismiss', t('close'), LC.closeModal)),
      el('h3', { text: t('tm_inHooks') }), el('p', { class: 'muted small', text: t('tm_inHelp') }), ins.length ? el('div', {}, ins.map(row)) : el('p', { class: 'muted small', text: t('tm_noHooks') }), el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => create('in') }, LC.icon('add'), el('span', { text: t('tm_newIn') }))),
      el('h3', { text: t('tm_outHooks') }), el('p', { class: 'muted small', text: t('tm_outHelp') }), outs.length ? el('div', {}, outs.map(row)) : el('p', { class: 'muted small', text: t('tm_noHooks') }),
      data.canOut ? el('div', { class: 'acts' }, el('button', { class: 'secondary sm withicon', onclick: () => create('out') }, LC.icon('add'), el('span', { text: t('tm_newOut') }))) : el('p', { class: 'muted small', text: t('tm_onlyOwnersOut') })], { wide: true });
  };

  // ---------- Manage › Bots ----------
  const chanOpts = () => [...S.channels.values()].filter((c) => !c.id.startsWith('dm:')).map((c) => [c.id, (LC.chanInfo(c.id).longTitle || LC.chanInfo(c.id).title)]).sort((a, b) => a[1].localeCompare(b[1]));
  async function botsTab() {
    const [{ bots }, { hooks }] = await Promise.all([LC.api('/api/tm/admin/bots'), LC.api('/api/tm/hooks')]);
    const save = (patch) => LC.api('/api/tm/admin/bots/save', patch).then(() => refresh('tm_bots')).catch(U.fail);
    return el('div', {}, el('div', { class: 'acts' }, el('button', { class: 'primary sm withicon', onclick: () => botDialog(null) }, LC.icon('add'), el('span', { text: t('tm_newBot') }))),
      bots.length ? el('div', {}, bots.map((b) => el('div', { class: 'req' }, LC.avatar(S.users.get(b.uid) || { name: b.name, color: '#6264a7' }, 'sm', false), el('div', { class: 'grow' }, el('b', { text: b.name }), ' ', U.pill(t('tm_bot'), 'bot'), el('div', { class: 'muted small', text: `${b.rules.length} ${t('tm_rules').toLowerCase()} · ${t('tm_runs', { n: b.runs })} · ${t('tm_lastRun', { when: fmt(b.lastRun) })}` }), b.lastError ? el('div', { class: 'err small', text: b.lastError }) : null),
        U.toggle(t('tm_on'), b.on, (v) => save({ id: b.id, on: v })), el('button', { class: 'secondary sm', text: t('tm_editBot'), onclick: () => botDialog(b) }), LC.ibtn('delete', t('delete') + ' ' + b.name, async () => { if (await LC.confirm(t('delete') + ' ' + b.name + '?', { danger: true, ok: t('delete') })) LC.api('/api/tm/admin/bots/remove', { id: b.id }).then(() => refresh('tm_bots')).catch(U.fail); })))) : el('p', { class: 'muted', text: t('tm_noBots') }),
      el('h3', { text: t('tm_allHooks') }), hooks.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'table small' }, el('thead', {}, el('tr', {}, [t('tm_hookName'), t('tm_where'), '', t('tm_lastRun', { when: '' }).trim(), ''].map(U.th))),
        el('tbody', {}, hooks.map((h) => el('tr', {}, el('td', { text: h.name }), el('td', { text: h.where }), el('td', { text: h.kind === 'in' ? t('tm_inHooks') : t('tm_outHooks') }), el('td', {}, el('span', { text: h.lastUsed ? LC.ago(h.lastUsed) : t('tm_neverUsed') }), h.lastError ? el('div', { class: 'err small', text: h.lastError }) : null),
          el('td', {}, LC.ibtn('delete', t('delete') + ' ' + h.name, () => LC.api('/api/tm/hooks/remove', { id: h.id }).then(() => refresh('tm_bots')).catch(U.fail)))))))) : el('p', { class: 'muted small', text: t('tm_noHooks') }));
  }
  function botDialog(b) {
    const name = el('input', { value: b ? b.name : '', maxlength: 24, 'aria-label': t('tm_botName') }), pic = el('input', { type: 'file', accept: 'image/*', 'aria-label': t('tm_hookPic') });
    const rules = (b ? b.rules : []).map((r) => ({ ...r, reply: { ...r.reply } })), box = el('div'), w = { ...(b ? b.welcome : { general: false, dm: false, text: 'Welcome, {person}!' }) };
    const welText = el('textarea', { rows: 2, maxlength: 2000, 'aria-label': t('tm_welText') }); welText.value = w.text || '';
    const draw = () => U.set(box, rules.map((r, i) => el('div', { class: 'tm-rule' },
      el('div', { class: 'rowline' }, U.select([['keyword', t('tm_kw')], ['regex', t('tm_rx')]], r.match, (v) => { r.match = v; }, t('tm_kw')), el('input', { class: 'grow', value: r.pattern, maxlength: 200, placeholder: t('tm_kwPh'), 'aria-label': t('tm_kwPh'), oninput: (e) => { r.pattern = e.target.value; } }), LC.ibtn('delete', t('delete'), () => { rules.splice(i, 1); draw(); })),
      el('textarea', { rows: 2, maxlength: 4000, 'aria-label': t('tm_reply'), placeholder: t('tm_reply'), oninput: (e) => { r.reply.text = e.target.value; } }, r.reply.text || ''),
      U.field(t('tm_where'), U.select([['*', t('tm_whereAll')], ['dm', t('tm_whereDm')], ...chanOpts()], (r.chans || ['*'])[0], (v) => { r.chans = [v]; }, t('tm_where'))))),
      el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { rules.push({ match: 'keyword', pattern: '', reply: { text: '' }, chans: ['*'] }); draw(); } }, LC.icon('add'), el('span', { text: t('tm_addRule') })));
    draw();
    LC.modal([el('h2', {}, LC.icon('bot'), ' ' + (b ? b.name : t('tm_newBot'))), U.field(t('tm_botName'), name), U.field(t('tm_hookPic'), pic),
      el('h3', { text: t('tm_rules') }), el('p', { class: 'muted small', text: t('tm_rulesHelp') }), box,
      el('h3', { text: t('tm_welcomeT') }), U.toggle(t('tm_welGeneral'), w.general, (v) => { w.general = v; }), U.toggle(t('tm_welDm'), w.dm, (v) => { w.dm = v; }), U.field(t('tm_welText'), welText),
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('tm_bots') }), el('button', { class: 'primary', text: t('tm_save'), onclick: async () => {
        try { const picture = pic.files[0] ? await uploadPic(pic.files[0]) : undefined; await LC.api('/api/tm/admin/bots/save', { id: b ? b.id : undefined, name: name.value, picture, rules: rules.filter((r) => r.pattern.trim()), welcome: { ...w, text: welText.value } }); LC.adminPanel('tm_bots'); } catch (e) { U.fail(e); }
      } }))], { wide: true });
  }

  // ---------- Manage › Workflows ----------
  const trigText = (f) => { const tr = f.trigger; let s = t('tm_tr_' + tr.type); if (tr.chan) s += ' · ' + (LC.chanInfo(tr.chan).title || tr.chan); if (tr.words) s += ' · “' + tr.words + '”'; if (tr.type === 'schedule') s += ` · ${tr.time}${tr.freq === 'weekly' ? ' · ' + (tr.days || []).map((d) => t(['tm_sun', 'tm_mon', 'tm_tue', 'tm_wed', 'tm_thu', 'tm_fri', 'tm_sat'][d])).join(' ') : ''}`; if (tr.emoji) s += ' · ' + tr.emoji; return s; };
  async function flowsTab() {
    const { flows } = await LC.api('/api/tm/admin/flows');
    return el('div', {}, el('div', { class: 'acts' }, el('button', { class: 'primary sm withicon', onclick: () => flowDialog(null) }, LC.icon('add'), el('span', { text: t('tm_newFlow') }))),
      flows.length ? el('div', {}, flows.map((f) => el('div', { class: 'req' }, LC.icon('flow'), el('div', { class: 'grow' }, el('b', { text: f.name }), el('div', { class: 'muted small', text: trigText(f) + ' → ' + f.actions.map((a) => t('tm_ac_' + a.type)).join(', ') }), el('div', { class: 'muted small', text: `${t('tm_runs', { n: f.runs || 0 })} · ${t('tm_lastRun', { when: fmt(f.lastRun) })}` }), f.lastError ? el('div', { class: 'err small', text: t('tm_err2', { msg: f.lastError }) + ' · ' + LC.ago(f.lastErrorAt) }) : null),
        U.toggle(t('tm_flowOn'), f.on, (v) => LC.api('/api/tm/admin/flows/toggle', { id: f.id, on: v }).catch(U.fail)), el('button', { class: 'secondary sm', text: t('tm_test'), onclick: () => LC.api('/api/tm/admin/flows/test', { id: f.id }).then(() => refresh('tm_flows')).catch(U.fail) }),
        el('button', { class: 'secondary sm', text: t('edit'), onclick: () => flowDialog(f) }), LC.ibtn('delete', t('delete') + ' ' + f.name, async () => { if (await LC.confirm(t('delete') + ' ' + f.name + '?', { danger: true, ok: t('delete') })) LC.api('/api/tm/admin/flows/remove', { id: f.id }).then(() => refresh('tm_flows')).catch(U.fail); })))) : el('p', { class: 'muted', text: t('tm_noFlows') }));
  }
  async function flowDialog(f) {
    let teams = []; try { teams = (await LC.api('/api/tm/admin/teams')).teams; } catch {}
    const tr = { type: 'message', chan: '', words: '', freq: 'daily', time: '09:00', days: [1, 2, 3, 4, 5], ...(f ? f.trigger : {}) }, steps = (f ? f.actions : [{ type: 'post', chan: '', text: '' }]).map((a) => ({ ...a, card: a.card ? { ...a.card } : { title: '', text: '' } }));
    const name = el('input', { value: f ? f.name : '', maxlength: 80, 'aria-label': t('tm_flowName') }), trigBox = el('div'), stepBox = el('div');
    const teamOpts = teams.map((x) => [x.id, x.name]), people = [...S.users.values()].filter((u) => !u.deleted && !u.removed && !u.bot).map((u) => [u.id, u.name]);
    const inp = (o, k, label, max = 4000, area) => { const n = el(area ? 'textarea' : 'input', { maxlength: max, 'aria-label': label, placeholder: label, rows: area ? 2 : null, oninput: (e) => { o[k] = e.target.value; } }); n.value = o[k] || ''; return n; };
    const drawTrig = () => {
      const kids = [U.select(['message', 'join', 'teamJoin', 'reaction', 'schedule', 'manual'].map((k) => [k, t('tm_tr_' + k)]), tr.type, (v) => { tr.type = v; drawTrig(); }, t('tm_when2'))];
      if (tr.type === 'message' || tr.type === 'reaction') kids.push(U.field(t('tm_chat'), U.select([['', t('tm_anyChannel')], ...chanOpts()], tr.chan || '', (v) => { tr.chan = v; }, t('tm_chat'))));
      if (tr.type === 'message') kids.push(U.field(t('tm_containing'), inp(tr, 'words', t('tm_containing'), 300)));
      if (tr.type === 'reaction') kids.push(U.field(t('tm_emoji'), inp(tr, 'emoji', t('tm_emoji'), 16)));
      if (tr.type === 'teamJoin') kids.push(U.field(t('tm_team'), U.select([['', t('tm_anyTeam')], ...teamOpts], tr.team || '', (v) => { tr.team = v; }, t('tm_team'))));
      if (tr.type === 'schedule') kids.push(el('div', { class: 'rowline' }, U.select([['daily', t('tm_daily')], ['weekly', t('tm_weekly')]], tr.freq, (v) => { tr.freq = v; drawTrig(); }, t('tm_tr_schedule')), el('label', { class: 'small' }, t('tm_at') + ' ', el('input', { type: 'time', value: tr.time, onchange: (e) => { tr.time = e.target.value; } }))),
        tr.freq === 'weekly' ? el('div', { class: 'rowline' }, ['tm_sun', 'tm_mon', 'tm_tue', 'tm_wed', 'tm_thu', 'tm_fri', 'tm_sat'].map((k, d) => U.toggle(t(k), (tr.days || []).includes(d), (v) => { tr.days = v ? [...new Set([...(tr.days || []), d])] : (tr.days || []).filter((x) => x !== d); }))) : null);
      if (tr.type === 'manual') kids.push(U.field(t('tm_inputLabel'), inp(tr, 'input', t('tm_inputLabel'), 60)));
      U.set(trigBox, ...kids);
    };
    const drawSteps = () => U.set(stepBox, steps.map((a, i) => {
      const fields = [];
      if (['post', 'card', 'task'].includes(a.type)) fields.push(U.field(t('tm_chat'), U.select([['', t('tm_triggerChat')], ...chanOpts()], a.chan || '', (v) => { a.chan = v; }, t('tm_chat'))));
      if (a.type === 'card') fields.push(inp(a.card, 'title', t('tm_cardTitle'), 200), inp(a.card, 'text', t('tm_cardText'), 4000, true));
      if (a.type === 'dm') fields.push(U.field(t('tm_to'), U.select([['person', t('tm_toPerson')], ...people], a.to || 'person', (v) => { a.to = v; }, t('tm_to'))));
      if (['post', 'dm', 'task'].includes(a.type)) fields.push(inp(a, 'text', t('tm_cardText'), 4000, true));
      if (a.type === 'addTeam') fields.push(U.field(t('tm_team'), U.select([['', '—'], ...teamOpts], a.team || '', (v) => { a.team = v; }, t('tm_team'))));
      if (a.type === 'addChannel') fields.push(U.field(t('tm_chat'), U.select([['', '—'], ...chanOpts()], a.chan || '', (v) => { a.chan = v; }, t('tm_chat'))));
      if (a.type === 'webhook') fields.push(U.field(t('tm_url'), inp(a, 'url', t('tm_url'), 500)));
      return el('div', { class: 'tm-rule' }, el('div', { class: 'rowline' }, el('b', { text: `${i + 1}.` }), U.select(['post', 'card', 'dm', 'addTeam', 'addChannel', 'task', 'webhook'].map((k) => [k, t('tm_ac_' + k)]), a.type, (v) => { a.type = v; drawSteps(); }, t('tm_then')), LC.ibtn('delete', t('delete'), () => { steps.splice(i, 1); drawSteps(); })), ...fields);
    }), el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { steps.push({ type: 'post', chan: '', text: '', card: { title: '', text: '' } }); drawSteps(); } }, LC.icon('add'), el('span', { text: t('tm_addStep') })));
    drawTrig(); drawSteps();
    LC.modal([el('h2', {}, LC.icon('flow'), ' ' + (f ? f.name : t('tm_newFlow'))), U.field(t('tm_flowName'), name), el('h3', { text: t('tm_when2') }), trigBox, el('h3', { text: t('tm_then') }), el('p', { class: 'muted small', text: t('tm_vars') }), stepBox,
      el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: () => LC.adminPanel('tm_flows') }), el('button', { class: 'primary', text: t('tm_save'), onclick: async () => {
        const actions = steps.map((a) => { const o = { type: a.type }; for (const k of ['chan', 'text', 'to', 'team', 'url']) if (a[k]) o[k] = a[k]; if (a.type === 'card') o.card = a.card; return o; });
        try { await LC.api('/api/tm/admin/flows/save', { id: f ? f.id : undefined, name: name.value, on: f ? f.on : true, trigger: tr, actions }); LC.adminPanel('tm_flows'); } catch (e) { U.fail(e); }
      } }))], { wide: true });
  }

  // ---------- Manage › Developer: API keys + guide ----------
  async function devTab() {
    const { keys, bots } = await LC.api('/api/tm/admin/keys'), origin = await base();
    const kname = el('input', { maxlength: 60, 'aria-label': t('tm_keyName'), placeholder: t('tm_keyName') }), newBot = el('input', { maxlength: 24, 'aria-label': t('tm_newBotNamed'), placeholder: t('tm_newBotNamed') });
    let bot = '', read = true, post = true; const out = el('div', { 'aria-live': 'polite' });
    const sel = U.select([['', t('tm_newBotNamed')], ...bots.map((b) => [b.id, b.name])], '', (v) => { bot = v; newBot.classList.toggle('hidden', !!v); }, t('tm_actsAs'));
    return el('div', {}, el('p', { class: 'muted small', text: t('tm_devHelp') }), el('p', {}, el('a', { href: '/api/tm/docs/api?token=' + encodeURIComponent(S.token), target: '_blank', rel: 'noopener' }, LC.icon('document_text'), ' ' + t('tm_guide'))),
      el('h3', { text: t('tm_keys') }), keys.length ? el('div', { class: 'tablewrap' }, el('table', { class: 'table small' }, el('thead', {}, el('tr', {}, [t('tm_keyName'), t('tm_actsAs'), t('tm_scopes'), t('tm_lastRun', { when: '' }).trim(), ''].map(U.th))),
        el('tbody', {}, keys.map((k) => el('tr', {}, el('td', {}, el('b', { text: k.name }), el('div', {}, el('code', { class: 'small', text: k.prefix + '_…' }))), el('td', { text: k.bot }), el('td', { text: k.scopes.join(', ') }), el('td', { text: k.lastUsed ? LC.ago(k.lastUsed) : t('tm_neverUsed') }),
          el('td', {}, k.revoked ? U.pill(t('tm_revoked'), 'warn') : el('button', { class: 'secondary sm danger', text: t('tm_revoke'), onclick: () => LC.api('/api/tm/admin/keys/revoke', { id: k.id }).then(() => refresh('tm_dev')).catch(U.fail) }))))))) : el('p', { class: 'muted small', text: t('tm_noKeys') }),
      el('section', { class: 'tm-sec' }, el('h3', { text: t('tm_newKey') }), U.field(t('tm_keyName'), kname), U.field(t('tm_actsAs'), sel), newBot,
        U.group(t('tm_scopes'), U.toggle(t('tm_scRead'), read, (v) => { read = v; }), U.toggle(t('tm_scPost'), post, (v) => { post = v; })),
        el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_create'), onclick: async () => {
          try { const r = await LC.api('/api/tm/admin/keys/create', { name: kname.value, bot: bot || undefined, botName: bot ? undefined : newBot.value, scopes: [read && 'read', post && 'post'].filter(Boolean) });
            U.set(out, el('p', { class: 'small', text: t('tm_keyShown') }), copyRow('x-api-key', r.key), el('pre', { class: 'tm-pre' }, el('code', { text: `curl -k -H 'x-api-key: ${r.key}' ${origin}/api/bot/chats\ncurl -k -X POST -H 'x-api-key: ${r.key}' -H 'content-type: application/json' \\\n  -d '{"chan":"general","text":"Hello from my script"}' ${origin}/api/bot/send` })), el('button', { class: 'secondary sm', text: t('tm_done'), onclick: () => refresh('tm_dev') }));
          } catch (e) { U.fail(e); }
        } })), out));
  }
  LC.ext.adminTabs.push({ key: 'tm_bots', icon: 'bot', label: () => t('tm_admBots'), order: 65, render: botsTab }, { key: 'tm_flows', icon: 'flow', label: () => t('tm_admFlows'), order: 66, render: flowsTab }, { key: 'tm_dev', icon: 'key_multiple', label: () => t('tm_admDev'), order: 67, render: devTab });
})();
