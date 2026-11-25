'use strict';
// Rendering: text (markdown-like formatting, mentions, custom emoji, coloured code), message bubbles and their widgets.
// Formatting the composer toolbar writes (chatux area, docs/features-chatux.md):
//   **bold** *italic* __underline__ ~~strike~~ ==highlight== `code` {color:red}text{/color} {size:large}text{/size} [text](https://link)
//   # Heading 1 … ### Heading 3, - bullets / 1. numbers (indent with spaces to nest), - [ ] checklist, > quote, --- divider,
//   | a | b | tables with a |---|---| line, ```js fenced code (coloured, with Copy)
(() => {
  const LC = window.LC, { el, S } = LC, t = (k, v) => LC.t(k, v);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  LC.addStrings('en', {
    cx_seeMore: 'See more', cx_seeLess: 'See less', cx_copyCode: 'Copy code', cx_codeCopied: 'Code copied', cx_important: 'IMPORTANT!', cx_urgent: 'URGENT!',
    cx_repliesFrom: '{n} replies from {names}', cx_oneReplyFrom: '1 reply from {names}', cx_newReplies: '{n} new', cx_newRepliesLong: '{n} new replies', cx_reply: 'Reply', cx_hideReplies: 'Hide replies',
    cx_checkItem: 'Checklist item', cx_copyLink: 'Copy link', cx_linkCopied: 'Link copied', cx_markUnread: 'Mark as unread', cx_notifOff: 'Turn off notifications', cx_notifOn: 'Turn on notifications',
    cx_saveGif: 'Save to My GIFs', cx_gifSaved: 'Saved to My GIFs', cx_post: 'Post', cx_loadingReplies: 'Loading replies…', cx_openLink: 'Open link: {url}',
    cx_stickerPrev: 'Sticker', cx_praisePrev: 'Praise', cx_locPrev: 'Location', cx_gifPrev: 'GIF', cx_memePrev: 'Meme', cx_annPrev: 'Announcement: {t}',
  });
  LC.addStrings('hi', { cx_seeMore: 'और देखें', cx_seeLess: 'कम देखें', cx_copyCode: 'कोड कॉपी करें', cx_important: 'महत्वपूर्ण!', cx_urgent: 'अत्यावश्यक!', cx_reply: 'जवाब दें', cx_copyLink: 'लिंक कॉपी करें', cx_markUnread: 'अपठित चिह्नित करें', cx_notifOff: 'सूचनाएँ बंद करें', cx_notifOn: 'सूचनाएँ चालू करें', cx_saveGif: 'मेरे GIF में सहेजें', cx_newReplies: '{n} नए' });
  LC.addStrings('es', { cx_seeMore: 'Ver más', cx_seeLess: 'Ver menos', cx_copyCode: 'Copiar código', cx_codeCopied: 'Código copiado', cx_important: '¡IMPORTANTE!', cx_urgent: '¡URGENTE!', cx_reply: 'Responder', cx_hideReplies: 'Ocultar respuestas', cx_copyLink: 'Copiar vínculo', cx_linkCopied: 'Vínculo copiado', cx_markUnread: 'Marcar como no leído', cx_notifOff: 'Desactivar notificaciones', cx_notifOn: 'Activar notificaciones', cx_saveGif: 'Guardar en Mis GIF', cx_gifSaved: 'Guardado en Mis GIF', cx_newReplies: '{n} nuevas', cx_newRepliesLong: '{n} respuestas nuevas', cx_repliesFrom: '{n} respuestas de {names}' });

  // ---------- inline formatting ----------
  const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'], SIZES = ['small', 'large', 'huge'];
  LC.cxColors = COLORS; LC.cxSizes = SIZES;
  function inlineSource() {
    if (LC.inlineSrc) return LC.inlineSrc;
    const names = [...S.users.values()].filter((u) => !u.removed).map((u) => u.name).sort((a, b) => b.length - a.length).map(esc);
    const parts = [
      '(`[^`\\n]+`)', // 1 code
      '(\\[[^\\]\\n]{1,200}\\]\\((?:https?:\\/\\/|#m=)[^\\s)]+\\))', // 2 [text](link)
      '(\\*\\*[^*\\n]+?\\*\\*)', '(__[^_\\n]+?__)', '(~~[^~\\n]+?~~)', '(==[^=\\n]+?==)', // 3 bold, 4 underline, 5 strike, 6 highlight
      '(\\{color:(?:' + COLORS.join('|') + ')\\}[^\\n]*?\\{\\/color\\})', '(\\{size:(?:' + SIZES.join('|') + ')\\}[^\\n]*?\\{\\/size\\})', // 7 colour, 8 size
      '(\\*[^\\s*][^*\\n]*?\\*)', '((?:^|\\s)_[^\\s_][^_\\n]*?_(?=\\s|$|[.,!?;:]))', // 9, 10 italic
      '(https?:\\/\\/[^\\s<]+)', '(@(?:everyone|here)(?![\\p{L}\\p{N}_]))', '(:[a-z0-9_]{2,20}:)', // 11 url, 12 @everyone, 13 :emoji:
      names.length ? '(@(?:' + names.join('|') + ')(?![\\p{L}\\p{N}_]))' : '(?!)()', // 14 @person
    ];
    return (LC.inlineSrc = parts.join('|'));
  }
  LC.on('user', () => { LC.inlineSrc = null; }); LC.on('init', () => { LC.inlineSrc = null; });
  // links to a message in this session (#m=<chan>/<id>) open inside the app instead of a new tab
  const deepLink = (url) => { const h = url.startsWith('#m=') ? url : url.startsWith(location.origin + '/') && url.includes('#m=') ? url.slice(url.indexOf('#m=')) : ''; return h || null; };
  function linkEl(url, text, depth) {
    const hash = deepLink(url);
    if (hash) return el('a', { href: hash, class: 'cx-msglink', title: url, onclick: (e) => { e.preventDefault(); LC.openHashLink && LC.openHashLink(hash); } }, text === null ? url : depth < 3 ? inline(text, depth + 1) : text);
    return el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', title: text === null ? null : url }, text === null ? url : depth < 3 ? inline(text, depth + 1) : text);
  }
  const wrap = (tag, cls, inner, depth) => el(tag, cls ? { class: cls } : {}, depth < 4 ? inline(inner, depth + 1) : inner);
  function inline(text, depth = 0) {
    const frag = document.createDocumentFragment(), re = new RegExp(inlineSource(), 'giu'); let last = 0, m;
    while ((m = re.exec(text))) {
      if (m[0] === '') { re.lastIndex++; continue; }
      let lead = ''; if (m[10]) lead = /^\s/.test(m[0]) ? m[0][0] : '';
      if (m.index > last) frag.append(text.slice(last, m.index)); last = re.lastIndex;
      if (m[1]) frag.append(el('code', { text: m[1].slice(1, -1) }));
      else if (m[2]) { const x = /^\[([^\]]*)\]\((.+)\)$/.exec(m[2]); frag.append(linkEl(x[2], x[1], depth)); }
      else if (m[3]) frag.append(wrap('b', '', m[3].slice(2, -2), depth));
      else if (m[4]) frag.append(wrap('u', '', m[4].slice(2, -2), depth));
      else if (m[5]) frag.append(wrap('s', '', m[5].slice(2, -2), depth));
      else if (m[6]) frag.append(wrap('mark', 'cx-mark', m[6].slice(2, -2), depth));
      else if (m[7]) { const x = /^\{color:([a-z]+)\}([\s\S]*)\{\/color\}$/.exec(m[7]); frag.append(wrap('span', 'cx-c-' + x[1], x[2], depth)); }
      else if (m[8]) { const x = /^\{size:([a-z]+)\}([\s\S]*)\{\/size\}$/.exec(m[8]); frag.append(wrap('span', 'cx-s-' + x[1], x[2], depth)); }
      else if (m[9]) frag.append(wrap('i', '', m[9].slice(1, -1), depth));
      else if (m[10]) { frag.append(lead); frag.append(el('i', {}, m[10].slice(lead.length + 1, -1))); }
      else if (m[11]) { let url = m[11], trail = ''; const x = url.match(/[.,;:!?)\]]+$/); if (x) { trail = x[0]; url = url.slice(0, -trail.length); } frag.append(linkEl(url, null, depth), trail); }
      else if (m[12]) frag.append(el('span', { class: 'mention everyone', text: m[12] }));
      else if (m[13]) { const name = m[13].slice(1, -1), id = S.emojis[name]; frag.append(id ? el('img', { class: 'cemoji', src: LC.fileUrl({ id, name: name + '.png' }, true), alt: m[13], title: m[13] }) : m[13]); }
      else if (m[14]) { const nm = m[14].slice(1).toLowerCase(), isMe = S.me && S.me.name.toLowerCase() === nm; frag.append(el('span', { class: 'mention' + (isMe ? ' me' : ''), text: m[14] })); }
    }
    frag.append(text.slice(last)); return frag;
  }
  LC.renderInline = (text) => inline(String(text || ''));

  // ---------- coloured code blocks ----------
  const KW = {
    js: 'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of static get set null undefined true false NaN Infinity from',
    py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print len range',
    java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws transient try void volatile while true false null var record String',
    c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false nullptr class namespace template typename public private protected virtual override new delete using std include define ifdef ifndef endif',
    go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false iota string int error',
    sql: 'select from where insert into values update set delete create table drop alter add index primary key foreign references join inner left right outer full on group by order having limit offset as and or not null is in like between distinct union all case when then else end count sum avg min max exists view default',
    sh: 'if then else elif fi for while do done case esac in function return exit echo export local readonly cd ls grep sed awk cat sudo set unset source mkdir rm cp mv chmod',
  };
  KW.ts = KW.js + ' interface type enum implements namespace declare abstract private protected public readonly as is keyof any unknown never string number boolean';
  const LANG = { javascript: 'js', jsx: 'js', mjs: 'js', node: 'js', typescript: 'ts', tsx: 'ts', python: 'py', py3: 'py', bash: 'sh', shell: 'sh', zsh: 'sh', console: 'sh', 'c++': 'c', cpp: 'c', h: 'c', hpp: 'c', cs: 'c', csharp: 'c', golang: 'go', kotlin: 'java', xml: 'html', svg: 'html', htm: 'html', scss: 'css', less: 'css', jsonc: 'json', mysql: 'sql', postgres: 'sql', sqlite: 'sql' };
  const langOf = (l) => { l = String(l || '').toLowerCase(); l = LANG[l] || l; return ['js', 'ts', 'py', 'json', 'html', 'css', 'sql', 'sh', 'java', 'c', 'go'].includes(l) ? l : ''; };
  const STR = '"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'', NUM = '\\b(?:0x[0-9a-f]+|\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?)\\b';
  const kw = (l) => '\\b(?:' + KW[l].split(' ').join('|') + ')\\b';
  function rules(l) { // [regex, [class per capture group]]
    if (l === 'json') return ['("(?:\\\\.|[^"\\\\])*")(?=\\s*:)|("(?:\\\\.|[^"\\\\])*")|\\b(true|false|null)\\b|(-?' + NUM + ')', ['tk-p', 'tk-s', 'tk-k', 'tk-n']];
    if (l === 'html') return ['(<!--[\\s\\S]*?-->)|(</?[a-zA-Z][\\w:-]*)|(\\s[\\w:-]+)(?==)|(' + STR + ')|(/?>)', ['tk-c', 'tk-k', 'tk-p', 'tk-s', 'tk-k']];
    if (l === 'css') return ['(/\\*[\\s\\S]*?\\*/)|(' + STR + ')|(@[\\w-]+)|([\\w-]+)(?=\\s*:[^;{}]*[;}])|(#[0-9a-fA-F]{3,8}\\b|-?\\d*\\.?\\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\\b)', ['tk-c', 'tk-s', 'tk-k', 'tk-p', 'tk-n']];
    const com = { py: '#.*', sh: '#.*', sql: '--.*|/\\*[\\s\\S]*?\\*/' }[l] || '//.*|/\\*[\\s\\S]*?\\*/';
    const str = l === 'py' ? '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|' + STR : l === 'js' || l === 'ts' || l === 'go' ? '`(?:\\\\.|[^`\\\\])*`|' + STR : STR;
    return ['(' + com + ')|(' + str + ')|(' + kw(l) + ')|(' + NUM + ')', ['tk-c', 'tk-s', 'tk-k', 'tk-n']];
  }
  LC.highlightCode = (code, lang) => {
    const l = langOf(lang), frag = document.createDocumentFragment(); if (!l) { frag.append(code); return frag; }
    const [src, cls] = rules(l), re = new RegExp(src, l === 'sql' ? 'gi' : 'g'); let last = 0, m;
    while ((m = re.exec(code))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const g = m.findIndex((x, i) => i > 0 && x !== undefined); if (g < 1) continue;
      if (m.index > last) frag.append(code.slice(last, m.index));
      frag.append(el('span', { class: cls[g - 1], text: m[0] })); last = re.lastIndex;
    }
    frag.append(code.slice(last)); return frag;
  };
  function codeBlock(raw) {
    const nl = raw.indexOf('\n'), first = nl >= 0 ? raw.slice(0, nl).trim() : '';
    const hasLang = nl >= 0 && /^[a-z0-9+#-]{1,20}$/i.test(first), lang = hasLang ? first : '';
    const code = (hasLang ? raw.slice(nl + 1) : raw.replace(/^\n/, '')).replace(/\n$/, ''), l = langOf(lang);
    return el('div', { class: 'cx-code' + (l ? ' lang-' + l : '') },
      el('div', { class: 'cx-codebar' }, el('span', { text: lang || 'code' }), el('button', { type: 'button', class: 'cx-copy', title: t('cx_copyCode'), 'aria-label': t('cx_copyCode'), onclick: async (e) => { e.stopPropagation(); LC.toast((await LC.copy(code)) ? t('cx_codeCopied') : t('copyFailed'), { ms: 1500 }); } }, LC.icon('copy'))),
      el('pre', {}, el('code', {}, LC.highlightCode(code, lang))));
  }

  // ---------- block formatting ----------
  const LIST = /^(\s*)([-*•]|\d+[.)])\s+(\S.*)$/, CHECK = /^\[( |x|X)\]\s+(.*)$/, HEAD = /^(#{1,3})\s+(\S.*)$/, HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
  const TROW = /^\s*\|.*\|\s*$/, TSEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/;
  const indentOf = (s) => s.replace(/\t/g, '    ').length;
  const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  function tableEl(rows, sep) {
    const align = cells(sep).map((c) => (/^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : ''));
    const head = cells(rows[0]), td = (tag, c, i) => el(tag, { style: align[i] ? { textAlign: align[i] } : null }, inline(c));
    return el('div', { class: 'cx-tablewrap' }, el('table', { class: 'cx-table' }, el('thead', {}, el('tr', {}, head.map((c, i) => td('th', c, i)))), el('tbody', {}, rows.slice(1).map((r) => el('tr', {}, cells(r).slice(0, Math.max(head.length, 1)).map((c, i) => td('td', c, i)))))));
  }
  function listEl(items, o) { // nested lists from indentation; "- [ ]" items become checkboxes
    const out = document.createDocumentFragment(), stack = [];
    for (const it of items) {
      while (stack.length && it.ind < stack[stack.length - 1].ind) stack.pop();
      let top = stack[stack.length - 1];
      if (!top || it.ind > top.ind) {
        const list = el(it.ordered ? 'ol' : 'ul', { class: it.check ? 'cx-checklist' : null, start: it.ordered && it.num > 1 ? String(it.num) : null });
        if (top && top.el.lastElementChild) top.el.lastElementChild.append(list); else out.append(list);
        stack.push(top = { ind: it.ind, el: list });
      }
      if (it.check) {
        const k = it.k, box = el('input', { type: 'checkbox', checked: it.done, disabled: !(o && o.onCheck), 'aria-label': t('cx_checkItem') + ': ' + it.text.slice(0, 60), onchange: (e) => o.onCheck(k, e.target.checked) });
        top.el.append(el('li', { class: 'cx-ck' + (it.done ? ' done' : '') }, box, el('span', {}, inline(it.text))));
      } else top.el.append(el('li', {}, inline(it.text)));
    }
    return out;
  }
  // o.onCheck(index, checked): makes "- [ ]" checklist items clickable (the author's own messages)
  LC.renderText = (text, o) => {
    const root = document.createDocumentFragment(); let checkNo = 0;
    String(text || '').split(/```([\s\S]*?)```/g).forEach((seg, i) => {
      if (i % 2) { root.append(codeBlock(seg)); return; }
      const lines = seg.split('\n'); let k = 0;
      const special = (L, next) => /^>\s?/.test(L) || LIST.test(L) || HEAD.test(L) || HR.test(L) || (TROW.test(L) && next !== undefined && TSEP.test(next));
      while (k < lines.length) {
        const L = lines[k];
        if (/^>\s?/.test(L)) { const q = []; while (k < lines.length && /^>\s?/.test(lines[k])) q.push(lines[k++].replace(/^>\s?/, '')); root.append(el('blockquote', {}, inline(q.join('\n')))); }
        else if (TROW.test(L) && k + 1 < lines.length && TSEP.test(lines[k + 1])) { const rows = [L], sep = lines[k + 1]; k += 2; while (k < lines.length && TROW.test(lines[k])) rows.push(lines[k++]); root.append(tableEl(rows, sep)); }
        else if (HEAD.test(L)) { const h = HEAD.exec(L); root.append(el('div', { class: 'cx-h cx-h' + h[1].length }, inline(h[2]))); k++; }
        else if (HR.test(L)) { root.append(el('hr', { class: 'cx-hr' })); k++; }
        else if (LIST.test(L)) {
          const items = [];
          while (k < lines.length && LIST.test(lines[k])) {
            const x = LIST.exec(lines[k++]), c = /^[-*•]$/.test(x[2]) ? CHECK.exec(x[3]) : null;
            items.push({ ind: indentOf(x[1]), ordered: /\d/.test(x[2]), num: parseInt(x[2], 10) || 1, text: c ? c[2] : x[3], check: !!c, done: !!c && c[1] !== ' ', k: c ? checkNo++ : -1 });
          }
          root.append(listEl(items, o));
        } else if (L.trim() === '') { k++; if (root.lastChild && !(root.lastChild.className || '').includes('gap') && k < lines.length) root.append(el('div', { class: 'gap' })); }
        else { const p = []; while (k < lines.length && lines[k].trim() !== '' && !special(lines[k], lines[k + 1])) p.push(lines[k++]); root.append(el('div', { class: 'p' }, inline(p.join('\n')))); }
      }
    });
    return root;
  };
  // toggles the n-th "- [ ]" item of a message text (used by checklist clicks)
  LC.toggleCheck = (text, n, on) => { let i = -1; return String(text).split(/(```[\s\S]*?```)/g).map((seg, j) => (j % 2 ? seg : seg.replace(/^(\s*[-*•]\s+)\[( |x|X)\](?=\s)/gm, (all, lead) => (++i === n ? lead + (on ? '[x]' : '[ ]') : all)))).join(''); };
  const BIG = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s|:[a-z0-9_]{2,20}:)+$/u;
  LC.isBigEmoji = (text) => { const s = text.trim(); if (!s || s.length > 40 || !BIG.test(s) || /^[\d\s#*]+$/.test(s)) return false; const n = (s.match(/\p{Extended_Pictographic}|:[a-z0-9_]{2,20}:/gu) || []).length; return n >= 1 && n <= 5; };
  LC.plain = (s) => String(s || '')
    .replace(/```[a-z0-9+#-]*\n?/gi, '').replace(/\[([^\]\n]+)\]\((?:https?:\/\/|#m=)[^\s)]+\)/g, '$1').replace(/\{(?:color|size):[a-z]+\}|\{\/(?:color|size)\}/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/~~(.+?)~~/g, '$1').replace(/==(.+?)==/g, '$1').replace(/`([^`\n]+)`/g, '$1')
    .replace(/(^|\s)[*_]([^*_\s][^*_\n]*?)[*_](?=\s|$|[.,!?])/g, '$1$2').replace(/^#{1,3}\s+/gm, '').replace(/^(\s*[-*•]\s+)\[[ xX]\]\s+/gm, '$1').replace(/^>\s?/gm, '')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/gm, '').replace(/^\s*\|(.*)\|\s*$/gm, (_a, x) => x.split('|').map((c) => c.trim()).join(' · ')).replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/\s+/g, ' ').trim();
  LC.snippet = (m) => {
    const body = LC.plain(m.text) || (m.announce && t('cx_annPrev', { t: m.announce.title })) || (m.sticker && (m.sticker.c || t('cx_stickerPrev'))) || (m.praise && t('cx_praisePrev')) || (m.location && t('cx_locPrev'))
      || (m.poll && t('pollPreview', { q: m.poll.q })) || (m.game && t('ttt')) || (m.gif && t('cx_gifPrev')) || (m.meme && t('cx_memePrev')) || (m.files && m.files.length && t('filePreview', { name: m.files[0].name })) || '';
    return ((m.subject ? m.subject + (body ? ' — ' : '') : '') + body).slice(0, 140);
  };
  LC.mentionsMe = (m) => !!(S.me && (m.everyone || (m.mentions || []).includes(S.me.id)));

  // ---------- attachments ----------
  LC.galleryImages = () => { const out = []; const w = S.win[S.chan]; if (w) for (const m of w.msgs) if (!m.deleted) for (const f of m.files || []) if (LC.isImage(f.name)) out.push(f); return out; };
  function attachments(m) {
    const wrap = el('div', { class: 'att' });
    for (const f of m.files || []) {
      if (m.announce && f.id === m.announce.image) continue; // shown as the announcement banner
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
      el('div', { class: 'lb-bar' }, el('span', { text: `${f.name}  ·  ${lb.i + 1}/${lb.list.length}` }), el('a', { href: LC.fileUrl(f), download: f.name, text: t('download') }), LC.saveGifs && LC.msgRules().gifs !== false ? el('button', { type: 'button', class: 'link', text: t('cx_saveGif'), onclick: () => LC.saveGifs([f]) }) : null));
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
  // session messaging rules set by admins (teams area): { edit, delete, editMinutes, stickers, memes, gifs }
  LC.msgRules = () => { const r = S.settings && S.settings.messagingRules; return r && typeof r === 'object' ? r : {}; };
  LC.canEditMsg = (m) => { const r = LC.msgRules(); return m.from === S.me.id && !m.deleted && !m.system && !m.poll && !m.game && !m.sticker && !m.praise && !m.location && r.edit !== false && !(r.editMinutes > 0 && Date.now() - m.ts > r.editMinutes * 60000); };
  LC.canDeleteMsg = (m) => (m.from === S.me.id && LC.msgRules().delete !== false) || LC.isAdmin();

  // ---------- message bubble ----------
  LC.quickReactions = ['👍', '❤️', '😂', '😮', '😢', '😡'];
  const tone = (e) => (LC.skinTone ? LC.skinTone(e) : e);
  LC.msgSig = (m, o) => JSON.stringify([m, !!o.grouped, !!o.thread, !!o.post, !!o.open, o.lastMine ? LC.groupSeen(m) : -1, LC.tickState(m), (LC.prefs().saved || []).includes(m.id), LC.uname(m.from), (S.users.get(m.from) || {}).avatar, (S.users.get(m.from) || {}).role, S.me.id, Object.keys(S.emojis).length, LC.ui.lang, LC.prefs().skinTone || 0, m.threadCount && LC.threadNew ? LC.threadNew(m) : 0, LC.canEditMsg(m)]);
  const SYS_ICON = { call: 'call', callend: 'call_end', pin: 'pin', clear: 'broom', create: 'chat_add', rename: 'rename', topic: 'text_edit_style', picture: 'image_edit', add: 'person_add', remove: 'person_delete', leave: 'arrow_exit', join: 'person_add', settings: 'settings', timer: 'timer', meeting: 'calendar_ltr' };
  const SYS_GUESS = [[/created (this|the) (group|channel|chat)/, 'create'], [/renamed (this|the chat) to/, 'rename'], [/(changed|removed) the topic/, 'topic'], [/(changed|removed) the group picture/, 'picture'], [/ left the (group|chat)$/, 'leave'], [/ joined$/, 'join'], [/ added /, 'add'], [/ removed /, 'remove'], [/disappear/, 'timer'], [/slow mode|read-only|allowed everyone to post/, 'settings']];
  // system lines from older versions start with an emoji or carry no kind; show an icon instead
  LC.sysText = (m) => {
    let text = String(m.system || ''), kind = m.kind; const lead = /^(📞|📌|🧹)\s*/u.exec(text);
    if (lead) { text = text.slice(lead[0].length); kind ||= { '📞': /ended/i.test(text) ? 'callend' : 'call', '📌': 'pin', '🧹': 'clear' }[lead[1]]; }
    if (!kind) for (const [re, k] of SYS_GUESS) if (re.test(text)) { kind = k; break; }
    return { text, kind };
  };
  function sysEl(m) {
    const { text, kind } = LC.sysText(m);
    return el('div', { class: 'msg sys' + (kind ? ' k-' + kind : ''), 'data-id': m.id, 'data-seq': m.seq }, kind && SYS_ICON[kind] ? LC.icon(SYS_ICON[kind]) : null, el('span', { text, onclick: m.ref ? () => LC.jumpToMessage(m.chan, m.ref) : null, class: m.ref ? 'link' : '' }), el('time', { text: LC.fmtTime(m.ts), title: LC.fmtDateTime(m.ts) }));
  }
  const isLong = (s) => s.length > 900 || (s.match(/\n/g) || []).length > 11;
  // "See more": long texts are clamped; once on screen, ones that turn out short lose the button (chat.js calls this after drawing)
  LC.measureClamps = (root) => { for (const x of root.querySelectorAll('.txt.cx-clamp:not(.cx-measured)')) { if (!x.clientHeight) continue; x.classList.add('cx-measured'); if (x.scrollHeight <= x.clientHeight + 4) { x.classList.remove('cx-clamp'); const b = x.nextElementSibling; if (b && b.classList.contains('cx-more')) b.remove(); } } };
  function repliesLine(m) {
    const names = (m.threadUsers || []).map((id) => LC.uname(id).split(' ')[0]).join(', ');
    return names ? (m.threadCount === 1 ? t('cx_oneReplyFrom', { names }) : t('cx_repliesFrom', { n: m.threadCount, names })) : t('replies', { n: m.threadCount });
  }
  function postFooter(m, o) { // posts-style channels: replies collapsed under each post, with Reply
    const fresh = LC.threadNew ? LC.threadNew(m) : 0, foot = el('div', { class: 'cx-postfoot' });
    if (m.threadCount) foot.append(el('button', { type: 'button', class: 'cx-replies' + (fresh ? ' cx-fresh' : ''), 'aria-expanded': String(!!o.open), onclick: () => LC.togglePostReplies && LC.togglePostReplies(m) },
      el('span', { class: 'cx-avs', 'aria-hidden': 'true' }, (m.threadUsers || []).slice(0, 3).map((id) => LC.avatar(S.users.get(id), 'sm', false))), el('span', { text: o.open ? t('cx_hideReplies') : repliesLine(m) }), fresh ? el('span', { class: 'cx-newpill', text: t('cx_newReplies', { n: fresh }) }) : null));
    foot.append(el('button', { type: 'button', class: 'cx-replybtn', onclick: () => LC.openThread(m) }, LC.icon('arrow_reply'), el('span', { text: t('cx_reply') })));
    if (o.open) {
      const box = el('div', { class: 'cx-postreplies', 'aria-live': 'polite' }, el('p', { class: 'muted small', text: t('cx_loadingReplies') }));
      LC.api('/api/thread?id=' + encodeURIComponent(m.id)).then((d) => box.replaceChildren(...d.messages.map((r) => el('div', { class: 'cx-preply' }, LC.avatar(S.users.get(r.from), 'sm', false),
        el('div', { class: 'cx-pbody' }, el('div', { class: 'mh' }, el('b', { class: 'who', text: LC.uname(r.from) }), el('time', { text: LC.fmtDateTime(r.ts) })), r.deleted ? el('div', { class: 'muted small', text: t('deleted') }) : el('div', { class: 'txt' }, LC.renderText(r.text || LC.snippet(r)))))))).catch((e) => box.replaceChildren(el('p', { class: 'err small', text: e.message })));
      foot.append(box);
    }
    return foot;
  }
  LC.msgEl = (m, o = {}) => {
    if (m.system) return sysEl(m);
    const mine = m.from === S.me.id, u = S.users.get(m.from);
    if (m.deleted) return el('div', { class: 'msg tomb' + (mine ? ' mine' : ''), 'data-id': m.id, 'data-seq': m.seq }, mine ? null : el('div', { class: 'gut' }), el('div', { class: 'body bubble deleted' }, LC.icon('delete'), ' ' + t('deleted') + (m.deletedBy && m.deletedBy !== m.from ? ' · ' + t('deletedBy', { name: LC.uname(m.deletedBy) }) : '')));
    const body = el('div', { class: 'body bubble' + (m.priority ? ' cx-p-' + m.priority : '') });
    const prio = m.priority ? el('span', { class: 'cx-prio ' + m.priority }, LC.icon(m.priority === 'urgent' ? 'alert_urgent' : 'important'), t(m.priority === 'urgent' ? 'cx_urgent' : 'cx_important')) : null;
    const marks = () => [m.pinned ? LC.icon('pin', { filled: true, cls: 'pinmark', label: t('pinned') }) : null, m.expiresAt ? el('span', { class: 'ttlmark', title: t('disappearsAt', { when: LC.fmtDateTime(m.expiresAt) }) }, LC.icon('timer', { label: t('disappearsAt', { when: LC.fmtDateTime(m.expiresAt) }) })) : null];
    if (!o.grouped) body.append(el('div', { class: 'mh' },
      mine && !o.post ? null : el('button', { class: 'who', text: LC.uname(m.from), onclick: (e) => LC.userMenu(e.currentTarget, m.from) }),
      !mine && u && (u.role === 'owner' || u.role === 'admin') ? el('span', { class: 'role ' + u.role, text: u.role === 'owner' ? t('host') : t('admin'), title: u.role === 'owner' ? t('hostTitle') : t('adminTitle') }) : null,
      !mine && u && u.statusEmoji ? el('span', { text: u.statusEmoji, title: u.statusText }) : null,
      el('time', { text: o.post ? LC.fmtDateTime(m.ts) : LC.fmtTime(m.ts), title: LC.fmtDateTime(m.ts) }), m.edits ? el('button', { class: 'edited', text: t('edited'), title: t('viewOriginal'), onclick: () => LC.showHistory(m) }) : null, ...marks(), prio));
    else if (m.pinned || m.expiresAt || m.edits || prio) body.append(el('div', { class: 'mh mini' }, m.edits ? el('button', { class: 'edited', text: t('edited'), title: t('viewOriginal'), onclick: () => LC.showHistory(m) }) : null, ...marks(), prio));
    if (m.fwd) body.append(el('div', { class: 'fwd small muted' }, LC.icon('arrow_forward'), ' ' + t('forwardedFrom', { name: LC.uname(m.fwd.from) })));
    if (m.reply) body.append(el('button', { class: 'quote', onclick: () => LC.jumpToMessage(m.chan, m.reply.id) }, el('b', { text: LC.uname(m.reply.from) }), el('span', { text: LC.plain(m.reply.text) })));
    if (m.announce && LC.announceEl) body.append(LC.announceEl(m));
    if (m.subject) body.append(el('div', { class: 'cx-subject', text: m.subject }));
    if (m.text) {
      const big = LC.isBigEmoji(m.text), long = !big && isLong(m.text);
      const txt = el('div', { class: 'txt' + (big ? ' big' : '') + (long ? ' cx-clamp' : '') }, LC.renderText(m.text, LC.canEditMsg(m) ? { onCheck: (k, on) => LC.api('/api/edit', { id: m.id, text: LC.toggleCheck(m.text, k, on) }).catch((e) => LC.toast(e.message)) } : null));
      body.append(txt);
      if (long) body.append(el('button', { type: 'button', class: 'link cx-more', 'aria-expanded': 'false', onclick: (e) => { const open = txt.classList.toggle('cx-open'); e.currentTarget.textContent = open ? t('cx_seeLess') : t('cx_seeMore'); e.currentTarget.setAttribute('aria-expanded', String(open)); } }, t('cx_seeMore')));
    }
    for (const part of [m.sticker && LC.stickerEl && LC.stickerEl(m), m.praise && LC.praiseEl && LC.praiseEl(m), m.location && LC.locationEl && LC.locationEl(m)]) if (part) body.append(part);
    if (m.poll) body.append(pollEl(m)); if (m.game) body.append(gameEl(m));
    if (m.files && m.files.some((f) => !m.announce || f.id !== m.announce.image)) body.append(attachments(m));
    if (m.preview) body.append(previewEl(m.preview));
    for (const part of LC.extItems(LC.ext.msgParts, m, o)) if (part && part.nodeType) body.append(part);
    const keys = Object.keys(m.reactions || {});
    if (keys.length) body.append(el('div', { class: 'reacts' }, keys.map((k) => { const ids = m.reactions[k], cm = /^:([a-z0-9_]+):$/.exec(k); return el('button', { class: 'react' + (ids.includes(S.me.id) ? ' mine' : ''), title: ids.map(LC.uname).join(', '), 'aria-label': `${k} ${ids.length}`, 'aria-pressed': String(ids.includes(S.me.id)), onclick: () => LC.api('/api/react', { id: m.id, emoji: k }).catch((e) => LC.toast(e.message)) }, cm && S.emojis[cm[1]] ? el('img', { class: 'cemoji', src: LC.fileUrl({ id: S.emojis[cm[1]], name: 'e.png' }, true), alt: k }) : el('span', { class: 'remo', text: k }), ' ' + ids.length); })));
    if (o.post) body.append(postFooter(m, o));
    else if (m.threadCount && !o.thread) {
      const fresh = LC.threadNew ? LC.threadNew(m) : 0;
      body.append(el('button', { class: 'thread-sum' + (fresh ? ' cx-fresh' : ''), onclick: () => LC.openThread(m) }, LC.icon('comment'), ' ' + t('replies', { n: m.threadCount }), fresh ? el('span', { class: 'cx-newpill', text: t('cx_newReplies', { n: fresh }), title: t('cx_newRepliesLong', { n: fresh }) }) : null, el('span', { class: 'muted', text: ' · ' + LC.ago(m.threadLast || m.ts) })));
    }
    const tk = LC.tickState(m); let status = null;
    if (tk) status = el('span', { class: 'ticks ' + tk, 'aria-label': t('tick_' + tk), title: t('tick_' + tk) }, LC.icon(tk === 'seen' ? 'eye' : 'checkmark_circle', { filled: tk === 'delivered' }));
    else if (o.lastMine) { const n = LC.groupSeen(m); if (n) status = el('span', { class: 'seenby small muted' }, LC.icon('eye'), ' ' + t('seenBy', { n })); }
    // hover bar: quick reactions (animated), more reactions, reply in thread, quote, more
    const react = (e) => LC.api('/api/react', { id: m.id, emoji: e }).catch((x) => LC.toast(x.message));
    const tools = el('div', { class: 'tools', role: 'toolbar', 'aria-label': t('messageActions') });
    for (const e0 of LC.quickReactions) { const e = tone(e0); tools.append(el('button', { class: 'emo-r', text: e, title: t('react') + ' ' + e, 'aria-label': t('react') + ' ' + e, onclick: () => react(e) })); }
    tools.append(LC.ibtn('emoji_add', t('moreReactions'), (ev) => LC.openPicker(ev.currentTarget, react, { reactions: true }), { cls: '' }));
    if (!o.thread) tools.append(LC.ibtn('comment', t('replyThread'), () => LC.openThread(m), { cls: '' }));
    tools.append(LC.ibtn('arrow_reply', t('quoteReply'), () => (o.thread ? LC.composers.thread : LC.composers.main).reply(m), { cls: '' }));
    tools.append(LC.ibtn('more_horizontal', t('more'), (ev) => LC.msgMenu(ev.currentTarget, m, o), { cls: '', menu: true }));
    const node = el('div', { class: 'msg' + (o.grouped ? ' grouped' : '') + (mine ? ' mine' : '') + (o.post ? ' cx-post' : '') + (LC.mentionsMe(m) ? ' mentioned' : ''), 'data-id': m.id, 'data-seq': m.seq },
      mine && !o.post ? null : o.grouped ? el('div', { class: 'gut', text: LC.fmtTime(m.ts).replace(/\s?[AP]M/i, '') }) : el('button', { class: 'avbtn', 'aria-label': LC.uname(m.from), onclick: (e) => LC.userMenu(e.currentTarget, m.from) }, LC.avatar(u, '', false)),
      el('div', { class: 'bwrap' }, body, status, tools));
    node.addEventListener('click', (e) => { if (matchMedia('(pointer:coarse)').matches && !e.target.closest('a,button,img,video,audio,input')) { LC.$$('.msg.sel').forEach((x) => x !== node && x.classList.remove('sel')); node.classList.toggle('sel'); } });
    return node;
  };
  LC.msgMenu = (anchor, m, o) => {
    const saved = (LC.prefs().saved || []).includes(m.id), top = !m.thread, imgs = (m.files || []).filter((f) => LC.isImage(f.name)), following = LC.isFollowing ? LC.isFollowing(m) : false;
    const canEdit = LC.canEditMsg(m), canDel = LC.canDeleteMsg(m);
    LC.menu(anchor, [
      LC.canPin(m) ? { icon: m.pinned ? 'pin_off' : 'pin', label: m.pinned ? t('unpin') : t('pin'), fn: () => LC.api('/api/pin', { id: m.id }).catch((e) => LC.toast(e.message)) } : null,
      { icon: saved ? 'bookmark_off' : 'bookmark', label: saved ? t('unsave') : t('save'), fn: () => LC.setPrefs({ saved: saved ? (LC.prefs().saved || []).filter((x) => x !== m.id) : [...(LC.prefs().saved || []), m.id] }) },
      !m.poll && !m.game ? { icon: 'arrow_forward', label: t('forward'), fn: () => LC.forwardDialog(m) } : null,
      m.text ? { icon: 'copy', label: t('copyText'), fn: async () => { LC.toast((await LC.copy(m.text)) ? t('copied') : t('copyFailed'), { ms: 1500 }); } } : null,
      LC.copyMsgLink ? { icon: 'link', label: t('cx_copyLink'), fn: () => LC.copyMsgLink(m) } : null,
      LC.markUnreadFrom ? { icon: 'mail_unread', label: t('cx_markUnread'), fn: () => LC.markUnreadFrom(m) } : null,
      top && LC.setFollow ? { icon: following ? 'alert_off' : 'alert_on', label: following ? t('cx_notifOff') : t('cx_notifOn'), fn: () => LC.setFollow(m, !following) } : null,
      imgs.length && LC.saveGifs && LC.msgRules().gifs !== false ? { icon: 'gif', label: t('cx_saveGif'), fn: () => LC.saveGifs(imgs) } : null,
      { icon: 'eye', label: t('seenByMenu'), fn: () => LC.showSeenBy(m) },
      m.edits ? { icon: 'history', label: t('viewOriginal'), fn: () => LC.showHistory(m) } : null,
      canEdit || canDel ? 'sep' : null,
      canEdit ? { icon: 'edit', label: t('edit'), fn: () => (o && o.thread ? LC.composers.thread : LC.composers.main).edit(m) } : null,
      ...LC.extItems(LC.ext.msgMenu, m, o),
      canDel ? { icon: 'delete', label: t('delete'), danger: true, fn: async () => { if (await LC.confirm(t('confirmDelete'), { danger: true, ok: t('delete') })) LC.api('/api/delete', { id: m.id }).catch((e) => LC.toast(e.message)); } } : null,
    ]);
  };
})();
