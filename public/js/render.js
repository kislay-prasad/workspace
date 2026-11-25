'use strict';
// Rendering: text (markdown subset, mentions, custom emoji), message bubbles and their widgets.
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // ---------- text ----------
  function inlineSource() {
    if (LC.inlineSrc) return LC.inlineSrc;
    const names = [...S.users.values()].filter((u) => !u.removed).map((u) => u.name).sort((a, b) => b.length - a.length).map(esc);
    const parts = ['(`[^`\\n]+`)', '(\\*\\*[^*\\n]+?\\*\\*)', '(~~[^~\\n]+?~~)', '(\\*[^\\s*][^*\\n]*?\\*)', '((?:^|\\s)_[^\\s_][^_\\n]*?_(?=\\s|$|[.,!?;:]))', '(https?:\\/\\/[^\\s<]+)', '(@(?:everyone|here)(?![\\p{L}\\p{N}_]))', '(:[a-z0-9_]{2,20}:)', names.length ? '(@(?:' + names.join('|') + ')(?![\\p{L}\\p{N}_]))' : '(?!)()'];
    return (LC.inlineSrc = parts.join('|'));
  }
  LC.on('user', () => { LC.inlineSrc = null; }); LC.on('init', () => { LC.inlineSrc = null; });
  function inline(text, depth = 0) {
    const frag = document.createDocumentFragment(), re = new RegExp(inlineSource(), 'giu'); let last = 0, m;
    while ((m = re.exec(text))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      let lead = ''; if (m[5]) lead = /^\s/.test(m[0]) ? m[0][0] : '';
      if (m.index > last) frag.append(text.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) frag.append(el('code', { text: m[1].slice(1, -1) }));
      else if (m[2]) frag.append(el('b', {}, depth < 3 ? inline(m[2].slice(2, -2), depth + 1) : m[2].slice(2, -2)));
      else if (m[3]) frag.append(el('s', {}, depth < 3 ? inline(m[3].slice(2, -2), depth + 1) : m[3].slice(2, -2)));
      else if (m[4]) frag.append(el('i', {}, depth < 3 ? inline(m[4].slice(1, -1), depth + 1) : m[4].slice(1, -1)));
      else if (m[5]) { frag.append(lead); const body = m[5].slice(lead.length + 1, -1); frag.append(el('i', {}, body)); }
      else if (m[6]) { let url = m[6], trail = ''; const x = url.match(/[.,;:!?)\]]+$/); if (x) { trail = x[0]; url = url.slice(0, -trail.length); } frag.append(el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: url }), trail); }
      else if (m[7]) frag.append(el('span', { class: 'mention everyone', text: m[7] }));
      else if (m[8]) { const name = m[8].slice(1, -1), id = S.emojis[name]; frag.append(id ? el('img', { class: 'cemoji', src: LC.fileUrl({ id, name: name + '.png' }, true), alt: m[8], title: m[8] }) : m[8]); }
      else if (m[9]) { const nm = m[9].slice(1).toLowerCase(), isMe = S.me && S.me.name.toLowerCase() === nm; frag.append(el('span', { class: 'mention' + (isMe ? ' me' : ''), text: m[9] })); }
    }
    frag.append(text.slice(last)); return frag;
  }
  LC.renderText = (text) => {
    const root = document.createDocumentFragment();
    text.split(/```([\s\S]*?)```/g).forEach((seg, i) => {
      if (i % 2) { root.append(el('pre', {}, el('code', { text: seg.replace(/^[a-z0-9+#-]*\n/i, '').replace(/^\n/, '').replace(/\n$/, '') }))); return; }
      const lines = seg.split('\n'); let k = 0;
      while (k < lines.length) {
        const L = lines[k];
        if (/^>\s?/.test(L)) { const q = []; while (k < lines.length && /^>\s?/.test(lines[k])) q.push(lines[k++].replace(/^>\s?/, '')); root.append(el('blockquote', {}, inline(q.join('\n')))); }
        else if (/^\s*(?:[-*•]|\d+[.)])\s+\S/.test(L)) {
          const ordered = /^\s*\d/.test(L), items = []; while (k < lines.length && /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(lines[k])) items.push(lines[k++].replace(/^\s*(?:[-*•]|\d+[.)])\s+/, ''));
          root.append(el(ordered ? 'ol' : 'ul', {}, items.map((x) => el('li', {}, inline(x)))));
        } else if (L.trim() === '') { k++; if (root.lastChild && !(root.lastChild.className || '').includes('gap') && k < lines.length) root.append(el('div', { class: 'gap' })); }
        else { const p = []; while (k < lines.length && lines[k].trim() !== '' && !/^>\s?/.test(lines[k]) && !/^\s*(?:[-*•]|\d+[.)])\s+\S/.test(lines[k])) p.push(lines[k++]); root.append(el('div', { class: 'p' }, inline(p.join('\n')))); }
      }
    });
    return root;
  };
  const BIG = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s|:[a-z0-9_]{2,20}:)+$/u;
  LC.isBigEmoji = (text) => { const s = text.trim(); if (!s || s.length > 40 || !BIG.test(s) || /^[\d\s#*]+$/.test(s)) return false; const n = (s.match(/\p{Extended_Pictographic}|:[a-z0-9_]{2,20}:/gu) || []).length; return n >= 1 && n <= 5; };
  LC.plain = (s) => String(s || '').replace(/```/g, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/`([^`\n]+)`/g, '$1').replace(/(^|\s)[*_]([^*_\s][^*_\n]*?)[*_](?=\s|$|[.,!?])/g, '$1$2').replace(/^>\s?/gm, '').replace(/\s+/g, ' ').trim();
  LC.snippet = (m) => (LC.plain(m.text) || (m.poll && t('pollPreview', { q: m.poll.q })) || (m.game && t('ttt')) || (m.files && m.files.length && t('filePreview', { name: m.files[0].name })) || '').slice(0, 140);
  LC.mentionsMe = (m) => !!(S.me && (m.everyone || (m.mentions || []).includes(S.me.id)));

  // ---------- attachments ----------
  LC.galleryImages = () => { const out = []; const w = S.win[S.chan]; if (w) for (const m of w.msgs) if (!m.deleted) for (const f of m.files || []) if (LC.isImage(f.name)) out.push(f); return out; };
  function attachments(m) {
    const wrap = el('div', { class: 'att' });
    for (const f of m.files || []) {
      const x = LC.extOf(f.name), url = LC.fileUrl(f, true);
      if (LC.isImage(f.name)) wrap.append(el('button', { class: 'imgbtn', 'aria-label': t('viewImage') + ' ' + f.name, onclick: () => { const g = LC.galleryImages(); LC.openLightbox(g, Math.max(0, g.findIndex((i) => i.id === f.id)), f); } }, el('img', { src: url, alt: f.name, loading: 'lazy' })));
      else if (['mp4', 'webm', 'mov'].includes(x) && !/^voice-/.test(f.name)) wrap.append(el('video', { src: url, controls: true, preload: 'metadata', 'aria-label': f.name }));
      else if (['mp3', 'wav', 'ogg', 'opus', 'm4a', 'weba', 'webm'].includes(x)) wrap.append(el('div', { class: 'voice' }, LC.icon(/^voice-/.test(f.name) ? 'mic' : 'music_note_2'), el('audio', { src: url, controls: true, preload: 'metadata', 'aria-label': f.name })));
      else wrap.append(el('div', { class: 'file' }, el('span', { class: 'fi ' + (x === 'pdf' ? 'pdf' : /^(zip|rar|7z|gz|tar)$/.test(x) ? 'zip' : 'doc'), 'aria-hidden': 'true' }, LC.icon(x === 'pdf' ? 'document_pdf' : /^(zip|rar|7z|gz|tar)$/.test(x) ? 'folder_zip' : 'document')), el('span', { class: 'fn' }, f.name, el('small', { text: LC.fmtSize(f.size) })), x === 'pdf' ? el('button', { class: 'secondary sm', text: t('view'), onclick: () => LC.openPdf(f) }) : null, el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download') })));
    }
    return wrap;
  }
  LC.openPdf = (f) => LC.modal([el('div', { class: 'row-between' }, el('h2', { text: f.name, style: { margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }), el('div', {}, el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download') }), el('button', { class: 'secondary sm', text: t('close'), onclick: LC.closeModal }))), el('iframe', { class: 'pdfview', src: LC.fileUrl(f, true), title: f.name }), el('p', { class: 'muted small', text: t('pdfHint') })], { wide: true });

  // ---------- lightbox ----------
  let lb = { list: [], i: 0 };
  function lbDraw() {
    const box = LC.$('#lightbox'), f = lb.list[lb.i]; if (!f) return LC.closeLightbox();
    box.replaceChildren(
      el('button', { class: 'lb-close', 'aria-label': t('close'), title: t('close'), onclick: LC.closeLightbox }, LC.icon('dismiss')),
      lb.list.length > 1 ? el('button', { class: 'lb-nav prev', 'aria-label': t('prev'), onclick: () => lbStep(-1) }, LC.icon('chevron_left')) : null,
      el('img', { src: LC.fileUrl(f, true), alt: f.name }),
      lb.list.length > 1 ? el('button', { class: 'lb-nav next', 'aria-label': t('next'), onclick: () => lbStep(1) }, LC.icon('chevron_right')) : null,
      el('div', { class: 'lb-bar' }, el('span', { text: `${f.name}  ·  ${lb.i + 1}/${lb.list.length}` }), el('a', { href: LC.fileUrl(f), download: f.name, text: t('download') })));
  }
  const lbStep = (d) => { lb.i = (lb.i + d + lb.list.length) % lb.list.length; lbDraw(); };
  LC.openLightbox = (list, i, single) => { lb = { list: list.length ? list : [single], i: list.length ? i : 0 }; const box = LC.$('#lightbox'); box.classList.remove('hidden'); lbDraw(); box.focus(); };
  LC.closeLightbox = () => { const b = LC.$('#lightbox'); b.classList.add('hidden'); b.replaceChildren(); };
  document.addEventListener('keydown', (e) => { if (LC.$('#lightbox').classList.contains('hidden')) return; if (e.key === 'Escape') LC.closeLightbox(); else if (e.key === 'ArrowRight') lbStep(1); else if (e.key === 'ArrowLeft') lbStep(-1); });
  document.addEventListener('DOMContentLoaded', () => { const b = LC.$('#lightbox'); let x0 = null; b.addEventListener('click', (e) => { if (e.target === b) LC.closeLightbox(); }); b.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true }); b.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && lb.list.length > 1) lbStep(dx < 0 ? 1 : -1); }); });

  // ---------- polls & games ----------
  function pollEl(m) {
    const p = m.poll, total = p.options.reduce((a, o) => a + o.v.length, 0), voted = p.options.some((o) => o.v.includes(S.me.id));
    const box = el('div', { class: 'poll', role: 'group', 'aria-label': p.q }, el('div', { class: 'pq' }, LC.icon(p.quiz ? 'lightbulb' : 'poll'), el('span', { text: p.q })), el('div', { class: 'muted small', text: p.closed ? t('pollClosed') : p.quiz ? t('quizHint') : p.multi ? t('pollMulti') : t('pollSingle') }));
    p.options.forEach((o, i) => {
      const pct = total ? Math.round((o.v.length / total) * 100) : 0, mine = o.v.includes(S.me.id), right = p.closed && p.quiz && p.correct === i;
      const showBar = !p.quiz || p.closed || voted;
      box.append(el('button', { class: 'opt' + (mine ? ' mine' : '') + (right ? ' right' : '') + (p.closed && p.quiz && mine && !right ? ' wrong' : ''), disabled: p.closed || (p.quiz && voted), title: o.v.map(LC.uname).join(', '), onclick: () => LC.api('/api/poll/vote', { id: m.id, option: i }).catch((e) => LC.toast(e.message)) },
        showBar ? el('span', { class: 'bar', style: { width: pct + '%' } }) : null, el('span', { class: 'ot' }, mine ? LC.icon('checkmark') : null, right ? LC.icon('checkmark_circle', { filled: true, cls: 'ok' }) : null, o.t), showBar ? el('span', { class: 'oc', text: `${o.v.length}${total ? ' · ' + pct + '%' : ''}` }) : null));
    });
    box.append(el('div', { class: 'row-between small muted' }, el('span', { text: t('votes', { n: total }) }), !p.closed && (m.from === S.me.id || LC.isAdmin()) ? el('button', { class: 'link', text: p.quiz ? t('revealClose') : t('closePoll'), onclick: () => LC.api('/api/poll/close', { id: m.id }).catch((e) => LC.toast(e.message)) }) : null));
    return box;
  }
  function gameEl(m) {
    const g = m.game, mine = g.x === S.me.id || g.o === S.me.id, turnId = g.turn === 'x' ? g.x : g.o;
    const status = g.winner ? (g.winner === 'draw' ? t('gameDraw') : t('gameWon', { name: LC.uname(g.winner === 'x' ? g.x : g.o) })) : !g.o ? t('gameWaiting', { name: LC.uname(g.x) }) : t('gameTurn', { name: LC.uname(turnId) });
    const grid = el('div', { class: 'ttt', role: 'group', 'aria-label': 'Tic-tac-toe' });
    g.board.forEach((c, i) => grid.append(el('button', { class: 'cell ' + c, 'aria-label': c ? c.toUpperCase() : t('empty'), disabled: !!c || !!g.winner || !g.o || turnId !== S.me.id, text: c === 'x' ? '✕' : c === 'o' ? '◯' : '', onclick: () => LC.api('/api/game/move', { id: m.id, cell: i }).catch((e) => LC.toast(e.message)) })));
    return el('div', { class: 'game' }, el('div', { class: 'pq' }, LC.icon('games'), el('span', { text: t('ttt') + ` — ${LC.uname(g.x)} ✕ ${g.o ? LC.uname(g.o) : '?'} ◯` })), grid, el('div', { class: 'small muted', text: status }), !g.o && g.x !== S.me.id ? el('button', { class: 'primary sm', text: t('joinGame'), onclick: () => LC.api('/api/game/join', { id: m.id }).catch((e) => LC.toast(e.message)) }) : null, void mine);
  }
  function previewEl(p) { return el('a', { class: 'preview', href: p.url, target: '_blank', rel: 'noopener noreferrer' }, el('span', { class: 'ps', text: p.site }), el('b', { text: p.title }), p.description ? el('span', { class: 'pd', text: p.description }) : null); }

  // ---------- receipts ----------
  LC.tickState = (m) => {
    if (m.from !== S.me.id || !m.chan.startsWith('dm:')) return '';
    const peer = (S.peers[m.chan] || {})[LC.peerOf(m.chan)]; if (!peer) return 'sent';
    return m.seq <= peer.seen ? 'seen' : m.seq <= peer.delivered ? 'delivered' : 'sent';
  };
  LC.groupSeen = (m) => { const c = S.channels.get(m.chan); if (!c || !c.members || m.from !== S.me.id) return 0; return Object.entries(S.peers[m.chan] || {}).filter(([, v]) => v.seen >= m.seq).length; };

  // ---------- permissions mirrored from the server (the server still enforces them) ----------
  LC.canPin = (m) => { if (m.chan.startsWith('dm:')) return true; const c = S.channels.get(m.chan); return LC.isAdmin() || !!(c && c.members && c.by === S.me.id); };

  // ---------- message bubble ----------
  LC.msgSig = (m, o) => JSON.stringify([m, !!o.grouped, !!o.thread, o.lastMine ? LC.groupSeen(m) : -1, LC.tickState(m), (LC.prefs().saved || []).includes(m.id), LC.uname(m.from), (S.users.get(m.from) || {}).avatar, (S.users.get(m.from) || {}).role, S.me.id, Object.keys(S.emojis).length, LC.ui.lang]);
  const SYS_ICON = { call: 'call', callend: 'call_end', pin: 'pin', clear: 'broom' };
  // system lines from older versions start with an emoji; show an icon instead
  LC.sysText = (m) => { let text = String(m.system || ''), kind = m.kind; const lead = /^(📞|📌|🧹)\s*/u.exec(text); if (lead) { text = text.slice(lead[0].length); kind ||= { '📞': /ended/i.test(text) ? 'callend' : 'call', '📌': 'pin', '🧹': 'clear' }[lead[1]]; } return { text, kind }; };
  function sysEl(m) { const { text, kind } = LC.sysText(m); return el('div', { class: 'msg sys' + (kind ? ' k-' + kind : ''), 'data-id': m.id }, kind && SYS_ICON[kind] ? LC.icon(SYS_ICON[kind]) : null, el('span', { text, onclick: m.ref ? () => LC.jumpToMessage(m.chan, m.ref) : null, class: m.ref ? 'link' : '' }), el('time', { text: LC.fmtTime(m.ts) })); }
  LC.msgEl = (m, o = {}) => {
    if (m.system) return sysEl(m);
    const mine = m.from === S.me.id, u = S.users.get(m.from);
    if (m.deleted) return el('div', { class: 'msg tomb' + (mine ? ' mine' : ''), 'data-id': m.id }, mine ? null : el('div', { class: 'gut' }), el('div', { class: 'body bubble deleted' }, LC.icon('delete'), ' ' + t('deleted') + (m.deletedBy && m.deletedBy !== m.from ? ' · ' + t('deletedBy', { name: LC.uname(m.deletedBy) }) : '')));
    const body = el('div', { class: 'body bubble' });
    const marks = () => [m.pinned ? LC.icon('pin', { filled: true, cls: 'pinmark', label: t('pinned') }) : null, m.expiresAt ? el('span', { class: 'ttlmark', title: t('disappearsAt', { when: LC.fmtDateTime(m.expiresAt) }) }, LC.icon('timer', { label: t('disappearsAt', { when: LC.fmtDateTime(m.expiresAt) }) })) : null];
    if (!o.grouped) body.append(el('div', { class: 'mh' },
      mine ? null : el('button', { class: 'who', text: LC.uname(m.from), onclick: (e) => LC.userMenu(e.currentTarget, m.from) }),
      !mine && u && (u.role === 'owner' || u.role === 'admin') ? el('span', { class: 'role ' + u.role, text: u.role === 'owner' ? t('host') : t('admin'), title: u.role === 'owner' ? t('hostTitle') : t('adminTitle') }) : null,
      !mine && u && u.statusEmoji ? el('span', { text: u.statusEmoji, title: u.statusText }) : null,
      el('time', { text: LC.fmtTime(m.ts), title: LC.fmtDateTime(m.ts) }), m.edits ? el('button', { class: 'edited', text: t('edited'), title: t('viewOriginal'), onclick: () => LC.showHistory(m) }) : null, ...marks()));
    else if (m.pinned || m.expiresAt || m.edits) body.append(el('div', { class: 'mh mini' }, m.edits ? el('button', { class: 'edited', text: t('edited'), title: t('viewOriginal'), onclick: () => LC.showHistory(m) }) : null, ...marks()));
    if (m.fwd) body.append(el('div', { class: 'fwd small muted' }, LC.icon('arrow_forward'), ' ' + t('forwardedFrom', { name: LC.uname(m.fwd.from) })));
    if (m.reply) body.append(el('button', { class: 'quote', onclick: () => LC.jumpToMessage(m.chan, m.reply.id) }, el('b', { text: LC.uname(m.reply.from) }), el('span', { text: m.reply.text })));
    if (m.text) body.append(el('div', { class: 'txt' + (LC.isBigEmoji(m.text) ? ' big' : '') }, LC.renderText(m.text)));
    if (m.poll) body.append(pollEl(m)); if (m.game) body.append(gameEl(m));
    if (m.files && m.files.length) body.append(attachments(m));
    if (m.preview) body.append(previewEl(m.preview));
    for (const part of LC.extItems(LC.ext.msgParts, m, o)) if (part && part.nodeType) body.append(part);
    const keys = Object.keys(m.reactions || {});
    if (keys.length) body.append(el('div', { class: 'reacts' }, keys.map((k) => { const ids = m.reactions[k], cm = /^:([a-z0-9_]+):$/.exec(k); return el('button', { class: 'react' + (ids.includes(S.me.id) ? ' mine' : ''), title: ids.map(LC.uname).join(', '), 'aria-label': `${k} ${ids.length}`, onclick: () => LC.api('/api/react', { id: m.id, emoji: k }).catch((e) => LC.toast(e.message)) }, cm && S.emojis[cm[1]] ? el('img', { class: 'cemoji', src: LC.fileUrl({ id: S.emojis[cm[1]], name: 'e.png' }, true), alt: k }) : k, ' ' + ids.length); })));
    if (m.threadCount && !o.thread) body.append(el('button', { class: 'thread-sum', onclick: () => LC.openThread(m) }, LC.icon('comment'), ' ' + t('replies', { n: m.threadCount }), el('span', { class: 'muted', text: ' · ' + LC.ago(m.threadLast || m.ts) })));
    const tk = LC.tickState(m); let status = null;
    if (tk) status = el('span', { class: 'ticks ' + tk, 'aria-label': t('tick_' + tk), title: t('tick_' + tk) }, LC.icon(tk === 'seen' ? 'eye' : 'checkmark_circle', { filled: tk === 'delivered' }));
    else if (o.lastMine) { const n = LC.groupSeen(m); if (n) status = el('span', { class: 'seenby small muted' }, LC.icon('eye'), ' ' + t('seenBy', { n })); }
    // hover toolbar
    const tools = el('div', { class: 'tools', role: 'toolbar', 'aria-label': t('messageActions') });
    for (const e of ['👍', '❤️', '😂', '😮']) tools.append(el('button', { class: 'emo-r', text: e, title: t('react'), 'aria-label': t('react') + ' ' + e, onclick: () => LC.api('/api/react', { id: m.id, emoji: e }).catch((x) => LC.toast(x.message)) }));
    tools.append(LC.ibtn('emoji_add', t('moreReactions'), (ev) => LC.openPicker(ev.currentTarget, (e) => LC.api('/api/react', { id: m.id, emoji: e }).catch((x) => LC.toast(x.message)), { reactions: true }), { cls: '' }));
    if (!o.thread) tools.append(LC.ibtn('comment', t('replyThread'), () => LC.openThread(m), { cls: '' }));
    tools.append(LC.ibtn('arrow_reply', t('quoteReply'), () => (o.thread ? LC.composers.thread : LC.composers.main).reply(m), { cls: '' }));
    tools.append(LC.ibtn('more_horizontal', t('more'), (ev) => LC.msgMenu(ev.currentTarget, m, o), { cls: '', menu: true }));
    const node = el('div', { class: 'msg' + (o.grouped ? ' grouped' : '') + (mine ? ' mine' : '') + (LC.mentionsMe(m) ? ' mentioned' : ''), 'data-id': m.id, 'data-seq': m.seq },
      mine ? null : o.grouped ? el('div', { class: 'gut', text: LC.fmtTime(m.ts).replace(/\s?[AP]M/i, '') }) : el('button', { class: 'avbtn', 'aria-label': LC.uname(m.from), onclick: (e) => LC.userMenu(e.currentTarget, m.from) }, LC.avatar(u, '', false)),
      el('div', { class: 'bwrap' }, body, status, tools));
    node.addEventListener('click', (e) => { if (matchMedia('(pointer:coarse)').matches && !e.target.closest('a,button,img,video,audio,input')) { LC.$$('.msg.sel').forEach((x) => x !== node && x.classList.remove('sel')); node.classList.toggle('sel'); } });
    return node;
  };
  LC.msgMenu = (anchor, m, o) => {
    const saved = (LC.prefs().saved || []).includes(m.id), mine = m.from === S.me.id;
    LC.menu(anchor, [
      LC.canPin(m) ? { icon: m.pinned ? 'pin_off' : 'pin', label: m.pinned ? t('unpin') : t('pin'), fn: () => LC.api('/api/pin', { id: m.id }).catch((e) => LC.toast(e.message)) } : null,
      { icon: saved ? 'bookmark_off' : 'bookmark', label: saved ? t('unsave') : t('save'), fn: () => LC.setPrefs({ saved: saved ? (LC.prefs().saved || []).filter((x) => x !== m.id) : [...(LC.prefs().saved || []), m.id] }) },
      !m.poll && !m.game ? { icon: 'arrow_forward', label: t('forward'), fn: () => LC.forwardDialog(m) } : null,
      m.text ? { icon: 'copy', label: t('copyText'), fn: async () => { LC.toast((await LC.copy(m.text)) ? t('copied') : t('copyFailed'), { ms: 1500 }); } } : null,
      { icon: 'eye', label: t('seenByMenu'), fn: () => LC.showSeenBy(m) },
      m.edits ? { icon: 'history', label: t('viewOriginal'), fn: () => LC.showHistory(m) } : null,
      (mine && m.text && !m.poll && !m.game) || (mine && (m.files || []).length) ? 'sep' : null,
      mine && !m.poll && !m.game ? { icon: 'edit', label: t('edit'), fn: () => (o.thread ? LC.composers.thread : LC.composers.main).edit(m) } : null,
      ...LC.extItems(LC.ext.msgMenu, m, o),
      mine || LC.isAdmin() ? { icon: 'delete', label: t('delete'), danger: true, fn: async () => { if (await LC.confirm(t('confirmDelete'), { danger: true, ok: t('delete') })) LC.api('/api/delete', { id: m.id }).catch((e) => LC.toast(e.message)); } } : null,
    ]);
  };
})();
