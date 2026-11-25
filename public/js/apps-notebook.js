'use strict';
// Notebook (like OneNote) on a chat tab: sections and pages, a page editor with formatting, to-do tags, highlight, links,
// tables and pictures, autosave, live updates for others; if someone else saved the page meanwhile: merge, theirs or mine.
(() => {
  const LC = window.LC, { el, S } = LC, A = LC.apps, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    ap_nb: 'Notebook', ap_nbDesc: 'A shared notebook for this chat: sections, pages, formatting, to-do tags, tables and pictures.', ap_sections: 'Sections', ap_pages: 'Pages', ap_addSection: 'Add section', ap_addPage: 'Add page', ap_newSection: 'New section', ap_untitled: 'Untitled page',
    ap_pageTitle: 'Page title', ap_nbStart: 'Start the notebook', ap_nbEmpty: 'This notebook is empty', ap_nbEmptyHelp: 'Add a section, then pages. Everyone in this chat can read and edit them.', ap_sectionColor: 'Colour', ap_delSection: 'Delete section', ap_delPage: 'Delete page',
    ap_confirmDelSection: 'Delete the section “{name}” and its {n} pages for everyone?', ap_confirmDelPage: 'Delete the page “{name}” for everyone?', ap_moveUp: 'Move up', ap_moveDown: 'Move down', ap_moveToSection: 'Move to {name}',
    ap_fBold: 'Bold (Ctrl+B)', ap_fItalic: 'Italic (Ctrl+I)', ap_fUnderline: 'Underline (Ctrl+U)', ap_fStrike: 'Strikethrough', ap_fH1: 'Heading 1', ap_fH2: 'Heading 2', ap_fH3: 'Heading 3', ap_fNormal: 'Normal text', ap_fStyle: 'Paragraph style',
    ap_fBullets: 'Bullets', ap_fNumbers: 'Numbering', ap_fTodo: 'To-do tag (Ctrl+1)', ap_fHighlight: 'Highlight', ap_fLink: 'Link', ap_fTable: 'Insert table', ap_fImage: 'Insert picture', ap_fClear: 'Clear formatting', ap_fUndo: 'Undo', ap_fRedo: 'Redo', ap_fQuote: 'Quote',
    ap_fAddRow: 'Add a row', ap_fAddCol: 'Add a column', ap_fDelTable: 'Delete table', ap_linkPrompt: 'Link address (https://…)', ap_tableSize: 'Table size (columns × rows)', ap_editedBy: 'Last edited by {name}, {when}', ap_pageBody: 'Page content',
    ap_conflict: '{name} changed this page while you were editing.', ap_merge: 'Merge both', ap_useTheirs: 'Use theirs', ap_keepMine: 'Keep mine', ap_merged: 'Merged: check the page, then keep writing.', ap_pageGone: 'This page was deleted.', ap_uploadingPic: 'Uploading the picture…', ap_sectionMenu: 'Section options for {name}', ap_pageMenu: 'Page options for {name}',
  });
  LC.addStrings('hi', { ap_nb: 'नोटबुक', ap_sections: 'अनुभाग', ap_pages: 'पेज', ap_addSection: 'अनुभाग जोड़ें', ap_addPage: 'पेज जोड़ें', ap_untitled: 'बिना शीर्षक पेज', ap_merge: 'दोनों मिलाएँ', ap_useTheirs: 'उनका रखें', ap_keepMine: 'मेरा रखें' });
  LC.addStrings('es', { ap_nb: 'Bloc de notas', ap_sections: 'Secciones', ap_pages: 'Páginas', ap_addSection: 'Agregar sección', ap_addPage: 'Agregar página', ap_untitled: 'Página sin título', ap_merge: 'Combinar', ap_useTheirs: 'Usar la suya', ap_keepMine: 'Conservar la mía' });
  const COLORS = ['#5b5fc7', '#038387', '#ca5010', '#c239b3', '#498205', '#0078d4', '#986f0b', '#d13438'];

  // ---------- client-side clean-up of rich text (the server cleans again with the same allow-list) ----------
  const TAGS = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'MARK', 'SPAN', 'A', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'IMG', 'HR', 'SUB', 'SUP']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'TEXTAREA', 'SELECT', 'TITLE', 'HEAD', 'META', 'LINK', 'BUTTON', 'INPUT', 'FORM', 'VIDEO', 'AUDIO', 'CANVAS']);
  const escT = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'), escA = (s) => escT(String(s)).replace(/"/g, '&quot;');
  function cleanNode(n, out, depth) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { out.push(escT(c.data)); continue; }
      if (c.nodeType !== 1 || depth > 40) continue;
      let tag = c.tagName.toUpperCase();
      if (DROP.has(tag)) continue;
      if (tag === 'SPAN' && /background/i.test(c.getAttribute('style') || '')) tag = 'MARK';
      if (tag === 'FONT' || !TAGS.has(tag)) { cleanNode(c, out, depth + 1); continue; }
      const low = tag.toLowerCase(); let attrs = '';
      if (tag === 'A') { const h = (c.getAttribute('href') || '').trim(); if (/^(https?:\/\/|mailto:)/i.test(h)) attrs = ` href="${escA(h)}" target="_blank" rel="noopener noreferrer"`; }
      else if (tag === 'IMG') { const f = c.getAttribute('data-fid'); if (!/^[a-f0-9]{24}$/.test(f || '')) continue; attrs = ` data-fid="${f}" data-fname="${escA(c.getAttribute('data-fname') || 'image.png')}" alt="${escA(c.getAttribute('alt') || '')}"`; const w = Number(c.getAttribute('width')); if (w >= 16 && w <= 4000) attrs += ` width="${Math.round(w)}"`; }
      else if (tag === 'TD' || tag === 'TH') for (const k of ['colspan', 'rowspan']) { const v = Number(c.getAttribute(k)); if (v > 1 && v <= 20) attrs += ` ${k}="${v}"`; }
      else if ((tag === 'P' || tag === 'LI' || tag === 'DIV') && c.classList.contains('ap-chk')) attrs = ` class="ap-chk${c.classList.contains('on') ? ' on' : ''}"`;
      if (tag === 'BR' || tag === 'HR' || tag === 'IMG') { out.push(`<${low}${attrs}>`); continue; }
      out.push(`<${low}${attrs}>`); cleanNode(c, out, depth + 1); out.push(`</${low}>`);
    }
    return out;
  }
  const cleanHtml = (html) => { const d = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html'); return cleanNode(d.body, [], 0).join(''); };
  A.cleanRich = cleanHtml;
  const showImages = (root) => { for (const im of root.querySelectorAll('img[data-fid]')) { const src = LC.fileUrl({ id: im.dataset.fid, name: im.dataset.fname || 'image.png' }, true); if (im.getAttribute('src') !== src) im.src = src; im.loading = 'lazy'; } };
  // three-way merge by top-level blocks: unchanged parts take the other side's change; both changed = keep both
  const blocks = (html) => { const d = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html'); return [...d.body.childNodes].map((n) => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 3 && n.data.trim() ? escT(n.data) : '')).filter(Boolean); };
  const lcs = (a, b) => { const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]); const map = new Array(n).fill(-1); let i = 0, j = 0; while (i < n && j < m) { if (a[i] === b[j]) { map[i] = j; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; } return map; };
  const merge3 = (base, mine, theirs) => {
    const B = blocks(base), M = blocks(mine), T = blocks(theirs), mm = lcs(B, M), tm = lcs(B, T), out = [], same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
    let bi = 0, mi = 0, ti = 0; const anchors = []; B.forEach((_, i) => { if (mm[i] >= 0 && tm[i] >= 0) anchors.push([i, mm[i], tm[i]]); }); anchors.push([B.length, M.length, T.length]);
    for (const [ab, am, at] of anchors) {
      const b = B.slice(bi, ab), m = M.slice(mi, am), th = T.slice(ti, at);
      if (same(m, b)) out.push(...th); else if (same(th, b) || same(m, th)) out.push(...m); else out.push(...th, ...m.filter((x) => !th.includes(x)));
      if (ab < B.length) out.push(B[ab]); bi = ab + 1; mi = am + 1; ti = at + 1;
    }
    return out.join('');
  };
  A.merge3 = merge3;

  // ---------- the notebook view ----------
  function mount(host, chan) {
    const can = () => A.writable(chan);
    const N = { tree: [], sec: LC.ls.get('ap_nbsec:' + chan, null), page: LC.ls.get('ap_nbpage:' + chan, null), cur: null, base: '', dirty: false, edits: 0, saving: false, timer: null, theirs: null };
    const side = el('nav', { class: 'ap-nbside', 'aria-label': t('ap_nb') }), compact = el('div', { class: 'ap-nbcompact' }), bar = el('div', { class: 'ap-nbbar', role: 'toolbar', 'aria-label': t('ap_fStyle') }), banner = el('div', { class: 'notice ap-nbconflict hidden', role: 'alert' });
    const title = el('input', { class: 'ap-nbtitle', maxlength: 200, placeholder: t('ap_untitled'), 'aria-label': t('ap_pageTitle') }), meta = el('div', { class: 'muted small ap-nbmeta' }), status = el('span', { class: 'muted small ap-nbstatus', role: 'status' });
    const ed = el('div', { class: 'ap-nbedit', contenteditable: 'false', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('ap_pageBody'), spellcheck: 'true' });
    const pageBox = el('div', { class: 'ap-nbpage' }, title, meta, ed), main = el('div', { class: 'ap-nbmain' }, bar, banner, el('div', { class: 'ap-nbscroll' }, pageBox), el('div', { class: 'ap-nbfoot' }, status));
    const root = el('div', { class: 'ap-fillbox ap-nb' }, compact, el('div', { class: 'ap-nbbody' }, side, main));
    A.put(host, root); host._apLeave = () => flush();
    const curSec = () => N.tree.find((s) => s.id === N.sec), allPages = () => N.tree.flatMap((s) => s.pages.map((p) => ({ ...p, sec: s.id })));
    const nb = (op, body) => A.call('/api/ap/nb', { chan, op, ...body }).then((r) => { if (r && r.tree) { N.tree = r.tree; drawSide(); } return r; });

    function drawSide() {
      const sec = curSec(), w = can();
      const secRow = (s, i) => el('div', { class: 'ap-nbsrow' + (s.id === N.sec ? ' on' : '') }, el('button', { type: 'button', class: 'ap-nbsbtn', 'aria-current': s.id === N.sec ? 'true' : null, onclick: () => openSection(s.id) }, el('i', { class: 'ap-nbsdot', style: { background: s.color } }), el('span', { class: 'grow', text: s.name }), el('span', { class: 'ap-count', text: String(s.pages.length) })),
        w ? LC.ibtn('more_horizontal', t('ap_sectionMenu', { name: s.name }), (e) => secMenu(e.currentTarget, s, i), { cls: 'icon ap-nbkebab', menu: true }) : null);
      const pageRow = (p, i) => el('div', { class: 'ap-nbprow' + (p.id === N.page ? ' on' : '') }, el('button', { type: 'button', class: 'ap-nbpbtn', 'aria-current': p.id === N.page ? 'true' : null, onclick: () => openPage(p.id) }, el('span', { class: 'ap-nbptitle', text: p.title || t('ap_untitled') }), el('span', { class: 'muted small', text: A.fmtDay(p.ts) })),
        w ? LC.ibtn('more_horizontal', t('ap_pageMenu', { name: p.title || t('ap_untitled') }), (e) => pageMenu(e.currentTarget, p, i), { cls: 'icon ap-nbkebab', menu: true }) : null);
      A.put(side, 
        el('div', { class: 'ap-nbcol' }, el('div', { class: 'ap-nbhead' }, el('h3', { text: t('ap_sections') }), w ? LC.ibtn('add', t('ap_addSection'), addSection) : null), el('div', { class: 'ap-nblist' }, ...N.tree.map(secRow))),
        el('div', { class: 'ap-nbcol' }, el('div', { class: 'ap-nbhead' }, el('h3', { text: sec ? sec.name : t('ap_pages') }), w && sec ? LC.ibtn('add', t('ap_addPage'), addPage) : null), el('div', { class: 'ap-nblist' }, ...(sec ? sec.pages.map(pageRow) : []))));
      A.put(compact, A.select(N.tree.map((s) => [s.id, s.name]), N.sec || '', (v) => openSection(v), t('ap_sections')), A.select((sec ? sec.pages : []).map((p) => [p.id, p.title || t('ap_untitled')]), N.page || '', (v) => openPage(v), t('ap_pages')), w ? LC.ibtn('add', t('ap_addPage'), addPage, { disabled: !sec }) : null, w ? LC.ibtn('more_horizontal', t('ap_more'), (e) => LC.menu(e.currentTarget, [{ icon: 'add', label: t('ap_addSection'), fn: addSection }, sec ? { icon: 'edit', label: t('ap_rename') + ': ' + sec.name, fn: () => renameSection(sec) } : null]), { menu: true }) : null);
      if (!N.tree.length) main.classList.add('ap-nbnone'); else main.classList.remove('ap-nbnone');
      if (!N.tree.length) A.put(pageBox, A.empty('notebook', t('ap_nbEmpty'), t('ap_nbEmptyHelp'), w ? el('button', { class: 'primary', text: t('ap_nbStart'), onclick: async () => { const r = await nb('addsec', { name: t('ap_newSection') + ' 1' }); if (r) { await nb('addpage', { sec: r.id, title: '' }); openSection(r.id); } } }) : null));
      else if (!pageBox.contains(ed)) A.put(pageBox, title, meta, ed);
    }
    const renameSection = async (s) => { const n = await LC.prompt(t('ap_rename'), { value: s.name, max: 60 }); if (n && n.trim()) nb('rensec', { id: s.id, name: n }); };
    function secMenu(anchor, s, i) {
      LC.menu(anchor, [{ icon: 'edit', label: t('ap_rename'), fn: () => renameSection(s) }, ...COLORS.map((c, k) => ({ icon: el('span', { class: 'ap-stkdot', style: { background: c } }), label: t('ap_sectionColor') + ' ' + (k + 1), checked: s.color === c, fn: () => nb('colsec', { id: s.id, color: c }) })), 'sep',
        { icon: 'arrow_up', label: t('ap_moveUp'), disabled: i === 0, fn: () => nb('movesec', { id: s.id, to: i - 1 }) }, { icon: 'arrow_down', label: t('ap_moveDown'), disabled: i >= N.tree.length - 1, fn: () => nb('movesec', { id: s.id, to: i + 1 }) }, 'sep',
        { icon: 'delete', label: t('ap_delSection'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmDelSection', { name: s.name, n: s.pages.length }), { danger: true, ok: t('ap_delete') })) { await nb('delsec', { id: s.id }); if (N.sec === s.id) openSection(N.tree[0] && N.tree[0].id); } } }]);
    }
    function pageMenu(anchor, p, i) {
      const sec = curSec();
      LC.menu(anchor, [{ icon: 'arrow_up', label: t('ap_moveUp'), disabled: i === 0, fn: () => nb('movepage', { id: p.id, to: i - 1 }) }, { icon: 'arrow_down', label: t('ap_moveDown'), disabled: !sec || i >= sec.pages.length - 1, fn: () => nb('movepage', { id: p.id, to: i + 1 }) }, 'sep',
        ...N.tree.filter((s) => s.id !== N.sec).map((s) => ({ icon: 'arrow_right', label: t('ap_moveToSection', { name: s.name }), fn: () => nb('movepage', { id: p.id, sec: s.id, to: s.pages.length }) })), 'sep',
        { icon: 'delete', label: t('ap_delPage'), danger: true, fn: async () => { if (await LC.confirm(t('ap_confirmDelPage', { name: p.title || t('ap_untitled') }), { danger: true, ok: t('ap_delete') })) { if (p.id === N.page) { N.cur = null; N.dirty = false; } await nb('delpage', { id: p.id }); if (!N.cur) openSection(N.sec); } } }]);
    }
    async function addSection() { const n = await LC.prompt(t('ap_addSection'), { value: t('ap_newSection') + ' ' + (N.tree.length + 1), max: 60 }); if (n === null) return; const r = await nb('addsec', { name: n }); if (r) { const p = await nb('addpage', { sec: r.id, title: '' }); N.sec = r.id; if (p) openPage(p.id); else drawSide(); } }
    async function addPage() { const sec = curSec(); if (!sec) return; await flush(); const r = await nb('addpage', { sec: sec.id, after: N.page, title: '' }); if (r) { await openPage(r.id); title.focus(); } }
    function openSection(id) { const s = N.tree.find((x) => x.id === id) || N.tree[0]; N.sec = s ? s.id : null; LC.ls.set('ap_nbsec:' + chan, N.sec); drawSide(); const p = s && s.pages[0]; if (p && !(N.cur && s.pages.some((x) => x.id === N.cur.id))) openPage(p.id); else if (!p) clearPage(); }
    const clearPage = () => { N.cur = null; N.page = null; title.value = ''; ed.innerHTML = ''; ed.contentEditable = 'false'; meta.textContent = ''; drawBar(); };
    async function openPage(id) {
      await flush();
      let r; try { r = await LC.api(`/api/ap/nb/page?chan=${encodeURIComponent(chan)}&id=${id}`); } catch (e) { return A.fail(e); }
      const p = r.page; N.cur = p; N.page = p.id; N.sec = p.sec; LC.ls.set('ap_nbpage:' + chan, p.id); LC.ls.set('ap_nbsec:' + chan, p.sec);
      setContent(p.html); title.value = p.title; N.dirty = false; N.theirs = null; banner.classList.add('hidden'); setMeta(); drawSide(); drawBar();
      ed.contentEditable = can() ? 'true' : 'false'; title.disabled = !can();
    }
    const setContent = (html) => { const c = cleanHtml(html); ed.innerHTML = c || '<p><br></p>'; showImages(ed); N.base = cleanHtml(ed.innerHTML); };
    const setMeta = () => { const p = N.cur; meta.textContent = p ? t('ap_editedBy', { name: LC.uname(p.by), when: LC.fmtDateTime(p.ts) }) : ''; status.textContent = N.dirty ? t('ap_saving') : p ? t('ap_saved') : ''; };
    const html = () => cleanHtml(ed.innerHTML);
    const changed = () => { if (!N.cur) return; N.dirty = true; N.edits++; status.textContent = t('ap_saving'); clearTimeout(N.timer); N.timer = setTimeout(save, 1200); };
    async function save(force) {
      clearTimeout(N.timer); if (!N.cur || (!N.dirty && !force)) return; if (N.saving) { N.timer = setTimeout(save, 400); return; }
      N.saving = true; const edits = N.edits, body = html(), v = force ? force.v : N.cur.v, page = N.cur;
      try {
        const r = await LC.api('/api/ap/nb/page', { chan, id: page.id, v, html: body, title: title.value });
        if (N.cur === page) { page.v = r.page.v; page.by = r.page.by; page.ts = r.page.ts; page.title = r.page.title; N.base = r.page.html; if (N.edits === edits) N.dirty = false; banner.classList.add('hidden'); N.theirs = null; setMeta(); }
        const tp = N.tree.flatMap((s) => s.pages).find((x) => x.id === page.id); if (tp && tp.title !== r.page.title) { tp.title = r.page.title; drawSide(); }
      } catch (e) {
        if (e.status === 409 && e.data && e.data.page) conflict(e.data.page); else if (e.status === 404) { A.fail(e); clearPage(); } else { status.textContent = e.message; N.timer = setTimeout(save, 4000); }
      }
      N.saving = false;
    }
    const flush = () => (N.dirty && N.cur && !N.theirs ? save() : Promise.resolve());
    function conflict(theirs) {
      N.theirs = theirs; status.textContent = '';
      A.put(banner, LC.icon('warning'), el('span', { class: 'grow', text: t('ap_conflict', { name: LC.uname(theirs.by) }) }),
        el('button', { class: 'primary sm', text: t('ap_merge'), onclick: () => { const merged = merge3(N.base, html(), cleanHtml(theirs.html)); ed.innerHTML = merged || '<p><br></p>'; showImages(ed); N.cur.v = theirs.v; N.base = cleanHtml(theirs.html); N.theirs = null; banner.classList.add('hidden'); N.dirty = true; save(); LC.toast(t('ap_merged')); } }),
        el('button', { class: 'secondary sm', text: t('ap_useTheirs'), onclick: () => { N.cur.v = theirs.v; N.cur.by = theirs.by; N.cur.ts = theirs.ts; setContent(theirs.html); if (theirs.title !== undefined) title.value = theirs.title; N.dirty = false; N.theirs = null; banner.classList.add('hidden'); setMeta(); } }),
        el('button', { class: 'secondary sm', text: t('ap_keepMine'), onclick: () => { N.cur.v = theirs.v; N.theirs = null; banner.classList.add('hidden'); N.dirty = true; save(); } }));
      banner.classList.remove('hidden');
    }
    // live: the page list, and someone else's save of the page I have open
    const onEvent = async (e) => {
      if (e.chan !== chan) return;
      if (e.op === 'tree') { N.tree = e.tree; if (N.cur && !allPages().some((p) => p.id === N.cur.id)) { LC.toast(t('ap_pageGone')); clearPage(); openSection(N.sec); } else drawSide(); return; }
      if (e.op === 'page' && N.cur && e.page.id === N.cur.id && e.page.v > N.cur.v && e.page.by !== S.me.id) {
        let r; try { r = await LC.api(`/api/ap/nb/page?chan=${encodeURIComponent(chan)}&id=${e.page.id}`); } catch { return; }
        if (!N.cur || N.cur.id !== r.page.id) return;
        if (!N.dirty) { const sc = main.querySelector('.ap-nbscroll'), top = sc ? sc.scrollTop : 0; N.cur.v = r.page.v; N.cur.by = r.page.by; N.cur.ts = r.page.ts; setContent(r.page.html); title.value = r.page.title; setMeta(); if (sc) sc.scrollTop = top; }
        else conflict(r.page);
      }
      const tp = N.tree.flatMap((s) => s.pages).find((x) => x.id === e.page.id); if (tp) { Object.assign(tp, e.page); drawSide(); }
    };
    A.on('ap_nb', onEvent, root);

    // ----- editing -----
    const exec = (cmd, val) => { ed.focus(); document.execCommand(cmd, false, val); normalize(); changed(); drawBar(); };
    const normalize = () => { for (const sp of ed.querySelectorAll('span[style*="background"]')) { const m = document.createElement('mark'); while (sp.firstChild) m.append(sp.firstChild); sp.replaceWith(m); } for (const f of ed.querySelectorAll('font')) f.replaceWith(...f.childNodes); };
    const block = () => { const sel = getSelection(); let n = sel && sel.anchorNode; while (n && n !== ed) { if (n.nodeType === 1 && /^(P|DIV|LI|H1|H2|H3|H4|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) return n; n = n.parentNode; } return null; };
    const inTable = () => { const b = block(); return b && b.closest ? b.closest('table') : null; };
    function toggleTodo() {
      ed.focus(); let b = block();
      if (!b || b === ed) { document.execCommand('formatBlock', false, 'p'); b = block(); }
      if (!b) return; if (/^(TD|TH)$/.test(b.tagName)) { const p = document.createElement('p'); while (b.firstChild) p.append(b.firstChild); b.append(p); b = p; }
      if (b.classList.contains('ap-chk')) b.classList.remove('ap-chk', 'on'); else b.classList.add('ap-chk'); changed(); drawBar();
    }
    function insertTable() {
      LC.prompt(t('ap_tableSize'), { value: '3 x 3', max: 9 }).then((v) => {
        if (!v) return; const [c, r] = v.split(/[x×*, ]+/i).map((n) => Math.max(1, Math.min(10, parseInt(n, 10) || 3)));
        const row = (tag) => '<tr>' + `<${tag}><br></${tag}>`.repeat(c) + '</tr>';
        exec('insertHTML', `<table><tbody>${row('td').repeat(r || 3)}</tbody></table><p><br></p>`);
      });
    }
    function tableOp(op) {
      const tb = inTable(); if (!tb) return; const cell = block().closest('td,th'), row = cell && cell.parentNode;
      if (op === 'row' && row) { const nr = row.cloneNode(true); for (const c of nr.children) c.innerHTML = '<br>'; row.after(nr); }
      else if (op === 'col' && cell) { const i = [...row.children].indexOf(cell); for (const r of tb.querySelectorAll('tr')) { const ref = r.children[i]; const nc = document.createElement(ref ? ref.tagName.toLowerCase() : 'td'); nc.innerHTML = '<br>'; if (ref) ref.after(nc); else r.append(nc); } }
      else if (op === 'del') tb.remove();
      changed(); drawBar();
    }
    async function insertImages(files) {
      for (const f of files) {
        if (!/^image\//.test(f.type)) continue; LC.toast(t('ap_uploadingPic'), { ms: 1500 });
        try { const up = await LC.upload(f, f.name || 'picture.png').promise; ed.focus(); document.execCommand('insertHTML', false, `<img data-fid="${up.id}" data-fname="${escA(up.name)}" alt="">`); showImages(ed); changed(); } catch (e) { A.fail(e); }
      }
    }
    const fileIn = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden', onchange: (e) => { const fl = [...e.target.files]; e.target.value = ''; insertImages(fl); } });
    ed.addEventListener('input', () => { normalize(); changed(); });
    title.addEventListener('input', changed);
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ed.focus(); } });
    ed.addEventListener('paste', (e) => {
      const files = [...((e.clipboardData && e.clipboardData.files) || [])].filter((f) => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); return insertImages(files); }
      const h = e.clipboardData && e.clipboardData.getData('text/html');
      if (h) { e.preventDefault(); document.execCommand('insertHTML', false, cleanHtml(h)); showImages(ed); changed(); }
    });
    ed.addEventListener('drop', (e) => { const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter((f) => /^image\//.test(f.type)); if (files.length) { e.preventDefault(); e.stopPropagation(); insertImages(files); } });
    ed.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.ap-chk'); if (!b || !ed.contains(b) || ed.contentEditable !== 'true') return; const r = b.getBoundingClientRect(); if (e.clientX < r.left + 26) { b.classList.toggle('on'); changed(); } });
    ed.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === '1') { e.preventDefault(); toggleTodo(); } else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } else if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); link(); }
      else if (e.key === ' ' && !mod) { const b = block(); if (b && b.tagName === 'P' && /^\[\]$/.test(b.textContent)) { e.preventDefault(); b.textContent = ''; b.append(document.createElement('br')); b.classList.add('ap-chk'); changed(); } } // "[] " starts a to-do
    });
    const onSel = () => { if (!root.isConnected) return document.removeEventListener('selectionchange', onSel); if (document.activeElement === ed) drawBarState(); }; document.addEventListener('selectionchange', onSel);
    async function link() { const sel = getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; const u = await LC.prompt(t('ap_linkPrompt'), { value: 'https://', max: 1000 }); if (!u || !/^(https?:\/\/|mailto:)\S+/i.test(u.trim())) return; ed.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); } if (range && range.collapsed) document.execCommand('insertHTML', false, `<a href="${escA(u.trim())}">${escT(u.trim())}</a>`); else document.execCommand('createLink', false, u.trim()); changed(); }
    const B = (icon, label, fn, key) => { const b = el('button', { type: 'button', class: 'ap-fbtn', title: label, 'aria-label': label, 'data-k': key || null, onmousedown: (e) => e.preventDefault(), onclick: fn }, LC.icon(icon)); return b; };
    function drawBar() {
      if (!can() || !N.cur) { A.put(bar); bar.classList.add('hidden'); return; } bar.classList.remove('hidden');
      const style = A.select([['p', t('ap_fNormal')], ['h1', t('ap_fH1')], ['h2', t('ap_fH2')], ['h3', t('ap_fH3')], ['blockquote', t('ap_fQuote')]], 'p', (v) => exec('formatBlock', v), t('ap_fStyle')); style.classList.add('ap-fstyle');
      const tbl = inTable();
      A.put(bar, style, el('span', { class: 'ap-fsep' }),
        B('text_bold', t('ap_fBold'), () => exec('bold'), 'bold'), B('text_italic', t('ap_fItalic'), () => exec('italic'), 'italic'), B('text_underline', t('ap_fUnderline'), () => exec('underline'), 'underline'), B('text_strikethrough', t('ap_fStrike'), () => exec('strikeThrough'), 'strikeThrough'),
        B('highlight', t('ap_fHighlight'), () => exec('hiliteColor', '#fff100')), el('span', { class: 'ap-fsep' }),
        B('text_bullet_list_ltr', t('ap_fBullets'), () => exec('insertUnorderedList'), 'insertUnorderedList'), B('text_number_list_ltr', t('ap_fNumbers'), () => exec('insertOrderedList'), 'insertOrderedList'), B('checkbox_checked', t('ap_fTodo'), toggleTodo), el('span', { class: 'ap-fsep' }),
        B('link', t('ap_fLink'), link), B('table', t('ap_fTable'), insertTable), B('image_add', t('ap_fImage'), () => fileIn.click()), fileIn,
        tbl ? B('table_add', t('ap_fAddRow'), () => tableOp('row')) : null, tbl ? B('column_triple_edit', t('ap_fAddCol'), () => tableOp('col')) : null, tbl ? B('delete', t('ap_fDelTable'), () => tableOp('del')) : null,
        el('span', { class: 'ap-fsep' }), B('text_clear_formatting', t('ap_fClear'), () => { exec('removeFormat'); exec('formatBlock', 'p'); }), B('arrow_undo', t('ap_fUndo'), () => exec('undo')), B('arrow_redo', t('ap_fRedo'), () => exec('redo')));
      drawBarState();
    }
    let lastTbl = null;
    function drawBarState() {
      for (const b of bar.querySelectorAll('[data-k]')) { let on = false; try { on = document.queryCommandState(b.dataset.k); } catch {} b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
      const s = bar.querySelector('.ap-fstyle'); if (s) { const bl = block(), tag = bl ? bl.tagName.toLowerCase() : 'p'; s.value = ['h1', 'h2', 'h3', 'blockquote'].includes(tag) ? tag : 'p'; }
      const tbl = !!inTable(); if (tbl !== lastTbl) { lastTbl = tbl; if (document.activeElement === ed) { const sel = getSelection(), r = sel.rangeCount ? sel.getRangeAt(0) : null; drawBar(); if (r) { sel.removeAllRanges(); sel.addRange(r); } } }
    }
    const onUnload = () => { if (!root.isConnected) return window.removeEventListener('beforeunload', onUnload); if (N.dirty) save(); }; window.addEventListener('beforeunload', onUnload);
    // first load
    LC.api('/api/ap/nb?chan=' + encodeURIComponent(chan)).then((r) => {
      N.tree = r.tree; drawSide();
      const want = allPages().find((p) => p.id === N.page) || (curSec() && curSec().pages[0]) || allPages()[0];
      if (want) openPage(want.id); else { N.sec = N.tree[0] ? N.tree[0].id : null; drawSide(); drawBar(); }
    }).catch((e) => A.put(pageBox, el('p', { class: 'err pad', text: e.message })));
  }
  A.tab({ key: 'ap_notebook', icon: 'notebook', label: () => t('ap_nb'), desc: () => t('ap_nbDesc'), order: 22, optIn: true, render: (host, chan) => mount(host, chan) });
  A.app({ key: 'ap_nbapp', icon: 'notebook', color: '#7719aa', name: () => t('ap_nb'), desc: () => t('ap_nbDesc'), tab: 'ap_notebook' });
  A.openers.notebook = async (a) => { if (a.chan) { await LC.openChat(a.chan); LC.setTab('ap_notebook'); } };
})();
