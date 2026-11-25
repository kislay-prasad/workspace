'use strict';
// Lists: custom tables with typed columns (text, number, choice, date, person, yes/no, link); add / edit / delete rows inline
// or in a form; sort, filter, search, group; templates; live for everyone. A chat tab and a "Lists" app.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_lists: 'Lists', ap_listsDesc: 'Track issues, assets, plans and contacts in shared tables.', ap_newList: 'New list', ap_listName: 'List name', ap_template: 'Start from', ap_tpl_blank: 'Blank list', ap_tpl_issues: 'Issue tracker', ap_tpl_assets: 'Asset tracker', ap_tpl_itinerary: 'Event itinerary', ap_tpl_contacts: 'Contacts',
    ap_tplD_blank: 'Start from scratch with a title column.', ap_tplD_issues: 'Track issues with priority, status and who is on it.', ap_tplD_assets: 'Keep track of devices and equipment and who has them.', ap_tplD_itinerary: 'Plan the activities and bookings of an event or a trip.', ap_tplD_contacts: 'A shared address book.',
    ap_newItem: 'New item', ap_editItem: 'Edit item', ap_delItem: 'Delete item', ap_confirmDelItem: 'Delete this item?', ap_addColumn: 'Add column', ap_editColumn: 'Edit column', ap_delColumn: 'Delete column', ap_confirmDelColumn: 'Delete the column “{name}” and its values?', ap_colName: 'Column name', ap_colType: 'Type',
    ap_c_text: 'Text', ap_c_number: 'Number', ap_c_choice: 'Choice', ap_c_date: 'Date', ap_c_person: 'Person', ap_c_bool: 'Yes/No', ap_c_link: 'Link', ap_choices: 'Choices', ap_addChoice: 'Add choice', ap_yes: 'Yes', ap_no: 'No', ap_allLists: 'All lists', ap_myLists: 'My lists',
    ap_noLists: 'No lists yet', ap_noListsHelp: 'Make a list from a template or from scratch. Everyone in the chat can see and edit it.', ap_noItems: 'No items yet. Select “New item” to add one.', ap_delList: 'Delete list', ap_confirmDelList: 'Delete the list “{name}” and all its items for everyone?', ap_listInfo: 'Name and description',
    ap_itemsN: '{n} items', ap_filterCol: 'Filter: {name}', ap_any: 'Any', ap_searchList: 'Search this list', ap_sortAsc: 'Sort A to Z', ap_sortDesc: 'Sort Z to A', ap_groupByCol: 'Group by this column', ap_noGroup: 'No grouping', ap_moveColLeft: 'Move left', ap_moveColRight: 'Move right', ap_empty: '(empty)', ap_listColor: 'Colour', ap_columnMenu: 'Column options for {name}', ap_itemMenu: 'Item options',
  });
  LC.addStrings('hi', { ap_lists: 'सूचियाँ', ap_newList: 'नई सूची', ap_newItem: 'नया आइटम', ap_addColumn: 'कॉलम जोड़ें' });
  LC.addStrings('es', { ap_lists: 'Listas', ap_newList: 'Nueva lista', ap_newItem: 'Nuevo elemento', ap_addColumn: 'Agregar columna' });
  const TYPES = ['text', 'number', 'choice', 'date', 'person', 'bool', 'link'], CICON = { text: 'text_t', number: 'number_symbol', choice: 'checkmark_circle', date: 'calendar_ltr', person: 'person', bool: 'toggle_left', link: 'link' };
  const TPL = ['blank', 'issues', 'assets', 'itinerary', 'contacts'], TPLICON = { blank: 'apps_list_detail', issues: 'warning', assets: 'desktop', itinerary: 'calendar_ltr', contacts: 'people' };
  const CHOICE_COLORS = ['#cfe4fa', '#dff6dd', '#fed9cc', '#fff4ce', '#f1dbf6', '#e1dfdd', '#c7e0f4', '#fde7e9'];
  const peopleOf = (l) => (l.chan ? A.members(l.chan) : A.everyone());

  A.newList = (chan, after) => {
    let tpl = 'blank'; const name = el('input', { maxlength: 80, placeholder: t('ap_listName'), 'aria-label': t('ap_listName') }), desc = el('input', { maxlength: 500, placeholder: t('ap_description'), 'aria-label': t('ap_description') });
    const where = A.select([['', t('ap_personal')], ...A.allChats().map((c) => [c.id, c.label])], chan || '', null, t('ap_where'));
    const grid = el('div', { class: 'ap-tplgrid', role: 'radiogroup', 'aria-label': t('ap_template') });
    const draw = () => A.put(grid, ...TPL.map((k) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(tpl === k), class: 'ap-tpl' + (tpl === k ? ' on' : ''), onclick: () => { tpl = k; if (!name.value || TPL.some((x) => t('ap_tpl_' + x) === name.value)) name.value = k === 'blank' ? '' : t('ap_tpl_' + k); draw(); } }, el('span', { class: 'ap-tplic', 'aria-hidden': 'true' }, LC.icon(TPLICON[k])), el('b', { text: t('ap_tpl_' + k) }), el('span', { class: 'muted small', text: t('ap_tplD_' + k) }))));
    draw();
    A.modal(t('ap_newList'), 'apps_list_detail', [el('h3', { text: t('ap_template') }), grid, A.field(t('ap_listName'), name), A.field(t('ap_description'), desc), A.field(t('ap_where'), where)],
      [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_newList'), onclick: async () => { if (!name.value.trim()) return name.focus(); const r = await A.call('/api/ap/list/new', { chan: where.value || undefined, name: name.value, desc: desc.value, template: tpl }); if (r) { LC.closeModal(); after && after(r.id, where.value); } } })]);
    setTimeout(() => name.focus(), 40);
  };

  // ---------- value display and editors ----------
  const show = (l, c, v) => {
    if (v === undefined || v === null || v === '') return el('span', { class: 'ap-lempty' });
    if (c.type === 'choice') { const o = (c.choices || []).find((x) => x.id === v); return o ? el('span', { class: 'ap-lchoice', style: '--cc:' + o.c, text: o.t }) : el('span'); }
    if (c.type === 'person') return el('span', { class: 'ap-lperson' }, LC.avatar(S.users.get(v), 'xs'), el('span', { text: LC.uname(v) }));
    if (c.type === 'bool') return v ? el('span', { class: 'ap-lbool' }, LC.icon('checkmark', { label: t('ap_yes') })) : el('span', { class: 'muted', text: t('ap_no') });
    if (c.type === 'link') return el('a', { href: v, target: '_blank', rel: 'noopener noreferrer', text: v.replace(/^https?:\/\//, '').slice(0, 60) });
    if (c.type === 'date') return el('span', { text: A.fmtDay(A.fromDay(v), { day: 'numeric', month: 'short', year: 'numeric' }) });
    if (c.type === 'number') return el('span', { class: 'ap-lnum', text: Number(v).toLocaleString(A.lang()) });
    return el('span', { class: c.long ? 'ap-llong' : '', text: String(v) });
  };
  const textOf = (l, c, v) => (v === undefined || v === null ? '' : c.type === 'choice' ? ((c.choices || []).find((x) => x.id === v) || {}).t || '' : c.type === 'person' ? LC.uname(v) : c.type === 'bool' ? (v ? t('ap_yes') : t('ap_no')) : String(v));
  function editor(l, c, v, commit) {
    let n;
    if (c.type === 'choice') n = A.select([['', '—'], ...(c.choices || []).map((o) => [o.id, o.t])], v || '', (x) => commit(x || null), c.name);
    else if (c.type === 'person') n = A.select([['', '—'], ...peopleOf(l).map((u) => [u.id, LC.uname(u.id)])], v || '', (x) => commit(x || null), c.name);
    else if (c.type === 'bool') { n = el('input', { type: 'checkbox', checked: !!v, 'aria-label': c.name }); n.addEventListener('change', () => commit(n.checked)); return n; }
    else if (c.type === 'date') { n = el('input', { type: 'date', value: v || '', 'aria-label': c.name }); n.addEventListener('change', () => commit(n.value || null)); }
    else { n = el(c.long ? 'textarea' : 'input', { type: c.type === 'number' ? 'number' : c.type === 'link' ? 'url' : null, step: c.type === 'number' ? 'any' : null, maxlength: c.long ? 4000 : 400, rows: c.long ? 3 : null, 'aria-label': c.name }); n.value = v === undefined || v === null ? '' : String(v); n.addEventListener('change', () => commit(n.value === '' ? null : n.value)); }
    return n;
  }

  // ---------- one list ----------
  function listView(host, id, back) {
    const V = { l: null, q: '', sort: null, dir: 1, group: '', filter: {} };
    const root = el('div', { class: 'ap-page ap-lview' }); A.put(host, root);
    const call = (path, body) => A.call(path, { id, ...body });
    const can = () => V.l && (!V.l.chan || A.writable(V.l.chan));
    async function load() { try { V.l = (await LC.api('/api/ap/list?id=' + id)).list; draw(); } catch (e) { A.put(root, el('p', { class: 'err', text: e.message }), back ? el('button', { class: 'secondary', text: t('ap_back'), onclick: back }) : null); } }
    A.on('ap_list', (e) => {
      if (e.id !== id || !V.l) return;
      if (e.op === 'deleted') { LC.toast(t('ap_delList') + ': ' + V.l.name); return back ? back() : A.put(root); }
      if (e.op === 'row') { const i = V.l.rows.findIndex((r) => r.id === e.row.id); if (i >= 0) V.l.rows[i] = e.row; else V.l.rows.push(e.row); }
      else if (e.op === 'delrows') { const ids = new Set(e.rows); V.l.rows = V.l.rows.filter((r) => !ids.has(r.id)); }
      else if (e.op === 'cols') { V.l.cols = e.cols; if (e.rows) V.l.rows = e.rows; }
      if (e.list) Object.assign(V.l, { name: e.list.name, desc: e.list.desc, color: e.list.color });
      const a = document.activeElement; if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('.ap-lcell')) { V.stale = true; return; } draw();
    }, root);
    root.addEventListener('focusout', () => setTimeout(() => { if (V.stale && !(document.activeElement && root.contains(document.activeElement) && document.activeElement.closest('.ap-lcell'))) { V.stale = false; draw(); } }, 30));
    const setCell = (r, c, v) => call('/api/ap/list/row', { op: 'edit', row: r.id, v: { [c.id]: v } }).then((x) => { if (x) { const i = V.l.rows.findIndex((y) => y.id === r.id); if (i >= 0) V.l.rows[i] = x.row; } });
    function rowsShown() {
      const l = V.l, q = V.q.toLowerCase(); let rows = l.rows.filter((r) => (!q || l.cols.some((c) => textOf(l, c, r.v[c.id]).toLowerCase().includes(q))) && Object.entries(V.filter).every(([cid, val]) => !val || (val === '__none' ? r.v[cid] === undefined : String(r.v[cid]) === val)));
      if (V.sort) { const c = l.cols.find((x) => x.id === V.sort); if (c) rows = [...rows].sort((a, b) => { const x = a.v[c.id], y = b.v[c.id]; if (x === undefined) return 1; if (y === undefined) return -1; return (c.type === 'number' ? x - y : textOf(l, c, x).localeCompare(textOf(l, c, y), undefined, { numeric: true })) * V.dir; }); }
      return rows;
    }
    function colMenu(anchor, c, i) {
      const l = V.l, ok = can(), vals = [...new Set(l.rows.map((r) => r.v[c.id]).filter((v) => v !== undefined).map(String))].slice(0, 30);
      LC.menu(anchor, [{ icon: 'arrow_up', label: t('ap_sortAsc'), fn: () => { V.sort = c.id; V.dir = 1; draw(); } }, { icon: 'arrow_down', label: t('ap_sortDesc'), fn: () => { V.sort = c.id; V.dir = -1; draw(); } },
        ['choice', 'person', 'bool', 'date'].includes(c.type) ? { icon: 'group_list', label: V.group === c.id ? t('ap_noGroup') : t('ap_groupByCol'), fn: () => { V.group = V.group === c.id ? '' : c.id; draw(); } } : null, 'sep',
        { icon: 'filter', label: t('ap_any'), checked: !V.filter[c.id], fn: () => { delete V.filter[c.id]; draw(); } }, ...vals.map((v) => ({ label: textOf(l, c, c.type === 'number' ? Number(v) : c.type === 'bool' ? v === 'true' : v) || v, checked: V.filter[c.id] === v, fn: () => { V.filter[c.id] = v; draw(); } })), { label: t('ap_empty'), checked: V.filter[c.id] === '__none', fn: () => { V.filter[c.id] = '__none'; draw(); } }, 'sep',
        { icon: 'edit', label: t('ap_editColumn'), disabled: !ok, fn: () => colDialog(c) }, { icon: 'arrow_left', label: t('ap_moveColLeft'), disabled: !ok || i === 0, fn: () => call('/api/ap/list/col', { op: 'move', col: c.id, to: i - 1 }).then(load) }, { icon: 'arrow_right', label: t('ap_moveColRight'), disabled: !ok || i === l.cols.length - 1, fn: () => call('/api/ap/list/col', { op: 'move', col: c.id, to: i + 1 }).then(load) },
        { icon: 'delete', label: t('ap_delColumn'), danger: true, disabled: !ok || l.cols.length <= 1, fn: async () => { if (await LC.confirm(t('ap_confirmDelColumn', { name: c.name }), { danger: true, ok: t('ap_delete') })) call('/api/ap/list/col', { op: 'del', col: c.id }).then(load); } }]);
    }
    function colDialog(c) {
      const name = el('input', { value: c ? c.name : '', maxlength: 80, 'aria-label': t('ap_colName') }), type = A.select(TYPES.map((x) => [x, t('ap_c_' + x)]), c ? c.type : 'text', () => drawExtra(), t('ap_colType')); type.disabled = !!c;
      let choices = c && c.choices ? c.choices.map((o) => ({ ...o })) : [{ t: '' }, { t: '' }], long = !!(c && c.long); const extra = el('div');
      const drawExtra = () => A.put(extra, ...(type.value === 'choice' ? [el('b', { class: 'small', text: t('ap_choices') }), ...choices.map((o, i) => el('div', { class: 'ap-optrow' }, el('input', { type: 'color', value: o.c || CHOICE_COLORS[i % 8], 'aria-label': t('ap_listColor'), onchange: (e) => { o.c = e.target.value; } }), (() => { const n = el('input', { value: o.t, maxlength: 80, 'aria-label': t('ap_option', { n: i + 1 }) }); n.addEventListener('input', () => { o.t = n.value; }); return n; })(), LC.ibtn('dismiss', t('ap_remove'), () => { choices.splice(i, 1); drawExtra(); }))), el('button', { type: 'button', class: 'link', text: t('ap_addChoice'), onclick: () => { choices.push({ t: '' }); drawExtra(); } })] : type.value === 'text' ? [el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: long, onchange: (e) => { long = e.target.checked; } }), t('ap_longAnswer'))] : []));
      drawExtra();
      A.modal(c ? t('ap_editColumn') : t('ap_addColumn'), CICON[c ? c.type : 'text'], [A.field(t('ap_colName'), name), A.field(t('ap_colType'), type), extra], [el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_save'), onclick: async () => {
        const def = { name: name.value, type: type.value, long, choices: choices.filter((o) => o.t.trim()) };
        const r = await call('/api/ap/list/col', c ? { op: 'edit', col: c.id, def } : { op: 'add', def }); if (r) { LC.closeModal(); load(); }
      } })], { wide: false });
      setTimeout(() => name.focus(), 40);
    }
    function itemDialog(r) {
      const l = V.l, vals = { ...(r ? r.v : {}) };
      const fields = l.cols.map((c) => A.field(c.name, editor(l, c, vals[c.id], (v) => { vals[c.id] = v === null ? '' : v; })));
      A.modal(r ? t('ap_editItem') : t('ap_newItem'), 'apps_list_detail', fields, [r ? el('button', { class: 'secondary ap-danger', text: t('ap_delItem'), onclick: async () => { if (await LC.confirm(t('ap_confirmDelItem'), { danger: true, ok: t('ap_delete') })) { await call('/api/ap/list/row', { op: 'del', row: r.id }); LC.closeModal(); } } }) : null,
        el('button', { class: 'secondary', text: t('ap_cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('ap_save'), onclick: async () => {
          for (const el2 of document.querySelectorAll('#modal input, #modal textarea')) el2.dispatchEvent(new Event('change'));
          const x = await call('/api/ap/list/row', r ? { op: 'edit', row: r.id, v: vals } : { op: 'add', v: vals }); if (x) { LC.closeModal(); const i = V.l.rows.findIndex((y) => y.id === x.row.id); if (i >= 0) V.l.rows[i] = x.row; else V.l.rows.push(x.row); draw(); }
        } })], { wide: false });
    }
    function cellEl(r, c) {
      const td = el('td', { class: 'ap-lcell t-' + c.type }); const v = r.v[c.id];
      if (!can()) { td.append(show(V.l, c, v)); return td; }
      if (c.type === 'bool') { td.append(el('input', { type: 'checkbox', checked: !!v, 'aria-label': c.name, onchange: (e) => setCell(r, c, e.target.checked) })); return td; }
      const b = el('button', { type: 'button', class: 'ap-lcellbtn', 'aria-label': c.name + ': ' + (textOf(V.l, c, v) || t('ap_empty')) }, show(V.l, c, v));
      b.addEventListener('click', () => { const ed = editor(V.l, c, v, (nv) => { setCell(r, c, nv).then(() => draw()); }); A.put(td, ed); ed.focus(); ed.addEventListener('blur', () => setTimeout(() => { if (td.contains(ed)) draw(); }, 150)); ed.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); draw(); } else if (e.key === 'Enter' && ed.tagName !== 'TEXTAREA') ed.blur(); }); });
      td.append(b); return td;
    }
    function draw() {
      const l = V.l; if (!l) return; const ok = can(), rows = rowsShown(), gc = l.cols.find((c) => c.id === V.group);
      const head = el('tr', {}, ...l.cols.map((c, i) => el('th', { scope: 'col', 'aria-sort': V.sort === c.id ? (V.dir > 0 ? 'ascending' : 'descending') : null }, el('button', { type: 'button', class: 'ap-colbtn', 'aria-haspopup': 'menu', 'aria-label': t('ap_columnMenu', { name: c.name }), onclick: (e) => colMenu(e.currentTarget, c, i) }, LC.icon(CICON[c.type]), el('span', { text: c.name }), V.filter[c.id] ? LC.icon('filter', { label: t('ap_filterCol', { name: c.name }) }) : null, V.sort === c.id ? LC.icon(V.dir > 0 ? 'arrow_up' : 'arrow_down') : null, LC.icon('chevron_down', { cls: 'ap-colchev' })))),
        ok ? el('th', { class: 'ap-lactcol' }, LC.ibtn('add', t('ap_addColumn'), () => colDialog(null))) : el('th', { class: 'ap-lactcol' }, el('span', { class: 'sr-only', text: t('ap_more') })));
      const rowEl = (r) => el('tr', { 'data-id': r.id }, ...l.cols.map((c) => cellEl(r, c)), el('td', { class: 'ap-lactcol' }, LC.ibtn('more_horizontal', t('ap_itemMenu'), (e) => LC.menu(e.currentTarget, [{ icon: 'edit', label: t('ap_editItem'), fn: () => itemDialog(r), disabled: !ok }, { icon: 'delete', label: t('ap_delItem'), danger: true, disabled: !ok, fn: async () => { if (await LC.confirm(t('ap_confirmDelItem'), { danger: true, ok: t('ap_delete') })) call('/api/ap/list/row', { op: 'del', row: r.id }); } }]), { menu: true })));
      const body = el('tbody');
      if (gc) { const keys = [...new Set(rows.map((r) => (r.v[gc.id] === undefined ? '' : String(r.v[gc.id]))))]; for (const k of keys) { const rs = rows.filter((r) => (r.v[gc.id] === undefined ? '' : String(r.v[gc.id])) === k); body.append(el('tr', { class: 'ap-grow' }, el('th', { colspan: l.cols.length + 1, scope: 'colgroup' }, k ? textOf(l, gc, gc.type === 'bool' ? k === 'true' : k) : t('ap_empty'), el('span', { class: 'ap-count', text: String(rs.length) }))), ...rs.map(rowEl)); } }
      else body.append(...rows.map(rowEl));
      const search = el('input', { type: 'search', value: V.q, placeholder: t('ap_searchList'), 'aria-label': t('ap_searchList'), oninput: LC.debounce((e) => { V.q = e.target.value; draw(); const s = root.querySelector('input[type=search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 250) });
      A.put(root, 
        el('div', { class: 'ap-lhead' }, back ? LC.ibtn('arrow_left', t('ap_back'), back) : null, el('span', { class: 'ap-navic', style: { background: l.color }, 'aria-hidden': 'true' }, LC.icon('apps_list_detail')), el('div', { class: 'grow' }, el('h2', { text: l.name }), l.desc ? el('div', { class: 'muted small', text: l.desc }) : null), el('span', { class: 'muted small', text: t('ap_itemsN', { n: l.rows.length }) + (l.chan ? ' · ' + A.chatTitle(l.chan) : ' · ' + t('ap_personal')) })),
        el('div', { class: 'ap-tbar' }, ok ? el('button', { class: 'primary sm withicon', onclick: () => itemDialog(null) }, LC.icon('add'), el('span', { text: t('ap_newItem') })) : null, ok ? el('button', { class: 'secondary sm withicon', onclick: () => colDialog(null) }, LC.icon('column_triple_edit'), el('span', { text: t('ap_addColumn') })) : null, el('span', { class: 'grow' }), search,
          el('label', { class: 'ap-inline' }, el('span', { class: 'small muted', text: t('ap_groupBy') }), A.select([['', t('ap_noGroup')], ...l.cols.filter((c) => ['choice', 'person', 'bool', 'date'].includes(c.type)).map((c) => [c.id, c.name])], V.group, (v) => { V.group = v; draw(); }, t('ap_groupBy'))),
          Object.keys(V.filter).length ? el('button', { class: 'secondary sm', text: t('ap_clearFilter'), onclick: () => { V.filter = {}; draw(); } }) : null,
          LC.ibtn('more_horizontal', t('ap_more'), (e) => LC.menu(e.currentTarget, [{ icon: 'arrow_download', label: t('ap_exportCsv'), fn: () => A.saveCsv([l.cols.map((c) => c.name), ...rows.map((r) => l.cols.map((c) => textOf(l, c, r.v[c.id])))], l.name) },
            { icon: 'edit', label: t('ap_listInfo'), disabled: !ok, fn: async () => { const n = await LC.prompt(t('ap_listName'), { value: l.name, max: 80 }); if (n === null) return; const d = await LC.prompt(t('ap_description'), { value: l.desc, max: 500 }); await call('/api/ap/list/meta', { name: n, desc: d === null ? l.desc : d }); load(); } },
            l.canDelete ? { icon: 'delete', label: t('ap_delList'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmDelList', { name: l.name }), { danger: true, ok: t('ap_delete') })) { if (await call('/api/ap/list/delete', {})) back ? back() : A.put(root); } } } : null]), { menu: true })),
        el('div', { class: 'tablewrap ap-ltable' }, el('table', { class: 'table ap-lgrid', 'aria-label': l.name }, el('thead', {}, head), body)),
        !l.rows.length ? el('p', { class: 'muted pad', text: t('ap_noItems') }) : null);
    }
    load();
  }

  // ---------- list of lists ----------
  function home(host, chan, open) {
    const box = el('div', { class: 'ap-lcards' });
    const load = async () => {
      try {
        const d = await LC.api('/api/ap/lists' + (chan ? '?chan=' + encodeURIComponent(chan) : ''));
        A.put(box, ...(d.lists.length ? d.lists.map((l) => el('button', { type: 'button', class: 'ap-lcard', onclick: () => open(l.id) }, el('span', { class: 'ap-navic', style: { background: l.color }, 'aria-hidden': 'true' }, LC.icon('apps_list_detail')), el('span', { class: 'grow' }, el('b', { text: l.name }), el('span', { class: 'muted small', text: t('ap_itemsN', { n: l.n }) + ' · ' + (l.chan ? A.chatTitle(l.chan) : t('ap_personal')) + ' · ' + A.fmtDay(l.updated) })))) : [A.empty('apps_list_detail', t('ap_noLists'), t('ap_noListsHelp'))]));
      } catch (e) { A.put(box, el('p', { class: 'err', text: e.message })); }
    };
    const can = !chan || A.writable(chan);
    A.put(host, el('div', { class: 'ap-page' }, A.head('apps_list_detail', chan ? t('ap_lists') : t('ap_allLists'), can ? el('button', { class: 'primary sm withicon', onclick: () => A.newList(chan, (id) => open(id)) }, LC.icon('add'), el('span', { text: t('ap_newList') })) : null), box));
    A.on('ap_list', (e) => { if (!chan || e.chan === chan) load(); }, box); load();
  }
  A.tab({ key: 'ap_lists', icon: 'apps_list_detail', label: () => t('ap_lists'), desc: () => t('ap_listsDesc'), order: 62, optIn: true,
    render(host, chan) { const open = (id) => listView(host, id, () => home(host, chan, open)); home(host, chan, open); } });
  const P = { list: null };
  A.app({ key: 'ap_lists', icon: 'apps_list_detail', color: '#c239b3', name: () => t('ap_lists'), desc: () => t('ap_listsDesc'), tab: 'ap_lists', order: 76,
    pane: {
      async render(nav) {
        A.put(nav, el('button', { class: 'ap-navitem' + (!P.list ? ' on' : ''), onclick: () => { P.list = null; LC.openApp('ap_lists'); LC.renderNav(); } }, LC.icon('apps_list_detail'), el('span', { class: 'grow', text: t('ap_allLists') })), el('div', { class: 'ap-navsec', text: t('ap_myLists') }));
        try { const d = await LC.api('/api/ap/lists'); nav.append(...d.lists.slice(0, 50).map((l) => el('button', { class: 'ap-navitem' + (P.list === l.id ? ' on' : ''), onclick: () => { P.list = l.id; LC.openApp('ap_lists'); LC.renderNav(); } }, el('i', { class: 'ap-ldot', style: { background: l.color } }), el('span', { class: 'grow', text: l.name })))); } catch {}
      },
      main(host) { const open = (id) => { P.list = id; listView(host, id, () => { P.list = null; home(host, '', open); LC.renderNav(); }); }; if (P.list) open(P.list); else home(host, '', open); },
    } });
  A.openers.lists = (a) => { P.list = a.ref && a.ref.id; A.openApp('ap_lists'); };
})();
