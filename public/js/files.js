'use strict';
// Files (section 9): text/code preview, file cards and actions in messages, the per-chat Files tab (folders, uploads,
// moving, zip downloads, details, versions, share links) and the Files app in the app bar. Server: lib/routes-files.js.
// The Calendar app is in files-cal.js.
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v);
  const F = (LC.files = {});
  LC.addEvents('fl_files', 'fl_links');

  LC.addStrings('en', {
    fl_appFiles: 'Files', fl_recent: 'Recent', fl_mine: 'My uploads', fl_myLinks: 'Shared links', fl_byChat: 'By chat', fl_allTypes: 'All', fl_t_doc: 'Documents', fl_t_image: 'Images', fl_t_video: 'Videos', fl_t_audio: 'Audio', fl_t_archive: 'Archives', fl_t_code: 'Code', fl_t_other: 'Other',
    fl_name: 'Name', fl_modified: 'Modified', fl_modifiedBy: 'Modified by', fl_sharedBy: 'Shared by', fl_size: 'Size', fl_location: 'Location', fl_type: 'Type', fl_items: '{n} items', fl_item1: '1 item',
    fl_new: 'New', fl_newFolder: 'New folder', fl_folderName: 'Folder name', fl_upload: 'Upload', fl_uploading: 'Uploading {n} file(s)… {p}%', fl_uploaded: 'Uploaded {n} file(s).', fl_download: 'Download', fl_downloadAll: 'Download all', fl_downloadZip: 'Download as zip',
    fl_moveTo: 'Move to', fl_moveHere: 'Move here', fl_moved: 'Moved.', fl_rename: 'Rename', fl_delete: 'Delete', fl_details: 'Details', fl_open: 'Open', fl_copyLink: 'Copy link', fl_share: 'Share', fl_selected: '{n} selected', fl_clearSel: 'Clear selection', fl_selectAll: 'Select all',
    fl_select: 'Select {name}', fl_searchFiles: 'Search files', fl_searchHere: 'Search in this chat’s files', fl_listView: 'List view', fl_gridView: 'Tiles view', fl_filterType: 'File type', fl_sortBy: 'Sort by', fl_sortName: 'Name', fl_sortDate: 'Date', fl_sortSize: 'Size',
    fl_root: 'Files', fl_path: 'Folder path', fl_emptyFolder: 'This folder is empty. Drop files here or select Upload.', fl_noFiles: 'No files here yet. Files shared in the chat show up here — or select Upload.', fl_noMatch: 'No files match.', fl_inFolder: 'in {path}',
    fl_confirmDelete: 'Delete “{name}” for everyone? It is removed from every chat it was shared in.', fl_confirmDeleteN: 'Delete {n} files for everyone? They are removed from every chat they were shared in.', fl_deleted: 'Deleted.', fl_fileDeleted: 'File deleted',
    fl_confirmDeleteFolder: 'Delete the folder “{name}”? Nothing inside is deleted: it moves up one level.', fl_renameFolder: 'Rename folder', fl_deleteFolder: 'Delete folder', fl_folder: 'Folder', fl_createdBy: 'Created by', fl_created: 'Created',
    fl_newVersion: 'Upload new version', fl_versions: 'Version history', fl_versionN: 'Version {n}', fl_current: 'Current version', fl_restore: 'Restore', fl_restored: 'Version {n} restored as the current version.', fl_versionSaved: 'Saved as version {n}.', fl_noVersions: 'There are no older versions yet. Upload a new version to start a history.',
    fl_confirmRestore: 'Make version {n} the current version? The current version is kept in the history.',
    fl_linkTitle: 'Share a link', fl_linkWho: 'Who can open it', fl_linkMembers: 'People in the chat (signed in)', fl_linkAnyone: 'Anyone on this network with the link', fl_linkAnyoneHint: 'No sign-in needed. Only you (the owner) or an admin can choose this.', fl_linkFor: 'Link works for',
    fl_1h: '1 hour', fl_1d: '1 day', fl_7d: '7 days', fl_custom: 'Until a date…', fl_until: 'Until', fl_create: 'Create link', fl_linkReady: 'Link ready — copied.', fl_activeLinks: 'Active links', fl_noLinks: 'No active links.', fl_expires: 'Expires {when}', fl_revoke: 'Remove link', fl_revoked: 'Link removed.', fl_anyoneLink: 'Anyone', fl_membersLink: 'Chat members',
    fl_linkGone: 'This link has expired or is no longer available.', fl_showInChat: 'Show in chat', fl_openInTab: 'Open in Files tab', fl_sharedIn: 'Shared in', fl_uploadedBy: 'Uploaded by', fl_uploaded2: 'Shared', fl_version: 'Version',
    fl_noPreview: 'There is no preview for this kind of file. Download it to open it.', fl_binary: 'This file doesn’t look like text, so it can’t be shown here.', fl_truncated: 'Showing the first {size}. Download to see the rest.', fl_linesCut: 'Showing the first {n} lines. Download to see the rest.',
    fl_rowsCut: 'Showing the first {n} rows. Download to see the rest.', fl_wrap: 'Wrap lines', fl_preview: 'Preview', fl_source: 'Source', fl_textView: 'File contents', fl_previewOf: 'Preview of {name}', fl_moreFor: 'More options for {name}', fl_detailsOf: 'Details: {name}', fl_dropUpload: 'Drop to upload here',
    fl_t_recording: 'Recordings', fl_descTab: 'Files shared in this chat, in folders — with previews, versions, links and zip downloads.', fl_inside: 'Search inside files', fl_insideHint: 'Also look inside text files', fl_hold: 'This file is on legal hold: it can’t be renamed, replaced or deleted.', fl_cantMoveHere: 'Can’t move a folder inside itself.', fl_sameKind: 'Pick a {ext} file for the new version.', fl_readonly: 'You can look at the files here, but not change them.', fl_tooBig: '{name} is larger than {n} MB.', fl_linkTo: 'Link to {name}',
  });
  LC.addStrings('hi', { fl_appFiles: 'फ़ाइलें', fl_recent: 'हाल की', fl_mine: 'मेरे अपलोड', fl_myLinks: 'साझा लिंक', fl_upload: 'अपलोड करें', fl_newFolder: 'नया फ़ोल्डर', fl_download: 'डाउनलोड', fl_downloadAll: 'सब डाउनलोड करें', fl_rename: 'नाम बदलें', fl_delete: 'हटाएँ', fl_details: 'विवरण', fl_open: 'खोलें', fl_copyLink: 'लिंक कॉपी करें', fl_moveTo: 'यहाँ ले जाएँ', fl_name: 'नाम', fl_modified: 'बदला गया', fl_size: 'आकार', fl_versions: 'संस्करण इतिहास', fl_newVersion: 'नया संस्करण अपलोड करें', fl_fileDeleted: 'फ़ाइल हटा दी गई', fl_root: 'फ़ाइलें', fl_allTypes: 'सभी', fl_t_doc: 'दस्तावेज़', fl_t_image: 'चित्र', fl_t_video: 'वीडियो', fl_t_audio: 'ऑडियो', fl_t_archive: 'आर्काइव', fl_t_code: 'कोड', fl_searchFiles: 'फ़ाइलें खोजें', fl_linkTitle: 'लिंक साझा करें', fl_create: 'लिंक बनाएँ' });
  LC.addStrings('es', { fl_appFiles: 'Archivos', fl_recent: 'Recientes', fl_mine: 'Mis archivos', fl_myLinks: 'Vínculos compartidos', fl_upload: 'Cargar', fl_newFolder: 'Nueva carpeta', fl_download: 'Descargar', fl_downloadAll: 'Descargar todo', fl_rename: 'Cambiar nombre', fl_delete: 'Eliminar', fl_details: 'Detalles', fl_open: 'Abrir', fl_copyLink: 'Copiar vínculo', fl_moveTo: 'Mover a', fl_name: 'Nombre', fl_modified: 'Modificado', fl_size: 'Tamaño', fl_versions: 'Historial de versiones', fl_newVersion: 'Cargar nueva versión', fl_fileDeleted: 'Archivo eliminado', fl_root: 'Archivos', fl_allTypes: 'Todos', fl_t_doc: 'Documentos', fl_t_image: 'Imágenes', fl_t_video: 'Vídeos', fl_t_audio: 'Audio', fl_t_archive: 'Comprimidos', fl_t_code: 'Código', fl_searchFiles: 'Buscar archivos', fl_linkTitle: 'Compartir un vínculo', fl_create: 'Crear vínculo' });

  // ---------- kinds, icons, URLs ----------
  const KINDS = [['image', /\.(png|jpe?g|gif|webp|bmp|svg|heic|tiff?|ico)$/i], ['video', /\.(mp4|webm|mov|mkv|avi|m4v)$/i], ['audio', /\.(mp3|wav|ogg|opus|m4a|weba|flac|aac)$/i], ['archive', /\.(zip|rar|7z|gz|tgz|tar|bz2|xz)$/i],
    ['code', /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|html?|css|scss|less|xml|json|ya?ml|ini|cfg|conf|toml|sql|sh|bash|zsh|bat|ps1|swift|lua|r|pl|vue|svelte|ipynb|env)$/i],
    ['doc', /\.(pdf|docx?|xlsx?|pptx?|od[tsp]|rtf|txt|md|markdown|csv|tsv|log|pages|numbers|key|epub)$/i]];
  const TYPES = ['doc', 'image', 'video', 'audio', 'archive', 'code'];
  const kindOf = (n) => (KINDS.find(([, re]) => re.test(n)) || ['other'])[0];
  const TEXT = /\.(txt|md|markdown|csv|tsv|json|log|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|html?|css|scss|less|xml|svg|ya?ml|ini|cfg|conf|toml|sql|sh|bash|zsh|bat|ps1|swift|lua|r|pl|env|properties|vue|svelte|gitignore)$/i;
  F.isText = (n) => TEXT.test(n) || /^(dockerfile|makefile|readme|license|changelog)$/i.test(n);
  F.kindOf = kindOf;
  const ext = (n) => LC.extOf(n);
  const isPdf = (n) => ext(n) === 'pdf';
  const isMedia = (n) => ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'opus', 'm4a', 'weba'].includes(ext(n));
  F.canPreview = (n) => LC.isImage(n) || isPdf(n) || F.isText(n) || isMedia(n);
  F.iconOf = (n) => { const x = ext(n), k = kindOf(n); return x === 'pdf' ? 'document_pdf' : /^(csv|tsv|xlsx?|ods|numbers)$/.test(x) ? 'document_table' : k === 'image' ? 'image' : k === 'video' ? 'video' : k === 'audio' ? 'music_note_2' : k === 'archive' ? 'folder_zip' : k === 'code' ? 'code' : k === 'doc' ? 'document_text' : 'document'; };
  F.tone = (n) => { const x = ext(n); return x === 'pdf' ? 'pdf' : /^(docx?|odt|rtf|pages)$/.test(x) ? 'word' : /^(xlsx?|ods|csv|tsv|numbers)$/.test(x) ? 'sheet' : /^(pptx?|odp|key)$/.test(x) ? 'slides' : kindOf(n); };
  F.fileIcon = (n, cls = '') => el('span', { class: 'fl-fi fl-tone-' + F.tone(n) + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }, LC.icon(F.iconOf(n)));
  // newer versions keep the same file id: the version number in the URL stops the browser from showing a cached old copy
  const baseUrl = LC.fileUrl;
  LC.fileUrl = (f, inline) => baseUrl(f, inline) + (f && f.v > 1 ? '&v=' + f.v : '');
  F.versionUrl = (f, n, inline) => `/api/files/vget?id=${f.id}&n=${n}&token=${encodeURIComponent(S.token)}${inline ? '&inline=1' : ''}`;
  F.zipUrl = (q) => '/api/files/zip?' + new URLSearchParams({ ...q, token: S.token });
  const fail = (e) => LC.toast(e.message || String(e));
  const who = (id) => (id ? LC.uname(id) : t('unknown'));
  const download = (url, name) => { const a = el('a', { href: url, download: name || '' }); document.body.append(a); a.click(); a.remove(); };
  F.download = (f) => download(LC.fileUrl(f), f.name);
  const when = (ts) => LC.fmtDateTime(ts);
  const short = (ts) => (Date.now() - ts < 7 * 86400000 ? LC.ago(ts) : new Date(ts).toLocaleDateString(LC.ui.lang === 'auto' ? undefined : LC.ui.lang, { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }));
  const canEdit = (f) => !!S.me && (f.by === S.me.id || LC.isAdmin());

  // ---------- opening files (the viewers) ----------
  F.open = (f, list, o = {}) => {
    if (LC.isImage(f.name)) { const imgs = (list || [f]).filter((x) => LC.isImage(x.name)); return LC.openLightbox(imgs, Math.max(0, imgs.findIndex((x) => x.id === f.id)), f); }
    if (isPdf(f.name) && !o.url) return LC.openPdf(f);
    if (F.isText(f.name)) return F.openText(f, o);
    if (isMedia(f.name) || isPdf(f.name)) return mediaModal(f, o);
    LC.modal([viewHead(f, o), el('p', { class: 'muted', text: t('fl_noPreview') })], { label: f.name });
  };
  function viewHead(f, o = {}, extra = []) {
    const url = o.url || LC.fileUrl(f);
    return el('div', { class: 'fl-viewhead' }, F.fileIcon(f.name), el('div', { class: 'grow' }, el('h2', { class: 'fl-viewname', text: f.name, title: f.name }), el('div', { class: 'muted small', text: [LC.fmtSize(f.size || 0), o.version ? t('fl_versionN', { n: o.version }) : f.v > 1 ? t('fl_versionN', { n: f.v }) : ''].filter(Boolean).join(' · ') })),
      ...extra, el('a', { class: 'secondary sm withicon', href: url, download: f.name }, LC.icon('arrow_download'), el('span', { text: t('download') })), LC.ibtn('dismiss', t('close'), LC.closeModal));
  }
  function mediaModal(f, o) {
    const src = o.url ? o.url.replace(/&?inline=1/, '') + '&inline=1' : LC.fileUrl(f, true), x = ext(f.name);
    const media = isPdf(f.name) ? el('iframe', { class: 'pdfview', src, title: f.name }) : ['mp3', 'wav', 'ogg', 'opus', 'm4a', 'weba'].includes(x) ? el('audio', { src, controls: true, class: 'fl-audio', 'aria-label': f.name }) : el('video', { src, controls: true, class: 'fl-video', 'aria-label': f.name });
    LC.modal([viewHead(f, o), media], { wide: true, label: f.name });
  }
  const LIMIT = 262144, MAX_LINES = 5000, MAX_ROWS = 1000;
  F.openText = async (f, o = {}) => {
    const body = el('div', { class: 'fl-viewbody' }, el('p', { class: 'muted', text: t('loading') })), note = el('div', { class: 'fl-trunc hidden', role: 'note' });
    let wrap = !!LC.ls.get('fl_wrap', false); const wrapBtn = LC.ibtn('text_wrap', t('fl_wrap'), () => { wrap = !wrap; LC.ls.set('fl_wrap', wrap); body.classList.toggle('wrap', wrap); wrapBtn.setAttribute('aria-pressed', String(wrap)); }, { pressed: wrap });
    body.classList.toggle('wrap', wrap);
    const card = [viewHead(f, o, [wrapBtn]), note, body]; LC.modal(card, { wide: true, label: f.name });
    const url = (o.url || LC.fileUrl(f)).replace(/&?inline=1/, '');
    try {
      const r = await fetch(url, { headers: { Range: `bytes=0-${LIMIT - 1}` } });
      if (!r.ok) throw new Error(r.status === 404 ? t('fl_linkGone') : r.statusText);
      const buf = new Uint8Array(await r.arrayBuffer()), cr = /\/(\d+)$/.exec(r.headers.get('content-range') || ''), total = cr ? Number(cr[1]) : buf.length;
      if (!body.isConnected) return;
      let bin = 0; for (let i = 0; i < Math.min(buf.length, 8000); i++) if (buf[i] === 0) bin++;
      if (bin) return body.replaceChildren(el('p', { class: 'muted', text: t('fl_binary') }));
      let text = new TextDecoder('utf-8').decode(buf); if (total > buf.length) text = text.replace(/�+$/, '');
      const cut = total > buf.length, lines = text.split('\n');
      const say = (msg) => { note.replaceChildren(LC.icon('info'), el('span', { text: msg }), el('a', { class: 'secondary sm', href: url, download: f.name, text: t('download') })); note.classList.remove('hidden'); };
      const x = ext(f.name);
      if (x === 'csv' || x === 'tsv') { const rows = parseCsv(text, x === 'tsv' ? '\t' : guessSep(text)); if (cut) rows.pop(); body.replaceChildren(csvTable(rows.slice(0, MAX_ROWS), f.name)); if (rows.length > MAX_ROWS) say(t('fl_rowsCut', { n: MAX_ROWS })); else if (cut) say(t('fl_truncated', { size: LC.fmtSize(LIMIT) })); return; }
      if (lines.length > MAX_LINES) { say(t('fl_linesCut', { n: MAX_LINES })); text = lines.slice(0, MAX_LINES).join('\n'); } else if (cut) say(t('fl_truncated', { size: LC.fmtSize(LIMIT) }));
      if (x === 'md' || x === 'markdown') {
        let src = false; const view = el('div'), seg = el('div', { class: 'segs fl-segs', role: 'group', 'aria-label': t('fl_textView') });
        const draw = () => { view.replaceChildren(src ? codeView(text, 'md', f.name) : mdView(text)); seg.replaceChildren(...[[false, 'fl_preview'], [true, 'fl_source']].map(([v, k]) => el('button', { class: 'seg' + (src === v ? ' on' : ''), 'aria-pressed': String(src === v), text: t(k), onclick: () => { src = v; draw(); } }))); };
        draw(); return body.replaceChildren(seg, view);
      }
      body.replaceChildren(codeView(text, langOf(f.name), f.name));
    } catch (e) { if (body.isConnected) body.replaceChildren(el('p', { class: 'err', text: e.message || t('fl_noPreview') })); }
  };
  // ----- syntax colours: one regex per language family; groups map to token classes -----
  const KW = {
    js: 'await break case catch class const continue debugger default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield async as',
    py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print',
    c: 'auto bool break case catch char class const continue default delete do double else enum extern false final float for fn func go goto if impl import int interface let long match mod mut namespace new nil null package private protected pub public return self short signed sizeof static struct super switch this throw true try type typedef union unsigned use using var void volatile while string boolean val fun when object override suspend',
    sh: 'if then else elif fi for while until do done case esac in function return local export echo exit set unset source read shift cd test true false',
    sql: 'select from where insert into values update set delete create table drop alter add column primary key foreign references join left right inner outer full cross on group by order having limit offset as and or not null is in like between distinct union all index view default case when then else end count sum avg min max exists asc desc with returning integer text varchar real boolean date',
  };
  const kwSet = {}; for (const [k, v] of Object.entries(KW)) kwSet[k] = new Set(v.split(' '));
  const NUM = String.raw`\b(?:0x[\da-fA-F]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`, STR = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'`;
  const LANG = {
    js: { re: new RegExp(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(${STR}|\`(?:[^\`\\]|\\.)*\`)|(${NUM})|([A-Za-z_$][\w$]*)`, 'g'), kw: 'js' },
    c: { re: new RegExp(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[a-z]+\b)|(${STR}|\`(?:[^\`\\]|\\.)*\`)|(${NUM})|([A-Za-z_$][\w$]*)`, 'g'), kw: 'c' },
    py: { re: new RegExp(String.raw`(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|${STR})|(${NUM})|([A-Za-z_]\w*)`, 'g'), kw: 'py' },
    sh: { re: new RegExp(String.raw`(#[^\n]*)|(${STR})|(${NUM}|\$\{?[\w@#?*!-]+\}?)|([A-Za-z_][\w-]*)`, 'g'), kw: 'sh' },
    sql: { re: new RegExp(String.raw`(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*'|"[^"\n]*")|(${NUM})|([A-Za-z_]\w*)`, 'g'), kw: 'sql', ci: true },
    css: { re: new RegExp(String.raw`(\/\*[\s\S]*?\*\/)|(${STR})|(#[\da-fA-F]{3,8}\b|-?\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|([\w-]+(?=\s*:[^:{]*[;}\n]))|(@[\w-]+|![a-z]+)`, 'g'), map: ['tc', 'ts', 'tn', 'ta', 'tk'] },
    json: { re: new RegExp(String.raw`("(?:[^"\\\n]|\\.)*"(?=\s*:))|("(?:[^"\\\n]|\\.)*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b`, 'g'), map: ['ta', 'ts', 'tn', 'tk'] },
    xml: { re: /(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![A-Za-z][^>]*>)|(<\/?[A-Za-z][\w:.-]*|\/?>)|(\s[\w:.-]+(?==))|("[^"]*"|'[^']*')|(&#?\w+;)/g, map: ['tc', 'tt', 'ta', 'ts', 'tn'] },
    yaml: { re: /(#[^\n]*)|(^[ \t]*(?:- )?[\w"'.\/-]+(?=[ \t]*:(?:\s|$)))|("(?:[^"\\\n]|\\.)*"|'(?:[^'\n])*')|(\b\d+(?:\.\d+)?\b|\b(?:true|false|null|yes|no)\b)/gm, map: ['tc', 'ta', 'ts', 'tn'] },
    ini: { re: /([;#][^\n]*)|(^[ \t]*\[[^\]\n]*\])|(^[ \t]*[\w.\-]+(?=[ \t]*=))|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')|(\b\d+(?:\.\d+)?\b|\b(?:true|false|on|off|yes|no)\b)/gm, map: ['tc', 'th', 'ta', 'ts', 'tn'] },
    md: { re: /(^#{1,6}[^\n]*)|(`[^`\n]+`|^```[^\n]*)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\[[^\]\n]+\]\([^)\n]+\))|(^[ \t]*(?:[-*+]|\d+\.)[ \t])/gm, map: ['th', 'ts', 'tk', 'ta', 'tn'] },
  };
  const LANG_OF = { js: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js', jsx: 'js', vue: 'js', svelte: 'js', json: 'json', ipynb: 'json', py: 'py', rb: 'py', pl: 'sh', r: 'py', sh: 'sh', bash: 'sh', zsh: 'sh', bat: 'sh', ps1: 'sh', env: 'ini', sql: 'sql', css: 'css', scss: 'css', less: 'css', html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', yml: 'yaml', yaml: 'yaml', ini: 'ini', cfg: 'ini', conf: 'ini', toml: 'ini', properties: 'ini', md: 'md', markdown: 'md', java: 'c', kt: 'c', c: 'c', h: 'c', cpp: 'c', hpp: 'c', cs: 'c', go: 'c', rs: 'c', php: 'c', swift: 'c', lua: 'c' };
  const langOf = (n) => LANG_OF[ext(n)] || (/^(dockerfile|makefile)$/i.test(n) ? 'sh' : null);
  F.tokens = (text, lang) => {
    const L = LANG[lang]; if (!L) return [[null, text]];
    const out = [], re = new RegExp(L.re.source, L.re.flags); let last = 0, m;
    while ((m = re.exec(text))) {
      if (!m[0]) { re.lastIndex++; continue; }
      let cls = null;
      if (L.map) { const g = m.slice(1).findIndex((x) => x !== undefined); cls = L.map[g] || null; }
      else if (m[1] !== undefined) cls = 'tc'; else if (m[2] !== undefined) cls = 'ts'; else if (m[3] !== undefined) cls = 'tn';
      else if (m[4] !== undefined && kwSet[L.kw].has(L.ci ? m[4].toLowerCase() : m[4])) cls = 'tk';
      if (m.index > last) out.push([null, text.slice(last, m.index)]);
      out.push([cls, m[0]]); last = re.lastIndex;
    }
    if (last < text.length) out.push([null, text.slice(last)]);
    return out;
  };
  function codeView(text, lang, name) {
    const lines = [[]];
    for (const [c, s] of F.tokens(text, lang)) s.split('\n').forEach((p, i) => { if (i) lines.push([]); if (p) lines[lines.length - 1].push([c, p]); });
    if (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
    const box = el('div', { class: 'fl-code', role: 'region', tabindex: '0', 'aria-label': t('fl_previewOf', { name }), style: `--lnw:${String(lines.length).length + 1}ch` });
    const frag = document.createDocumentFragment();
    for (const ln of lines) { const d = document.createElement('div'), lc = document.createElement('span'); d.className = 'fl-line'; lc.className = 'fl-lc'; for (const [c, s] of ln) { if (!c) lc.append(s); else { const sp = document.createElement('span'); sp.className = 'fl-' + c; sp.textContent = s; lc.append(sp); } } d.append(lc); frag.append(d); }
    box.append(frag); return box;
  }
  function mdView(text) {
    const box = el('div', { class: 'fl-md' }); let chunk = [], inCode = false;
    const flush = () => { if (chunk.length) { box.append(el('div', { class: 'txt' }, LC.renderText(chunk.join('\n')))); chunk = []; } };
    for (const line of text.split('\n')) {
      if (/^```/.test(line)) inCode = !inCode;
      const h = !inCode && /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { flush(); box.append(el('div', { class: 'fl-mdh fl-mdh' + h[1].length, text: h[2].replace(/\s*#+\s*$/, '') })); } else chunk.push(line);
    }
    flush(); return box;
  }
  const guessSep = (text) => { const l = text.slice(0, 2000).split('\n')[0] || ''; const c = (ch) => l.split(ch).length; return c(';') > c(',') && c(';') > c('\t') ? ';' : c('\t') > c(',') ? '\t' : ','; };
  function parseCsv(text, sep) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length && rows.length <= MAX_ROWS; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
      if (ch === '"' && !cell) q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += ch;
    }
    if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    return rows;
  }
  function csvTable(rows, name) {
    if (!rows.length) return el('p', { class: 'muted', text: t('fl_noMatch') });
    const cols = Math.min(60, Math.max(...rows.map((r) => r.length))), head = rows[0], cellOf = (r, i) => (r[i] === undefined ? '' : r[i]);
    return el('div', { class: 'fl-csv', role: 'region', tabindex: '0', 'aria-label': t('fl_previewOf', { name }) }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', class: 'fl-rn', text: '#' }), Array.from({ length: cols }, (_, i) => el('th', { scope: 'col', text: cellOf(head, i) })))),
      el('tbody', {}, rows.slice(1).map((r, n) => el('tr', {}, el('td', { class: 'fl-rn', text: n + 1 }), Array.from({ length: cols }, (_, i) => el('td', { text: cellOf(r, i) })))))));
  }

  // ---------- actions on one file ----------
  F.rename = async (f) => {
    const v = await LC.prompt(t('fl_rename'), { value: f.name, max: 120, ok: t('fl_rename') }); if (v === null || !v.trim() || v.trim() === f.name) return;
    try { await LC.api('/api/files/rename', { id: f.id, name: v.trim() }); } catch (e) { fail(e); }
  };
  F.remove = async (list) => {
    list = Array.isArray(list) ? list : [list]; if (!list.length) return false;
    if (!(await LC.confirm(list.length === 1 ? t('fl_confirmDelete', { name: list[0].name }) : t('fl_confirmDeleteN', { n: list.length }), { danger: true, ok: t('delete') }))) return false;
    try { await LC.api('/api/files/delete', { ids: list.map((f) => f.id) }); LC.toast(t('fl_deleted'), { ms: 2500 }); LC.sr(t('fl_deleted')); return true; } catch (e) { fail(e); return false; }
  };
  const pickFile = (accept) => new Promise((resolve) => { const inp = el('input', { type: 'file', class: 'hidden', accept: accept || null, multiple: false, onchange: () => { resolve(inp.files[0] || null); inp.remove(); } }); document.body.append(inp); inp.click(); setTimeout(() => { if (!inp.files.length) inp.addEventListener('cancel', () => resolve(null)); }, 0); });
  F.newVersion = async (f) => {
    const x = ext(f.name), file = await pickFile(x ? '.' + x : ''); if (!file) return;
    if (ext(file.name) !== x) return LC.toast(t('fl_sameKind', { ext: x ? '.' + x : '' }));
    if (S.settings.maxUploadMB && file.size > S.settings.maxUploadMB * 1048576) return LC.toast(t('fl_tooBig', { name: file.name, n: S.settings.maxUploadMB }));
    const toast = LC.toast(t('fl_uploading', { n: 1, p: 0 }), { ms: 600000 }), span = toast.querySelector('span');
    try {
      const up = await LC.upload(file, file.name, (p) => { span.textContent = t('fl_uploading', { n: 1, p: Math.round(p * 100) }); }).promise;
      const r = await LC.api('/api/files/version', { id: f.id, upload: up.id }); toast.remove(); LC.toast(t('fl_versionSaved', { n: r.file.v }));
    } catch (e) { toast.remove(); fail(e); }
  };
  F.versions = async (f) => {
    const list = el('div', { class: 'fl-vlist' }, el('p', { class: 'muted', text: t('loading') }));
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('history'), ' ' + t('fl_versions')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted small', text: f.name }), list], { label: t('fl_versions') });
    const draw = async () => {
      let d; try { d = await LC.api('/api/files/versions?id=' + f.id); } catch (e) { return list.replaceChildren(el('p', { class: 'err', text: e.message })); }
      const cur = d.file, row = (v, isCur) => el('div', { class: 'fl-vrow' + (isCur ? ' cur' : '') }, el('div', { class: 'fl-vnum', text: 'v' + v.n }),
        el('div', { class: 'grow' }, el('b', { text: isCur ? t('fl_current') : t('fl_versionN', { n: v.n }) }), el('div', { class: 'muted small', text: `${when(v.ts)} · ${who(v.by)} · ${LC.fmtSize(v.size)}` })),
        F.canPreview(cur.name) ? el('button', { class: 'secondary sm', text: t('fl_open'), onclick: () => (isCur ? F.open(cur) : F.open({ ...cur, size: v.size }, null, { url: F.versionUrl(cur, v.n), version: v.n })) }) : null,
        el('a', { class: 'secondary sm', href: isCur ? LC.fileUrl(cur) : F.versionUrl(cur, v.n), download: cur.name, text: t('download'), 'aria-label': t('download') + ' ' + (isCur ? t('fl_current') : t('fl_versionN', { n: v.n })) }),
        !isCur && d.canEdit ? el('button', { class: 'secondary sm', text: t('fl_restore'), 'aria-label': t('fl_restore') + ' ' + t('fl_versionN', { n: v.n }), onclick: async () => { if (!(await LC.confirm(t('fl_confirmRestore', { n: v.n })))) return; try { await LC.api('/api/files/restore', { id: cur.id, n: v.n }); LC.toast(t('fl_restored', { n: v.n })); draw(); } catch (e) { fail(e); } } }) : null);
      list.replaceChildren(...[row({ n: cur.v, ts: cur.mod, by: cur.modBy, size: cur.size }, true), ...d.versions.map((v) => row(v, false)), !d.versions.length ? el('p', { class: 'muted small', text: t('fl_noVersions') }) : null, d.canEdit ? el('div', { class: 'acts' }, el('button', { class: 'secondary withicon', onclick: () => F.newVersion(cur).then(draw) }, LC.icon('arrow_upload'), el('span', { text: t('fl_newVersion') }))) : null].filter(Boolean));
    };
    draw();
  };
  const linkUrl = (l) => (l.scope === 'anyone' ? `${location.origin}/api/share?k=${l.k}` : `${location.origin}/#fl=${l.k}`);
  const expLabel = (exp) => t('fl_expires', { when: exp - Date.now() < 86400000 ? LC.fmtTime(exp) : LC.fmtDateTime(exp) });
  F.linkRow = (l, after) => el('div', { class: 'fl-linkrow' }, LC.icon(l.scope === 'anyone' ? 'globe' : 'people'), el('div', { class: 'grow' }, el('b', { text: l.name || '' }), el('div', { class: 'muted small', text: `${l.scope === 'anyone' ? t('fl_anyoneLink') : t('fl_membersLink')} · ${expLabel(l.exp)}` })),
    el('button', { class: 'secondary sm', text: t('copy'), 'aria-label': t('fl_copyLink') + ' ' + (l.name || ''), onclick: async () => { LC.toast((await LC.copy(linkUrl(l))) ? t('copied') : t('copyFailed'), { ms: 1500 }); } }),
    LC.ibtn('link_dismiss', t('fl_revoke'), async () => { try { await LC.api('/api/files/link/revoke', { id: l.id }); LC.toast(t('fl_revoked'), { ms: 2000 }); if (after) after(); } catch (e) { fail(e); } }));
  F.share = (f) => {
    let scope = 'members', ttl = 86400; const owner = f.ownerKnown !== undefined ? !!f.ownerKnown : canEdit(f);
    const listBox = el('div', { class: 'fl-links' }), until = el('input', { type: 'datetime-local', class: 'hidden', 'aria-label': t('fl_until') });
    const draw = async () => { try { const { links } = await LC.api('/api/files/links?file=' + f.id); listBox.replaceChildren(el('h3', { text: t('fl_activeLinks') }), ...(links.length ? links.map((l) => F.linkRow(l, draw)) : [el('p', { class: 'muted small', text: t('fl_noLinks') })])); } catch (e) { listBox.replaceChildren(el('p', { class: 'err', text: e.message })); } };
    const radio = (name, v, label, hint, on, fn, disabled) => el('label', { class: 'fl-radio' + (disabled ? ' off' : '') }, el('input', { type: 'radio', name, value: v, checked: on, disabled, onchange: fn }), el('span', {}, label, hint ? el('small', { class: 'muted', text: ' — ' + hint }) : null));
    const ttls = [[3600, 'fl_1h'], [86400, 'fl_1d'], [604800, 'fl_7d'], [0, 'fl_custom']];
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('link'), ' ' + t('fl_linkTitle')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted small', text: f.name }),
      el('fieldset', { class: 'fl-fs' }, el('legend', { text: t('fl_linkWho') }), radio('flwho', 'members', t('fl_linkMembers'), '', true, () => { scope = 'members'; }), radio('flwho', 'anyone', t('fl_linkAnyone'), t('fl_linkAnyoneHint'), false, () => { scope = 'anyone'; }, !owner)),
      el('fieldset', { class: 'fl-fs' }, el('legend', { text: t('fl_linkFor') }), el('div', { class: 'fl-ttls' }, ...ttls.map(([v, k]) => radio('flttl', String(v), t(k), '', v === 86400, () => { ttl = v; until.classList.toggle('hidden', v !== 0); if (!v) until.focus(); }))), until),
      el('div', { class: 'acts' }, el('button', { class: 'primary withicon', onclick: async () => {
        let secs = ttl; if (!secs) { const at = new Date(until.value).getTime(); if (!at || at < Date.now() + 300000) return LC.toast(t('pickFuture')); secs = Math.round((at - Date.now()) / 1000); }
        try { const { link } = await LC.api('/api/files/link', { id: f.id, ttl: secs, scope }); await LC.copy(linkUrl(link)); LC.toast(t('fl_linkReady'), { ms: 2500 }); LC.sr(t('fl_linkReady')); draw(); } catch (e) { fail(e); }
      } }, LC.icon('link_add'), el('span', { text: t('fl_create') }))), listBox], { label: t('fl_linkTitle') });
    draw();
  };
  F.details = async (id) => {
    const box = el('div', { class: 'fl-detailsmodal' }, el('p', { class: 'muted', text: t('loading') }));
    LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('info'), ' ' + t('fl_details')), LC.ibtn('dismiss', t('close'), LC.closeModal)), box], { label: t('fl_details') });
    try { box.replaceChildren(detailsNode(await LC.api('/api/files/info?id=' + id), { modal: true })); } catch (e) { box.replaceChildren(el('p', { class: 'err', text: e.message })); }
  };
  function detailsNode(d, o = {}) {
    const f = d.file, row = (label, ...val) => el('div', { class: 'fl-drow' }, el('dt', { text: label }), el('dd', {}, ...val));
    const goto = (p) => { if (o.modal) LC.closeModal(); F.openTab(p.chan, p.folder); };
    return el('div', { class: 'fl-details-in' },
      LC.isImage(f.name) ? el('img', { class: 'fl-dthumb', src: LC.fileUrl(f, true), alt: '' }) : el('div', { class: 'fl-dicon' }, F.fileIcon(f.name, 'big')),
      el('h3', { class: 'fl-dname', text: f.name }), d.hold ? el('p', { class: 'notice fl-holdnote' }, LC.icon('lock_closed'), el('span', { text: t('fl_hold') })) : null,
      el('dl', { class: 'fl-dl' }, row(t('fl_type'), t('fl_t_' + f.kind) + (ext(f.name) ? ' (.' + ext(f.name) + ')' : '')), row(t('fl_size'), LC.fmtSize(f.size)), row(t('fl_uploadedBy'), who(f.by)), row(t('fl_uploaded2'), when(f.ts)),
        f.v > 1 ? row(t('fl_modified'), `${when(f.mod)} · ${who(f.modBy)}`) : null,
        row(t('fl_sharedIn'), ...d.places.map((p) => el('div', {}, el('button', { class: 'link', text: [p.title, ...p.path].join(' › '), onclick: () => goto(p) }), p.msg ? el('button', { class: 'link fl-sic', text: '(' + t('fl_showInChat') + ')', onclick: () => { if (o.modal) LC.closeModal(); LC.jumpToMessage(p.chan, p.msg); } }) : null))),
        row(t('fl_version'), t('fl_versionN', { n: f.v }), ' ', el('button', { class: 'link', text: t('fl_versions'), onclick: () => F.versions(f) })),
        row(t('fl_activeLinks'), String(d.links.length), ' ', el('button', { class: 'link', text: t('fl_copyLink'), onclick: () => F.share({ ...f, ownerKnown: d.canEdit }) }))),
      el('div', { class: 'fl-dacts' }, F.canPreview(f.name) ? el('button', { class: 'secondary sm withicon', onclick: () => F.open(f) }, LC.icon('open'), el('span', { text: t('fl_open') })) : null,
        el('a', { class: 'secondary sm withicon', href: LC.fileUrl(f), download: f.name }, LC.icon('arrow_download'), el('span', { text: t('download') })),
        d.canEdit && !d.hold ? el('button', { class: 'secondary sm withicon', onclick: () => F.rename(f).then(() => o.modal && F.details(f.id)) }, LC.icon('rename'), el('span', { text: t('fl_rename') })) : null,
        d.canEdit && !d.hold ? el('button', { class: 'secondary sm withicon', onclick: () => F.newVersion(f) }, LC.icon('arrow_upload'), el('span', { text: t('fl_newVersion') })) : null,
        d.canEdit && !d.hold ? el('button', { class: 'secondary sm danger withicon', onclick: async () => { if (await F.remove(f) && o.modal) LC.closeModal(); } }, LC.icon('delete'), el('span', { text: t('fl_delete') })) : null));
  }
  // the "…" menu of a file (messages, the Files tab, the Files app)
  F.menu = (anchor, f, o = {}) => {
    const mine = o.canEdit !== undefined ? o.canEdit : canEdit(f);
    LC.menu(anchor, [
      F.canPreview(f.name) ? { icon: 'open', label: t('fl_open'), fn: () => F.open(f, o.list) } : null,
      { icon: 'arrow_download', label: t('download'), fn: () => F.download(f) },
      { icon: 'link', label: t('fl_copyLink'), fn: () => F.share({ ...f, ownerKnown: mine }) },
      { icon: 'info', label: t('fl_details'), fn: () => (o.onDetails ? o.onDetails(f) : F.details(f.id)) },
      o.chan && o.msg !== undefined && o.msg ? { icon: 'chat', label: t('fl_showInChat'), fn: () => LC.jumpToMessage(o.chan, o.msg) } : null,
      o.inMessage ? { icon: 'folder_open', label: t('fl_openInTab'), fn: () => F.openTab(o.chan, null) } : null,
      'sep',
      o.onMove ? { icon: 'folder_arrow_right', label: t('fl_moveTo'), fn: () => o.onMove(f) } : null,
      mine ? { icon: 'rename', label: t('fl_rename'), fn: () => F.rename(f) } : null,
      mine ? { icon: 'arrow_upload', label: t('fl_newVersion'), fn: () => F.newVersion(f) } : null,
      { icon: 'history', label: t('fl_versions'), fn: () => F.versions(f) },
      mine ? 'sep' : null, mine ? { icon: 'delete', label: t('fl_delete'), danger: true, fn: () => F.remove(f) } : null,
    ]);
  };
  F.openTab = async (chan, folder) => { pendingFolder = { chan, folder: folder || '' }; await LC.openChat(chan); LC.setTab('files'); };

  // ---------- files in messages: Teams-like file card + "File deleted" placeholders + message menu ----------
  // render.js asks LC.fileCard(f, m) first (one-line hook); null keeps its own rendering (pictures, video, audio)
  LC.fileCard = (f, m) => {
    if (LC.isImage(f.name) || isMedia(f.name)) return null; // render.js shows pictures, video and audio itself
    const mine = !!m && !m.fwd && m.from === S.me.id, full = { ...f, by: mine ? S.me.id : undefined };
    return el('div', { class: 'file fl-card', 'data-file': f.id },
      el('span', { class: 'fi ' + (isPdf(f.name) ? 'pdf' : kindOf(f.name) === 'archive' ? 'zip' : 'doc') + ' fl-tone-' + F.tone(f.name), 'aria-hidden': 'true' }, LC.icon(F.iconOf(f.name))),
      el('span', { class: 'fn' }, el('button', { class: 'fl-fname', text: f.name, title: f.name, onclick: () => (F.canPreview(f.name) ? F.open(f) : F.details(f.id)) }), el('small', { text: LC.fmtSize(f.size || 0) + (f.v > 1 ? ' · ' + t('fl_versionN', { n: f.v }) : '') })),
      F.canPreview(f.name) ? el('button', { class: 'secondary sm', text: t('view'), 'aria-label': t('view') + ' ' + f.name, onclick: () => F.open(f) }) : null,
      el('a', { class: 'secondary sm', href: LC.fileUrl(f), download: f.name, text: t('download'), 'aria-label': t('download') + ' ' + f.name }),
      LC.ibtn('more_horizontal', t('fl_moreFor', { name: f.name }), (e) => F.menu(e.currentTarget, full, { canEdit: mine || LC.isAdmin(), chan: m && m.chan, inMessage: true }), { menu: true }));
  };
  LC.ext.msgParts.push((m) => (m.filesDeleted && m.filesDeleted.length ? el('div', { class: 'att fl-gone' }, m.filesDeleted.map((g) => el('div', { class: 'file fl-deleted', role: 'note' }, LC.icon('document_dismiss'), el('span', { class: 'fn' }, el('span', { text: t('fl_fileDeleted') }), el('small', { text: g.name }))))) : null));
  LC.ext.msgMenu.push((m) => (m.files && m.files.length && !m.deleted ? m.files.slice(0, 5).map((f) => ({ icon: 'info', label: t('fl_detailsOf', { name: f.name.length > 28 ? f.name.slice(0, 26) + '…' : f.name }), fn: () => F.details(f.id) })) : []));

  // ---------- uploads into a chat's Files tab ----------
  async function uploadTo(chan, folder, list, onState) {
    list = [...list].filter(Boolean); if (!list.length) return;
    const max = S.settings.maxUploadMB; const ok = list.filter((f) => { if (max && f.size > max * 1048576) { LC.toast(t('fl_tooBig', { name: f.name, n: max })); return false; } return true; }).slice(0, 50);
    if (!ok.length) return;
    const total = ok.reduce((a, f) => a + f.size, 0) || 1, done = new Map(), ids = [];
    const report = () => onState && onState(t('fl_uploading', { n: ok.length, p: Math.round(([...done.values()].reduce((a, b) => a + b, 0) / total) * 100) }));
    report();
    for (const file of ok) {
      try { const up = await LC.upload(file, file.name, (p) => { done.set(file, p * file.size); report(); }).promise; done.set(file, file.size); ids.push(up.id); report(); } catch (e) { fail(e); }
    }
    if (ids.length) { try { await LC.api('/api/files/add', { chan, folder: folder || '', ids }); LC.toast(t('fl_uploaded', { n: ids.length }), { ms: 2500 }); LC.sr(t('fl_uploaded', { n: ids.length })); } catch (e) { fail(e); } }
    if (onState) onState(null);
  }

  // ---------- the Files tab of a chat ----------
  let pendingFolder = null; const tabState = new Map(); // chan -> { folder }
  const SORTS = { name: (a, b) => a.name.localeCompare(b.name), mod: (a, b) => (a.mod || a.ts) - (b.mod || b.ts), size: (a, b) => (a.size || 0) - (b.size || 0) };
  function renderTab(host, chan) {
    const st = tabState.get(chan) || { folder: '' }; tabState.set(chan, st);
    if (pendingFolder && pendingFolder.chan === chan) { st.folder = pendingFolder.folder || ''; pendingFolder = null; }
    let data = null, q = '', type = 'all', sel = new Set(), sort = LC.ls.get('fl_sort', { key: 'mod', dir: -1 }), view = LC.ls.get('fl_view', 'list'), showDetails = !!LC.ls.get('fl_details', false), busyMsg = null, alive = true;
    const root = el('div', { class: 'fl-files', 'data-chan': chan }), fileIn = el('input', { type: 'file', multiple: true, class: 'hidden', 'aria-hidden': 'true', tabindex: '-1', onchange: (e) => { const l = [...e.target.files]; e.target.value = ''; up(l, st.folder); } });
    const up = (list, folder) => uploadTo(chan, folder, list, (msg) => { busyMsg = msg; drawStatus(); });
    const status = el('div', { class: 'fl-progress hidden', role: 'status' }), bar = el('div', { class: 'fl-bar', role: 'toolbar', 'aria-label': t('tabFiles') }), crumbs = el('nav', { class: 'fl-crumbs', 'aria-label': t('fl_path') }), listBox = el('div', { class: 'fl-listwrap' }), side = el('aside', { class: 'fl-details', 'aria-label': t('fl_details') });
    root.append(bar, crumbs, status, el('div', { class: 'fl-main' }, listBox, side), fileIn);
    host.replaceChildren(root);
    const drawStatus = () => { status.classList.toggle('hidden', !busyMsg); status.replaceChildren(busyMsg ? el('span', { class: 'fl-spin', 'aria-hidden': 'true' }) : '', busyMsg || ''); };
    const folders = () => (data ? data.folders : []), byId = (id) => folders().find((f) => f.id === id);
    const pathOf = (fid) => { const out = []; for (let f = fid, i = 0; f && i < 20; i++) { const x = byId(f); if (!x) break; out.unshift(x); f = x.parent; } return out; };
    const isInside = (fid, anc) => { for (let f = fid, i = 0; f && i < 20; i++) { if (f === anc) return true; const x = byId(f); f = x ? x.parent : ''; } return false; };
    const countIn = (fid) => data.files.filter((f) => f.folder === fid).length + folders().filter((f) => f.parent === fid).length;
    const key = (it) => (it.isFolder ? 'd:' : 'f:') + it.id;
    const items = () => {
      if (!data) return [];
      const filt = (f) => (type === 'all' || f.kind === type) && (!q || f.name.toLowerCase().includes(q));
      const dir = sort.dir, cmp = SORTS[sort.key] || SORTS.mod, flat = !!q || type !== 'all';
      const fs = flat ? folders().filter((f) => type === 'all' && f.name.toLowerCase().includes(q)) : folders().filter((f) => (f.parent || '') === st.folder);
      const files = data.files.filter((f) => (flat || f.folder === st.folder) && filt(f));
      return [...fs.map((f) => ({ ...f, isFolder: true })).sort((a, b) => a.name.localeCompare(b.name) * (sort.key === 'name' ? dir : 1)), ...files.sort((a, b) => cmp(a, b) * dir)];
    };
    async function load() {
      try { data = await LC.api('/api/files/list?chan=' + encodeURIComponent(chan)); } catch (e) { if (alive) listBox.replaceChildren(el('p', { class: 'err pad', text: e.message })); return; }
      if (!root.isConnected) { alive = false; return; }
      if (st.folder && !byId(st.folder)) st.folder = '';
      const live = new Set([...data.files.map((f) => 'f:' + f.id), ...data.folders.map((f) => 'd:' + f.id)]); sel = new Set([...sel].filter((k) => live.has(k)));
      draw();
    }
    const reload = LC.debounce(() => { if (root.isConnected) load(); else alive = false; }, 250);
    const selected = () => items().filter((it) => sel.has(key(it))), selFiles = () => selected().filter((x) => !x.isFolder), selFolders = () => selected().filter((x) => x.isFolder);
    const go = (fid) => { st.folder = fid || ''; sel.clear(); q = ''; draw(); };
    function drawBar() {
      const can = data && data.canWrite, n = sel.size, onlyFiles = selFiles(), one = selected().length === 1 ? selected()[0] : null;
      const b = (icon, label, fn, o = {}) => el('button', { class: 'fl-tb' + (o.primary ? ' primary' : ''), type: 'button', onclick: fn, disabled: o.disabled, 'aria-haspopup': o.menu ? 'menu' : null }, LC.icon(icon), el('span', { text: label }));
      const typeSel = el('select', { class: 'fl-type', 'aria-label': t('fl_filterType'), onchange: (e) => { type = e.target.value; draw(); } }, el('option', { value: 'all', text: t('fl_allTypes') }), ...TYPES.map((k) => el('option', { value: k, text: t('fl_t_' + k) }))); typeSel.value = type;
      const search = el('input', { type: 'search', class: 'fl-search', placeholder: t('fl_searchFiles'), 'aria-label': t('fl_searchHere'), value: q, oninput: LC.debounce((e) => { q = e.target.value.trim().toLowerCase(); drawList(); drawCrumbs(); }, 200) });
      bar.replaceChildren(...[
        ...(n ? [
          el('span', { class: 'fl-selcount', text: t('fl_selected', { n }) }), LC.ibtn('dismiss', t('fl_clearSel'), () => { sel.clear(); draw(); }),
          one && !one.isFolder ? b('open', t('fl_open'), () => F.open(one, data.files)) : null,
          b('arrow_download', onlyFiles.length === 1 && !selFolders().length ? t('fl_download') : t('fl_downloadZip'), () => dl()),
          one && !one.isFolder ? b('link', t('fl_copyLink'), () => F.share({ ...one, ownerKnown: canEdit(one) })) : null,
          can ? b('folder_arrow_right', t('fl_moveTo'), () => moveDialog(selFiles(), selFolders())) : null,
          one && (one.isFolder ? can && (one.by === S.me.id || LC.isAdmin()) : canEdit(one)) ? b('rename', t('fl_rename'), () => (one.isFolder ? renameFolder(one) : F.rename(one))) : null,
          (onlyFiles.length && onlyFiles.every(canEdit) && !selFolders().length) || (one && one.isFolder && can && (one.by === S.me.id || LC.isAdmin())) ? b('delete', t('fl_delete'), () => (one && one.isFolder ? deleteFolder(one) : F.remove(onlyFiles).then((ok) => { if (ok) sel.clear(); }))) : null,
        ] : [
          can ? b('folder_add', t('fl_newFolder'), () => newFolder()) : null,
          can ? b('arrow_upload', t('fl_upload'), () => fileIn.click(), { primary: true }) : null,
          b('arrow_download', t('fl_downloadAll'), () => download(F.zipUrl({ chan, folder: st.folder })), { disabled: !data || !data.files.length }),
        ]),
        el('span', { class: 'grow' }), typeSel, search,
        el('div', { class: 'fl-viewsw', role: 'group', 'aria-label': t('fl_listView') + ' / ' + t('fl_gridView') }, LC.ibtn('text_bullet_list', t('fl_listView'), () => { view = 'list'; LC.ls.set('fl_view', view); draw(); }, { pressed: view === 'list' }), LC.ibtn('grid', t('fl_gridView'), () => { view = 'grid'; LC.ls.set('fl_view', view); draw(); }, { pressed: view === 'grid' })),
        LC.ibtn('info', t('fl_details'), () => { showDetails = !showDetails; LC.ls.set('fl_details', showDetails); if (matchMedia('(max-width: 760px)').matches) { showDetails = false; const it = selected()[0]; if (it && !it.isFolder) F.details(it.id); return; } draw(); }, { pressed: showDetails })].filter(Boolean));
    }
    function drawCrumbs() {
      const parts = [{ id: '', name: t('fl_root') }, ...pathOf(st.folder)];
      crumbs.replaceChildren(...[el('ol', {}, parts.map((p, i) => el('li', {}, i === parts.length - 1 && !q ? el('span', { class: 'fl-crumb cur', 'aria-current': 'location', text: p.name }) : dropTarget(el('button', { class: 'fl-crumb', text: p.name, onclick: () => go(p.id) }), p.id)))), q ? el('span', { class: 'muted small fl-crumbq', text: '“' + q + '”' }) : null].filter(Boolean));
    }
    const dl = () => { const fs = selFiles(), ds = selFolders(); if (fs.length === 1 && !ds.length) return F.download(fs[0]); download(F.zipUrl({ chan, ids: fs.map((f) => f.id).join(','), folders: ds.map((f) => f.id).join(',') })); };
    // drag and drop: rows onto folders / crumbs move; files from the computer upload into the folder they are dropped on
    let dragging = null;
    function dropTarget(node, fid) {
      node.addEventListener('dragover', (e) => { const dt = e.dataTransfer; if (!dt) return; const types = [...(dt.types || [])]; if ((dragging && data.canWrite) || (types.includes('Files') && data.canWrite)) { e.preventDefault(); node.classList.add('fl-over'); } });
      node.addEventListener('dragleave', () => node.classList.remove('fl-over'));
      node.addEventListener('drop', (e) => {
        node.classList.remove('fl-over'); if (!data.canWrite) return;
        if (dragging) { e.preventDefault(); e.stopPropagation(); const d = dragging; dragging = null; root.classList.remove('fl-dropping'); doMove(d.files, d.folders, fid); }
        else if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) { e.preventDefault(); e.stopPropagation(); root.classList.remove('fl-dropping'); up([...e.dataTransfer.files], fid); }
      });
      return node;
    }
    function dragSource(node, it) {
      if (!data.canWrite || matchMedia('(pointer:coarse)').matches) return node;
      node.draggable = true;
      node.addEventListener('dragstart', (e) => {
        if (!sel.has(key(it))) { sel = new Set([key(it)]); }
        const its = selected(); dragging = { files: its.filter((x) => !x.isFolder).map((x) => x.id), folders: its.filter((x) => x.isFolder).map((x) => x.id) };
        e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', its.map((x) => x.name).join(', ')); } catch {}
      });
      node.addEventListener('dragend', () => { dragging = null; listBox.querySelectorAll('.fl-over').forEach((x) => x.classList.remove('fl-over')); });
      return node;
    }
    async function doMove(fileIds, folderIds, to) {
      if (folderIds.some((id) => id === to || isInside(to, id))) return LC.toast(t('fl_cantMoveHere'));
      try { await LC.api('/api/files/move', { chan, files: fileIds, folders: folderIds, to: to || '' }); sel.clear(); LC.toast(t('fl_moved'), { ms: 1500 }); LC.sr(t('fl_moved')); } catch (e) { fail(e); }
    }
    function moveDialog(fs, ds) {
      if (!fs.length && !ds.length) return;
      let target = st.folder; const banned = (id) => ds.some((d) => id === d.id || isInside(id, d.id));
      const tree = el('div', { class: 'fl-tree', role: 'radiogroup', 'aria-label': t('fl_moveTo') });
      const drawTree = () => {
        const rows = []; const walk = (parent, depth) => { for (const f of folders().filter((x) => (x.parent || '') === parent).sort((a, b) => a.name.localeCompare(b.name))) { rows.push([f, depth]); walk(f.id, depth + 1); } };
        walk('', 1);
        tree.replaceChildren(...[[{ id: '', name: t('fl_root') }, 0], ...rows].map(([f, depth]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(target === f.id), class: 'fl-treerow' + (target === f.id ? ' on' : ''), style: { paddingLeft: 8 + depth * 18 + 'px' }, disabled: banned(f.id), onclick: () => { target = f.id; drawTree(); } }, LC.icon(f.id ? 'folder' : 'folder_open'), el('span', { text: f.name }))));
      };
      drawTree();
      LC.modal([el('div', { class: 'row-between' }, el('h2', {}, LC.icon('folder_arrow_right'), ' ' + t('fl_moveTo')), LC.ibtn('dismiss', t('close'), LC.closeModal)), el('p', { class: 'muted small', text: [...ds, ...fs].map((x) => x.name).join(', ') }), tree,
        el('div', { class: 'acts' }, el('button', { class: 'secondary', text: t('cancel'), onclick: LC.closeModal }), el('button', { class: 'primary', text: t('fl_moveHere'), onclick: async () => { LC.closeModal(); await doMove(fs.map((f) => f.id), ds.map((d) => d.id), target); } }))], { label: t('fl_moveTo') });
    }
    async function newFolder() {
      const name = await LC.prompt(t('fl_newFolder'), { placeholder: t('fl_folderName'), max: 60, ok: t('create') }); if (!name || !name.trim()) return;
      try { await LC.api('/api/files/folder', { chan, op: 'add', name: name.trim(), parent: st.folder }); } catch (e) { fail(e); }
    }
    async function renameFolder(f) { const name = await LC.prompt(t('fl_renameFolder'), { value: f.name, max: 60, ok: t('fl_rename') }); if (!name || !name.trim() || name.trim() === f.name) return; try { await LC.api('/api/files/folder', { chan, op: 'rename', id: f.id, name: name.trim() }); } catch (e) { fail(e); } }
    async function deleteFolder(f) { if (!(await LC.confirm(t('fl_confirmDeleteFolder', { name: f.name }), { danger: true, ok: t('delete') }))) return; try { await LC.api('/api/files/folder', { chan, op: 'delete', id: f.id }); sel.delete('d:' + f.id); } catch (e) { fail(e); } }
    const folderMenu = (anchor, f) => { const mine = data.canWrite && (f.by === S.me.id || LC.isAdmin()); LC.menu(anchor, [{ icon: 'folder_open', label: t('fl_open'), fn: () => go(f.id) }, { icon: 'arrow_download', label: t('fl_downloadZip'), fn: () => download(F.zipUrl({ chan, folders: f.id })) }, data.canWrite ? { icon: 'folder_arrow_right', label: t('fl_moveTo'), fn: () => moveDialog([], [f]) } : null, mine ? { icon: 'rename', label: t('fl_renameFolder'), fn: () => renameFolder(f) } : null, mine ? 'sep' : null, mine ? { icon: 'delete', label: t('fl_deleteFolder'), danger: true, fn: () => deleteFolder(f) } : null]); };
    const fileMenu = (anchor, f) => F.menu(anchor, f, { list: data.files, chan, msg: f.msg, onMove: data.canWrite ? (x) => moveDialog([x], []) : null, onDetails: (x) => { sel = new Set(['f:' + x.id]); showDetails = true; LC.ls.set('fl_details', true); if (matchMedia('(max-width: 760px)').matches) return F.details(x.id); draw(); } });
    const toggle = (it, on) => { const k = key(it); if (on === undefined ? !sel.has(k) : on) sel.add(k); else sel.delete(k); drawBar(); drawDetails(); listBox.querySelectorAll('[data-key]').forEach((n) => { const s = sel.has(n.dataset.key); n.classList.toggle('sel', s); const cb = n.querySelector('input[type=checkbox]'); if (cb) cb.checked = s; }); const all = listBox.querySelector('.fl-all'); if (all) { const its = items(); all.checked = its.length > 0 && its.every((x) => sel.has(key(x))); all.indeterminate = sel.size > 0 && !all.checked; } };
    const openItem = (it) => (it.isFolder ? go(it.id) : F.open(it, data.files));
    const nameBtn = (it) => el('button', { class: 'fl-name', title: it.name, onclick: (e) => { e.stopPropagation(); openItem(it); } }, it.name);
    const where = (f) => (q || type !== 'all' ? (f.isFolder ? f.parent : f.folder) : null);
    function drawList() {
      const its = items();
      if (!data) return listBox.replaceChildren(el('p', { class: 'muted pad', text: t('loading') }));
      if (!its.length) {
        const empty = el('div', { class: 'fl-empty' }, LC.icon(q || type !== 'all' ? 'search' : 'folder_open', { cls: 'big' }), el('p', { class: 'muted', text: q || type !== 'all' ? t('fl_noMatch') : st.folder ? t('fl_emptyFolder') : t('fl_noFiles') }), data.canWrite && !q ? el('button', { class: 'primary withicon', onclick: () => fileIn.click() }, LC.icon('arrow_upload'), el('span', { text: t('fl_upload') })) : null);
        return listBox.replaceChildren(dropTarget(empty, st.folder));
      }
      if (view === 'grid') {
        return listBox.replaceChildren(el('div', { class: 'filegrid fl-grid' }, its.map((it) => {
          const k = key(it), on = sel.has(k);
          const card = el('div', { class: 'fcard fl-item' + (on ? ' sel' : '') + (it.isFolder ? ' fl-folder' : ''), 'data-key': k, onclick: (e) => { if (!e.target.closest('button,a,input')) toggle(it); } },
            el('input', { type: 'checkbox', class: 'fl-check', checked: on, 'aria-label': t('fl_select', { name: it.name }), onchange: (e) => toggle(it, e.target.checked) }),
            it.isFolder ? el('button', { class: 'thumb ico fl-thumbbtn', 'aria-label': it.name, onclick: () => go(it.id) }, LC.icon('folder', { filled: false })) : LC.isImage(it.name) ? el('button', { class: 'thumb', 'aria-label': it.name, onclick: () => openItem(it) }, el('img', { src: LC.fileUrl(it, true), alt: '', loading: 'lazy' })) : el('button', { class: 'thumb ico fl-thumbbtn', 'aria-label': it.name, onclick: () => openItem(it) }, F.fileIcon(it.name, 'big')),
            el('div', { class: 'fmeta' }, nameBtn(it), el('small', { text: it.isFolder ? (countIn(it.id) === 1 ? t('fl_item1') : t('fl_items', { n: countIn(it.id) })) : `${LC.fmtSize(it.size)} · ${short(it.mod || it.ts)}` }), where(it) !== null && where(it) !== undefined ? el('small', { class: 'fl-where', text: [t('fl_root'), ...pathOf(where(it)).map((x) => x.name)].join(' › ') }) : null),
            LC.ibtn('more_horizontal', t('fl_moreFor', { name: it.name }), (e) => (it.isFolder ? folderMenu(e.currentTarget, it) : fileMenu(e.currentTarget, it)), { menu: true, cls: 'icon fl-more' }));
          dragSource(card, it); if (it.isFolder) dropTarget(card, it.id); return card;
        })));
      }
      const th = (k, label) => { const on = sort.key === k; return el('th', { scope: 'col', class: 'fl-c-' + k, 'aria-sort': on ? (sort.dir > 0 ? 'ascending' : 'descending') : null }, el('button', { class: 'fl-sort', onclick: () => { sort = { key: k, dir: on ? -sort.dir : k === 'name' ? 1 : -1 }; LC.ls.set('fl_sort', sort); drawList(); } }, label, on ? LC.icon(sort.dir > 0 ? 'arrow_sort_up' : 'arrow_sort_down') : null)); };
      const allOn = its.every((x) => sel.has(key(x)));
      const table = el('table', { class: 'fl-table' },
        el('thead', {}, el('tr', {}, el('th', { scope: 'col', class: 'fl-c-check' }, el('input', { type: 'checkbox', class: 'fl-all', checked: allOn, 'aria-label': t('fl_selectAll'), onchange: (e) => { for (const it of its) { if (e.target.checked) sel.add(key(it)); else sel.delete(key(it)); } draw(); } })),
          th('name', t('fl_name')), th('mod', t('fl_modified')), el('th', { scope: 'col', class: 'fl-c-by', text: t('fl_modifiedBy') }), th('size', t('fl_size')), el('th', { scope: 'col', class: 'fl-c-act' }, el('span', { class: 'sr-only', text: t('actions') })))),
        el('tbody', {}, its.map((it) => {
          const k = key(it), on = sel.has(k), loc = where(it);
          const tr = el('tr', { class: 'fl-item' + (on ? ' sel' : '') + (it.isFolder ? ' fl-folder' : ''), 'data-key': k, onclick: (e) => { if (!e.target.closest('button,a,input')) toggle(it); }, ondblclick: (e) => { if (!e.target.closest('button,a,input')) openItem(it); } },
            el('td', { class: 'fl-c-check' }, el('input', { type: 'checkbox', checked: on, 'aria-label': t('fl_select', { name: it.name }), onchange: (e) => toggle(it, e.target.checked) })),
            el('td', { class: 'fl-c-name' }, el('div', { class: 'fl-namecell' }, it.isFolder ? el('span', { class: 'fl-fi fl-tone-folder', 'aria-hidden': 'true' }, LC.icon('folder', { filled: true })) : F.fileIcon(it.name), el('div', { class: 'fl-nm' }, nameBtn(it), loc !== null && loc !== undefined ? el('small', { class: 'fl-where', text: [t('fl_root'), ...pathOf(loc).map((x) => x.name)].join(' › ') }) : null, !it.isFolder && it.v > 1 ? el('small', { class: 'fl-vtag', text: 'v' + it.v }) : null))),
            el('td', { class: 'fl-c-mod', text: short(it.isFolder ? it.ts : it.mod || it.ts), title: when(it.isFolder ? it.ts : it.mod || it.ts) }),
            el('td', { class: 'fl-c-by', text: who(it.isFolder ? it.by : it.modBy || it.by) }),
            el('td', { class: 'fl-c-size', text: it.isFolder ? (countIn(it.id) === 1 ? t('fl_item1') : t('fl_items', { n: countIn(it.id) })) : LC.fmtSize(it.size) }),
            el('td', { class: 'fl-c-act' }, LC.ibtn('more_horizontal', t('fl_moreFor', { name: it.name }), (e) => (it.isFolder ? folderMenu(e.currentTarget, it) : fileMenu(e.currentTarget, it)), { menu: true })));
          dragSource(tr, it); if (it.isFolder) dropTarget(tr, it.id); return tr;
        })));
      const all = table.querySelector('.fl-all'); all.indeterminate = sel.size > 0 && !allOn;
      listBox.replaceChildren(table);
    }
    async function drawDetails() {
      const on = showDetails && !matchMedia('(max-width: 760px)').matches; side.classList.toggle('hidden', !on); root.classList.toggle('with-details', on); if (!on || !data) return;
      const its = selected(), it = its.length === 1 ? its[0] : null, head = el('div', { class: 'row-between fl-dhead' }, el('h3', { text: t('fl_details') }), LC.ibtn('dismiss', t('close'), () => { showDetails = false; LC.ls.set('fl_details', false); draw(); }));
      if (it && !it.isFolder) {
        side.replaceChildren(head, el('p', { class: 'muted small', text: t('loading') }));
        try { const d = await LC.api('/api/files/info?id=' + it.id); if (selected()[0] === it || (selected()[0] && selected()[0].id === it.id)) side.replaceChildren(head, detailsNode(d)); } catch (e) { side.replaceChildren(head, el('p', { class: 'err', text: e.message })); }
        return;
      }
      const f = it || (st.folder ? byId(st.folder) : null), n = f ? countIn(f.id) : data.files.filter((x) => !x.folder).length + folders().filter((x) => !x.parent).length;
      side.replaceChildren(head, el('div', { class: 'fl-details-in' }, el('div', { class: 'fl-dicon' }, el('span', { class: 'fl-fi fl-tone-folder big', 'aria-hidden': 'true' }, LC.icon('folder', { filled: true }))), el('h3', { class: 'fl-dname', text: f ? f.name : t('fl_root') }),
        el('dl', { class: 'fl-dl' }, el('div', { class: 'fl-drow' }, el('dt', { text: t('fl_folder') }), el('dd', { text: [LC.chanInfo(chan).title, ...pathOf(f ? f.id : '').map((x) => x.name)].join(' › ') })), el('div', { class: 'fl-drow' }, el('dt', { text: t('fl_size') }), el('dd', { text: n === 1 ? t('fl_item1') : t('fl_items', { n }) })),
          f ? el('div', { class: 'fl-drow' }, el('dt', { text: t('fl_createdBy') }), el('dd', { text: who(f.by) })) : null, f ? el('div', { class: 'fl-drow' }, el('dt', { text: t('fl_created') }), el('dd', { text: when(f.ts) })) : null)));
    }
    function draw() { if (!root.isConnected && data) { alive = false; return; } drawBar(); drawCrumbs(); drawList(); drawDetails(); drawStatus(); }
    // dropping files from the computer anywhere on the tab uploads them into the open folder
    root.addEventListener('dragover', (e) => { if (!dragging && e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files') && data && data.canWrite) { e.preventDefault(); root.classList.add('fl-dropping'); } });
    root.addEventListener('dragleave', (e) => { if (!root.contains(e.relatedTarget)) root.classList.remove('fl-dropping'); });
    root.addEventListener('drop', (e) => { root.classList.remove('fl-dropping'); if (!dragging && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length && data && data.canWrite) { e.preventDefault(); up([...e.dataTransfer.files], st.folder); } });
    root.addEventListener('keydown', (e) => { if (e.key === 'Delete' && sel.size && !e.target.closest('input')) { const fs = selFiles(); if (fs.length && fs.every(canEdit) && !selFolders().length) F.remove(fs); } else if (e.key === 'Backspace' && st.folder && !e.target.closest('input,textarea')) { e.preventDefault(); go((byId(st.folder) || {}).parent || ''); } });
    root._reload = reload; draw(); load();
    return root;
  }
  LC.ext.tabs.push({ key: 'files', icon: 'folder', label: () => t('tabFiles'), desc: () => t('fl_descTab'), order: 10, render: (host, chan) => { renderTab(host, chan); } });
  const tabRoot = () => { const r = $('#tabView .fl-files'); return r && S.tab === 'files' && !S.app && r.dataset.chan === S.chan ? r : null; };
  const refreshTab = (chan) => { const r = tabRoot(); if (r && (!chan || r.dataset.chan === chan)) r._reload(); };
  LC.on('fl_files', (e) => { refreshTab(e.chan); refreshApp(); });
  LC.on('message', (m) => { if (m.files && m.files.length) { refreshTab(m.chan); refreshApp(); } });
  LC.on('update', (m) => { if (m.chan === S.chan && (m.files || m.filesDeleted || m.deleted)) refreshTab(m.chan); });
  LC.on('purge', (e) => refreshTab(e.chan));

  // ---------- the Files app (app bar): every file you can see ----------
  const AS = Object.assign({ view: 'recent', chan: '', type: 'all', q: '', sort: 'date', dir: 'desc', layout: 'list' }, LC.ls.get('fl_app', {}));
  const saveAS = () => LC.ls.set('fl_app', { view: AS.view, chan: AS.chan, type: AS.type, sort: AS.sort, dir: AS.dir, layout: AS.layout });
  let appHost = null, appSel = new Set(), appData = null;
  const refreshApp = LC.debounce(() => { if (S.app === 'files' && appHost && appHost.isConnected) loadApp(); }, 300);
  function renderAppNav(nav) {
    const item = (view, icon, label, chan) => { const on = AS.view === view && (!chan || AS.chan === chan); return el('button', { class: 'fl-navitem' + (on ? ' on' : ''), 'aria-current': on ? 'page' : null, onclick: () => { AS.view = view; AS.chan = chan || ''; appSel.clear(); saveAS(); LC.renderNav(); if (S.app !== 'files') LC.openApp('files'); else { drawAppHead(); loadApp(); } LC.menuToggle(false); } }, chan ? LC.chatLead(chan, 'sm') : LC.icon(icon, { filled: on }), el('span', { class: 'name', text: label })); };
    const ce = LC.chatEntries(), withHistory = [...ce.chans.filter((e) => !e.team || (S.last && S.last[e.id])).map((e) => e.id), ...(ce.self && S.last[ce.self.id] ? [ce.self.id] : []), ...ce.people.filter((e) => S.last[e.id]).map((e) => e.id)];
    nav.replaceChildren(el('div', { class: 'fl-nav' }, item('recent', 'clock', t('fl_recent')), item('mine', 'person', t('fl_mine')), item('links', 'link', t('fl_myLinks')),
      el('div', { class: 'sec' }, el('span', { class: 'sectitle', text: t('fl_byChat') })), ...withHistory.map((id) => item('chat', '', LC.chanInfo(id).title, id))));
  }
  const viewTitle = () => (AS.view === 'mine' ? t('fl_mine') : AS.view === 'links' ? t('fl_myLinks') : AS.view === 'chat' && AS.chan ? LC.chanInfo(AS.chan).title : t('fl_recent'));
  function renderApp(host) {
    appHost = el('div', { class: 'fl-app' }); host.replaceChildren(appHost); appSel.clear();
    appHost.append(el('div', { class: 'fl-apphead' }), el('div', { class: 'fl-appbody' }, el('p', { class: 'muted pad', text: t('loading') })));
    drawAppHead(); loadApp();
  }
  function drawAppHead() {
    if (!appHost) return; const head = appHost.querySelector('.fl-apphead'); $('#topic') && $('#topic').replaceChildren(viewTitle());
    if (AS.view === 'links') return head.replaceChildren(el('h2', { class: 'fl-apptitle', text: viewTitle() }));
    const chips = el('div', { class: 'fl-chips', role: 'group', 'aria-label': t('fl_filterType') }, ['all', ...TYPES, 'recording'].map((k) => el('button', { class: 'fl-chip' + (AS.type === k ? ' on' : ''), 'aria-pressed': String(AS.type === k), text: k === 'all' ? t('fl_allTypes') : t('fl_t_' + k), onclick: () => { AS.type = k; saveAS(); drawAppHead(); loadApp(); } })));
    const sortSel = el('select', { 'aria-label': t('fl_sortBy'), onchange: (e) => { const [s, d] = e.target.value.split(':'); AS.sort = s; AS.dir = d; saveAS(); loadApp(); } }, [['date:desc', t('fl_sortDate') + ' ↓'], ['date:asc', t('fl_sortDate') + ' ↑'], ['name:asc', t('fl_sortName') + ' A–Z'], ['name:desc', t('fl_sortName') + ' Z–A'], ['size:desc', t('fl_sortSize') + ' ↓'], ['size:asc', t('fl_sortSize') + ' ↑']].map(([v, l]) => el('option', { value: v, text: l }))); sortSel.value = AS.sort + ':' + AS.dir;
    const search = el('input', { type: 'search', class: 'fl-search', placeholder: t('fl_searchFiles'), 'aria-label': t('fl_searchFiles'), value: AS.q, oninput: LC.debounce((e) => { AS.q = e.target.value.trim(); loadApp(); }, 250) });
    const inside = LC.openSearch ? el('button', { class: 'fl-tb', title: t('fl_insideHint'), onclick: () => LC.openSearch({ q: search.value.trim(), tab: 'files', chan: AS.view === 'chat' ? AS.chan : '' }) }, LC.icon('search'), el('span', { text: t('fl_inside') })) : null;
    head.replaceChildren(el('div', { class: 'fl-apptop' }, el('h2', { class: 'fl-apptitle', text: viewTitle() }), el('span', { class: 'grow' }), search, inside), el('div', { class: 'fl-apptop' }, chips, el('span', { class: 'grow' }), el('div', { class: 'fl-appsel' }), sortSel,
      el('div', { class: 'fl-viewsw', role: 'group', 'aria-label': t('fl_listView') + ' / ' + t('fl_gridView') }, LC.ibtn('text_bullet_list', t('fl_listView'), () => { AS.layout = 'list'; saveAS(); drawApp(); drawAppHead(); }, { pressed: AS.layout === 'list' }), LC.ibtn('grid', t('fl_gridView'), () => { AS.layout = 'grid'; saveAS(); drawApp(); drawAppHead(); }, { pressed: AS.layout === 'grid' }))));
    drawAppSel();
  }
  function drawAppSel() {
    const box = appHost && appHost.querySelector('.fl-appsel'); if (!box) return; const n = appSel.size;
    box.replaceChildren(...(n ? [el('span', { class: 'fl-selcount', text: t('fl_selected', { n }) }), el('button', { class: 'fl-tb', onclick: () => { const ids = [...appSel]; if (ids.length === 1) { const f = appData.files.find((x) => x.id === ids[0]); if (f) return F.download(f); } download(F.zipUrl({ ids: ids.join(',') })); } }, LC.icon('arrow_download'), el('span', { text: n === 1 ? t('fl_download') : t('fl_downloadZip') })), LC.ibtn('dismiss', t('fl_clearSel'), () => { appSel.clear(); drawApp(); })] : []));
  }
  async function loadApp() {
    if (!appHost) return; const body = appHost.querySelector('.fl-appbody'); if (!body) return;
    try {
      if (AS.view === 'links') { const { links } = await LC.api('/api/files/links'); if (S.app !== 'files') return; appData = { links }; return drawApp(); }
      const p = new URLSearchParams({ view: AS.view === 'chat' ? 'all' : AS.view, sort: AS.sort, dir: AS.dir }); if (AS.view === 'chat' && AS.chan) p.set('chan', AS.chan); if (AS.type !== 'all') p.set('type', AS.type); if (AS.q) p.set('q', AS.q);
      const d = await LC.api('/api/files/all?' + p); if (S.app !== 'files') return; appData = d; const live = new Set(d.files.map((f) => f.id)); appSel = new Set([...appSel].filter((x) => live.has(x))); drawApp();
    } catch (e) { body.replaceChildren(el('p', { class: 'err pad', text: e.message })); }
  }
  function drawApp() {
    const body = appHost && appHost.querySelector('.fl-appbody'); if (!body || !appData) return;
    if (AS.view === 'links') return body.replaceChildren(appData.links.length ? el('div', { class: 'fl-links fl-linkspage' }, appData.links.map((l) => F.linkRow(l, loadApp))) : el('div', { class: 'fl-empty' }, LC.icon('link', { cls: 'big' }), el('p', { class: 'muted', text: t('fl_noLinks') })));
    const files = appData.files; drawAppSel();
    if (!files.length) return body.replaceChildren(el('div', { class: 'fl-empty' }, LC.icon(AS.q || AS.type !== 'all' ? 'search' : 'folder_open', { cls: 'big' }), el('p', { class: 'muted', text: AS.q || AS.type !== 'all' ? t('fl_noMatch') : t('fl_noFiles') })));
    const toggle = (f, on) => { if (on) appSel.add(f.id); else appSel.delete(f.id); drawAppSel(); body.querySelectorAll('[data-id]').forEach((n) => { const s = appSel.has(n.dataset.id); n.classList.toggle('sel', s); const cb = n.querySelector('input'); if (cb) cb.checked = s; }); };
    const loc = (f) => el('button', { class: 'link fl-loc', text: [LC.chanInfo(f.chan).title, ...(f.path || [])].join(' › '), onclick: () => F.openTab(f.chan, f.folder) });
    const menu = (anchor, f) => F.menu(anchor, f, { list: files, chan: f.chan, msg: f.msg });
    const name = (f) => el('button', { class: 'fl-name', title: f.name, onclick: () => F.open(f, files) }, f.name);
    if (AS.layout === 'grid') return body.replaceChildren(el('div', { class: 'filegrid fl-grid' }, files.map((f) => el('div', { class: 'fcard fl-item' + (appSel.has(f.id) ? ' sel' : ''), 'data-id': f.id },
      el('input', { type: 'checkbox', class: 'fl-check', checked: appSel.has(f.id), 'aria-label': t('fl_select', { name: f.name }), onchange: (e) => toggle(f, e.target.checked) }),
      LC.isImage(f.name) ? el('button', { class: 'thumb', 'aria-label': f.name, onclick: () => F.open(f, files) }, el('img', { src: LC.fileUrl(f, true), alt: '', loading: 'lazy' })) : el('button', { class: 'thumb ico fl-thumbbtn', 'aria-label': f.name, onclick: () => F.open(f, files) }, F.fileIcon(f.name, 'big')),
      el('div', { class: 'fmeta' }, name(f), el('small', { text: `${LC.fmtSize(f.size)} · ${short(Math.max(f.mod, f.shared || 0))}` }), loc(f)), LC.ibtn('more_horizontal', t('fl_moreFor', { name: f.name }), (e) => menu(e.currentTarget, f), { menu: true, cls: 'icon fl-more' })))));
    body.replaceChildren(el('table', { class: 'fl-table fl-apptable' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', class: 'fl-c-check' }, el('input', { type: 'checkbox', class: 'fl-all', checked: files.every((f) => appSel.has(f.id)), 'aria-label': t('fl_selectAll'), onchange: (e) => { for (const f of files) { if (e.target.checked) appSel.add(f.id); else appSel.delete(f.id); } drawApp(); } })), el('th', { scope: 'col', class: 'fl-c-name', text: t('fl_name') }), el('th', { scope: 'col', class: 'fl-c-loc', text: t('fl_location') }), el('th', { scope: 'col', class: 'fl-c-mod', text: t('fl_modified') }), el('th', { scope: 'col', class: 'fl-c-by', text: t('fl_sharedBy') }), el('th', { scope: 'col', class: 'fl-c-size', text: t('fl_size') }), el('th', { scope: 'col', class: 'fl-c-act' }, el('span', { class: 'sr-only', text: t('actions') })))),
      el('tbody', {}, files.map((f) => el('tr', { class: 'fl-item' + (appSel.has(f.id) ? ' sel' : ''), 'data-id': f.id },
        el('td', { class: 'fl-c-check' }, el('input', { type: 'checkbox', checked: appSel.has(f.id), 'aria-label': t('fl_select', { name: f.name }), onchange: (e) => toggle(f, e.target.checked) })),
        el('td', { class: 'fl-c-name' }, el('div', { class: 'fl-namecell' }, F.fileIcon(f.name), el('div', { class: 'fl-nm' }, name(f), el('small', { class: 'fl-where fl-onlyphone', text: LC.chanInfo(f.chan).title })))),
        el('td', { class: 'fl-c-loc' }, loc(f)), el('td', { class: 'fl-c-mod', text: short(Math.max(f.mod, f.shared || 0)), title: when(Math.max(f.mod, f.shared || 0)) }), el('td', { class: 'fl-c-by', text: who(f.from || f.by) }), el('td', { class: 'fl-c-size', text: LC.fmtSize(f.size) }),
        el('td', { class: 'fl-c-act' }, LC.ibtn('more_horizontal', t('fl_moreFor', { name: f.name }), (e) => menu(e.currentTarget, f), { menu: true })))))));
  }
  LC.ext.panes.files = { icon: 'folder', label: () => t('fl_appFiles'), title: () => t('fl_appFiles'), subtitle: () => viewTitle(), order: 70, render: renderAppNav, main: renderApp };

  // ---------- links opened inside the app: #fl=<secret> ----------
  async function openLinkHash() {
    const m = /[#&]fl=([a-f0-9]{32})/.exec(location.hash); if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    try { const d = await LC.api('/api/files/link/open?k=' + m[1]); F.open(d.file); } catch (e) { LC.toast(t('fl_linkGone')); }
  }
  LC.on('init', () => setTimeout(openLinkHash, 300));
  window.addEventListener('hashchange', () => { if (S.me) openLinkHash(); });
  LC.on('fl_links', () => { if (S.app === 'files' && AS.view === 'links') loadApp(); });
})();
