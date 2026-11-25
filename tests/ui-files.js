'use strict';
// Files and Calendar browser flows (docs/features-files.md). Playwright with Chromium; servers use the files port range
// (4700–4799). Screenshots go to /tmp/files-shots/. With AXE_JS set, the new screens are audited with axe-core.
const ROOT = require('path').resolve(__dirname, '..'), os = require('os'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const { readZipIndex } = require(ROOT + '/lib/zip.js');
const SHOTS = '/tmp/files-shots'; fs.mkdirSync(SHOTS, { recursive: true });
const axeSrc = process.env.AXE_JS ? fs.readFileSync(process.env.AXE_JS, 'utf8') : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(os.tmpdir() + '/lc-files-ui-');
  const app = createApp({ dataDir: dir, name: 'Files UI', publicDir: ROOT + '/public' }); const port = await app.start(4710); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const ana = c.makeUser('Ana'); c.makeOwner(ana); const bob = c.makeUser('Bob'), eve = c.makeUser('Eve'); const at = c.newToken(ana), bt = c.newToken(bob), et = c.newToken(eve);
  const grp = 'g-files1'; c.db.channels[grp] = { id: grp, name: 'Project', topic: '', created: Date.now(), by: ana.id, members: [ana.id, bob.id], kind: 'group' }; c.sysMsg(grp, 'Ana created this group');
  const br = await chromium.launch(); const errs = []; let pass = 0, failN = 0, axeBad = 0;
  const open = async (tok, label, o = {}) => {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], ...o });
    await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok);
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.ctx = ctx;
    p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/401|404|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p;
  };
  const A = await open(at, 'ana'), P = await open(bt, 'bob');
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failN++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); try { await A.screenshot({ path: `${SHOTS}/fail-${pass + failN}.png` }); } catch {} } };
  const audit = async (p, label) => {
    if (!axeSrc) return; await p.evaluate(axeSrc);
    const r = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes.slice(0, 2).map((x) => x.target.join(' ')).join(' | ')}`));
    if (r.length) { axeBad += r.length; console.log(`    axe ${label}: ${r.length} violation(s)\n      ` + r.join('\n      ')); } else console.log(`    axe ${label}: 0 violations`);
  };
  const openChat = (p, chan) => p.evaluate((ch) => LC.openChat(ch), chan);
  const tab = async (p, key) => { await p.click(`.tab[data-tab="${key}"]`); };
  const prompt = async (p, value) => { await p.waitForSelector('.modal.top input'); await p.fill('.modal.top input', value); await p.press('.modal.top input', 'Enter'); };
  const confirm = async (p) => { await p.waitForSelector('[role=alertdialog] button.primary'); await p.click('[role=alertdialog] button.primary'); };
  const fileRec = (name) => Object.values(c.db.files).find((f) => f.name === name && !f.verOf);
  const code = 'const greet = (name) => `Hi ${name}`; // say hi\nfunction add(a, b) { return a + b; }\nconsole.log(greet("Bob"), add(2, 3));\n';

  console.log('Files');
  await step('a code file in a message gets a file card; View opens the text viewer with colours and line numbers', async () => {
    await openChat(A, grp); await A.setInputFiles('#composerHost input[type=file]', { name: 'app.js', mimeType: 'text/javascript', buffer: Buffer.from(code) });
    await A.waitForSelector('.chip svg.ok'); await A.click('#composerHost .send');
    await openChat(P, grp); await P.waitForSelector('.file.fl-card:has-text("app.js")');
    await P.click('.file.fl-card:has-text("app.js") button:has-text("View")'); await P.waitForSelector('.modal .fl-code .fl-line');
    const n = await P.locator('.modal .fl-line').count(); if (n !== 3) throw new Error('lines: ' + n);
    if (!(await P.locator('.modal .fl-tk').count()) || !(await P.locator('.modal .fl-tc').count())) throw new Error('no syntax colours');
    await P.screenshot({ path: `${SHOTS}/ui-viewer.png` }); await audit(P, 'text viewer'); await P.keyboard.press('Escape');
  });
  await step('CSV opens as a table; a big log says "Download to see the rest"', async () => {
    const big = 'line\n'.repeat(70000); await A.evaluate(async ([csv, log]) => { const a = await LC.upload(new Blob([csv]), 'budget.csv').promise, b = await LC.upload(new Blob([log]), 'server.log').promise; await LC.api('/api/send', { chan: 'g-files1', text: 'numbers', files: [a, b] }); }, ['Item,Q1,Q2\nRent,1200,1250\n"Coffee, beans",80,95\n', big]);
    await P.waitForSelector('.file.fl-card:has-text("budget.csv")'); await P.click('.file.fl-card:has-text("budget.csv") button:has-text("View")');
    await P.waitForSelector('.modal .fl-csv table'); const cell = await P.locator('.modal .fl-csv tbody tr >> nth=1').locator('td >> nth=1').textContent(); if (cell !== 'Coffee, beans') throw new Error(cell); await P.keyboard.press('Escape');
    await P.click('.file.fl-card:has-text("server.log") button:has-text("View")'); await P.waitForSelector('.modal .fl-trunc:not(.hidden)'); await P.keyboard.press('Escape');
  });
  await step('Files tab: lists the chat’s files; a new folder shows up live for the other person', async () => {
    await tab(A, 'files'); await tab(P, 'files'); await A.waitForSelector('.fl-table tr.fl-item:has-text("app.js")');
    await A.click('.fl-bar button:has-text("New folder")'); await prompt(A, 'Designs');
    await P.waitForSelector('.fl-table tr.fl-folder:has-text("Designs")'); await A.screenshot({ path: `${SHOTS}/ui-files-tab.png` }); await audit(A, 'Files tab (light)');
    await A.evaluate(() => LC.setUi({ theme: 'dark' })); await audit(A, 'Files tab (dark)'); await A.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('upload into a folder, breadcrumb navigation, Move to dialog', async () => {
    await A.click('.fl-table tr.fl-folder:has-text("Designs") .fl-name'); await A.waitForSelector('.fl-crumbs .fl-crumb.cur:has-text("Designs")');
    await A.setInputFiles('.fl-files input[type=file]', { name: 'logo-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('blue logo') });
    await A.waitForSelector('.fl-table tr.fl-item:has-text("logo-notes.txt")'); const r = fileRec('logo-notes.txt'); if (!r || r.home !== grp) throw new Error('not in the Files tab');
    await A.click('.fl-crumbs button.fl-crumb:has-text("Files")'); await A.waitForSelector('.fl-table tr.fl-item:has-text("budget.csv")');
    await A.click('.fl-table tr.fl-item:has-text("budget.csv") input[type=checkbox]'); await A.click('.fl-bar button:has-text("Move to")');
    await A.click('.modal .fl-treerow:has-text("Designs")'); await A.click('.modal button:has-text("Move here")');
    await P.waitForSelector('.fl-table tr.fl-folder:has-text("Designs") .fl-c-size:has-text("2 items")');
  });
  await step('rename a file: the chat message shows the new name', async () => {
    await A.click('.fl-table tr.fl-item:has-text("app.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Rename")'); await prompt(A, 'greeter.js');
    await tab(P, 'chat'); await P.waitForSelector('.file.fl-card:has-text("greeter.js")'); await tab(P, 'files');
  });
  await step('new version from the file menu: same message, "Version 2", history lists version 1', async () => {
    await A.waitForSelector('.fl-table tr.fl-item:has-text("greeter.js")');
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]');
    const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('.popmenu button:has-text("Upload new version")')]);
    await fc.setFiles({ name: 'greeter.js', mimeType: 'text/javascript', buffer: Buffer.from('const v = 2;\n') });
    await A.waitForSelector('.toast:has-text("version 2")'); await tab(P, 'chat'); await P.waitForSelector('.file.fl-card:has-text("greeter.js"):has-text("Version 2")');
    await P.click('.file.fl-card:has-text("greeter.js") button[aria-haspopup="menu"]'); await P.click('.popmenu button:has-text("Version history")');
    await P.waitForSelector('.modal .fl-vrow:has-text("Version 1")'); await audit(P, 'version history'); await P.keyboard.press('Escape'); await tab(P, 'files');
  });
  await step('Download all builds a zip on the server with the folder structure', async () => {
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click('.fl-bar button:has-text("Download all")')]);
    const f = path.join(dir, 'all.zip'); await dl.saveAs(f); const names = readZipIndex(f).map((e) => e.name).sort();
    for (const n of ['Designs/budget.csv', 'Designs/logo-notes.txt', 'greeter.js']) if (!names.includes(n)) throw new Error(names.join(', '));
  });
  await step('share link: members link is copied; it shows in the Files app under Shared links and can be removed', async () => {
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Copy link")');
    await A.waitForSelector('.modal input[value="anyone"]'); if (!(await A.locator('.modal input[value="anyone"]').isEnabled())) throw new Error('owner should be allowed a public link');
    await A.click('.modal button:has-text("Create link")'); await A.waitForSelector('.modal .fl-linkrow'); await audit(A, 'share dialog'); await A.keyboard.press('Escape');
    const k = Object.values(c.db.fileLinks)[0].k; const link = await P.evaluate((key) => fetch('/api/files/link/open?k=' + key, { headers: { 'x-token': LC.S.token } }).then((r) => r.status), k); if (link !== 200) throw new Error('member cannot open: ' + link);
    await A.click('.rbtn[data-pane="files"]'); await A.click('.fl-navitem:has-text("Shared links")'); await A.waitForSelector('.fl-linkrow:has-text("greeter.js")');
    await A.click('.fl-linkrow button[aria-label="Remove link"]'); await A.waitForSelector('.fl-linkrow', { state: 'detached' }); if (Object.keys(c.db.fileLinks).length) throw new Error('not revoked');
  });
  await step('Files app: recent files, type chips, name search, open details', async () => {
    await A.click('.fl-navitem:has-text("Recent")'); await A.waitForSelector('.fl-apptable tr:has-text("budget.csv")');
    await A.click('.fl-chip:has-text("Code")'); await A.waitForSelector('.fl-apptable tr:has-text("budget.csv")', { state: 'detached' }); await A.waitForSelector('.fl-apptable tr:has-text("greeter.js")');
    await A.click('.fl-chip:has-text("All")'); await A.fill('.fl-apphead input[type=search]', 'logo'); await A.waitForFunction(() => document.querySelectorAll('.fl-apptable tbody tr').length === 1);
    await A.screenshot({ path: `${SHOTS}/ui-files-app.png` }); await audit(A, 'Files app');
    await A.click('.fl-apptable tr:has-text("logo-notes") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Details")'); await A.waitForSelector('.modal .fl-dl:has-text("Project")'); await audit(A, 'details'); await A.keyboard.press('Escape');
    await A.fill('.fl-apphead input[type=search]', ''); await A.click('.rbtn[data-pane="chat"]');
  });
  await step('delete your file: the message shows "File deleted"; others can’t delete it', async () => {
    await openChat(A, grp); await tab(A, 'files');
    const id = fileRec('greeter.js').id, st = await P.evaluate((x) => fetch('/api/files/delete', { method: 'POST', headers: { 'x-token': LC.S.token }, body: JSON.stringify({ id: x }) }).then((r) => r.status), id);
    if (st !== 403) throw new Error('Bob deleted Ana’s file: ' + st);
    await A.click('.fl-table tr.fl-item:has-text("greeter.js") button[aria-haspopup="menu"]'); await A.click('.popmenu button:has-text("Delete")'); await confirm(A);
    await tab(P, 'chat'); await P.waitForSelector('.fl-deleted:has-text("File deleted")'); if (fileRec('greeter.js')) throw new Error('still on the server');
  });
  await step('outsiders see nothing of the chat’s files', async () => {
    const E = await open(et, 'eve'); const r = await E.evaluate(async () => { const a = await fetch('/api/files/list?chan=g-files1', { headers: { 'x-token': LC.S.token } }); const b = await fetch('/api/files/all', { headers: { 'x-token': LC.S.token } }).then((x) => x.json()); return [a.status, b.files.length]; });
    if (r[0] !== 404 || r[1] !== 0) throw new Error(JSON.stringify(r)); await E.ctx.close();
  });
  await step('phone: the Files tab and the Files app work at 390 px', async () => {
    const M = await open(at, 'phone', { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    await openChat(M, grp); await M.evaluate(() => LC.setTab('files')); await M.waitForSelector('.fl-table tr.fl-folder:has-text("Designs")'); await M.screenshot({ path: `${SHOTS}/ui-files-phone.png` });
    const wide = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); if (wide) throw new Error('horizontal scroll');
    await M.evaluate(() => LC.setPane('files')); await M.waitForSelector('.fl-apptable'); await M.ctx.close();
  });

  console.log('Calendar');
  const today = new Date(); today.setHours(0, 0, 0, 0); const atT = (h, m = 0, dd = 0) => { const d = new Date(today); d.setDate(d.getDate() + dd); d.setHours(h, m, 0, 0); return d.getTime(); };
  const evs = (chan) => ((c.db.extras[chan] || {}).events || []);
  const evByTitle = (chan, title) => evs(chan).find((e) => e.title === title);
  await step('chat Calendar tab: Add event shows in the month grid and Upcoming, live for the other person', async () => {
    await openChat(A, grp); await openChat(P, grp); await tab(A, 'calendar'); await tab(P, 'calendar'); await A.waitForSelector('#tabView .fl-cal .calgrid');
    await A.click('#tabView button:has-text("Add event")'); await A.fill('.modal input >> nth=0', 'Board games'); await A.click('.modal .primary');
    await A.waitForSelector('.evrow:has-text("Board games")'); await P.waitForSelector('.evrow:has-text("Board games")'); await P.waitForSelector('.fl-mcell .fl-chip-ev:has-text("Board games")');
    await A.screenshot({ path: `${SHOTS}/ui-cal-tab.png` }); await audit(A, 'Calendar tab');
  });
  await step('Calendar app: week view with the events of every chat; views, Today, previous / next', async () => {
    await A.evaluate(async ([g, s, e]) => { await LC.api('/api/event', { chan: g, op: 'add', title: 'Design review', start: s, end: e, location: 'Room 1' }); await LC.api('/api/event', { chan: 'general', op: 'add', title: 'Team lunch', start: s + 7200000, end: e + 7200000 }); }, [grp, atT(10), atT(11)]);
    await A.click('.rbtn[data-pane="calendar"]'); await A.waitForSelector('.fl-cal'); await A.selectOption('.fl-viewsel', 'week');
    await A.waitForSelector('.fl-ev:has-text("Design review")'); await A.waitForSelector('.fl-ev:has-text("Team lunch")'); await A.waitForSelector('.fl-col.today .fl-nowline');
    for (const v of ['day', 'workweek', 'month', 'week']) { await A.selectOption('.fl-viewsel', v); await A.waitForSelector(`.fl-cal[data-view="${v}"]`); }
    const t0 = await A.textContent('.fl-caltitle'); await A.click('.fl-calbar button[aria-label="Next"]'); await A.waitForFunction((x) => document.querySelector('.fl-caltitle').textContent !== x, t0);
    await A.click('.fl-calbar button:has-text("Today")'); await A.waitForFunction((x) => document.querySelector('.fl-caltitle').textContent === x, t0);
    await A.screenshot({ path: `${SHOTS}/ui-cal-week.png` }); await audit(A, 'Calendar app (light)'); await A.evaluate(() => LC.setUi({ theme: 'dark' })); await audit(A, 'Calendar app (dark)'); await A.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('drag an event one hour later, drag its bottom edge to make it longer (saved on the server)', async () => {
    const ev = { ...evByTitle(grp, 'Design review') }, b = A.locator('.fl-ev:has-text("Design review")'); await b.scrollIntoViewIfNeeded(); let box = await b.boundingBox();
    await A.mouse.move(box.x + box.width / 2, box.y + 10); await A.mouse.down(); await A.mouse.move(box.x + box.width / 2, box.y + 34, { steps: 4 }); await A.mouse.move(box.x + box.width / 2, box.y + 58, { steps: 4 }); await A.mouse.up();
    await A.waitForFunction(() => true); for (let i = 0; i < 40 && evByTitle(grp, 'Design review').start === ev.start; i++) await sleep(100);
    const moved = evByTitle(grp, 'Design review'); if (moved.start - ev.start !== 3600000) throw new Error('moved by ' + (moved.start - ev.start) / 60000 + ' min');
    await A.waitForSelector('.fl-ev:has-text("Design review") .fl-resize'); const b2 = A.locator('.fl-ev:has-text("Design review")'); box = await b2.boundingBox();
    await A.mouse.move(box.x + box.width / 2, box.y + box.height - 3); await A.mouse.down(); await A.mouse.move(box.x + box.width / 2, box.y + box.height + 12, { steps: 3 }); await A.mouse.move(box.x + box.width / 2, box.y + box.height + 22, { steps: 3 }); await A.mouse.up();
    for (let i = 0; i < 40 && evByTitle(grp, 'Design review').end - evByTitle(grp, 'Design review').start === 3600000; i++) await sleep(100);
    const r = evByTitle(grp, 'Design review'); if (r.end - r.start !== 90 * 60000) throw new Error('length ' + (r.end - r.start) / 60000);
  });
  await step('Bob may not move Ana’s event; he answers Tentative and Ana sees it in the event card', async () => {
    await P.click('.rbtn[data-pane="calendar"]'); await P.selectOption('.fl-viewsel', 'week'); await P.waitForSelector('.fl-ev:has-text("Design review")');
    if (await P.locator('.fl-ev.can:has-text("Design review")').count()) throw new Error('Bob can drag it');
    await P.click('.fl-ev:has-text("Design review")'); await P.waitForSelector('.fl-peek'); await audit(P, 'event card'); await P.click('.fl-peek button:has-text("Tentative")');
    for (let i = 0; i < 40 && !(evByTitle(grp, 'Design review').rsvp || {})[bob.id]; i++) await sleep(100); if (evByTitle(grp, 'Design review').rsvp[bob.id] !== 'maybe') throw new Error('not saved');
    let seen = false; for (let i = 0; i < 12 && !seen; i++) { await A.click('.fl-ev:has-text("Design review")'); await A.waitForSelector('.fl-peek'); seen = (await A.locator('.fl-peek:has-text("Tentative (1)")').count()) > 0; await A.keyboard.press('Escape'); if (!seen) await sleep(300); }
    if (!seen) throw new Error('Ana does not see Bob’s answer');
  });
  await step('repeating event from the form (weekly), delete one occurrence; month view drag moves a single event to another day', async () => {
    const first = new Date(); first.setDate(1); const ymd1 = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`;
    await A.click('.fl-calbar button:has-text("New event")'); await A.fill('.modal input >> nth=0', 'Yoga'); await A.selectOption('.modal select[aria-label="Chat"]', grp);
    await A.fill('.modal input[aria-label="Start date"]', ymd1); await A.fill('.modal input[aria-label="End date"]', ymd1);
    await A.fill('.modal input[aria-label="Start time"]', '07:00'); await A.fill('.modal input[aria-label="End time"]', '08:00'); await A.selectOption('.modal select[aria-label="Repeat"]', 'weekly'); await audit(A, 'event form');
    await A.click('.modal .primary'); await A.waitForSelector('.modal', { state: 'hidden' });
    const y = evByTitle(grp, 'Yoga'); if (!y || !y.repeat || y.repeat.freq !== 'weekly') throw new Error(JSON.stringify(y));
    await A.selectOption('.fl-viewsel', 'month'); await A.waitForSelector('.fl-mcell .fl-chip-ev:has-text("Yoga")'); const n0 = await A.locator('.fl-chip-ev:has-text("Yoga")').count(); if (n0 < 4) throw new Error('occurrences: ' + n0);
    await A.click('.fl-chip-ev:has-text("Yoga") >> nth=1'); await A.click('.fl-peek button:has-text("Delete")'); await A.click('.popmenu button:has-text("Delete this occurrence")');
    await A.waitForFunction((n) => document.querySelectorAll('.fl-chip-ev').length && [...document.querySelectorAll('.fl-chip-ev')].filter((x) => x.textContent.includes('Yoga')).length === n - 1, n0);
    const lunch = { ...evByTitle('general', 'Team lunch') }, src = A.locator('.fl-chip-ev:has-text("Team lunch")'), cell = await src.evaluate((n) => n.closest('.fl-mcell').dataset.day), target = A.locator(`.fl-mcell[data-day="${Number(cell) + (new Date().getDate() >= 27 ? -1 : 1)}"]`);
    await src.dragTo(target); for (let i = 0; i < 40 && evByTitle('general', 'Team lunch').start === lunch.start; i++) await sleep(100);
    if (Math.abs(Math.abs(evByTitle('general', 'Team lunch').start - lunch.start) - 86400000) > 3600000) throw new Error('not moved a day');
    await A.selectOption('.fl-viewsel', 'week');
  });
  await step('categories: rename for yourself, colour an event; second time zone column', async () => {
    await A.click('.fl-calbar button[aria-label="More calendar options"]'); await A.click('.popmenu button:has-text("Categories")'); await A.fill('.modal input[aria-label="Red category"]', 'Work'); await A.click('.modal .primary');
    await A.click('.fl-ev:has-text("Design review")'); await A.click('.fl-peek button:has-text("Categorize")'); await A.click('.popmenu button:has-text("Work")');
    await A.waitForFunction(() => (document.querySelector('.fl-ev[data-key*="|"]:not([data-x])') || {}) && [...document.querySelectorAll('.fl-ev')].some((n) => n.textContent.includes('Design review') && /--c:\s*#d13438/.test(n.getAttribute('style'))));
    if (c.db.calPrefs[ana.id].cats.red !== 'Work') throw new Error('names not saved');
    await A.click('.fl-calbar button[aria-label="More calendar options"]'); await A.click('.popmenu button:has-text("Second time zone")'); await A.selectOption('.modal select', 'Asia/Kolkata'); await A.click('.modal .primary');
    await A.waitForSelector('.fl-gutter.tz2'); await A.screenshot({ path: `${SHOTS}/ui-cal-tz2.png` });
    await A.click('.fl-calbar button[aria-label="More calendar options"]'); await A.click('.popmenu button:has-text("Second time zone")'); await A.selectOption('.modal select', { index: 0 }); await A.click('.modal .primary'); await A.waitForSelector('.fl-gutter.tz2', { state: 'detached' });
  });
  await step('meetings show next to events; Join and RSVP use the meetings area; New meeting opens its form', async () => {
    const r = await A.evaluate(async ([s, e, b]) => LC.api('/api/meetings/create', { title: 'Client call', start: s, end: e, invitees: [b] }), [atT(15), atT(16), bob.id]); if (!r.ok) throw new Error(JSON.stringify(r));
    await A.evaluate(() => LC.calendar && LC.emitLocal('fl_events', {})); await P.waitForSelector('.fl-ev.mt:has-text("Client call")', { timeout: 10000 }).catch(async () => { await P.click('.fl-calbar button:has-text("Today")'); await P.waitForSelector('.fl-ev.mt:has-text("Client call")'); });
    await P.click('.fl-ev.mt:has-text("Client call")'); await P.click('.fl-peek button:has-text("Accept")'); for (let i = 0; i < 40 && (c.db.meetings[r.meeting.id].rsvp || {})[bob.id] !== 'yes'; i++) await sleep(100);
    if (c.db.meetings[r.meeting.id].rsvp[bob.id] !== 'yes') throw new Error('meeting RSVP not saved');
    await P.evaluate(() => { window.__joined = null; LC.meetings.join = (id) => { window.__joined = id; }; });
    await P.click('.fl-ev.mt:has-text("Client call")'); await P.click('.fl-peek button:has-text("Join")'); if ((await P.evaluate(() => window.__joined)) !== r.meeting.id) throw new Error('join not routed');
    await A.click('.fl-calbar button:has-text("New meeting")'); await A.waitForSelector('.modal'); await A.keyboard.press('Escape');
  });
  await step('scheduling assistant: busy blocks for the people you pick', async () => {
    await A.click('.fl-calbar button[aria-label="More calendar options"]'); await A.click('.popmenu button:has-text("Scheduling assistant")');
    await A.click('.modal .fl-pick:has-text("Bob") input'); await A.waitForSelector('.modal .fl-fbrow:has-text("Bob") .fl-fbslot.busy, .modal .fl-fbrow:has-text("Bob") .fl-fbslot.tent');
    await audit(A, 'scheduling assistant'); await A.click('.modal .fl-fball .fl-fbslot.free >> nth=0'); if (await A.locator('.modal button:has-text("Schedule")').isDisabled()) throw new Error('no slot picked'); await A.keyboard.press('Escape');
  });
  await step('export and import .ics', async () => {
    await A.click('.fl-calbar button[aria-label="More calendar options"]');
    const [dl] = await Promise.all([A.waitForEvent('download'), A.click('.popmenu button:has-text("Export calendar")')]); const f = path.join(dir, 'cal.ics'); await dl.saveAs(f); const txt = fs.readFileSync(f, 'utf8');
    if (!txt.includes('SUMMARY:Design review') || !txt.includes('RRULE:FREQ=WEEKLY')) throw new Error(txt.slice(0, 300));
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:' + new Date(atT(13, 0, 1)).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z\r\nDURATION:PT1H\r\nSUMMARY:Imported dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    await A.click('.fl-calbar button[aria-label="More calendar options"]'); const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('.popmenu button:has-text("Import")')]);
    await fc.setFiles({ name: 'dentist.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics) }); await A.selectOption('.modal select', grp); await A.click('.modal .primary');
    await A.waitForSelector('.toast:has-text("Imported 1")'); if (!evByTitle(grp, 'Imported dentist')) throw new Error('not imported');
  });
  await step('phone: the Calendar app opens in the day view without sideways scrolling', async () => {
    const M = await open(c.newToken(ana), 'phone-cal', { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    await M.evaluate(() => LC.setPane('calendar')); await M.waitForSelector('.fl-cal[data-view="day"]'); await M.screenshot({ path: `${SHOTS}/ui-cal-phone.png` });
    if (await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('horizontal scroll'); await M.ctx.close();
  });

  console.log(`ui-files: ${pass}/${pass + failN} steps passed${axeSrc ? `, axe violations: ${axeBad}` : ''}`);
  console.log('ERRORS:', errs.length ? errs : 'none');
  await br.close(); app.stop(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(failN || axeBad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
