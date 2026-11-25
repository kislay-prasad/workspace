'use strict';
// Writing messages (chatux area): the Format box (toolbar that writes the markdown-like syntax render.js understands, live preview,
// subject line), Important/Urgent, announcements, sharing a location, quick (canned) replies, posts-style channels, list continuation.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  LC.addStrings('en', {
    cx_format: 'Format', cx_formatting: 'Formatting', cx_bold: 'Bold', cx_italic: 'Italic', cx_underline: 'Underline', cx_strike: 'Strikethrough', cx_highlight: 'Highlight', cx_fontColor: 'Font color', cx_fontSize: 'Font size',
    cx_paragraph: 'Paragraph style', cx_h1: 'Heading 1', cx_h2: 'Heading 2', cx_h3: 'Heading 3', cx_normal: 'Normal text', cx_quote: 'Quote', cx_bullets: 'Bulleted list', cx_numbers: 'Numbered list', cx_checklist: 'Checklist',
    cx_indent: 'Increase indent', cx_outdent: 'Decrease indent', cx_link: 'Insert link', cx_table: 'Insert table', cx_divider: 'Divider line', cx_codeBlock: 'Code block', cx_clearFmt: 'Clear formatting', cx_undo: 'Undo', cx_redo: 'Redo',
    cx_preview: 'Preview', cx_previewOff: 'Hide preview', cx_previewEmpty: 'Nothing to preview yet.', cx_subject: 'Add a subject', cx_subjectLabel: 'Subject', cx_priority: 'Set delivery options', cx_standard: 'Standard', cx_markImportant: 'Important',
    cx_markUrgent: 'Urgent', cx_urgentHint: 'Urgent messages keep notifying people until they read them.', cx_prioChip: 'This message is marked {p}', cx_removePrio: 'Remove priority', cx_linkText: 'Text to show', cx_linkUrl: 'Address (https://…)', cx_insert: 'Insert',
    cx_badUrl: 'Enter a web address that starts with http:// or https://', cx_rows: 'Rows', cx_cols: 'Columns', cx_column: 'Column {n}', cx_language: 'Language', cx_plainText: 'Plain text', cx_code: 'Code', cx_size_small: 'Small', cx_size_normal: 'Normal',
    cx_size_large: 'Large', cx_size_huge: 'Huge', cx_col_red: 'Red', cx_col_orange: 'Orange', cx_col_yellow: 'Yellow', cx_col_green: 'Green', cx_col_teal: 'Teal', cx_col_blue: 'Blue', cx_col_purple: 'Purple', cx_col_pink: 'Pink', cx_col_gray: 'Gray',
    cx_announce: 'Announcement', cx_annTitle: 'New announcement', cx_annHeadline: 'Headline', cx_annSub: 'Subheading (optional)', cx_annBanner: 'Banner', cx_annImage: 'Use a picture', cx_annNoImage: 'Remove picture', cx_annText: 'Message (optional)',
    cx_annNeedTitle: 'Type a headline.', cx_location: 'Share location', cx_locTitle: 'Share your location', cx_locFinding: 'Finding your location…', cx_locAcc: 'Accurate to about {n} m', cx_locOpen: 'Open in maps', cx_locApp: 'Open in a maps app',
    cx_locCopy: 'Copy coordinates', cx_locNoApi: "This device or browser can't share a location.", cx_locDenied: 'Location permission was denied. Allow it in your browser or system settings and try again.',
    cx_locFailed: "Your device couldn't find its location. Computers without GPS often need location services (and sometimes the internet) for this.", cx_locNote: 'Only the coordinates are sent; “Open in maps” needs the internet.',
    cx_quick: 'Quick replies', cx_quickManage: 'Manage quick replies…', cx_quickNone: 'No quick replies yet.', cx_quickNew: 'New quick reply', cx_quickHelp: 'Save replies you send often and insert them from the message box.', cx_startPost: 'Start a post',
    cx_scFind: 'Find in this chat', cx_scCtrlEnter: 'Send (always; in the Format box too)', cx_scFormat: 'Open or close the Format box', cx_scBIU: 'Bold, italic, underline', cx_scSlash: 'Commands (at the start of the message box)', cx_newPost: 'New post',
  });
  LC.addStrings('hi', { cx_format: 'फ़ॉर्मेट', cx_bold: 'बोल्ड', cx_italic: 'इटैलिक', cx_underline: 'रेखांकित', cx_subject: 'विषय जोड़ें', cx_markImportant: 'महत्वपूर्ण', cx_markUrgent: 'अत्यावश्यक', cx_announce: 'घोषणा', cx_location: 'स्थान साझा करें', cx_quick: 'त्वरित जवाब', cx_startPost: 'पोस्ट शुरू करें' });
  LC.addStrings('es', { cx_format: 'Formato', cx_formatting: 'Formato', cx_bold: 'Negrita', cx_italic: 'Cursiva', cx_underline: 'Subrayado', cx_strike: 'Tachado', cx_highlight: 'Resaltar', cx_fontColor: 'Color de fuente', cx_fontSize: 'Tamaño de fuente', cx_bullets: 'Viñetas', cx_numbers: 'Lista numerada', cx_checklist: 'Lista de comprobación', cx_link: 'Insertar vínculo', cx_table: 'Insertar tabla', cx_codeBlock: 'Bloque de código', cx_clearFmt: 'Borrar formato', cx_undo: 'Deshacer', cx_redo: 'Rehacer', cx_preview: 'Vista previa', cx_subject: 'Agregar un asunto', cx_markImportant: 'Importante', cx_markUrgent: 'Urgente', cx_announce: 'Anuncio', cx_location: 'Compartir ubicación', cx_quick: 'Respuestas rápidas', cx_startPost: 'Iniciar una publicación' });

  LC.isPostsChat = (chan) => { const c = chan && S.channels.get(chan); return !!c && c.kind === 'posts'; };
  const fail = (e) => LC.toast(e.message || String(e));

  // ---------- editing the textarea (keeps the browser's own undo/redo where it can) ----------
  const replaceRange = (ta, a, z, text, s0, s1) => {
    ta.focus(); ta.setSelectionRange(a, z); let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch {}
    if (!ok || ta.value.slice(a, a + text.length) !== text) { ta.setRangeText(text, a, z, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    if (s0 != null) ta.setSelectionRange(s0, s1 ?? s0);
  };
  function wrap(ta, before, after = before, hint = '') {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, sel = v.slice(s, e);
    if (v.slice(s - before.length, s) === before && v.slice(e, e + after.length) === after) return replaceRange(ta, s - before.length, e + after.length, sel, s - before.length, e - before.length);
    if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) { const inner = sel.slice(before.length, sel.length - after.length); return replaceRange(ta, s, e, inner, s, s + inner.length); }
    if (sel.includes('\n')) { const out = sel.split('\n').map((l) => (l.trim() ? before + l + after : l)).join('\n'); return replaceRange(ta, s, e, out, s, s + out.length); }
    const inner = sel || hint; replaceRange(ta, s, e, before + inner + after, s + before.length, s + before.length + inner.length);
  }
  function eachLine(ta, fn) {
    const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, a = v.lastIndexOf('\n', s - 1) + 1, zi = v.indexOf('\n', Math.max(s, e - (e > s && v[e - 1] === '\n' ? 1 : 0))), z = zi < 0 ? v.length : zi;
    const lines = v.slice(a, z).split('\n'), out = fn(lines).join('\n'); replaceRange(ta, a, z, out, a, a + out.length);
  }
  const PREFIX = /^(\s*)(?:[-*•]\s+\[[ xX]\]\s+|[-*•]\s+|\d+[.)]\s+|#{1,3}\s+|>\s?)/;
  const strip = (l) => l.replace(PREFIX, '$1');
  const linePrefix = (ta, make, test) => eachLine(ta, (lines) => { const all = lines.filter((l) => l.trim()).every((l) => test.test(l)); return lines.map((l, i) => (!l.trim() ? l : all ? strip(l) : l.match(/^\s*/)[0] + make(i) + strip(l).trimStart())); });
  const indent = (ta, d) => eachLine(ta, (lines) => lines.map((l) => (d > 0 ? '  ' + l : l.replace(/^ {1,2}|^\t/, ''))));
  const clearFormatting = (ta) => {
    let s = ta.selectionStart, e = ta.selectionEnd; if (s === e) { s = 0; e = ta.value.length; }
    const out = ta.value.slice(s, e).replace(/\[([^\]\n]+)\]\((?:https?:\/\/|#m=)[^\s)]+\)/g, '$1').replace(/\{(?:color|size):[a-z]+\}|\{\/(?:color|size)\}/g, '').replace(/\*\*|__|~~|==/g, '').replace(/`/g, '')
      .replace(/(^|\s)[*_]([^*_\s][^*_\n]*?)[*_](?=\s|$|[.,!?])/g, '$1$2').split('\n').map(strip).join('\n');
    replaceRange(ta, s, e, out, s, s + out.length);
  };
  const insertBlock = (ta, block) => { const v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '', post = v[e] && v[e] !== '\n' ? '\n' : ''; replaceRange(ta, s, e, pre + block + post, s + pre.length + block.length); };
  // Enter inside a list starts the next item; Enter on an empty item ends the list (composer.js calls this)
  LC.continueList = (ta) => {
    const v = ta.value, s = ta.selectionStart; if (s !== ta.selectionEnd) return false;
    const a = v.lastIndexOf('\n', s - 1) + 1, line = v.slice(a, s), m = /^(\s*)([-*•]\s+\[[ xX]\]\s+|[-*•]\s+|(\d+)([.)])\s+)(.*)$/.exec(line); if (!m) return false;
    if (!m[5].trim()) { replaceRange(ta, a, s, m[1].slice(2) || '', a + Math.max(0, m[1].length - 2)); return true; }
    const next = m[3] ? `${Number(m[3]) + 1}${m[4]} ` : /\[/.test(m[2]) ? m[2].replace(/\[[xX]\]/, '[ ]') : m[2];
    replaceRange(ta, s, s, '\n' + m[1] + next); return true;
  };

  // ---------- small dialogs: link, table, code ----------
  function linkDialog(ta) {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd), s = ta.selectionStart, e = ta.selectionEnd, isUrl = /^https?:\/\/\S+$/.test(sel);
    const text = el('input', { value: isUrl ? '' : sel, maxlength: 200, 'aria-label': t('cx_linkText') }), url = el('input', { type: 'url', value: isUrl ? sel : '', placeholder: 'https://', 'aria-label': t('cx_linkUrl') }), err = el('div', { class: 'err', role: 'alert' });
    LC.modal(el('form', { onsubmit: (ev) => { ev.preventDefault(); const u = url.value.trim(); if (!/^https?:\/\/[^\s)]+$/i.test(u)) { err.textContent = t('cx_badUrl'); return url.focus(); } LC.closeModal(); const tx = text.value.replace(/[[\]\n]/g, ' ').trim(); replaceRange(ta, s, e, tx ? `[${tx}](${u})` : u); } },
      el('h2', {}, LC.icon('link'), ' ' + t('cx_link')), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_linkText') }), text), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_linkUrl') }), url), err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'submit', class: 'primary', text: t('cx_insert') }))));
    setTimeout(() => (isUrl || !sel ? (isUrl ? text : url) : url).focus(), 40);
  }
  function tableDialog(ta) {
    const rows = el('input', { type: 'number', min: 1, max: 20, value: 2, 'aria-label': t('cx_rows') }), cols = el('input', { type: 'number', min: 1, max: 8, value: 3, 'aria-label': t('cx_cols') });
    const grid = el('div', { class: 'cx-tgrid', role: 'group', 'aria-label': t('cx_table') }); let hr = 2, hc = 3;
    const paint = () => [...grid.children].forEach((b) => b.classList.toggle('on', Number(b.dataset.r) <= hr && Number(b.dataset.c) <= hc));
    for (let r = 1; r <= 6; r++) for (let c = 1; c <= 6; c++) grid.append(el('button', { type: 'button', 'data-r': r, 'data-c': c, 'aria-label': `${r} × ${c}`, onmouseenter: () => { hr = r; hc = c; rows.value = r; cols.value = c; paint(); }, onfocus: () => { hr = r; hc = c; rows.value = r; cols.value = c; paint(); }, onclick: () => go() }));
    const go = () => { const R = Math.max(1, Math.min(20, Math.round(Number(rows.value) || 2))), C = Math.max(1, Math.min(8, Math.round(Number(cols.value) || 3))); LC.closeModal();
      const head = '| ' + Array.from({ length: C }, (_, i) => t('cx_column', { n: i + 1 })).join(' | ') + ' |', sep = '|' + ' --- |'.repeat(C), body = Array.from({ length: R }, () => '|' + '   |'.repeat(C)).join('\n'); insertBlock(ta, head + '\n' + sep + '\n' + body); };
    LC.modal([el('h2', {}, LC.icon('table'), ' ' + t('cx_table')), grid, el('div', { class: 'rowline' }, el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_rows') }), rows), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_cols') }), cols)),
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('cx_insert'), onclick: go }))]); paint();
  }
  const LANGS = [['', 'cx_plainText'], ['js', 'JavaScript'], ['ts', 'TypeScript'], ['py', 'Python'], ['json', 'JSON'], ['html', 'HTML'], ['css', 'CSS'], ['sql', 'SQL'], ['sh', 'Shell'], ['java', 'Java'], ['c', 'C / C++'], ['go', 'Go']];
  function codeDialog(ta) {
    const s = ta.selectionStart, e = ta.selectionEnd, lang = el('select', { 'aria-label': t('cx_language') }, LANGS.map(([v, l]) => el('option', { value: v, text: l.startsWith('cx_') ? t(l) : l }))), code = el('textarea', { rows: 8, class: 'cx-codein', spellcheck: 'false', 'aria-label': t('cx_code'), value: ta.value.slice(s, e) });
    lang.value = LC.ls.get('lc_codelang', '') || '';
    LC.modal([el('h2', {}, LC.icon('code_block'), ' ' + t('cx_codeBlock')), el('label', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_language') }), lang), code,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('cx_insert'), onclick: () => { LC.ls.set('lc_codelang', lang.value); LC.closeModal(); ta.setSelectionRange(s, e); insertBlock(ta, '```' + lang.value + '\n' + code.value.replace(/```/g, "'''") + '\n```'); } }))], { wide: true });
    setTimeout(() => code.focus(), 40);
  }

  // ---------- quick (canned) replies ----------
  const replies = () => LC.prefs().cannedReplies || [];
  const saveReplies = (list) => { S.me.prefs.cannedReplies = list; return LC.setPrefs({ cannedReplies: list }); };
  function quickMenu(anchor, api) {
    const list = replies();
    LC.menu(anchor, [...(list.length ? list.map((r) => ({ icon: 'comment', label: r.length > 60 ? r.slice(0, 58) + '…' : r, fn: () => { const ta = api.ta; if (!ta.value.trim()) replaceRange(ta, 0, ta.value.length, r); else replaceRange(ta, ta.selectionStart, ta.selectionEnd, r); } })) : [{ label: t('cx_quickNone'), disabled: true }]), 'sep', { icon: 'edit_settings', label: t('cx_quickManage'), fn: () => LC.quickRepliesDialog() }]);
  }
  LC.quickRepliesDialog = () => {
    const list = [...replies()], box = el('div', { class: 'cx-quicklist' });
    const draw = () => box.replaceChildren(...list.map((r, i) => el('div', { class: 'rowline' }, el('textarea', { rows: 2, class: 'grow', maxlength: 1000, value: r, 'aria-label': t('cx_quick') + ' ' + (i + 1), oninput: (e) => { list[i] = e.target.value; } }), LC.ibtn('delete', t('delete'), () => { list.splice(i, 1); draw(); }))));
    draw();
    LC.modal([el('h2', {}, LC.icon('comment_multiple'), ' ' + t('cx_quick')), el('p', { class: 'muted small', text: t('cx_quickHelp') }), box,
      el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => { if (list.length < 30) { list.push(''); draw(); const ts = box.querySelectorAll('textarea'); ts[ts.length - 1].focus(); } } }, LC.icon('add'), t('cx_quickNew')),
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('save'), onclick: () => { saveReplies(list.map((x) => x.trim()).filter(Boolean)).then(() => LC.toast(t('saved'), { ms: 1200 })); LC.closeModal(); } }))], { wide: true });
  };

  // ---------- announcements ----------
  const BANNERS = ['brand', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
  LC.announceEl = (m) => {
    const a = m.announce, f = a.image && (m.files || []).find((x) => x.id === a.image);
    return el('div', { class: 'cx-ann cx-ban-' + (a.color || 'brand') + (f ? ' cx-annimg' : ''), style: f ? { backgroundImage: `linear-gradient(rgba(0,0,0,.15),rgba(0,0,0,.55)),url("${LC.fileUrl(f, true)}")` } : null },
      el('div', { class: 'cx-annt', role: 'heading', 'aria-level': '2', text: a.title }), a.sub ? el('div', { class: 'cx-anns', text: a.sub }) : null);
  };
  function announceDialog(api) {
    let color = 'brand', image = null; const title = el('input', { maxlength: 120, placeholder: t('cx_annHeadline'), 'aria-label': t('cx_annHeadline') }), sub = el('input', { maxlength: 200, placeholder: t('cx_annSub'), 'aria-label': t('cx_annSub') });
    const text = el('textarea', { rows: 3, maxlength: 8000, placeholder: t('cx_annText'), 'aria-label': t('cx_annText'), spellcheck: 'true', value: api.ta.value }), preview = el('div', { class: 'cx-annprev' }), err = el('div', { class: 'err', role: 'alert' });
    const draw = () => preview.replaceChildren(LC.announceEl({ announce: { title: title.value || t('cx_annHeadline'), sub: sub.value, color, image: image && image.id }, files: image ? [image] : [] }));
    const sw = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': t('cx_annBanner') }, BANNERS.map((c) => el('button', { type: 'button', role: 'radio', class: 'swatch cx-ban-' + c, 'aria-checked': String(c === color), 'aria-label': c === 'brand' ? t('accent') : t('cx_col_' + c), onclick: (e) => { color = c; image = null; [...sw.children].forEach((b) => b.setAttribute('aria-checked', String(b === e.currentTarget))); draw(); } })));
    const pic = el('input', { type: 'file', accept: 'image/*', class: 'hidden', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const up = await LC.upload(f, f.name || 'banner.jpg').promise; image = { id: up.id, name: up.name, size: up.size }; draw(); } catch (x) { fail(x); } } });
    title.addEventListener('input', draw); sub.addEventListener('input', draw); draw();
    LC.modal([el('h2', {}, LC.icon('megaphone_loud'), ' ' + t('cx_annTitle')), preview, title, sub, el('div', { class: 'field' }, el('span', { class: 'flabel', text: t('cx_annBanner') }), sw, el('div', { class: 'rowline' }, el('button', { type: 'button', class: 'secondary sm withicon', onclick: () => pic.click() }, LC.icon('image_add'), t('cx_annImage')), pic)), text, err,
      el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { type: 'button', class: 'primary', text: t('post'), onclick: () => {
        if (!title.value.trim()) { err.textContent = t('cx_annNeedTitle'); return title.focus(); }
        const used = text.value === api.ta.value; LC.closeModal();
        api.send({ force: true, text: text.value, cxFormat: true, extra: { announce: { title: title.value, sub: sub.value, color, image: image ? image.id : undefined }, files: image ? [image] : [] } });
        if (used) { api.ta.value = ''; api.saveDraft(); api.autosize(); api.update(); }
      } }))], { wide: true, label: t('cx_annTitle') });
  }

  // ---------- share location ----------
  const fmtCoord = (v, pos, neg) => `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
  LC.locationEl = (m) => {
    const l = m.location, osm = `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lon}#map=16/${l.lat}/${l.lon}`;
    return el('div', { class: 'cx-loc' }, el('span', { class: 'cx-locpin', 'aria-hidden': 'true' }, LC.icon('location', { filled: false })),
      el('div', { class: 'cx-locbody' }, el('b', { text: t('cx_locPrev') }), el('div', { class: 'cx-coords', text: `${fmtCoord(l.lat, 'N', 'S')}, ${fmtCoord(l.lon, 'E', 'W')}` }), l.acc != null ? el('div', { class: 'muted small', text: t('cx_locAcc', { n: l.acc }) }) : null,
        el('div', { class: 'cx-locacts' }, el('a', { href: osm, target: '_blank', rel: 'noopener noreferrer', class: 'secondary sm' }, t('cx_locOpen')), el('a', { href: `geo:${l.lat},${l.lon}`, class: 'secondary sm' }, t('cx_locApp')),
          el('button', { type: 'button', class: 'secondary sm', text: t('cx_locCopy'), onclick: async () => LC.toast((await LC.copy(`${l.lat}, ${l.lon}`)) ? t('copied') : t('copyFailed'), { ms: 1500 }) }))));
  };
  function shareLocation(api) {
    if (!window.isSecureContext) return LC.needSecure();
    if (!navigator.geolocation) return LC.toast(t('cx_locNoApi'));
    const status = el('p', { class: 'muted', role: 'status', text: t('cx_locFinding') }), card = el('div'), send = el('button', { type: 'button', class: 'primary', text: t('send'), disabled: true });
    LC.modal([el('h2', {}, LC.icon('location'), ' ' + t('cx_locTitle')), status, card, el('p', { class: 'muted small', text: t('cx_locNote') }), el('div', { class: 'acts' }, el('button', { type: 'button', class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), send)]);
    navigator.geolocation.getCurrentPosition((p) => {
      const loc = { lat: p.coords.latitude, lon: p.coords.longitude, acc: Math.round(p.coords.accuracy || 0) };
      status.textContent = ''; card.replaceChildren(LC.locationEl({ location: { ...loc, lat: Math.round(loc.lat * 1e6) / 1e6, lon: Math.round(loc.lon * 1e6) / 1e6 } })); send.disabled = false;
      send.onclick = () => { LC.closeModal(); api.send({ force: true, extra: { location: loc } }); };
    }, (e) => { status.textContent = e.code === 1 ? t('cx_locDenied') : t('cx_locFailed'); status.classList.add('err'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }
  LC.shareLocation = shareLocation;

  // ---------- the Format box on each composer ----------
  LC.ext.composerSetup.push((api) => {
    const ta = api.ta, root = api.root, st = (api.cx = { prio: '', preview: false });
    const subject = el('input', { class: 'cx-subjectin hidden', maxlength: 200, placeholder: t('cx_subject'), 'aria-label': t('cx_subjectLabel') });
    const prev = el('div', { class: 'cx-preview txt hidden', 'aria-live': 'off', 'aria-label': t('cx_preview') });
    const chip = el('div', { class: 'cx-priochip hidden' });
    const setPrio = (p) => { st.prio = p; chip.replaceChildren(...(p ? [el('span', { class: 'cx-prio ' + p }, LC.icon(p === 'urgent' ? 'alert_urgent' : 'important'), t(p === 'urgent' ? 'cx_urgent' : 'cx_important')), el('span', { class: 'muted small', text: p === 'urgent' ? t('cx_urgentHint') : '' }), LC.ibtn('dismiss', t('cx_removePrio'), () => setPrio(''))] : [])); chip.classList.toggle('hidden', !p); };
    const prioMenu = (a) => LC.menu(a, [{ label: t('cx_standard'), checked: !st.prio, fn: () => setPrio('') }, { icon: 'important', label: t('cx_markImportant'), checked: st.prio === 'important', fn: () => setPrio('important') }, { icon: 'alert_urgent', label: t('cx_markUrgent'), checked: st.prio === 'urgent', fn: () => setPrio('urgent') }]);
    api.setPriority = setPrio;
    const drawPreview = LC.debounce(() => { if (!st.preview) return; prev.replaceChildren(ta.value.trim() ? LC.renderText(ta.value) : el('span', { class: 'muted small', text: t('cx_previewEmpty') })); }, 120);
    const fmtColor = (a) => LC.menu(a, LC.cxColors.map((c) => ({ icon: el('span', { class: 'cx-dot cx-c-' + c, 'aria-hidden': 'true' }), label: t('cx_col_' + c), fn: () => wrap(ta, `{color:${c}}`, '{/color}') })));
    const fmtSize = (a) => LC.menu(a, [['small', 'cx_size_small'], ['large', 'cx_size_large'], ['huge', 'cx_size_huge']].map(([v, k]) => ({ icon: 'text_font_size', label: t(k), fn: () => wrap(ta, `{size:${v}}`, '{/size}') })));
    const fmtPara = (a) => LC.menu(a, [{ icon: 'text_paragraph', label: t('cx_normal'), fn: () => eachLine(ta, (ls) => ls.map((l) => l.replace(/^#{1,3}\s+/, '').replace(/^>\s?/, ''))) }, ...[1, 2, 3].map((n) => ({ icon: 'text_header_' + n, label: t('cx_h' + n), fn: () => eachLine(ta, (ls) => ls.map((l) => (l.trim() ? '#'.repeat(n) + ' ' + l.replace(/^#{1,3}\s+/, '') : l))) })), { icon: 'text_quote', label: t('cx_quote'), fn: () => linePrefix(ta, () => '> ', /^\s*>/) }]);
    const exec = (cmd) => { ta.focus(); let ok = false; try { ok = document.execCommand(cmd); } catch {} if (!ok) LC.toast(t(cmd === 'undo' ? 'cx_undo' : 'cx_redo') + ' ✗', { ms: 800 }); };
    const B = (icon, label, fn, o = {}) => { const b = LC.ibtn(icon, label, (e) => fn(e.currentTarget), { cls: 'icon cx-fb', menu: o.menu }); b.addEventListener('mousedown', (e) => e.preventDefault()); b.tabIndex = -1; return b; };
    const bar = el('div', { class: 'cx-fmtbar hidden', role: 'toolbar', 'aria-label': t('cx_formatting') },
      B('text_bold', t('cx_bold') + ' (Ctrl+B)', () => wrap(ta, '**', '**')), B('text_italic', t('cx_italic') + ' (Ctrl+I)', () => wrap(ta, '*', '*')), B('text_underline', t('cx_underline') + ' (Ctrl+U)', () => wrap(ta, '__', '__')), B('text_strikethrough', t('cx_strike'), () => wrap(ta, '~~', '~~')),
      B('highlight', t('cx_highlight'), () => wrap(ta, '==', '==')), B('text_color', t('cx_fontColor'), fmtColor, { menu: true }), B('text_font_size', t('cx_fontSize'), fmtSize, { menu: true }), B('text_paragraph', t('cx_paragraph'), fmtPara, { menu: true }), el('span', { class: 'cx-fsep', 'aria-hidden': 'true' }),
      B('text_bullet_list_ltr', t('cx_bullets'), () => linePrefix(ta, () => '- ', /^\s*[-*•]\s+(?!\[)/)), B('text_number_list_ltr', t('cx_numbers'), () => linePrefix(ta, (i) => `${i + 1}. `, /^\s*\d+[.)]\s+/)), B('task_list_square_ltr', t('cx_checklist'), () => linePrefix(ta, () => '- [ ] ', /^\s*[-*•]\s+\[[ xX]\]/)),
      B('text_indent_decrease_ltr', t('cx_outdent'), () => indent(ta, -1)), B('text_indent_increase_ltr', t('cx_indent'), () => indent(ta, 1)), el('span', { class: 'cx-fsep', 'aria-hidden': 'true' }),
      B('link', t('cx_link'), () => linkDialog(ta)), B('table', t('cx_table'), () => tableDialog(ta)), B('line_horizontal_1', t('cx_divider'), () => insertBlock(ta, '---')), B('code_block', t('cx_codeBlock'), () => codeDialog(ta)), B('text_clear_formatting', t('cx_clearFmt'), () => clearFormatting(ta)),
      el('span', { class: 'cx-fsep', 'aria-hidden': 'true' }), B('arrow_undo', t('cx_undo') + ' (Ctrl+Z)', () => exec('undo')), B('arrow_redo', t('cx_redo') + ' (Ctrl+Y)', () => exec('redo')), B('important', t('cx_priority'), prioMenu, { menu: true }),
      B('comment_multiple', t('cx_quick'), (a) => quickMenu(a, api), { menu: true }), B('eye', t('cx_preview'), (b) => { st.preview = !st.preview; prev.classList.toggle('hidden', !st.preview); b.setAttribute('aria-pressed', String(st.preview)); drawPreview(); }));
    const btns = () => [...bar.querySelectorAll('button')];
    btns()[0].tabIndex = 0;
    bar.addEventListener('keydown', (e) => { const bs = btns(), i = bs.indexOf(document.activeElement); if (i < 0) return; const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -i : e.key === 'End' ? bs.length - 1 - i : 0; if (!d) return; e.preventDefault(); bs[i].tabIndex = -1; const n = bs[(i + d + bs.length) % bs.length]; n.tabIndex = 0; n.focus(); });
    const fmtBtn = LC.ibtn('text_edit_style', t('cx_format') + ' (Ctrl+Shift+X)', () => toggle(), { cls: 'icon cx-fmtbtn', pressed: false });
    const postBtn = el('button', { type: 'button', class: 'primary withicon cx-startpost', onclick: () => { root.classList.remove('cx-collapsed'); toggle(true); subject.focus(); } }, LC.icon('compose'), el('span', { text: t('cx_startPost') }));
    const subjectFor = () => { const chan = api.cfg.chan(); return !api.cfg.thread() && !!chan && !chan.startsWith('dm:') && !LC.isGroupChat(S.channels.get(chan)); };
    function toggle(on) {
      const open = on === undefined ? !root.classList.contains('cx-expanded') : !!on;
      root.classList.toggle('cx-expanded', open); bar.classList.toggle('hidden', !open); fmtBtn.setAttribute('aria-pressed', String(open)); subject.classList.toggle('hidden', !open || !subjectFor());
      if (!open && st.preview) { st.preview = false; prev.classList.add('hidden'); }
      api.autosize(); if (open) ta.focus();
    }
    api.toggleFormat = toggle;
    api.row.prepend(bar); api.row.insertBefore(subject, ta); api.row.insertBefore(prev, ta.nextSibling); api.row.before(chip);
    if (!api.cfg.compact) api.row.before(postBtn);
    const tools = api.row.querySelector('.ctools'); tools.prepend(fmtBtn);
    ta.addEventListener('input', drawPreview);
    ta.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(); if (!mod || e.altKey) return;
      if (!e.shiftKey && (k === 'b' || k === 'i' || k === 'u')) { e.preventDefault(); wrap(ta, k === 'b' ? '**' : k === 'i' ? '*' : '__', k === 'b' ? '**' : k === 'i' ? '*' : '__'); }
      else if (e.shiftKey && k === 'x') { e.preventDefault(); toggle(); }
    });
    api.onRefresh(() => { // another chat: posts channels start with "Start a post"
      subject.value = ''; setPrio(''); const posts = !api.cfg.compact && LC.isPostsChat(api.cfg.chan());
      root.classList.toggle('cx-postmode', posts); root.classList.toggle('cx-collapsed', posts && !ta.value.trim()); if (posts) toggle(false); else subject.classList.toggle('hidden', !root.classList.contains('cx-expanded') || !subjectFor()); drawPreview();
    });
    api.onSent((body, o) => { if (o && o.force && !o.cxFormat) return; subject.value = ''; setPrio(''); drawPreview(); if (root.classList.contains('cx-postmode')) { toggle(false); root.classList.add('cx-collapsed'); } });
    api.subjectInput = subject;
  });
  LC.ext.beforeSend.push((body, api, o) => {
    if (!api || !api.cx || (o && o.force && !o.cxFormat)) return;
    const subj = api.subjectInput && !api.subjectInput.classList.contains('hidden') ? api.subjectInput.value.trim() : '';
    if (subj && !body.thread) body.subject = subj;
    if (api.cx.prio) body.priority = api.cx.prio;
  });
  // composer "More options" menu: Teams' message extensions
  LC.ext.composerMore.push((api) => [
    'sep',
    { icon: 'important', label: t('cx_priority'), fn: () => LC.menu(api.row.querySelector('.morebtn') || api.row, [{ label: t('cx_standard'), checked: !api.cx.prio, fn: () => api.setPriority('') }, { icon: 'important', label: t('cx_markImportant'), checked: api.cx.prio === 'important', fn: () => api.setPriority('important') }, { icon: 'alert_urgent', label: t('cx_markUrgent'), checked: api.cx.prio === 'urgent', fn: () => api.setPriority('urgent') }]) },
    !api.cfg.thread() ? { icon: 'megaphone_loud', label: t('cx_announce'), fn: () => announceDialog(api) } : null,
    { icon: 'ribbon_star', label: t('cx_praise'), fn: () => LC.praiseDialog(api) },
    { icon: 'location', label: t('cx_location'), fn: () => shareLocation(api) },
    { icon: 'comment_multiple', label: t('cx_quick'), fn: () => quickMenu(api.row.querySelector('.morebtn') || api.row, api) },
    LC.msgRules().memes !== false ? { icon: 'emoji_meme', label: t('cx_makeMeme'), fn: () => LC.memeDialog(api) } : null,
    { icon: 'text_edit_style', label: t('cx_format'), fn: () => api.toggleFormat() },
  ]);
  void $;
})();
