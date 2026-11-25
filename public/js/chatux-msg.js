'use strict';
// Message actions (chatux area): follow / unfollow threads ("notifications on/off"), new-reply counts, the followed-threads view,
// mark unread from a message, the pinned-messages bar under the header, replies under posts in posts-style channels.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_followedEmpty: "You aren't following any threads with replies yet. Reply in a thread, or use ⋯ → Turn on notifications on a message.", cx_inChat: 'in {where}', cx_lastReply: 'Last reply from {name}: {text}',
    cx_unfollow: 'Stop following', cx_openThread: 'Open thread', cx_followedHelp: 'Threads you started, replied to or were mentioned in. New replies are counted since you last opened each thread.',
    cx_pinnedBar: 'Pinned message', cx_pinnedN: '{n} pinned', cx_seeAll: 'See all', cx_pinnedNone: 'Nothing pinned yet.', cx_pinnedBy: 'Pinned by {name}', cx_goToMsg: 'Go to message', cx_markedUnread: 'Marked as unread',
    cx_notifOffDone: "You won't be notified about replies to this message.", cx_notifOnDone: "You'll be notified about replies to this message.", cx_closePins: 'Hide pinned messages',
  });
  LC.addStrings('es', { cx_seeAll: 'Ver todo', cx_pinnedBar: 'Mensaje anclado', cx_pinnedN: '{n} anclados', cx_markedUnread: 'Marcado como no leído', cx_unfollow: 'Dejar de seguir', cx_openThread: 'Abrir conversación' });
  LC.addStrings('hi', { cx_seeAll: 'सभी देखें', cx_pinnedBar: 'पिन किया गया संदेश' });
  const cx = () => S.cx, fail = (e) => LC.toast(e.message || String(e));

  // ---------- following threads ----------
  LC.isFollowing = (m) => cx().follows.has(m.id) || ((m.from === S.me.id || LC.mentionsMe(m)) && !cx().unfollows.has(m.id));
  LC.setFollow = (m, on) => {
    if (on) { cx().follows.add(m.id); cx().unfollows.delete(m.id); } else { cx().follows.delete(m.id); cx().unfollows.add(m.id); }
    LC.api('/api/chatux/follow', { id: m.id, on }).then(() => LC.toast(on ? t('cx_notifOnDone') : t('cx_notifOffDone'), { ms: 2200 })).catch(fail); LC.renderNav();
  };
  // replies since you last opened a thread you follow
  LC.threadNew = (m) => { const c = cx(); if (!c || !m.threadCount || !c.follows.has(m.id)) return 0; return Math.max(0, m.threadCount - (c.seen[m.id] || 0)); };
  LC.followedFresh = () => { const c = cx(); if (!c) return 0; let n = 0; for (const [id, th] of Object.entries(c.threads)) if (c.follows.has(id) && th.n > (c.seen[id] || 0)) n++; return n; };
  const markSeen = (id) => LC.api('/api/chatux/thread/seen', { id }).then((r) => { cx().seen[id] = r.n; LC.renderNav(); }).catch(() => {});
  const seenSoon = LC.debounce(markSeen, 600);
  LC.on('cx:thread', (e) => markSeen(e.id));
  LC.on('message', (m) => { if (m.thread && S.thread && S.thread.id === m.thread && LC.visible()) seenSoon(m.thread); });

  // ---------- followed threads (from the chat list) ----------
  LC.ext.panes.cxthreads = { icon: 'comment_multiple', label: () => t('cx_followed'), order: 999, hidden: () => true, render: (nav) => LC.renderChats(nav, 0), main: (host) => drawFollowed(host) };
  LC.openFollowed = () => LC.openApp('cxthreads');
  async function drawFollowed(host) {
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('comment_multiple'), ' ' + t('cx_followed'))), el('p', { class: 'muted small', text: t('cx_followedHelp') }), el('p', { class: 'muted', text: t('loading') }));
    let threads; try { threads = (await LC.api('/api/chatux/followed')).threads; } catch (e) { return host.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
    if (S.app !== 'cxthreads') return;
    for (const th of threads) cx().threads[th.root.id] = { n: th.root.threadCount || th.count, chan: th.root.chan };
    const list = el('div', { class: 'cx-threads' }, threads.map((th) => {
      const m = th.root, open = async () => { await LC.openChat(m.chan, { noFocus: true }); LC.openThread(m); };
      return el('div', { class: 'cx-thcard' + (th.fresh ? ' unread' : '') },
        el('button', { type: 'button', class: 'plain cx-thmain', onclick: open, 'aria-label': t('cx_openThread') + ': ' + LC.uname(m.from) + ' — ' + LC.snippet(m) },
          el('div', { class: 'cx-threadhead' }, LC.chatLead(m.chan, 'sm'), el('b', { text: LC.chatTitle(m.chan) }), el('time', { class: 'muted small', text: LC.shortTime(th.last) })),
          el('div', { class: 'cx-thsnip' }, LC.avatar(S.users.get(m.from), 'sm', false), el('span', {}, el('b', { text: LC.uname(m.from) + ': ' }), LC.snippet(m))),
          el('div', { class: 'cx-thmeta' }, LC.icon('comment'), el('span', { text: t('replies', { n: th.count }) }), th.fresh ? el('span', { class: 'cx-newpill', text: t('cx_newReplies', { n: th.fresh }) }) : null,
            el('span', { class: 'muted small cx-thlast', text: t('cx_lastReply', { name: LC.uname(th.lastFrom), text: LC.plain(th.lastText) }) }))),
        LC.ibtn('alert_off', t('cx_unfollow'), () => { LC.setFollow(m, false); drawFollowed(host); }));
    }));
    host.replaceChildren(el('div', { class: 'tabhead' }, el('h2', {}, LC.icon('comment_multiple'), ' ' + t('cx_followed'))), el('p', { class: 'muted small', text: t('cx_followedHelp') }), threads.length ? list : LC.emptyState('comment_multiple', t('cx_followedEmpty')));
    LC.renderNav();
  }

  // ---------- mark unread from here ----------
  LC.markUnreadFrom = async (m) => {
    try {
      const r = await LC.api('/api/chatux/unread', { chan: m.chan, msg: m.id });
      S.read[m.chan] = r.seq; S.readAt[m.chan] = r.seq; S.unread[m.chan] = r.unread; S.mentions[m.chan] = r.mentions; if (S.chan === m.chan) cx().keepUnread = m.chan;
      LC.renderNav(); LC.updateBadge(); if (S.chan === m.chan) LC.renderMessages('keep'); LC.toast(t('cx_markedUnread'), { ms: 1500 });
    } catch (e) { fail(e); }
  };

  // ---------- posts-style channels: replies open inline under a post ----------
  LC.togglePostReplies = (m) => { const o = cx().openPosts; if (o.has(m.id)) o.delete(m.id); else o.add(m.id); LC.renderMessages('keep'); if (o.has(m.id)) markSeen(m.id); };

  // ---------- pinned messages: a bar under the header with the latest pin; "See all" lists them ----------
  let pins = [], pinChan = null, pinsShut = {};
  const bars = () => $('#cxBars');
  function drawPinBar() {
    const host = bars() && bars().querySelector('.cx-pinbar'); if (!host) return;
    const show = pins.length && S.chan === pinChan && S.tab === 'chat' && !pinsShut[pinChan];
    host.classList.toggle('hidden', !show); if (!show) return host.replaceChildren();
    const m = pins[0];
    host.replaceChildren(LC.icon('pin', { filled: true, cls: 'cx-pinic' }),
      el('button', { type: 'button', class: 'plain cx-pinmain', title: t('cx_goToMsg'), onclick: () => LC.jumpToMessage(m.chan, m.id) }, el('b', { text: (pins.length > 1 ? t('cx_pinnedN', { n: pins.length }) : t('cx_pinnedBar')) + ' · ' }), el('span', { text: LC.uname(m.from) + ': ' + (LC.snippet(m) || '…') })),
      el('button', { type: 'button', class: 'link cx-seeall', text: t('cx_seeAll'), onclick: () => LC.pinnedList() }),
      LC.ibtn('dismiss', t('cx_closePins'), () => { pinsShut[pinChan] = true; drawPinBar(); }));
  }
  const loadPins = async (chan) => { try { const r = await LC.api('/api/chatux/pins?chan=' + encodeURIComponent(chan)); if (S.chan !== chan) return; pins = r.pins; pinChan = chan; } catch { pins = []; pinChan = chan; } drawPinBar(); };
  LC.on('cx:chat', (e) => { if (e.changed || pinChan !== e.chan) { pins = []; pinChan = e.chan; drawPinBar(); loadPins(e.chan); } else drawPinBar(); });
  LC.on('update', (m) => { if (m.chan !== pinChan) return; const had = pins.some((p) => p.id === m.id); if (had !== !!m.pinned || (had && m.deleted)) { if (m.pinned) delete pinsShut[pinChan]; loadPins(m.chan); } else if (had) { pins = pins.map((p) => (p.id === m.id ? m : p)); drawPinBar(); } });
  LC.on('purge', (e) => { if (e.chan === pinChan && pins.some((p) => e.ids.includes(p.id))) loadPins(e.chan); });
  LC.pinnedList = async () => {
    const chan = S.chan, out = el('div', { class: 'results' }, el('p', { class: 'muted', text: t('loading') }));
    LC.modal([el('h2', {}, LC.icon('pin'), ' ' + t('pinnedMsgs')), out, el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('close'), onclick: LC.closeModal }))], { wide: true });
    try {
      const { pins: list } = await LC.api('/api/chatux/pins?chan=' + encodeURIComponent(chan));
      out.replaceChildren(...(list.length ? list.map((m) => el('div', { class: 'hit row-between' }, el('button', { class: 'plain', onclick: () => { LC.closeModal(); LC.jumpToMessage(m.chan, m.id); } }, el('small', { text: `${LC.uname(m.from)} · ${LC.fmtDateTime(m.ts)}` + (m.pinned && m.pinned.by ? ' · ' + t('cx_pinnedBy', { name: LC.uname(m.pinned.by) }) : '') }), el('div', { text: LC.snippet(m) || '…' })),
        LC.canPin(m) ? el('button', { class: 'secondary sm', text: t('unpin'), onclick: () => LC.api('/api/pin', { id: m.id }).then(() => LC.pinnedList()).catch(fail) }) : null)) : [el('p', { class: 'muted', text: t('cx_pinnedNone') })]));
    } catch (e) { out.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const view = $('#chatView'); if (!view) return;
    view.insertBefore(el('div', { id: 'cxBars', class: 'cx-bars' }, el('div', { class: 'cx-findhost' }), el('div', { class: 'cx-pinbar hidden', role: 'region', 'aria-label': t('pinnedMsgs') })), $('#msgs'));
  });
})();
