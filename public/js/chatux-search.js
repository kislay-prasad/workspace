'use strict';
// Search and commands (chatux area): suggestions under the search box (people, chats, recent searches, /commands), a Teams-style
// results page with Messages / People / Files / Channels tabs, file-content matches, highlighted matches, find in this chat (Ctrl+F).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_recentSearches: 'Recent searches', cx_clearRecent: 'Clear', cx_searchFor: 'Search for “{q}”', cx_tabMessages: 'Messages', cx_tabPeople: 'People', cx_tabFilesR: 'Files', cx_tabChannels: 'Channels', cx_results: 'Results',
    cx_resultsFor: 'Results for “{q}”', cx_noPeople: 'Nobody matches.', cx_noFiles: 'No files match.', cx_noChannels: 'No chats or channels match.', cx_inFile: 'Found inside the file', cx_closeSearch: 'Close search',
    cx_find: 'Find in this chat', cx_findPh: 'Find in this chat', cx_findCount: '{i} of {n}', cx_findNone: 'No results', cx_findPrev: 'Previous result (Shift+Enter)', cx_findNext: 'Next result (Enter)', cx_closeFind: 'Close find (Esc)',
    cx_searchLabel: 'Search, or type / for commands', cx_open: 'Open', cx_message: 'Message', cx_moreFilters: 'Filters', cx_typeToSearch: 'Type to search messages, people, files and channels.', cx_messageMore: 'Showing the newest {n} matches.',
  });
  LC.addStrings('es', { cx_recentSearches: 'Búsquedas recientes', cx_clearRecent: 'Borrar', cx_tabMessages: 'Mensajes', cx_tabPeople: 'Personas', cx_tabFilesR: 'Archivos', cx_tabChannels: 'Canales', cx_find: 'Buscar en este chat', cx_findPh: 'Buscar en este chat', cx_findNone: 'Sin resultados', cx_findCount: '{i} de {n}' });
  LC.addStrings('hi', { cx_recentSearches: 'हाल की खोजें', cx_tabMessages: 'संदेश', cx_tabPeople: 'लोग', cx_tabFilesR: 'फ़ाइलें', cx_tabChannels: 'चैनल', cx_find: 'इस चैट में खोजें' });
  const fail = (e) => LC.toast(e.message || String(e));
  const recent = () => (LC.prefs().recentSearches || []).filter((x) => typeof x === 'string');
  const remember = (q) => { q = q.trim(); if (!q || q.startsWith('/') || !S.me) return; const list = [q, ...recent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 10); S.me.prefs.recentSearches = list; LC.setPrefs({ recentSearches: list }); };

  // ---------- highlighting matches (results and the conversation) ----------
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  LC.highlightText = (text, q) => { // -> fragment with <mark> around matches
    const frag = document.createDocumentFragment(), words = String(q || '').trim().split(/\s+/).filter((w) => w.length > 0); if (!words.length) { frag.append(text); return frag; }
    const re = new RegExp('(' + words.map(escRe).join('|') + ')', 'gi'); let last = 0, m;
    while ((m = re.exec(text))) { if (!m[0]) { re.lastIndex++; continue; } frag.append(text.slice(last, m.index), el('mark', { class: 'cx-hl', text: m[0] })); last = re.lastIndex; }
    frag.append(text.slice(last)); return frag;
  };
  const clearMarks = (root) => { for (const m of root.querySelectorAll('mark.cx-hl')) { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); } };
  LC.highlightIn = (root, q) => {
    clearMarks(root); const words = String(q || '').trim().split(/\s+/).filter(Boolean); if (!words.length) return 0;
    const re = new RegExp(words.map(escRe).join('|'), 'i'); let n = 0;
    for (const box of root.querySelectorAll('.txt, .cx-subject')) {
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT), nodes = []; while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue) && !walker.currentNode.parentNode.closest('mark.cx-hl')) nodes.push(walker.currentNode);
      for (const tn of nodes) { tn.parentNode.replaceChild(LC.highlightText(tn.nodeValue, q), tn); n++; }
    }
    return n;
  };
  LC.highlightQuery = '';
  LC.on('cx:drawn', (box) => { if (LC.highlightQuery) LC.highlightIn(box, LC.highlightQuery); else if (box.querySelector('mark.cx-hl')) clearMarks(box); });
  LC.on('cx:chat', (e) => { if (e.changed && !jumping) { LC.highlightQuery = ''; closeFind(); } });
  let jumping = false;
  const jump = async (chan, id, q) => { jumping = true; try { await LC.jumpToMessage(chan, id, { q }); } finally { jumping = false; } };

  // ---------- the search box: recent searches, suggestions, commands ----------
  function suggestBox() {
    const inp = $('#search'); if (!inp) return; const wrap = inp.closest('.topsearch');
    const box = el('div', { class: 'cx-sugbox hidden', id: 'cxSearchList', role: 'listbox', 'aria-label': t('cx_searchLabel') }); wrap.append(box);
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-controls', 'cxSearchList'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('aria-autocomplete', 'list');
    let items = [], sel = -1;
    const close = () => { box.classList.add('hidden'); inp.setAttribute('aria-expanded', 'false'); inp.removeAttribute('aria-activedescendant'); sel = -1; };
    const choose = (it) => { close(); it.run(); };
    const draw = () => {
      const q = inp.value.trim(), lq = q.toLowerCase(), groups = [];
      if (q.startsWith('/')) groups.push([t('cx_commands'), LC.commandList(q.split(/\s/)[0]).slice(0, 10).map((c) => ({ icon: 'slash_forward', label: c.name + (c.args ? ' ' + c.args : ''), sub: c.help, run: () => { LC.runCommand(q.split(/\s/)[0] === c.name ? q : c.name); inp.value = ''; } }))]);
      else if (!q) { const r = recent(); if (r.length) groups.push([t('cx_recentSearches'), r.map((x) => ({ icon: 'history', label: x, run: () => { inp.value = ''; LC.openSearch({ q: x }); } })), true]); }
      else {
        groups.push(['', [{ icon: 'search', label: t('cx_searchFor', { q }), run: () => { inp.value = ''; LC.openSearch({ q }); } }]]);
        const ppl = [...S.users.values()].filter((u) => !u.removed && !u.deleted && (LC.uname(u.id).toLowerCase().includes(lq) || u.name.toLowerCase().includes(lq))).slice(0, 4);
        if (ppl.length) groups.push([t('cx_tabPeople'), ppl.map((u) => ({ av: u, label: u.id === S.me.id ? LC.chatTitle(LC.dmId(u.id, u.id)) : LC.uname(u.id), sub: u.statusText || '', run: () => { inp.value = ''; LC.openChat(LC.dmId(S.me.id, u.id)); } }))]);
        const chats = [...S.channels.values()].filter((c) => c.name.toLowerCase().includes(lq)).slice(0, 4);
        if (chats.length) groups.push([t('cx_tabChannels'), chats.map((c) => ({ lead: c.id, label: LC.chanInfo(c.id).title, run: () => { inp.value = ''; LC.openChat(c.id); } }))]);
        const rs = recent().filter((x) => x.toLowerCase().includes(lq) && x.toLowerCase() !== lq).slice(0, 3);
        if (rs.length) groups.push([t('cx_recentSearches'), rs.map((x) => ({ icon: 'history', label: x, run: () => { inp.value = ''; LC.openSearch({ q: x }); } }))]);
      }
      items = groups.flatMap((g) => g[1]); if (sel >= items.length) sel = items.length - 1;
      if (!items.length) return close();
      let i = 0;
      box.replaceChildren(...groups.flatMap(([title, list, clearable]) => [title ? el('div', { class: 'cx-sughead', role: 'presentation' }, el('span', { text: title }), clearable ? el('button', { type: 'button', class: 'link', text: t('cx_clearRecent'), tabindex: '-1', onmousedown: (e) => { e.preventDefault(); S.me.prefs.recentSearches = []; LC.setPrefs({ recentSearches: [] }); draw(); } }) : null) : null,
        ...list.map((it) => { const k = i++; return el('div', { class: 'cx-opt' + (k === sel ? ' on' : ''), role: 'option', id: 'cxs-' + k, 'aria-selected': String(k === sel), onmousedown: (e) => { e.preventDefault(); choose(it); } }, it.av ? LC.avatar(it.av, 'sm', true) : it.lead ? LC.chatLead(it.lead, 'sm') : LC.icon(it.icon), el('span', { class: 'cx-optl', text: it.label }), it.sub ? el('small', { class: 'muted', text: it.sub }) : null); })]));
      box.classList.remove('hidden'); inp.setAttribute('aria-expanded', 'true'); if (sel >= 0) inp.setAttribute('aria-activedescendant', 'cxs-' + sel); else inp.removeAttribute('aria-activedescendant');
    };
    inp.addEventListener('focus', () => { sel = -1; draw(); });
    inp.addEventListener('input', () => { sel = -1; draw(); });
    inp.addEventListener('blur', () => setTimeout(close, 120));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = e.key === 'ArrowDown' ? (sel + 1 >= items.length ? 0 : sel + 1) : (sel <= 0 ? items.length - 1 : sel - 1); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); const q = inp.value.trim(); if (sel >= 0 && items[sel]) return choose(items[sel]); close(); if (!q) return; if (q.startsWith('/')) { LC.runCommand(q); inp.value = ''; return; } inp.value = ''; LC.openSearch({ q }); }
      else if (e.key === 'Escape') { if (!box.classList.contains('hidden')) { e.stopPropagation(); close(); } else inp.blur(); }
    });
  }
  document.addEventListener('DOMContentLoaded', suggestBox);

  // ---------- results page (takes over the big area, like Teams) ----------
  const view = { q: '', tab: 'messages', from: '', chan: '', has: '', after: '', before: '' };
  LC.ext.panes.cxsearch = { icon: 'search', label: () => t('search'), title: () => (view.q ? t('cx_resultsFor', { q: view.q }) : t('search')), order: 998, hidden: () => true, render: (nav) => LC.renderChats(nav, 0), main: (host) => drawResults(host),
    headerActions: () => [LC.ibtn('dismiss', t('cx_closeSearch'), () => { LC.closeApp(); LC.openChat(S.chan || 'general'); })] };
  LC.openSearch = (pre = {}) => {
    Object.assign(view, { q: pre.q || '', tab: pre.tab || 'messages', from: pre.from || '', chan: pre.chan || '', has: pre.has || '', after: '', before: '' });
    if (view.q) remember(view.q);
    LC.openApp('cxsearch');
  };
  const TABS = [['messages', 'cx_tabMessages', 'chat'], ['people', 'cx_tabPeople', 'people'], ['files', 'cx_tabFilesR', 'document'], ['channels', 'cx_tabChannels', 'people_team']];
  function drawResults(host) {
    const q = el('input', { type: 'search', class: 'cx-rq', value: view.q, placeholder: t('search'), 'aria-label': t('search') });
    const tabbar = el('div', { class: 'tabs cx-rtabs', role: 'tablist', 'aria-label': t('cx_results') }), out = el('div', { class: 'cx-results', id: 'cxResults', role: 'tabpanel', 'aria-live': 'polite' });
    const filters = el('div', { class: 'filters cx-rfilters' });
    const counts = {};
    const drawTabs = () => tabbar.replaceChildren(...TABS.map(([k, label, ic]) => el('button', { type: 'button', role: 'tab', class: 'tab' + (view.tab === k ? ' on' : ''), id: 'cxrt-' + k, 'aria-selected': String(view.tab === k), 'aria-controls': 'cxResults', onclick: () => { view.tab = k; drawTabs(); run(); } }, LC.icon(ic, { filled: view.tab === k }), el('span', { text: t(label) + (counts[k] != null ? ` (${counts[k]})` : '') }))));
    const sel = (label, opts, key) => { const s = el('select', { 'aria-label': label, onchange: (e) => { view[key] = e.target.value; run(); } }, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = view[key]; return s; };
    filters.append(sel(t('searchFrom'), [['', t('anyone')], ...[...S.users.values()].filter((u) => !u.deleted).map((u) => [u.id, LC.uname(u.id)])], 'from'),
      sel(t('searchIn'), [['', t('everywhere')], ...[...S.channels.values()].map((c) => [c.id, LC.chanInfo(c.id).title]), [LC.dmId(S.me.id, S.me.id), LC.chatTitle(LC.dmId(S.me.id, S.me.id))], ...[...S.users.values()].filter((u) => u.id !== S.me.id && !u.removed && !u.deleted).map((u) => [LC.dmId(S.me.id, u.id), '@ ' + LC.uname(u.id)])], 'chan'),
      sel(t('searchHas'), [['', 'anything'], ['file', 'hasFile'], ['image', 'hasImage'], ['link', 'hasLink'], ['pin', 'hasPin'], ['mention', 'hasMention'], ['poll', 'hasPoll']].map(([v, k]) => [v, t(k)]), 'has'),
      el('label', { class: 'small' }, t('after') + ' ', el('input', { type: 'date', value: view.after, 'aria-label': t('after'), onchange: (e) => { view.after = e.target.value; run(); } })), el('label', { class: 'small' }, t('before') + ' ', el('input', { type: 'date', value: view.before, 'aria-label': t('before'), onchange: (e) => { view.before = e.target.value; run(); } })));
    let seq = 0;
    async function run() {
      const my = ++seq, qq = view.q.trim(); $('#title').textContent = qq ? t('cx_resultsFor', { q: qq }) : t('search'); filters.classList.toggle('hidden', view.tab !== 'messages' && view.tab !== 'files');
      tabbar.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.id === 'cxrt-' + view.tab)));
      const lq = qq.toLowerCase();
      // people and chats are known locally: count them for the tab labels
      const people = [...S.users.values()].filter((u) => !u.removed && !u.deleted && (!lq || LC.uname(u.id).toLowerCase().includes(lq) || u.name.toLowerCase().includes(lq) || (u.statusText || '').toLowerCase().includes(lq)));
      const chans = [...S.channels.values()].filter((c) => !lq || c.name.toLowerCase().includes(lq) || (c.topic || '').toLowerCase().includes(lq));
      counts.people = people.length; counts.channels = chans.length;
      if (view.tab === 'people') { drawTabs(); return out.replaceChildren(...(people.length ? people.map((u) => el('div', { class: 'cx-rrow' }, LC.avatar(u, '', true), el('div', { class: 'grow' }, el('b', {}, LC.highlightText(u.id === S.me.id ? LC.chatTitle(LC.dmId(u.id, u.id)) : LC.uname(u.id), qq)), el('div', { class: 'muted small' }, u.statusText ? LC.highlightText(u.statusText, qq) : t(u.presence))),
        el('button', { type: 'button', class: 'secondary sm', text: t('cx_message'), onclick: () => LC.openChat(LC.dmId(S.me.id, u.id)) }), LC.ibtn('more_horizontal', t('more'), (e) => LC.userMenu(e.currentTarget, u.id), { menu: true }))) : [el('p', { class: 'muted pad', text: t('cx_noPeople') })])); }
      if (view.tab === 'channels') { drawTabs(); return out.replaceChildren(...(chans.length ? chans.map((c) => el('button', { type: 'button', class: 'cx-rrow plain', onclick: () => LC.openChat(c.id) }, LC.chatLead(c.id), el('div', { class: 'grow' }, el('b', {}, LC.highlightText(LC.chanInfo(c.id).title, qq)), el('div', { class: 'muted small' }, c.members ? t('peopleCount', { n: c.members.length }) : LC.highlightText(c.topic || '', qq))))) : [el('p', { class: 'muted pad', text: t('cx_noChannels') })])); }
      out.replaceChildren(el('p', { class: 'muted pad', text: t('searching') })); drawTabs();
      const p = new URLSearchParams(); if (qq) p.set('q', qq); if (view.from) p.set('from', view.from); if (view.chan) p.set('chan', view.chan);
      try {
        if (view.tab === 'files') {
          const { files } = await LC.api('/api/chatux/search/files?' + p); if (my !== seq) return; counts.files = files.length; drawTabs();
          return out.replaceChildren(...(files.length ? files.map((f) => el('div', { class: 'cx-rrow' }, el('span', { class: 'fi doc', 'aria-hidden': 'true' }, LC.icon(LC.isImage(f.name) ? 'image' : 'document')),
            el('button', { type: 'button', class: 'plain grow cx-rfile', onclick: () => jump(f.chan, f.msg, qq) }, el('b', {}, LC.highlightText(f.name, qq)), el('div', { class: 'muted small', text: `${LC.uname(f.from)} · ${LC.chatTitle(f.chan)} · ${LC.fmtDateTime(f.ts)} · ${LC.fmtSize(f.size || 0)}` }), f.snippet ? el('div', { class: 'cx-snip' }, el('span', { class: 'pill', text: t('cx_inFile') }), ' ', LC.highlightText(f.snippet, qq)) : null),
            el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download') }))) : [el('p', { class: 'muted pad', text: t('cx_noFiles') })]));
        }
        if (view.has) p.set('has', view.has); if (view.after) p.set('after', new Date(view.after + 'T00:00:00').getTime()); if (view.before) p.set('before', new Date(view.before + 'T23:59:59').getTime() + 1);
        if (![...p.keys()].length) { counts.messages = undefined; drawTabs(); return out.replaceChildren(el('p', { class: 'muted pad', text: t('cx_typeToSearch') })); }
        const { results } = await LC.api('/api/search?' + p); if (my !== seq) return; counts.messages = results.length; drawTabs();
        out.replaceChildren(...(results.length ? results.map((m) => el('button', { type: 'button', class: 'hit cx-rmsg', onclick: () => jump(m.chan, m.id, qq) }, el('div', { class: 'cx-rhead' }, LC.avatar(S.users.get(m.from), 'sm', false), el('b', { text: LC.uname(m.from) }), el('small', { text: `${LC.chatTitle(m.chan)} · ${LC.fmtDateTime(m.ts)}` })),
          m.subject ? el('div', { class: 'cx-subject' }, LC.highlightText(m.subject, qq)) : null, el('div', { class: 'cx-rtext' }, LC.highlightText(LC.snippet(m) || '…', qq)))) : [el('p', { class: 'muted pad', text: t('noMatches') })]), results.length >= 60 ? el('p', { class: 'muted small pad', text: t('cx_messageMore', { n: 60 }) }) : '');
      } catch (e) { out.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
    }
    const deb = LC.debounce(() => { view.q = q.value; run(); }, 300);
    q.addEventListener('input', deb); q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { view.q = q.value; remember(view.q); run(); } });
    host.replaceChildren(el('div', { class: 'cx-rsearch' }, LC.icon('search'), q), tabbar, filters, out); drawTabs(); run();
    if (!view.q) setTimeout(() => q.focus(), 30);
  }

  // ---------- find in this chat (Ctrl+F) ----------
  const find = { open: false, q: '', hits: [], i: -1, chan: null };
  function closeFind() { if (!find.open) return; find.open = false; find.hits = []; find.i = -1; const h = $('#cxBars .cx-findhost'); if (h) h.replaceChildren(); LC.highlightQuery = ''; const box = $('#msgs'); if (box) clearMarks(box); }
  LC.closeFind = closeFind;
  LC.openFind = () => {
    if (!S.chan || S.app) return; if (S.tab !== 'chat') LC.setTab('chat');
    const host = $('#cxBars .cx-findhost'); if (!host) return;
    if (find.open && find.chan === S.chan) { const i = host.querySelector('input'); if (i) { i.focus(); i.select(); } return; }
    Object.assign(find, { open: true, q: '', hits: [], i: -1, chan: S.chan });
    const inp = el('input', { type: 'search', class: 'cx-findin', placeholder: t('cx_findPh'), 'aria-label': t('cx_find') }), count = el('span', { class: 'cx-findcount muted small', role: 'status', 'aria-live': 'polite' });
    const prev = LC.ibtn('chevron_up', t('cx_findPrev'), () => step(-1)), next = LC.ibtn('chevron_down', t('cx_findNext'), () => step(1));
    const show = () => { count.textContent = !find.q ? '' : find.hits.length ? t('cx_findCount', { i: find.i + 1, n: find.hits.length }) : t('cx_findNone'); prev.disabled = next.disabled = find.hits.length < 2; };
    const go = async () => { const h = find.hits[find.i]; show(); if (!h) return; LC.highlightQuery = find.q; await jump(find.chan, h.id, find.q); const n = $('#msgs').querySelector(`[data-id="${h.id}"]`); $$('.cx-findcur').forEach((x) => x.classList.remove('cx-findcur')); if (n) n.classList.add('cx-findcur'); inp.focus(); };
    const $$ = LC.$$;
    async function search() {
      const q = inp.value.trim(); find.q = q; LC.highlightQuery = q; const box = $('#msgs'); if (box) LC.highlightIn(box, q);
      if (!q) { find.hits = []; find.i = -1; return show(); }
      try { const r = await LC.api(`/api/chatux/find?chan=${encodeURIComponent(find.chan)}&q=${encodeURIComponent(q)}`); if (find.q !== q) return; find.hits = r.hits; find.i = r.hits.length ? 0 : -1; show(); if (r.hits.length) go(); } catch (e) { fail(e); }
    }
    function step(d) { if (!find.hits.length) return; find.i = (find.i + d + find.hits.length) % find.hits.length; go(); } // results run newest → oldest: "next" goes further back
    const deb = LC.debounce(search, 280);
    inp.addEventListener('input', deb);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (find.q !== inp.value.trim()) search(); else step(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); LC.composers.main && LC.composers.main.focus(); } });
    host.replaceChildren(el('div', { class: 'cx-find', role: 'search', 'aria-label': t('cx_find') }, LC.icon('search'), inp, count, prev, next, LC.ibtn('dismiss', t('cx_closeFind'), () => closeFind())));
    show(); inp.focus();
  };
  document.addEventListener('keydown', (e) => {
    if (!S.me || !$('#app') || $('#app').classList.contains('hidden')) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' && !$('#modal:not(.hidden)') && !$('.modal.top')) { e.preventDefault(); LC.openFind(); }
  });
})();
