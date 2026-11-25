'use strict';
// Approvals: ask people to approve something (everyone must approve, or the first response decides), with details and an
// optional attachment; approvers answer with a comment from the card in the chat or from the Approvals app (Received / Sent).
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_approvals: 'Approvals', ap_apprDesc: 'Ask people to approve things and keep track of the answers.', ap_newAppr: 'New approval request', ap_received: 'Received', ap_sent: 'Sent', ap_apprTitle: 'Request title', ap_apprDetails: 'Details',
    ap_approvers: 'Approvers', ap_apprMode: 'Who needs to answer', ap_modeAll: 'Everyone must approve', ap_modeFirst: 'The first response decides', ap_attach: 'Attachment', ap_addAttachment: 'Add a file', ap_postIn: 'Post in a chat', ap_noChat: 'Don’t post in a chat',
    ap_approve: 'Approve', ap_reject: 'Reject', ap_cancelReq: 'Cancel request', ap_s_pending: 'Requested', ap_s_approved: 'Approved', ap_s_rejected: 'Rejected', ap_s_canceled: 'Canceled', ap_comment: 'Comment (optional)', ap_requestedBy: 'Requested by {name} · {when}',
    ap_waiting: 'Waiting', ap_history: 'History', ap_h_created: 'sent the request', ap_h_approved: 'approved', ap_h_rejected: 'rejected', ap_h_canceled: 'canceled the request', ap_h_final: 'Final result: {s}', ap_noAppr: 'No approval requests', ap_noApprHelp: 'Requests you send or need to answer show up here.',
    ap_apprCard: 'Approval request', ap_viewDetails: 'View details', ap_all: 'All', ap_youAnswered: 'You answered: {d}', ap_pickApprover: 'Pick at least one approver.', ap_status: 'Status',
  });
  LC.addStrings('hi', { ap_approvals: 'अनुमोदन', ap_newAppr: 'नया अनुमोदन अनुरोध', ap_approve: 'स्वीकृत करें', ap_reject: 'अस्वीकार करें', ap_received: 'प्राप्त', ap_sent: 'भेजे गए' });
  LC.addStrings('es', { ap_approvals: 'Aprobaciones', ap_newAppr: 'Nueva solicitud de aprobación', ap_approve: 'Aprobar', ap_reject: 'Rechazar', ap_received: 'Recibidas', ap_sent: 'Enviadas' });
  const SICON = { pending: 'hourglass_half', approved: 'checkmark_circle', rejected: 'dismiss_circle', canceled: 'prohibited' };
  const pill = (s) => el('span', { class: 'ap-pill s-' + s }, LC.icon(SICON[s], { filled: s !== 'pending' && s !== 'canceled' }), t('ap_s_' + s));
  let pending = 0;
  const refreshCount = async () => { try { const d = await LC.api('/api/ap/approvals?box=received'); pending = d.pending; LC.renderRail && LC.renderRail(); } catch {} };
  LC.on('init', () => setTimeout(refreshCount, 800));
  LC.on('activity', (a) => { if (a.type === 'approval') { refreshCount(); LC.emitLocal('ap:approvals', {}); } });

  A.newApproval = (chan) => {
    let file = null; const title = el('input', { maxlength: 200, placeholder: t('ap_apprTitle'), 'aria-label': t('ap_apprTitle') }), details = el('textarea', { rows: 4, maxlength: 4000, placeholder: t('ap_apprDetails'), 'aria-label': t('ap_apprDetails') });
    const where = A.select([['', t('ap_noChat')], ...A.allChats().map((c) => [c.id, c.label])], chan || '', () => { who.set([]); drawWho(); }, t('ap_postIn'));
    const whoBox = el('div'); let who;
    const drawWho = () => { who = A.peoplePick({ people: (where.value ? A.members(where.value) : A.everyone()), label: t('ap_approvers'), placeholder: t('ap_approvers') }); whoBox.replaceChildren(who); };
    drawWho();
    const mode = el('div', { class: 'ap-achoices', role: 'radiogroup', 'aria-label': t('ap_apprMode') }, el('label', { class: 'check' }, el('input', { type: 'radio', name: 'ap-mode', value: 'all', checked: true }), t('ap_modeAll')), el('label', { class: 'check' }, el('input', { type: 'radio', name: 'ap-mode', value: 'first' }), t('ap_modeFirst')));
    const fileName = el('span', { class: 'muted small' }), fileIn = el('input', { type: 'file', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; fileName.textContent = t('ap_loading'); try { file = await LC.upload(f, f.name).promise; fileName.textContent = file.name + ' · ' + LC.fmtSize(file.size); } catch (er) { fileName.textContent = ''; A.fail(er); } } });
    const send = async () => {
      if (!title.value.trim()) return title.focus(); if (!who.get().length) return LC.toast(t('ap_pickApprover'));
      const r = await A.call('/api/ap/approval/new', { title: title.value, details: details.value, approvers: who.get(), mode: mode.querySelector('input:checked').value, chan: where.value || undefined, file: file ? { id: file.id } : undefined });
      if (r) { LC.closeModal(); LC.emitLocal('ap:approvals', {}); if (!where.value) LC.toast(t('ap_s_pending') + ': ' + r.approval.title); }
    };
    A.modal(t('ap_newAppr'), 'clipboard_task', [A.field(t('ap_apprTitle'), title), A.field(t('ap_apprDetails'), details), A.field(t('ap_postIn'), where), A.field(t('ap_approvers'), whoBox), el('fieldset', { class: 'ap-fset' }, el('legend', { text: t('ap_apprMode') }), mode),
      el('div', { class: 'ap-row' }, el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => fileIn.click() }, LC.icon('attach'), el('span', { text: t('ap_addAttachment') })), fileName, fileIn)],
    [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_newAppr'), onclick: send })], { wide: false });
    setTimeout(() => title.focus(), 40);
  };
  async function respond(id, decision, comment) { const r = await A.call('/api/ap/approval/respond', { id, decision, comment }); if (r) { LC.emitLocal('ap:approvals', {}); refreshCount(); } return r; }
  A.approvalDetails = async (id) => {
    let x; try { x = (await LC.api('/api/ap/approval?id=' + id)).approval; } catch (e) { return A.fail(e); }
    const comment = el('textarea', { rows: 2, maxlength: 1000, placeholder: t('ap_comment'), 'aria-label': t('ap_comment') });
    const act = (d) => respond(x.id, d, comment.value).then((r) => r && A.approvalDetails(x.id));
    const hist = (h) => el('li', {}, el('b', { text: h.by ? LC.uname(h.by) + ' ' : '' }), h.act.startsWith('final:') ? t('ap_h_final', { s: t('ap_s_' + h.act.slice(6)) }) : t('ap_h_' + h.act), h.c ? el('span', { class: 'muted', text: ' — “' + h.c + '”' }) : null, el('time', { class: 'muted small', text: ' · ' + LC.fmtDateTime(h.ts) }));
    A.modal(x.title, 'clipboard_task', [
      el('div', { class: 'ap-row' }, pill(x.status), el('span', { class: 'muted small', text: t('ap_requestedBy', { name: LC.uname(x.by), when: LC.fmtDateTime(x.created) }) }), x.chan ? el('span', { class: 'muted small', text: t('ap_inChat', { where: A.chatTitle(x.chan) }) }) : null),
      x.details ? el('p', { class: 'ap-pre', text: x.details }) : null,
      x.file ? el('p', {}, LC.icon('attach'), ' ', el('a', { href: LC.fileUrl(x.file), download: x.file.name, text: x.file.name }), el('span', { class: 'muted small', text: ' · ' + LC.fmtSize(x.file.size) })) : null,
      el('h3', { text: t('ap_approvers') + ' · ' + (x.mode === 'first' ? t('ap_modeFirst') : t('ap_modeAll')) }),
      el('div', { class: 'ap-apprs' }, ...x.approvers.map((uid) => { const r = x.res[uid]; return el('div', { class: 'ap-appr' }, LC.avatar(S.users.get(uid), 'sm', true), el('span', { class: 'grow', text: LC.uname(uid) }), r ? pill(r.d === 'approve' ? 'approved' : 'rejected') : el('span', { class: 'muted small', text: t('ap_waiting') }), r && r.c ? el('span', { class: 'muted small ap-apprc', text: '“' + r.c + '”' }) : null); })),
      x.canAct ? el('div', { class: 'ap-apprbox' }, comment, el('div', { class: 'ap-row' }, el('button', { class: 'primary withicon', onclick: () => act('approve') }, LC.icon('checkmark'), el('span', { text: t('ap_approve') })), el('button', { class: 'secondary danger withicon', onclick: () => act('reject') }, LC.icon('dismiss'), el('span', { text: t('ap_reject') })))) : null,
      el('h3', { text: t('ap_history') }), el('ul', { class: 'ap-hist' }, ...x.hist.map(hist))],
    [x.mine && x.status === 'pending' ? el('button', { class: 'secondary danger', text: t('ap_cancelReq'), onclick: async () => { if (await LC.confirm(t('ap_cancelReq') + '?', { danger: true })) { const r = await A.call('/api/ap/approval/cancel', { id: x.id }); if (r) { LC.emitLocal('ap:approvals', {}); A.approvalDetails(x.id); } } } }) : null, el('button', { class: 'primary', text: t('ap_close'), onclick: LC.closeModal })], { wide: false });
  };
  // the card in the chat
  A.card('approval', (m) => {
    const c = m.apCard, mineToAnswer = c.status === 'pending' && c.approvers.includes(S.me.id) && !c.res[S.me.id];
    return el('div', { class: 'ap-mcard ap-acard s-' + c.status, role: 'group', 'aria-label': t('ap_apprCard') + ': ' + c.title },
      el('div', { class: 'ap-mchead' }, el('span', { class: 'ap-mcicon', 'aria-hidden': 'true' }, LC.icon('clipboard_task')), el('div', { class: 'grow' }, el('div', { class: 'ap-mckind', text: t('ap_apprCard') }), el('b', { class: 'ap-mctitle', text: c.title })), pill(c.status)),
      el('div', { class: 'ap-apprs mini' }, ...c.approvers.map((uid) => el('span', { class: 'ap-apprmini', title: LC.uname(uid) + (c.res[uid] ? ': ' + t(c.res[uid] === 'approve' ? 'ap_s_approved' : 'ap_s_rejected') : '') }, LC.avatar(S.users.get(uid), 'xs'), c.res[uid] ? LC.icon(c.res[uid] === 'approve' ? 'checkmark_circle' : 'dismiss_circle', { filled: true, cls: c.res[uid] === 'approve' ? 'ok' : 'no', label: t(c.res[uid] === 'approve' ? 'ap_s_approved' : 'ap_s_rejected') }) : null, el('span', { class: 'small', text: LC.uname(uid).split(' ')[0] })))),
      el('div', { class: 'ap-mcacts' }, mineToAnswer ? el('button', { class: 'primary sm', text: t('ap_approve'), onclick: () => respondDialog(c, 'approve') }) : null, mineToAnswer ? el('button', { class: 'secondary sm', text: t('ap_reject'), onclick: () => respondDialog(c, 'reject') }) : null,
        el('button', { class: 'secondary sm', text: t('ap_viewDetails'), onclick: () => A.approvalDetails(c.id) }), !mineToAnswer && c.res[S.me.id] ? el('span', { class: 'muted small', text: t('ap_youAnswered', { d: t(c.res[S.me.id] === 'approve' ? 'ap_s_approved' : 'ap_s_rejected') }) }) : null));
  });
  function respondDialog(c, d) {
    const comment = el('textarea', { rows: 3, maxlength: 1000, placeholder: t('ap_comment'), 'aria-label': t('ap_comment') });
    A.modal((d === 'approve' ? t('ap_approve') : t('ap_reject')) + ': ' + c.title, d === 'approve' ? 'checkmark_circle' : 'dismiss_circle', [comment], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: d === 'approve' ? 'primary' : 'primary danger', text: d === 'approve' ? t('ap_approve') : t('ap_reject'), onclick: async () => { if (await respond(c.id, d, comment.value)) LC.closeModal(); } })], { wide: false });
  }
  LC.ext.composerMore.push((composer) => (composer.cfg && composer.cfg.chan() && A.writable(composer.cfg.chan()) ? [{ icon: 'clipboard_task', label: t('ap_newAppr') + '…', fn: () => A.newApproval(composer.cfg.chan()) }] : []));

  // ---------- the Approvals app ----------
  const V = { box: 'received', status: '' };
  function row(x) {
    const who = V.box === 'sent' ? x.approvers : [x.by];
    return el('button', { type: 'button', class: 'ap-arow', onclick: () => A.approvalDetails(x.id) }, A.avatars(who, 3), el('span', { class: 'grow' }, el('b', { text: x.title }), el('span', { class: 'muted small', text: (V.box === 'sent' ? who.map(LC.uname).join(', ') : LC.uname(x.by)) + ' · ' + LC.fmtDateTime(x.created) + (x.chan ? ' · ' + A.chatTitle(x.chan) : '') })), x.canAct ? el('span', { class: 'ap-dot', title: t('ap_waiting') }) : null, pill(x.status));
  }
  A.tab({ key: 'ap_approvals', icon: 'clipboard_task', label: () => t('ap_approvals'), desc: () => t('ap_apprDesc'), order: 64, optIn: true,
    async render(host, chan) {
      const list = el('div', { class: 'ap-alist' }), load = async () => { try { const d = await LC.api('/api/ap/approvals?chan=' + encodeURIComponent(chan)); V.box = 'received'; list.replaceChildren(...(d.approvals.length ? d.approvals.map(row) : [A.empty('clipboard_task', t('ap_noAppr'), t('ap_noApprHelp'))])); } catch (e) { list.replaceChildren(el('p', { class: 'err', text: e.message })); } };
      host.replaceChildren(el('div', { class: 'ap-page' }, A.head('clipboard_task', t('ap_approvals'), A.writable(chan) ? el('button', { class: 'primary sm withicon', onclick: () => A.newApproval(chan) }, LC.icon('add'), el('span', { text: t('ap_newAppr') })) : null), list));
      A.on('ap:approvals', load, list); A.on('update', (m) => { if (m.chan === chan && m.apCard && m.apCard.kind === 'approval') load(); }, list); load();
    } });
  A.app({ key: 'ap_approvals', icon: 'clipboard_task', color: '#0078d4', name: () => t('ap_approvals'), desc: () => t('ap_apprDesc'), tab: 'ap_approvals', order: 74,
    pane: {
      badge: () => pending,
      render(nav) {
        const item = (k, icon, n) => el('button', { class: 'ap-navitem' + (V.box === k ? ' on' : ''), 'aria-current': V.box === k ? 'page' : null, onclick: () => { V.box = k; LC.openApp('ap_approvals'); LC.renderNav(); } }, LC.icon(icon), el('span', { class: 'grow', text: t('ap_' + k) }), n ? el('span', { class: 'ap-count', text: String(n) }) : null);
        nav.replaceChildren(item('received', 'mail_inbox', pending), item('sent', 'send'), el('div', { class: 'pad' }, el('button', { class: 'primary sm withicon', onclick: () => A.newApproval(S.chan || '') }, LC.icon('add'), el('span', { text: t('ap_newAppr') }))));
      },
      async main(host) {
        const list = el('div', { class: 'ap-alist' });
        const load = async () => {
          try { const d = await LC.api('/api/ap/approvals?box=' + V.box); pending = d.pending; const rows = d.approvals.filter((x) => !V.status || x.status === V.status); list.replaceChildren(...(rows.length ? rows.map(row) : [A.empty('clipboard_task', t('ap_noAppr'), t('ap_noApprHelp'))])); LC.renderRail && LC.renderRail(); } catch (e) { list.replaceChildren(el('p', { class: 'err', text: e.message })); }
        };
        const draw = () => host.replaceChildren(el('div', { class: 'ap-page' }, el('div', { class: 'ap-tbar' }, A.seg([['received', t('ap_received'), 'mail_inbox'], ['sent', t('ap_sent'), 'send']], V.box, (v) => { V.box = v; draw(); LC.renderNav(); }, t('ap_approvals')), el('span', { class: 'grow' }),
          el('label', { class: 'ap-inline' }, el('span', { class: 'small muted', text: t('ap_status') }), A.select([['', t('ap_all')], ...['pending', 'approved', 'rejected', 'canceled'].map((s) => [s, t('ap_s_' + s)])], V.status, (v) => { V.status = v; load(); }, t('ap_status'))),
          el('button', { class: 'primary sm withicon', onclick: () => A.newApproval(S.chan || '') }, LC.icon('add'), el('span', { text: t('ap_newAppr') }))), list));
        draw(); A.on('ap:approvals', load, list); A.on('update', (m) => { if (m.apCard && m.apCard.kind === 'approval') load(); }, list); load();
      },
    } });
  A.openers.approvals = (a) => { if (a.ref && a.ref.id) return A.approvalDetails(a.ref.id); A.openApp('ap_approvals'); };
})();
