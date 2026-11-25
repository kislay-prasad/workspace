'use strict';
// chatux browser flows (docs/features-chatux.md): emoji & fun, search & commands, chat list, writing messages, message actions.
// Playwright with Chromium; servers use the chatux port range (4100–4199). Screenshots go to /tmp/chatux-shots/.
const ROOT = require('path').resolve(__dirname, '..'), os = require('os'), fs = require('fs');
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js');
const SHOTS = '/tmp/chatux-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/lc-chatux-ui-');
  const app = createApp({ dataDir: dir, name: 'Chat UX', publicDir: ROOT + '/public' }); const port = await app.start(4110); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'), cara = c.makeUser('Cara'); const ht = c.newToken(host), bt = c.newToken(bob), ct = c.newToken(cara);
  c.db.channels.news = { id: 'news', name: 'news', topic: 'Company news', created: Date.now(), by: host.id, kind: 'posts' };
  c.db.channels['m-plan'] = { id: 'm-plan', name: 'Sprint planning', topic: '', created: Date.now(), by: host.id, members: [host.id, bob.id], kind: 'meeting' };
  c.sysMsg('general', 'Welcome');
  const br = await chromium.launch(); const errs = []; let pass = 0, failN = 0;
  const open = async (tok, label, o = {}) => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['clipboard-read', 'clipboard-write', 'geolocation'], geolocation: { latitude: 51.5007, longitude: -0.1246, accuracy: 15 }, ...o });
    await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok);
    const p = await ctx.newPage(); p.setDefaultTimeout(6000); p.ctx = ctx;
    p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(o.url || B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p;
  };
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failN++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); } };
  const send = async (p, text) => { await p.fill('#composerHost textarea', text); await p.press('#composerHost textarea', 'Enter'); };
  const msgMenu = async (p, text) => { const m = p.locator('.msg', { hasText: text }).last(); await m.hover(); await m.locator('.tools button[title="More"]').click(); };
  const openChat = (p, chan) => p.evaluate((ch) => LC.openChat(ch), chan);
  const dm = (a, b) => 'dm:' + [a.id, b.id].sort().join(':');
  const last = (chan) => c.chanMsgs(chan).filter((m) => !m.thread).slice(-1)[0];
  const H = await open(ht, 'host'), P = await open(bt, 'bob');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const bigPng = await H.evaluate(() => new Promise((r) => { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; const g = cv.getContext('2d'); g.fillStyle = '#4f6bed'; g.fillRect(0, 0, 320, 200); g.fillStyle = '#ffb900'; g.fillRect(40, 40, 120, 80); cv.toBlob((b) => b.arrayBuffer().then((a) => r([...new Uint8Array(a)])), 'image/png'); }));

  console.log('Emoji and fun');
  await step('picker: search by keyword inserts the emoji', async () => { await H.click('#composerHost .emojibtn'); await H.fill('#picker .psearch', 'pizza'); await H.waitForSelector('#picker .grid button[aria-label*="pizza"]'); await H.click('#picker .grid button >> nth=0'); if (!(await H.inputValue('#composerHost textarea')).includes('🍕')) throw new Error('no pizza'); await H.fill('#composerHost textarea', ''); });
  await step('skin tone is applied to hands and remembered (also on the 👍 quick reaction)', async () => {
    await H.click('#composerHost .emojibtn'); await H.click('#picker .cx-tonebtn'); await H.click('#picker .cx-tones button >> nth=3'); await H.click('#picker .cx-cats button[aria-label="People and hands"]');
    const wave = await H.locator('#picker .grid button >> nth=0').textContent(); if (!wave.includes('\u{1F3FD}')) throw new Error(wave); await H.keyboard.press('Escape');
    await H.waitForFunction(() => LC.prefs().skinTone === 3); if (c.db.users[host.id].prefs.skinTone !== 3) throw new Error('not saved');
    await send(H, 'tone test'); await H.locator('.msg', { hasText: 'tone test' }).hover(); if (!(await H.locator('.msg:has-text("tone test") .tools .emo-r >> nth=0').textContent()).includes('\u{1F3FD}')) throw new Error('quick reaction not toned');
    await H.evaluate(() => LC.setPrefs({ skinTone: 0 }));
  });
  await step('typed shortcuts become emoji on send, and can be turned off in Settings', async () => {
    await send(P, 'hello :) <3'); await H.waitForSelector('.msg:has-text("hello 🙂 ❤️")');
    await P.click('#gearBtn'); await P.click('.popmenu button:has-text("Settings")'); await P.click('.tabbtn:has-text("Appearance")'); await P.click('.modal label:has-text("Turn typed shortcuts") input'); await P.keyboard.press('Escape');
    await P.waitForFunction(() => LC.prefs().emojiShortcuts === false); await send(P, 'plain :)'); await H.waitForSelector('.msg:has-text("plain :)")'); await P.evaluate(() => LC.setPrefs({ emojiShortcuts: true }));
  });
  await step('six animated quick reactions on hover; a big emoji message animates', async () => {
    const m = H.locator('.msg', { hasText: 'hello 🙂' }); await m.hover(); if ((await m.locator('.tools .emo-r').count()) !== 6) throw new Error('not 6');
    await m.locator('.tools button[aria-label="React 😢"]').click(); await P.waitForSelector('.msg:has-text("hello 🙂") .react:has-text("😢")');
    await send(H, '🎉'); await P.waitForSelector('.txt.big'); const anim = await P.evaluate(() => getComputedStyle(document.querySelector('.txt.big')).animationName); if (anim !== 'cx-pop') throw new Error(anim);
  });
  await step('sticker packs with a caption', async () => { await H.click('#composerHost .emojibtn'); await H.click('#picker .ptabs button[aria-label="Stickers"]'); await H.click('#picker .cx-cats button[aria-label="Cats"]'); await H.fill('#picker .cx-capin', 'Monday mood'); await H.click('#picker .sticker >> nth=1'); await P.waitForSelector('.cx-sticker text.cx-stcap:has-text("MONDAY")'); if (last('general').sticker.p !== 'cats') throw new Error('pack'); });
  let gifFile;
  await step('My GIFs: save a GIF from the chat, find it in the picker, send it', async () => {
    await H.setInputFiles('#composerHost input[type=file]', { name: 'party.gif', mimeType: 'image/gif', buffer: png }); await H.waitForSelector('#composerHost .chip svg.ok'); await H.click('#composerHost .send');
    await P.waitForSelector('.msg .att img[alt="party.gif"]'); await msgMenu(P, ''); await P.locator('.msg:has(img[alt="party.gif"])').last().hover(); await P.locator('.msg:has(img[alt="party.gif"]) .tools button[title="More"]').last().click();
    await P.click('.popmenu button:has-text("Save to My GIFs")'); await P.waitForSelector('.toast:has-text("Saved to My GIFs")');
    await P.click('#composerHost .emojibtn'); await P.click('#picker .ptabs button[aria-label="My GIFs"]'); await P.waitForSelector('#picker .cx-gifbtn'); await P.click('#picker .cx-gifbtn');
    await H.waitForFunction(() => { const m = LC.S.win.general.msgs.slice(-1)[0]; return m && m.gif === 1; }); gifFile = last('general').files[0].id; if (c.db.files[gifFile].by !== bob.id) throw new Error('not a copy');
  });
  await step('meme maker: top/bottom text on a picture, sent as an image', async () => {
    await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Make a meme")'); await H.setInputFiles('.cx-meme input[type=file]', { name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from(bigPng) });
    await H.fill('.cx-meme input[placeholder="Top text"]', 'when the build'); await H.fill('.cx-meme input[placeholder="Bottom text"]', 'passes first try'); await sleep(300); await H.screenshot({ path: SHOTS + '/meme-light.png' });
    await H.click('.cx-meme .acts .primary'); await P.waitForFunction(() => { const m = LC.S.win.general.msgs.slice(-1)[0]; return m && m.meme === 1 && m.files && /^meme-/.test(m.files[0].name); });
  });
  await step('praise: pick a badge and people, add a note', async () => {
    await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Praise")'); await H.click('.cx-badgebtn:has-text("Team player")'); await H.check('.modal .pick:has-text("Bob") input'); await H.fill('.modal textarea', 'Thanks for the release!');
    await H.click('.modal .acts .primary'); await P.waitForSelector('.cx-praise:has-text("Praise for Bob")'); await P.waitForSelector('.cx-praise .cx-praisetitle:has-text("Team player")');
  });

  console.log('Search and commands');
  const tx = await c.ctx === undefined; void tx;
  await step('search box: suggestions while typing (people, chats), results page with tabs and highlights', async () => {
    const up = await H.evaluate(async () => { const f = new File(['The quarterly zebracorn report is ready.'], 'report.txt', { type: 'text/plain' }); const u = await LC.upload(f, 'report.txt').promise; await LC.api('/api/send', { chan: 'general', text: 'report attached', files: [{ id: u.id, name: u.name, size: u.size }] }); return u.id; }); void up;
    await send(P, 'the zebracorn budget meeting'); await H.click('#search'); await H.fill('#search', 'Bo'); await H.waitForSelector('#cxSearchList .cx-opt:has-text("Bob")'); await H.waitForSelector('#cxSearchList .cx-sughead:has-text("People")');
    await H.fill('#search', 'zebracorn'); await H.press('#search', 'Enter'); await H.waitForSelector('#tabView .cx-rmsg mark.cx-hl'); await H.waitForSelector('.cx-rtabs [role=tab]:has-text("Files")');
    await H.click('.cx-rtabs [role=tab]:has-text("Files")'); await H.waitForSelector('.cx-rfile:has-text("report.txt") .cx-snip mark.cx-hl');
    await H.click('.cx-rtabs [role=tab]:has-text("People")'); await H.fill('.cx-rq', 'bob'); await H.waitForSelector('.cx-rrow:has-text("Bob") mark'); await H.click('.cx-rtabs [role=tab]:has-text("Channels")'); await H.fill('.cx-rq', 'gen'); await H.waitForSelector('.cx-rrow:has-text("general")');
    await H.screenshot({ path: SHOTS + '/search-results-light.png' });
    await H.click('.cx-rtabs [role=tab]:has-text("Messages")'); await H.fill('.cx-rq', 'zebracorn'); await H.waitForSelector('.cx-rmsg:has-text("budget")'); await H.click('.cx-rmsg:has-text("budget")'); await H.waitForSelector('#msgs .msg:has-text("budget") mark.cx-hl');
  });
  await step('recent searches show when the box is focused and can be cleared', async () => { await H.click('#search'); await H.waitForSelector('#cxSearchList .cx-opt:has-text("zebracorn")'); await H.click('#cxSearchList .cx-sughead button'); await H.waitForFunction(() => !(LC.prefs().recentSearches || []).length); await H.keyboard.press('Escape'); });
  await step('find in this chat (Ctrl+F): count, next/previous, highlights', async () => {
    for (const w of ['needle one', 'needle two', 'needle three']) await send(H, w);
    await H.click('#msgs'); await H.keyboard.press('Control+f'); await H.waitForSelector('.cx-findin'); await H.fill('.cx-findin', 'needle'); await H.waitForSelector('.cx-findcount:has-text("1 of 3")');
    await H.press('.cx-findin', 'Enter'); await H.waitForSelector('.cx-findcount:has-text("2 of 3")'); await H.waitForSelector('.msg.cx-findcur:has-text("needle two")'); await H.waitForSelector('#msgs mark.cx-hl');
    await H.press('.cx-findin', 'Shift+Enter'); await H.waitForSelector('.cx-findcount:has-text("1 of 3")'); await H.screenshot({ path: SHOTS + '/find-light.png' }); await H.press('.cx-findin', 'Escape'); await H.waitForSelector('.cx-findin', { state: 'detached' });
  });
  await step('slash commands: list in the message box, /away runs, /goto from the search box, /help', async () => {
    await H.fill('#composerHost textarea', '/'); await H.waitForSelector('#composerHost .ac button:has-text("/away")'); await H.fill('#composerHost textarea', '/aw'); await H.press('#composerHost textarea', 'Enter');
    await H.waitForFunction(() => LC.S.me.presence === 'away'); if (await H.inputValue('#composerHost textarea')) throw new Error('box not cleared');
    await H.click('#search'); await H.fill('#search', '/goto news'); await H.press('#search', 'Enter'); await H.waitForFunction(() => LC.S.chan === 'news');
    await H.fill('#composerHost textarea', '/help'); await H.press('#composerHost textarea', 'Enter'); await H.waitForSelector('.modal .cx-cmdtable kbd:has-text("/unread")'); await H.keyboard.press('Escape');
    await H.evaluate(() => LC.api('/api/presence', { state: 'auto' })); await openChat(H, 'general');
  });

  console.log('Chat list');
  await step('drafts show a pencil and "Draft:" in the list; Drafts filter', async () => {
    await openChat(H, dm(host, bob)); await H.fill('#composerHost textarea', 'half-written thought'); await sleep(450); await openChat(H, 'general');
    await H.waitForSelector(`.item[data-chan="${dm(host, bob)}"] .cx-draft:has-text("half-written")`); await H.click('.cx-chip:has-text("Drafts")'); await H.waitForSelector(`#nav .item[data-chan="${dm(host, bob)}"]`);
    if (await H.locator('#nav .item[data-chan="general"]').count()) throw new Error('filter shows general'); await H.click('.cx-chip:has-text("Drafts")');
  });
  await step('mark a chat as unread (menu), synced on the server; opening it clears it; Unread filter', async () => {
    await H.click('#nav .item[data-chan="news"] .kebab'); await H.click('.popmenu button:has-text("Mark as unread")'); await H.waitForSelector('#nav .item[data-chan="news"].unread .cx-flag');
    if (!(c.db.cxUnread[host.id] || {}).news) throw new Error('not on server'); await H.click('.cx-chip:has-text("Unread")'); await H.waitForSelector('#nav .item[data-chan="news"]'); await H.click('.cx-chip:has-text("Unread")');
    await openChat(H, 'news'); await H.waitForFunction(() => !LC.S.cx.unread.news); await openChat(H, 'general'); if ((c.db.cxUnread[host.id] || {}).news) throw new Error('not cleared');
  });
  await step('meeting chats show with a calendar tile and under the Meetings filter', async () => { await H.click('.cx-chip:has-text("Meetings")'); await H.waitForSelector('#nav .item[data-chan="m-plan"] .av.cx-meet'); await H.click('.cx-chip:has-text("Meetings")'); });
  await step('notes to self at the top as "<name> (You)"', async () => { const first = await H.locator('#nav .item').first().getAttribute('data-chan'); if (first !== dm(host, host)) throw new Error(first); await H.click('#nav .item:has-text("Host (You)")'); await send(H, 'buy milk'); await H.waitForSelector('#msgs .msg:has-text("buy milk")'); await H.waitForSelector('#title:has-text("(You)")'); });
  let gid;
  await step('New chat: To: box with two people and a group name', async () => {
    await H.click('#sideActions button[aria-label="New chat"]'); await H.fill('.cx-toin', 'bo'); await H.press('.cx-toin', 'Enter'); await H.fill('.cx-toin', 'car'); await H.press('.cx-toin', 'Enter'); await H.fill('.modal input[placeholder="Group name (optional)"]', 'Trip crew');
    await H.fill('.cx-newchat textarea', 'first!'); await H.click('.cx-newchat button[type=submit]'); await H.waitForFunction(() => LC.S.chan.startsWith('g-')); gid = await H.evaluate(() => LC.S.chan);
    await P.waitForSelector('#nav .item:has-text("Trip crew")'); await H.waitForSelector('#msgs .msg:has-text("first!")');
  });
  await step('any member renames the group (system line with an icon); group picture shows in list and header', async () => {
    await openChat(P, gid); await P.click('#headActions button[title="More options"]'); P.once('dialog', () => {}); await P.click('.popmenu button:has-text("Rename chat")'); await P.fill('.modal.top input', 'Trip crew 2026'); await P.press('.modal.top input', 'Enter');
    await H.waitForSelector('#msgs .msg.sys.k-rename svg'); await H.waitForSelector('#title:has-text("Trip crew 2026")');
    await P.click('#headActions button[title="More options"]'); const fc = P.waitForEvent('filechooser'); await P.click('.popmenu button:has-text("Change picture")'); await (await fc).setFiles({ name: 'pic.png', mimeType: 'image/png', buffer: Buffer.from(bigPng) });
    await H.waitForSelector(`#nav .item[data-chan="${gid}"] .av img`); await H.waitForSelector('#headAvatar .av img'); await H.waitForSelector('#msgs .msg.sys.k-picture');
  });
  await step('adding someone without history: they do not see older messages', async () => {
    await send(H, 'secret plans before dave');
    const dave = c.makeUser('Dave'); const dt = c.newToken(dave); await H.evaluate(() => LC.emitLocal('user', {})).catch(() => {}); await sleep(200);
    await H.evaluate(async (g) => { await LC.api('/api/channel/members', { id: g, add: [Object.values(LC.S.users).length ? null : null].filter(Boolean) }).catch(() => {}); }, gid);
    await H.reload(); await H.waitForSelector('#app:not(.hidden) .item.active'); await openChat(H, gid); await H.click('#headActions .cx-peoplebtn'); await H.waitForSelector('.modal .cx-picker');
    await H.check('.modal .cx-picker .pick:has-text("Dave") input'); await H.check('.modal input[name=cxHist][value=none]'); await H.click('.modal .acts .primary:has-text("Add")');
    await H.waitForSelector('#msgs .msg.sys.k-add'); const D = await open(dt, 'dave'); await openChat(D, gid); await D.waitForSelector('#msgs .msg.sys');
    if (await D.locator('#msgs .msg:has-text("secret plans")').count()) throw new Error('history leaked'); await D.ctx.close();
  });
  await step('delete a 1:1 chat for me: gone from the list until a new message arrives', async () => {
    await openChat(P, dm(bob, cara)); await send(P, 'hi cara'); const C = await open(ct, 'cara'); await C.waitForSelector(`#nav .item[data-chan="${dm(bob, cara)}"]`);
    await C.click(`#nav .item[data-chan="${dm(bob, cara)}"] .kebab`); await C.click('.popmenu button:has-text("Delete chat")'); await C.click('[role=alertdialog] button.primary');
    await C.waitForSelector(`#nav .item[data-chan="${dm(bob, cara)}"]`, { state: 'detached' }); await send(P, 'still there?'); await C.waitForSelector(`#nav .item[data-chan="${dm(bob, cara)}"]`);
    await C.click(`#nav .item[data-chan="${dm(bob, cara)}"]`); await C.waitForSelector('#msgs .msg:has-text("still there?")'); if (await C.locator('#msgs .msg:has-text("hi cara")').count()) throw new Error('old history visible');
    await C.ctx.close();
  });
  await step('your own sections: create, drag a chat in, it is stored in your settings', async () => {
    await openChat(H, 'general'); await H.click('#sideActions button[aria-label="More chat list options"]'); await H.click('.popmenu button:has-text("New section")'); await H.fill('.modal.top input', 'Family'); await H.press('.modal.top input', 'Enter');
    await H.waitForSelector('#nav .sec:has-text("Family")'); await H.dragTo(`#nav .item[data-chan="${gid}"]`, '#nav .sec:has-text("Family")');
    await H.waitForFunction((g) => (LC.prefs().chatSections || []).some((s) => s.name === 'Family' && s.chats.includes(g)), gid);
    if (!c.db.users[host.id].prefs.chatSections[0].chats.includes(gid)) throw new Error('not on server'); await H.screenshot({ path: SHOTS + '/chatlist-sections-light.png' });
  });
  await step('hide previews (Settings › Appearance) and Ctrl+Enter sending mode', async () => {
    await H.click('#gearBtn'); await H.click('.popmenu button:has-text("Settings")'); await H.click('.tabbtn:has-text("Appearance")'); await H.click('.modal label:has-text("Hide message previews") input'); await H.click('.modal input[name=cxSendKey][value=ctrl]'); await H.keyboard.press('Escape');
    await H.waitForSelector('#nav .item.cx-nopreview'); await H.fill('#composerHost textarea', 'line one'); await H.press('#composerHost textarea', 'Enter'); await H.keyboard.type('line two');
    if ((await H.inputValue('#composerHost textarea')) !== 'line one\nline two') throw new Error('Enter sent'); await H.press('#composerHost textarea', 'Control+Enter'); await P.waitForSelector('.msg:has-text("line two")');
    await H.evaluate(() => LC.setPrefs({ hidePreviews: false, sendKey: 'enter' }));
  });

  console.log('Writing messages');
  await step('Format box: toolbar wraps the selection, lists, table, code block with language, live preview', async () => {
    await openChat(H, 'general'); await H.click('#composerHost .cx-fmtbtn'); await H.fill('#composerHost textarea', 'make me bold'); await H.evaluate(() => { const t = document.querySelector('#composerHost textarea'); t.setSelectionRange(8, 12); });
    await H.click('#composerHost .cx-fmtbar button[aria-label^="Bold"]'); if ((await H.inputValue('#composerHost textarea')) !== 'make me **bold**') throw new Error(await H.inputValue('#composerHost textarea'));
    await H.press('#composerHost textarea', 'End'); await H.keyboard.press('Shift+Enter'); await H.keyboard.type('apples'); await H.click('#composerHost .cx-fmtbar button[aria-label="Bulleted list"]'); await H.press('#composerHost textarea', 'End'); await H.keyboard.press('Enter'); await H.keyboard.type('pears');
    if (!(await H.inputValue('#composerHost textarea')).endsWith('- apples\n- pears')) throw new Error('list: ' + (await H.inputValue('#composerHost textarea')));
    await H.keyboard.press('Enter'); await H.keyboard.press('Enter'); await H.click('#composerHost .cx-fmtbar button[aria-label="Insert table"]'); await H.click('.modal .acts .primary');
    await H.click('#composerHost .cx-fmtbar button[aria-label="Code block"]'); await H.selectOption('.modal select', 'py'); await H.fill('.modal .cx-codein', 'def hi():\n    return "hi"  # greet'); await H.click('.modal .acts .primary');
    await H.click('#composerHost .cx-fmtbar button[aria-label="Preview"]'); await H.waitForSelector('#composerHost .cx-preview .cx-table'); await H.screenshot({ path: SHOTS + '/format-box-light.png' });
    await H.press('#composerHost textarea', 'Control+Enter'); await P.waitForSelector('.msg .txt b:has-text("bold")'); await P.waitForSelector('.msg .cx-code.lang-py .tk-k'); await P.waitForSelector('.msg .cx-table');
  });
  await step('coloured code blocks have a Copy button', async () => { await P.locator('.cx-code.lang-py').last().locator('.cx-copy').click(); await P.waitForSelector('.toast:has-text("Code copied")'); const clip = await P.evaluate(() => navigator.clipboard.readText()); if (!clip.includes('def hi')) throw new Error(clip); });
  await step('subject line in a channel; Important / Urgent label', async () => {
    await H.fill('#composerHost .cx-subjectin', 'Release day'); await H.fill('#composerHost textarea', 'Everything ships at 5.'); await H.click('#composerHost .cx-fmtbar button[aria-label="Set delivery options"]'); await H.click('.popmenu button:has-text("Urgent")');
    await H.waitForSelector('#composerHost .cx-priochip .cx-prio.urgent'); await H.press('#composerHost textarea', 'Control+Enter'); await P.waitForSelector('.msg:has(.cx-subject:has-text("Release day")) .cx-prio.urgent');
    const m = last('general'); if (m.subject !== 'Release day' || m.priority !== 'urgent') throw new Error(JSON.stringify(m)); await H.click('#composerHost .cx-fmtbtn');
  });
  await step('announcement card with headline, subheading and banner colour', async () => { await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Announcement")'); await H.fill('.modal input[placeholder="Headline"]', 'Office party'); await H.fill('.modal input[placeholder="Subheading (optional)"]', 'Friday at 6'); await H.click('.modal .swatch[aria-label="Purple"]'); await H.click('.modal .acts .primary'); await P.waitForSelector('.cx-ann.cx-ban-purple .cx-annt:has-text("Office party")'); });
  await step('share location: coordinates card with Open in maps', async () => { await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Share location")'); await H.waitForSelector('.modal .cx-loc'); await H.click('.modal .acts .primary'); await P.waitForSelector('.msg .cx-loc .cx-coords:has-text("51.50070° N")'); await P.waitForSelector('.msg .cx-loc a[href*="openstreetmap.org"]'); });
  await step('spell check is on; quick replies are saved and inserted', async () => {
    if ((await H.getAttribute('#composerHost textarea', 'spellcheck')) !== 'true') throw new Error('spellcheck off');
    await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Quick replies")'); await H.click('.popmenu button:has-text("Manage quick replies")'); await H.click('.modal button:has-text("New quick reply")'); await H.fill('.modal .cx-quicklist textarea', 'On my way!'); await H.click('.modal .acts .primary');
    await H.waitForFunction(() => (LC.prefs().cannedReplies || [])[0] === 'On my way!'); await H.click('#composerHost .morebtn'); await H.click('.popmenu button:has-text("Quick replies")'); await H.click('.popmenu button:has-text("On my way!")'); if ((await H.inputValue('#composerHost textarea')) !== 'On my way!') throw new Error('not inserted'); await H.fill('#composerHost textarea', '');
  });
  await step('posts-style channel: Start a post with a subject, card with Reply, replies collapse under the post', async () => {
    await openChat(H, 'news'); await H.click('#composerHost .cx-startpost'); await H.fill('#composerHost .cx-subjectin', 'Q3 results'); await H.fill('#composerHost textarea', 'We did great.'); await H.press('#composerHost textarea', 'Control+Enter');
    await openChat(P, 'news'); await P.waitForSelector('.msg.cx-post:has(.cx-subject:has-text("Q3 results"))'); await P.click('.msg.cx-post:has-text("Q3 results") .cx-replybtn'); await P.fill('#threadPanel textarea', 'Congrats!'); await P.press('#threadPanel textarea', 'Enter');
    await H.waitForSelector('.msg.cx-post:has-text("Q3 results") .cx-replies:has-text("1 reply")'); await H.click('.msg.cx-post:has-text("Q3 results") .cx-replies'); await H.waitForSelector('.cx-postreplies .cx-preply:has-text("Congrats!")'); await H.screenshot({ path: SHOTS + '/posts-channel-light.png' });
  });
  await step('messaging rules: no Edit when edits are off, no stickers tab when stickers are off', async () => {
    c.S.messagingRules = { edit: false, stickers: false }; c.emit('settings', c.clientSettings()); await openChat(P, 'general'); await P.waitForFunction(() => LC.msgRules().edit === false);
    await send(P, 'cannot edit me'); await msgMenu(P, 'cannot edit me'); if (await P.locator('.popmenu button .ml:text-is("Edit")').count()) throw new Error('edit shown'); await P.keyboard.press('Escape');
    await P.click('#composerHost .emojibtn'); if (await P.locator('#picker .ptabs button[aria-label="Stickers"]').count()) throw new Error('stickers shown'); await P.keyboard.press('Escape');
    delete c.S.messagingRules; c.emit('settings', c.clientSettings());
  });

  console.log('Message actions');
  await step('copy link to a message; opening the link jumps to it', async () => {
    await openChat(H, 'general'); await send(H, 'link target message'); await msgMenu(H, 'link target message'); await H.click('.popmenu button:has-text("Copy link")');
    const link = await H.evaluate(() => navigator.clipboard.readText()); if (!/#m=general\/[0-9a-f]+$/.test(link)) throw new Error(link);
    for (let i = 0; i < 25; i++) await send(P, 'filler ' + i);
    const L = await open(bt, 'bob-link', { url: link }); await L.waitForSelector('#msgs .msg:has-text("link target message")'); if (await L.evaluate(() => location.hash)) throw new Error('hash kept'); await L.ctx.close();
  });
  await step('mark unread from here: "New messages" divider and unread count', async () => { await msgMenu(H, 'filler 20'); await H.click('.popmenu button:has-text("Mark as unread")'); await H.waitForSelector('#unreadSep + .msg:has-text("filler 20")'); await H.waitForSelector('#nav .item[data-chan="general"] .badge'); });
  await step('pinned messages bar shows the latest pin; See all lists them', async () => { await msgMenu(H, 'link target message'); await H.click('.popmenu button:has-text("Pin")'); await P.waitForSelector('.cx-pinbar:not(.hidden):has-text("link target message")'); await P.click('.cx-pinbar .cx-seeall'); await P.waitForSelector('.modal .hit:has-text("link target message")'); await P.keyboard.press('Escape'); });
  await step('See more for long messages', async () => { await send(P, Array.from({ length: 30 }, (_, i) => 'line ' + i).join('\n')); await H.waitForSelector('.msg:has-text("line 29") .cx-more'); await H.click('.msg:has-text("line 29") .cx-more'); await H.waitForSelector('.msg:has-text("line 29") .txt.cx-open'); });
  await step('threads: new-replies count, notifications off/on, followed threads view', async () => {
    await send(H, 'who is in for lunch?'); await P.locator('.msg', { hasText: 'who is in for lunch?' }).hover(); await P.click('.msg:has-text("who is in for lunch?") .tools button[title="Reply in thread"]'); await P.fill('#threadPanel textarea', 'me!'); await P.press('#threadPanel textarea', 'Enter');
    await H.waitForSelector('.msg:has-text("who is in for lunch?") .cx-newpill:has-text("1 new")'); await H.waitForSelector('#nav .cx-threadsrow .badge');
    await H.click('#nav .cx-threadsrow'); await H.waitForSelector('#tabView .cx-thcard:has-text("lunch")'); await H.screenshot({ path: SHOTS + '/followed-threads-light.png' }); await H.click('#tabView .cx-thmain');
    await H.waitForSelector('#threadPanel .msg:has-text("me!")'); await H.waitForSelector('.msg:has-text("who is in for lunch?") .cx-newpill', { state: 'detached' });
    await msgMenu(H, 'who is in for lunch?'); await H.click('.popmenu button:has-text("Turn off notifications")'); await H.waitForFunction(() => !LC.S.cx.follows.size || ![...LC.S.cx.follows].some((id) => LC.S.win.general.msgs.find((m) => m.id === id && /lunch/.test(m.text))));
  });
  await step('system lines carry icons (added, renamed, picture)', async () => { await openChat(H, gid); for (const k of ['add', 'rename', 'picture']) await H.waitForSelector(`#msgs .msg.sys.k-${k} svg`); });

  console.log('Screens');
  await step('screenshots light and dark', async () => {
    await openChat(H, 'general'); await H.screenshot({ path: SHOTS + '/chat-light.png' }); await H.click('#composerHost .emojibtn'); await H.screenshot({ path: SHOTS + '/picker-light.png' }); await H.keyboard.press('Escape');
    await H.evaluate(() => LC.setUi({ theme: 'dark' })); await H.screenshot({ path: SHOTS + '/chat-dark.png' }); await H.click('#composerHost .emojibtn'); await H.click('#picker .ptabs button[aria-label="Stickers"]'); await H.screenshot({ path: SHOTS + '/picker-stickers-dark.png' }); await H.keyboard.press('Escape');
    await H.click('#sideActions button[aria-label="New chat"]'); await H.fill('.cx-toin', 'b'); await H.screenshot({ path: SHOTS + '/newchat-dark.png' }); await H.keyboard.press('Escape');
    await openChat(H, gid); await H.click('#headActions button[title="Chat info"]'); await H.screenshot({ path: SHOTS + '/groupinfo-dark.png' }); await H.keyboard.press('Escape');
    await openChat(H, 'news'); await H.screenshot({ path: SHOTS + '/posts-channel-dark.png' }); await H.evaluate(() => LC.setUi({ theme: 'auto' }));
    const M = await open(bt, 'phone', { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true }); await M.waitForSelector('#app.list-mode .cx-chips'); await M.screenshot({ path: SHOTS + '/phone-list-light.png' }); await M.tap('#nav .item[data-chan="general"] .itemmain'); await M.waitForSelector('#app:not(.list-mode) #composerHost'); await M.screenshot({ path: SHOTS + '/phone-chat-light.png' }); await M.ctx.close();
  });
  console.log(`chatux UI: ${pass}/${pass + failN} passed`); console.log('ERRORS:', errs.length ? errs : 'none');
  await br.close(); app.stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(failN || errs.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
