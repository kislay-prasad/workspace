'use strict';
// Live components inside messages (like Loop): a checklist, a table or a task list sent as a message whose content anyone in
// the chat edits in place; changes appear live for everyone (m.live = { kind, data, v }, POST /api/ap/live, 'update' events).
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_liveC: 'Live component', ap_liveChecklist: 'Live checklist', ap_liveTable: 'Live table', ap_liveTasks: 'Live task list', ap_liveDesc: 'Everyone in the chat can edit it right in the message, and sees changes as they happen.',
    ap_lvTitle: 'Title', ap_lvItems: 'Items (one per line)', ap_lvCols: 'Columns (separated by commas)', ap_lvRows: 'Rows', ap_lvAdd: 'Add an item', ap_lvAddRow: 'Add row', ap_lvAddCol: 'Add column', ap_lvDelRow: 'Delete row', ap_lvDelCol: 'Delete column', ap_lvColN: 'Column {n}',
    ap_lvEdited: 'Edited by {name} · {when}', ap_lvConflict: 'Someone else changed this first. You see their version now.', ap_lvCopy: 'Copy as text', ap_lvInsert: 'Insert a live component', ap_lvSend: 'Send', ap_lvDone: '{a} of {b} done', ap_lvItemN: 'Item {n}', ap_lvCell: '{col}, row {n}',
    ap_lvDefChecklist: 'Checklist', ap_lvDefTasks: 'Task list', ap_lvDefTable: 'Table',
  });
  LC.addStrings('hi', { ap_liveChecklist: 'लाइव चेकलिस्ट', ap_liveTable: 'लाइव टेबल', ap_liveTasks: 'लाइव कार्य सूची' });
  LC.addStrings('es', { ap_liveChecklist: 'Lista de comprobación en vivo', ap_liveTable: 'Tabla en vivo', ap_liveTasks: 'Lista de tareas en vivo' });
  const KIND = { checklist: ['checkbox_checked', 'ap_liveChecklist', 'ap_lvDefChecklist'], tasks: ['task_list_square_ltr', 'ap_liveTasks', 'ap_lvDefTasks'], table: ['table', 'ap_liveTable', 'ap_lvDefTable'] };

  // ---------- creating one from the message box ----------
  function create(composer, kind) {
    const title = el('input', { maxlength: 200, value: t(KIND[kind][2]), 'aria-label': t('ap_lvTitle') });
    const items = el('textarea', { rows: 5, maxlength: 10000, 'aria-label': t('ap_lvItems'), placeholder: '…' }), cols = el('input', { value: kind === 'table' ? 'A, B, C' : '', maxlength: 600, 'aria-label': t('ap_lvCols') }), rows = el('input', { type: 'number', min: 1, max: 60, value: 3, class: 'ap-num', 'aria-label': t('ap_lvRows') });
    const body = kind === 'table' ? [A.field(t('ap_lvTitle'), title), A.field(t('ap_lvCols'), cols), A.field(t('ap_lvRows'), rows)] : [A.field(t('ap_lvTitle'), title), A.field(t('ap_lvItems'), items)];
    A.modal(t(KIND[kind][1]), KIND[kind][0], [el('p', { class: 'muted small', text: t('ap_liveDesc') }), ...body], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_lvSend'), onclick: () => {
      const data = { title: title.value.trim() };
      if (kind === 'table') { data.cols = cols.value.split(',').map((x) => x.trim()).slice(0, 12); if (!data.cols.filter(Boolean).length) data.cols = ['', '']; data.rows = Array.from({ length: Math.max(1, Math.min(60, Number(rows.value) || 3)) }, () => []); }
      else data.items = items.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 100).map((text) => ({ text }));
      LC.closeModal(); composer.send({ force: true, text: data.title || t(KIND[kind][2]), extra: { live: { kind, data } } });
    } })], { wide: false });
    setTimeout(() => (kind === 'table' ? title : items).focus(), 40);
  }
  const menuItems = (composer) => (composer.cfg && composer.cfg.chan() && A.writable(composer.cfg.chan()) ? Object.entries(KIND).map(([k, [icon, label]]) => ({ icon, label: t(label) + '…', fn: () => create(composer, k) })) : []);
  LC.ext.composerMore.push((composer) => { const it = menuItems(composer); return it.length ? ['sep', ...it] : []; });
  LC.ext.attachMenu.push((composer) => (menuItems(composer).length ? [{ icon: 'live', label: t('ap_lvInsert') + '…', fn: () => A.modal(t('ap_lvInsert'), 'live', el('div', { class: 'ap-gallery' }, ...Object.entries(KIND).map(([k, [icon, label]]) => el('button', { type: 'button', class: 'ap-gcard ap-lvpick', onclick: () => create(composer, k) }, el('span', { class: 'ap-gicon', 'aria-hidden': 'true' }, LC.icon(icon)), el('span', { class: 'ap-gtext' }, el('b', { text: t(label) }), el('span', { class: 'muted small', text: t('ap_liveDesc') }))))), null, { wide: false }) }] : []));

  // ---------- drawing and editing it inside the message ----------
  // the chat redraws messages (new messages, reactions…), which moves them in the page and takes the focus away for a moment:
  // a field that loses focus that way gets it back instead of saving half-typed text; a real click elsewhere or Tab saves
  let lastDown = 0; document.addEventListener('pointerdown', () => { lastDown = Date.now(); }, true);
  const keepFocus = (i, comp, done) => i.addEventListener('blur', () => {
    const s0 = i.selectionStart, e0 = i.selectionEnd;
    setTimeout(() => { if (comp.dead) return; if (!i._done && i.isConnected && document.activeElement === document.body && Date.now() - lastDown > 300) { i.focus(); try { i.setSelectionRange(s0, e0); } catch {} return; } i._done = false; if (done) done(); }, 0);
  });
  const comps = new Map(); // message id (+ ':t' in the thread panel) -> { root, dead }
  const asText = (L) => { const d = L.data; if (L.kind === 'table') return [d.title, d.cols.map((c) => c.name).join('\t'), ...d.rows.map((r) => d.cols.map((c) => r.c[c.id] || '').join('\t'))].filter((x) => x !== undefined).join('\n'); return [d.title, ...d.items.map((x) => (x.done ? '[x] ' : '[ ] ') + x.text + (x.who ? ' — ' + LC.uname(x.who) : '') + (x.due ? ' (' + A.dayKey(x.due) + ')' : ''))].join('\n'); };
  function build(m, comp) {
    const L = m.live, d = L.data, can = A.writable(m.chan) && !m.deleted;
    const op = async (body) => { try { await LC.api('/api/ap/live', { id: m.id, ...body }); } catch (e) { if (e.status === 409) LC.toast(t('ap_lvConflict')); else A.fail(e); } };
    // a text field that saves when you leave it (Enter = done, Esc = undo); keeps what it started from to detect conflicts
    const field = (k, value, label, save, o = {}) => {
      const i = el('input', { class: 'ap-lvin' + (o.cls ? ' ' + o.cls : ''), value, maxlength: o.max || 500, 'aria-label': label, placeholder: o.ph || '', 'data-k': k, 'data-base': value, disabled: !can, readonly: !can });
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i._done = true; i.blur(); } else if (e.key === 'Escape') { i.value = i.dataset.base; i._done = true; i.blur(); } });
      keepFocus(i, comp, () => { const v = i.value.trim(); if (v !== i.dataset.base && (v || o.empty)) { i.dataset.base = v; save(v, i.getAttribute('data-orig') ?? value); } else if (!v && !o.empty) i.value = i.dataset.base; });
      return i;
    };
    const head = el('div', { class: 'ap-lvhead' }, el('span', { class: 'ap-lvicon', 'aria-hidden': 'true' }, LC.icon(KIND[L.kind][0])), field('title', d.title || '', t('ap_lvTitle'), (v, base) => op({ op: 'title', text: v, base }), { cls: 'ap-lvtitle', max: 200, ph: t(KIND[L.kind][2]), empty: true }), el('span', { class: 'ap-pill live' }, LC.icon('live'), t('ap_live')));
    const meta = el('div', { class: 'ap-lvmeta muted small', text: L.eby ? t('ap_lvEdited', { name: LC.uname(L.eby), when: LC.ago(L.ets) }) : L.kind !== 'table' && d.items.length ? t('ap_lvDone', { a: d.items.filter((x) => x.done).length, b: d.items.length }) : '' });
    let body;
    if (L.kind === 'table') {
      body = el('div', { class: 'tablewrap' }, el('table', { class: 'ap-lvtable' },
        el('thead', {}, el('tr', {}, ...d.cols.map((c, ci) => el('th', { scope: 'col' }, el('div', { class: 'ap-lvth' }, field('c:' + c.id, c.name, t('ap_lvColN', { n: ci + 1 }), (v, base) => op({ op: 'colname', col: c.id, text: v, base }), { max: 80, ph: t('ap_lvColN', { n: ci + 1 }), empty: true }), can && d.cols.length > 1 ? LC.ibtn('dismiss', t('ap_lvDelCol') + ': ' + (c.name || ci + 1), () => op({ op: 'delcol', col: c.id }), { cls: 'icon ap-lvx' }) : null))), can ? el('th', { class: 'ap-lvact' }, d.cols.length < 12 ? LC.ibtn('add', t('ap_lvAddCol'), () => op({ op: 'addcol', text: '' })) : null) : null)),
        el('tbody', {}, ...d.rows.map((r, ri) => el('tr', {}, ...d.cols.map((c) => el('td', {}, field('r:' + r.id + ':' + c.id, r.c[c.id] || '', t('ap_lvCell', { col: c.name || '', n: ri + 1 }), (v, base) => op({ op: 'cell', row: r.id, col: c.id, text: v, base }), { empty: true }))), can ? el('td', { class: 'ap-lvact' }, LC.ibtn('delete', t('ap_lvDelRow') + ' ' + (ri + 1), () => op({ op: 'delrow', row: r.id }), { cls: 'icon ap-lvx' })) : null)))),
        can && d.rows.length < 60 ? el('button', { type: 'button', class: 'link ap-lvaddrow', onclick: () => op({ op: 'addrow' }) }, LC.icon('add'), t('ap_lvAddRow')) : null);
    } else {
      const people = A.members(m.chan);
      body = el('div', {}, el('div', { class: 'ap-lvitems', role: 'list' }, ...d.items.map((x, i) => el('div', { class: 'ap-lvitem' + (x.done ? ' done' : ''), role: 'listitem' },
        el('input', { type: 'checkbox', checked: x.done, disabled: !can, 'aria-label': (x.text || t('ap_lvItemN', { n: i + 1 })), onchange: () => op({ op: 'toggle', item: x.id }) }),
        field('i:' + x.id, x.text, t('ap_lvItemN', { n: i + 1 }), (v, base) => op({ op: 'edit', item: x.id, text: v, base })),
        L.kind === 'tasks' ? el('span', { class: 'ap-lvwho' }, can ? A.peoplePick({ people, value: x.who ? [x.who] : [], multi: false, label: t('ap_assign'), placeholder: t('ap_assign'), onChange: (v) => op({ op: 'assign', item: x.id, who: v[0] || '' }) }) : x.who ? A.avatars([x.who]) : null) : null,
        L.kind === 'tasks' ? (() => { const dd = el('input', { type: 'date', value: x.due ? A.dayKey(x.due) : '', disabled: !can, 'aria-label': t('ap_due') + ': ' + x.text, class: 'ap-lvdue' + (x.due && !x.done && x.due < A.dayStart(Date.now()) ? ' late' : '') }); dd.addEventListener('change', () => op({ op: 'due', item: x.id, due: dd.value ? A.fromDay(dd.value) + 17 * 3600000 : 0 })); return dd; })() : null,
        can ? LC.ibtn('dismiss', t('ap_delete') + ': ' + x.text, () => op({ op: 'del', item: x.id }), { cls: 'icon ap-lvx' }) : null))),
        can && d.items.length < 100 ? (() => { const add = el('input', { class: 'ap-lvin ap-lvnew', placeholder: '+ ' + t('ap_lvAdd'), maxlength: 500, 'aria-label': t('ap_lvAdd'), 'data-k': 'new' }); add.addEventListener('keydown', (e) => { if (e.key === 'Enter' && add.value.trim()) { e.preventDefault(); const v = add.value.trim(); add.value = ''; comp.keepNew = true; op({ op: 'add', text: v }); } }); keepFocus(add, comp, null); return el('div', { class: 'ap-lvitem new' }, LC.icon('add'), add); })() : null);
    }
    return el('div', { class: 'ap-live k-' + L.kind, role: 'group', 'aria-label': t('ap_liveC') + ': ' + (d.title || t(KIND[L.kind][1])) }, head, body, meta);
  }
  LC.ext.msgParts.push((m, o) => {
    if (!m.live || m.deleted) return null;
    const key = m.id + (o && o.thread ? ':t' : ''), old = comps.get(key), comp = { dead: false, keepNew: false }; let carry = null;
    if (old) { const f = document.activeElement; if (old.root.isConnected && f && old.root.contains(f) && f.dataset && f.dataset.k) carry = { k: f.dataset.k, value: f.value, base: f.dataset.base, edited: f.value !== f.dataset.base, s: f.selectionStart, e: f.selectionEnd }; else if (old.keepNew) carry = { k: 'new', value: '', edited: false }; old.dead = true; }
    comp.root = build(m, comp); comps.set(key, comp);
    if (carry) requestAnimationFrame(() => { const n = comp.root.querySelector(`[data-k="${CSS.escape(carry.k)}"]`); if (!n) return; if (carry.edited) { n.value = carry.value; if (carry.base !== undefined) n.setAttribute('data-orig', carry.base); } n.focus(); try { n.setSelectionRange(carry.s ?? n.value.length, carry.e ?? n.value.length); } catch {} });
    if (comps.size > 300) for (const [k, c] of comps) if (c !== comp && !c.root.isConnected) comps.delete(k);
    return comp.root;
  });
  LC.ext.msgMenu.push((m) => (m.live && !m.deleted ? [{ icon: 'copy', label: t('ap_lvCopy'), fn: async () => { LC.toast((await LC.copy(asText(m.live))) ? t('copied') : t('copyFailed'), { ms: 1500 }); } }] : []));
})();
