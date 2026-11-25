'use strict';
// Browser test for the built-in apps (docs/features-apps.md): two people (Host in the light theme, Bob in the dark one)
// use every app and see each other's changes live. Screenshots go to /tmp/apps-shots/. Ports 4600–4699 (apps area).
//   node tests/ui-apps.js            (needs Playwright with Chromium, like the other ui-*.js tests)
const ROOT = require('path').resolve(__dirname, '..'), os = require('os'), fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js');
const SHOTS = '/tmp/apps-shots', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lanchat-ui-apps-')); fs.mkdirSync(SHOTS, { recursive: true });
  const app = createApp({ dataDir: dir, name: 'Apps test', publicDir: ROOT + '/public' }); const port = await app.start(4600, 60); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'); const ht = c.newToken(host), bt = c.newToken(bob); c.sysMsg('general', 'Welcome');
  const api = (tok, p, b) => fetch(B + p, { method: b === undefined ? 'GET' : 'POST', headers: { 'x-token': tok, 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) }).then((r) => r.json());
  // a LAN web page for the website tab: one that may be framed and one that refuses
  const lanIp = (Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal) || {}).address;
  const site = http.createServer((q, res) => { res.writeHead(200, { 'content-type': 'text/html', ...(q.url === '/deny' ? { 'X-Frame-Options': 'DENY' } : {}) }); res.end('<!doctype html><title>Intranet</title><h1>Team wiki</h1>'); });
  await new Promise((ok) => site.listen(0, '0.0.0.0', ok)); const siteUrl = lanIp ? `http://${lanIp}:${site.address().port}` : '';
  const br = await chromium.launch(); const errs = []; let pass = 0, failn = 0;
  const open = async (tok, label, theme, vp = { width: 1280, height: 860 }) => {
    const ctx = await br.newContext({ viewport: vp, acceptDownloads: true }); await ctx.addInitScript(([t, th]) => { try { localStorage.setItem('lc_token', JSON.stringify(t)); if (th) localStorage.setItem('lc_ui', JSON.stringify({ theme: th })); } catch {} }, [tok, theme]);
    const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.ctx = ctx; p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active, #app:not(.hidden) #title'); await p.waitForTimeout(400); return p;
  };
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { failn++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 3).join(' | ')); try { await H.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '-').slice(0, 40)}-host.png` }); await P.screenshot({ path: `${SHOTS}/fail-${name.replace(/\W+/g, '-').slice(0, 40)}-bob.png` }); } catch {}
    for (const p of [H, P]) { try { await p.evaluate(() => { LC.closeModal(); LC.closeMenu(); document.querySelectorAll('.modal.top, .ap-pop').forEach((m) => m.remove()); }); await p.click('.rbtn[data-pane="chat"]'); } catch {} } } };
  const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });
  // accessibility: axe-core over the apps' screens (AXE_JS=/path/to/axe.min.js); any violation fails the step
  const axeSrc = process.env.AXE_JS && fs.existsSync(process.env.AXE_JS) ? fs.readFileSync(process.env.AXE_JS, 'utf8') : null; let audits = 0;
  const audit = async (p, label) => {
    if (!axeSrc) return; audits++; await p.evaluate(axeSrc);
    const v = await p.evaluate(async () => {
      const ours = (sel) => { let n = document.querySelector(sel); for (; n && n !== document.body; n = n.parentElement) if ([...(n.classList || [])].some((c) => c.startsWith('ap-'))) return true; return false; }; // this area's markup only
      return (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => ({ ...x, nodes: x.nodes.filter((n) => ours(n.target.join(' '))) })).filter((x) => x.nodes.length).map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    if (v.length) throw new Error(`axe on "${label}": ` + v.join(' ;; '));
  };
  const until = async (fn, ms = 6000, what = 'condition') => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out: ' + what); await sleep(100); } };
  const tab = (p, label) => p.click(`#tabs .tab:has-text("${label}")`);
  const addTab = async (p, label) => { await p.click('#tabs .tab[data-tab="ap_add"]'); await p.waitForSelector('.ap-gallery'); await p.click(`.ap-gcard:has-text("${label}") button.primary`); await p.waitForTimeout(300); };
  const moreMenu = async (p, item) => { await p.click('#composerHost .morebtn'); await p.click(`.popmenu button:has-text("${item}")`); };
  const H = await open(ht, 'host'), P = await open(bt, 'bob', 'dark');

  await step('tabs: "+" gallery adds a Notebook tab; Bob sees it live; rename and reorder from the gallery', async () => {
    await H.click('#tabs .tab[data-tab="ap_add"]'); await H.waitForSelector('.ap-gallery .ap-gcard'); await shot(H, 'gallery-light'); await audit(H, 'add a tab gallery');
    await H.click('.ap-gcard:has-text("Notebook") button.primary'); await H.waitForSelector('#tabs .tab.on:has-text("Notebook")');
    await P.waitForSelector('#tabs .tab:has-text("Notebook")');
    await H.click('#tabs .tab[data-tab="ap_add"]'); await H.click('.ap-trow:has-text("Notebook") button[aria-label^="Rename"]'); await H.fill('.modal.top input', 'Team notebook'); await H.click('.modal.top button.primary');
    await P.waitForSelector('#tabs .tab:has-text("Team notebook")'); await H.click('.ap-trow:has-text("Team notebook") button[aria-label^="Move left"]'); await H.keyboard.press('Escape');
    const order = await P.evaluate(() => [...document.querySelectorAll('#tabs .tab')].map((b) => b.dataset.tab)); if (order.indexOf('ap_notebook') > order.indexOf('notes')) throw new Error('not moved: ' + order);
  });
  await step('notebook: sections, page, formatting and a to-do; Bob sees the text live', async () => {
    await tab(H, 'Team notebook'); await H.click('.ap-nb .ap-empty button.primary'); await H.waitForSelector('.ap-nbedit[contenteditable=true]');
    await H.fill('.ap-nbtitle', 'Trip plan'); await H.click('.ap-nbedit'); await H.keyboard.type('Packing list'); await H.keyboard.press('Control+b'); await H.keyboard.type(' bold'); await H.keyboard.press('Control+b'); await H.keyboard.press('Enter'); await H.keyboard.press('Control+1'); await H.keyboard.type('Tent');
    await H.waitForSelector('.ap-nbstatus:has-text("Saved")', { timeout: 8000 });
    await tab(P, 'Team notebook'); await P.waitForSelector('.ap-nbedit .ap-chk:has-text("Tent")'); await P.waitForSelector('.ap-nbprow:has-text("Trip plan")');
    await H.click('.ap-nbedit .ap-chk', { position: { x: 8, y: 8 } }); await until(() => P.evaluate(() => !!document.querySelector('.ap-nbedit .ap-chk.on')), 8000, 'to-do ticked for Bob');
    const saved = Object.values(c.db.ap_notebooks)[0].sections[0].pages[0].html; if (!/<b>/.test(saved) || !/ap-chk on/.test(saved)) throw new Error(saved);
    await shot(H, 'notebook-light'); await shot(P, 'notebook-dark'); await audit(H, 'notebook'); await audit(P, 'notebook (dark)');
  });
  await step('notebook: someone else saves while Bob types → Bob merges both', async () => {
    const nb = Object.values(c.db.ap_notebooks)[0], pg = nb.sections[0].pages[0];
    await P.click('.ap-nbedit'); await P.keyboard.press('Control+End'); await P.keyboard.press('Enter'); await P.keyboard.type('Bob was here');
    const r = await api(ht, '/api/ap/nb/page', { chan: 'general', id: pg.id, v: pg.v, html: pg.html + '<p>Host added this</p>' }); if (!r.ok) throw new Error(JSON.stringify(r));
    await P.waitForSelector('.ap-nbconflict:not(.hidden)', { timeout: 6000 }); await shot(P, 'notebook-conflict-dark'); await audit(P, 'notebook conflict'); await P.click('.ap-nbconflict button:has-text("Merge both")');
    await until(() => /Bob was here/.test(pg.html) && /Host added this/.test(pg.html), 8000, 'merged page saved');
    await H.waitForSelector('.ap-nbedit p:has-text("Bob was here")');
  });
  await step('whiteboard: sticky note, rectangle and a template are drawn for Bob; PDF export', async () => {
    await tab(H, 'Whiteboard'); await tab(P, 'Whiteboard'); await H.waitForSelector('.ap-wb .boardcv'); await sleep(400);
    const box = await H.locator('.ap-wb .boardcv').boundingBox();
    await H.click('.ap-wbbar button[aria-label^="Sticky note"]'); await H.mouse.click(box.x + 200, box.y + 150); await H.waitForSelector('.ap-wbedit'); await H.keyboard.type('Pizza night'); await H.keyboard.press('Escape');
    await H.click('.ap-wbbar button[aria-label="Shapes"]'); await H.click('.popmenu button:has-text("Rectangle")'); await H.mouse.move(box.x + 420, box.y + 100); await H.mouse.down(); await H.mouse.move(box.x + 600, box.y + 220, { steps: 6 }); await H.mouse.up();
    await until(() => (c.db.extras.general.board || []).some((o) => o.t === 'sticky' && o.text === 'Pizza night') && c.db.extras.general.board.some((o) => o.t === 'rect'), 6000, 'objects stored');
    const px = await until(() => P.evaluate(() => { const cv = document.querySelector('.ap-wb .boardcv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 2000 ? n : 0; }), 6000, 'Bob sees the objects');
    void px; await H.click('.ap-wbbar button:has-text("Templates")'); await H.click('.popmenu button:has-text("Kanban")'); await until(() => c.db.extras.general.board.filter((o) => o.t === 'sticky').length >= 4, 6000, 'template stored');
    await sleep(500); await shot(H, 'whiteboard-light'); await shot(P, 'whiteboard-dark'); await audit(H, 'whiteboard'); await audit(P, 'whiteboard (dark)');
    const [dl] = await Promise.all([H.waitForEvent('download'), (async () => { await H.click('.ap-wbbar button[aria-label^="Save as"]'); await H.click('.popmenu button:has-text("PDF")'); })()]);
    const pdf = fs.readFileSync(await dl.path()); if (!pdf.slice(0, 8).toString().startsWith('%PDF-1.4') || !pdf.includes('/DCTDecode') || !pdf.slice(-6).toString().includes('%%EOF')) throw new Error('bad pdf');
  });
  await step('whiteboard: select, move and delete with the keyboard', async () => {
    const before = c.db.extras.general.board.length; await H.click('.ap-wbbar button[aria-label^="Select"]'); await H.click('.ap-wb .boardcv'); await H.keyboard.press('Control+a'); await H.keyboard.press('ArrowRight');
    await sleep(500); await H.keyboard.press('Delete'); await until(() => c.db.extras.general.board.length === 0, 6000, 'deleted'); await H.keyboard.press('Control+z'); await until(() => c.db.extras.general.board.length === before, 6000, 'undo brings them back');
  });
  await step('tasks: add, details (assign Bob, urgent, checklist), Bob sees it live and gets an activity item', async () => {
    await tab(H, 'Tasks'); await tab(P, 'Tasks'); await H.fill('.ap-quickadd input:not([type])', 'Book the hall'); await H.press('.ap-quickadd input:not([type])', 'Enter');
    await H.waitForSelector('.ap-card:has-text("Book the hall")'); await P.waitForSelector('.ap-card:has-text("Book the hall")');
    await H.click('.ap-card:has-text("Book the hall") .ap-copen'); await H.waitForSelector('.ap-details');
    await H.click('.ap-details .ap-pick'); await H.click('.ap-pop label:has-text("Bob")'); await H.keyboard.press('Escape');
    await H.selectOption('.ap-details select[aria-label="Priority"]', 'urgent'); await H.fill('.ap-details input[aria-label="Add an item"]', 'Ask for a price'); await H.press('.ap-details input[aria-label="Add an item"]', 'Enter');
    await H.waitForSelector('.ap-details .ap-ckrow'); await shot(H, 'task-details-light'); await audit(H, 'task details'); await H.click('.ap-details .acts button.primary');
    await P.waitForSelector('.ap-card:has-text("Book the hall") .ap-prio.p-urgent'); await P.waitForSelector('.ap-card:has-text("Book the hall") .ap-chip:has-text("0/1")');
    await until(() => (c.db.activity[bob.id] || []).some((a) => a.type === 'task' && a.app === 'tasks'), 4000, 'task activity');
  });
  await step('tasks: new bucket, drag a card there, Bob sees it move; list and charts views', async () => {
    await H.click('.ap-newcol button'); await H.fill('.modal.top input', 'Doing'); await H.click('.modal.top button.primary'); await H.waitForSelector('.ap-col[aria-label="Doing"]');
    await H.locator('.ap-card:has-text("Book the hall")').dragTo(H.locator('.ap-col[aria-label="Doing"] .ap-cards'));
    await P.waitForSelector('.ap-col[aria-label="Doing"] .ap-card:has-text("Book the hall")');
    await audit(H, 'task board'); await H.click('.ap-seg button:has-text("List")'); await H.waitForSelector('.ap-tlist tr.todo'); await audit(H, 'task list'); await H.click('.ap-seg button:has-text("Charts")'); await H.waitForSelector('.ap-charts svg.ap-donut'); await shot(H, 'tasks-charts-light'); await audit(H, 'task charts'); await H.click('.ap-seg button:has-text("Board")');
    await shot(P, 'tasks-board-dark'); await audit(P, 'task board (dark)');
  });
  await step('My tasks app: Bob completes the task in place; Host sees it done', async () => {
    await P.click('.rbtn[data-pane="ap_tasks"]'); await P.waitForSelector('.ap-mrow:has-text("Book the hall")'); await shot(P, 'my-tasks-dark'); await audit(P, 'my tasks');
    await P.click('.ap-mrow:has-text("Book the hall") input.ap-round'); await H.waitForSelector('.ap-card.done:has-text("Book the hall")');
    await P.click('.rbtn[data-pane="chat"]');
  });
  await step('activity: the task item opens the task', async () => {
    await P.click('.rbtn[data-pane="activity"]'); await P.waitForSelector('.pp-act:has-text("Book the hall")'); await P.click('.pp-act:has-text("Book the hall") .pp-amain'); await P.waitForSelector('.ap-details input.ap-dtitle'); await P.keyboard.press('Escape');
  });
  await step('forms: build from the message box, Bob fills it in, results and CSV', async () => {
    await tab(H, 'Chat'); await tab(P, 'Chat'); await moreMenu(H, 'New form'); await H.waitForSelector('.ap-qcard');
    await H.fill('.ap-ftitle', 'Lunch survey'); await H.fill('.ap-qcard .ap-qtext', 'Where shall we eat?'); const o = H.locator('.ap-qcard .ap-optrow input:not([type])'); await o.nth(0).fill('Pizza'); await o.nth(1).fill('Sushi');
    await H.click('.ap-qadd button:has-text("Rating")'); await H.locator('.ap-qtext').nth(1).fill('How hungry?'); await shot(H, 'form-builder-light'); await audit(H, 'form builder'); await H.click('.modal .acts button.primary');
    await P.waitForSelector('.ap-fcard:has-text("Lunch survey")'); await P.click('.ap-fcard button:has-text("Fill in")'); await P.click('.modal label:has-text("Sushi")'); await P.click('.ap-rating button >> nth=3'); await shot(P, 'form-fill-dark'); await audit(P, 'form fill in'); await P.click('.modal .acts button.primary'); await P.waitForSelector('.ap-thanks'); await P.keyboard.press('Escape');
    await H.waitForSelector('.ap-fcard:has-text("1 response")'); await H.click('.ap-fcard button:has-text("Results")'); await H.waitForSelector('.ap-qsum svg'); await shot(H, 'form-results-light'); await audit(H, 'form results');
    const [dl] = await Promise.all([H.waitForEvent('download'), H.click('.modal button:has-text("Export to CSV")')]); const csv = fs.readFileSync(await dl.path(), 'utf8'); if (!/Sushi/.test(csv) || !/Bob/.test(csv)) throw new Error(csv); await H.keyboard.press('Escape');
  });
  await step('approvals: request with Bob as approver; Bob approves from the card; Approvals app', async () => {
    await moreMenu(H, 'New approval request'); await H.fill('.modal input[aria-label="Request title"]', 'Buy a projector'); await H.click('.modal .ap-pick'); await H.click('.ap-pop label:has-text("Bob")'); await H.keyboard.press('Escape'); await H.click('.modal .acts button.primary');
    await P.waitForSelector('.ap-acard:has-text("Buy a projector") button:has-text("Approve")'); await P.click('.ap-acard button:has-text("Approve")'); await P.fill('.modal textarea', 'Good idea'); await P.click('.modal .acts button.primary');
    await H.waitForSelector('.ap-acard.s-approved'); await shot(H, 'approval-card-light'); await audit(H, 'chat with cards');
    await P.click('.rbtn[data-pane="ap_more"]'); await P.click('.popmenu button:has-text("Approvals")'); await P.waitForSelector('.ap-arow:has-text("Buy a projector")'); await shot(P, 'approvals-app-dark'); await audit(P, 'approvals app'); await P.click('.ap-arow'); await P.waitForSelector('.ap-hist li:has-text("Good idea")'); await P.keyboard.press('Escape'); await P.click('.rbtn[data-pane="chat"]');
  });
  await step('live components: checklist and table edited in place by both, live', async () => {
    await moreMenu(H, 'Live checklist'); await H.fill('.modal textarea', 'Milk\nEggs'); await H.click('.modal .acts button.primary'); await P.waitForSelector('.ap-live.k-checklist');
    await P.click('.ap-live.k-checklist .ap-lvitem input[type=checkbox] >> nth=0'); await H.waitForSelector('.ap-live.k-checklist .ap-lvitem.done');
    await P.fill('.ap-live.k-checklist .ap-lvnew', 'Bread'); await P.press('.ap-live.k-checklist .ap-lvnew', 'Enter');
    await until(() => H.evaluate(() => [...document.querySelectorAll('.ap-live.k-checklist .ap-lvin')].some((i) => i.value === 'Bread')), 6000, 'Host sees Bread');
    await moreMenu(H, 'Live table'); await H.click('.modal .acts button.primary'); await P.waitForSelector('.ap-live.k-table');
    await P.fill('.ap-live.k-table tbody .ap-lvin >> nth=0', 'Monday'); await P.press('.ap-live.k-table tbody .ap-lvin >> nth=0', 'Enter');
    await until(() => H.evaluate(() => [...document.querySelectorAll('.ap-live.k-table tbody .ap-lvin')].some((i) => i.value === 'Monday')), 6000, 'Host sees the cell');
    await shot(H, 'live-components-light'); await shot(P, 'live-components-dark'); await audit(H, 'live components'); await audit(P, 'live components (dark)');
  });
  await step('lists: issue tracker from a template, item from the form, Bob edits a cell inline, live', async () => {
    await addTab(H, 'Lists'); await H.click('#tabView button:has-text("New list")'); await H.click('.ap-tpl:has-text("Issue tracker")'); await H.click('.modal .acts button.primary'); await H.waitForSelector('.ap-lgrid');
    await H.click('#tabView button:has-text("New item")'); await H.fill('.modal .field:has-text("Issue") input', 'Wi-Fi drops'); await H.selectOption('.modal .field:has-text("Priority") select', { label: 'High' }); await H.click('.modal .acts button.primary'); await H.waitForSelector('.ap-lgrid td:has-text("Wi-Fi drops")');
    await tab(P, 'Lists'); await P.click('.ap-lcard:has-text("Issue tracker")'); await P.waitForSelector('.ap-lgrid td:has-text("Wi-Fi drops")');
    await P.click('.ap-lgrid tbody tr td.t-choice >> nth=1'); await P.selectOption('.ap-lgrid tbody tr td.t-choice select', { label: 'In progress' }); await H.waitForSelector('.ap-lgrid .ap-lchoice:has-text("In progress")');
    await shot(H, 'lists-light'); await shot(P, 'lists-dark'); await audit(H, 'list'); await audit(P, 'list (dark)');
  });
  await step('shifts: schedule, open shift, Bob asks for it, Host approves, Bob clocks in and out', async () => {
    await addTab(H, 'Shifts'); await H.click('#tabView button:has-text("Create a schedule")'); await H.waitForSelector('.ap-sgrid');
    const day = new Date().getDay(), col = (day + 6) % 7; await H.click(`.ap-sopen .ap-sadd >> nth=${col}`); await H.fill('.modal input[aria-label="Label"]', 'Evening'); await H.fill('.modal input[aria-label="Starts"]', '23:00'); await H.fill('.modal input[aria-label="Ends"]', '23:59'); await H.click('.modal .acts button.primary'); await H.waitForSelector('.ap-shift.open:has-text("Evening")');
    await tab(P, 'Shifts'); await P.click('.ap-shift.open:has-text("Evening")'); await P.click('.modal button:has-text("Ask for this shift")');
    await H.waitForSelector('.ap-tbar button:has-text("Requests (1)")'); await H.click('.ap-tbar button:has-text("Requests (1)")'); await H.click('.modal .ap-reqrow button:has-text("Approve")');
    await P.waitForSelector('.ap-sgrid tr:has-text("Bob") .ap-shift:has-text("Evening")'); await P.click('.ap-clockbtn button:has-text("Clock in")'); await P.waitForSelector('.ap-clockbtn button:has-text("Clock out")'); await P.click('.ap-clockbtn button:has-text("Clock out")');
    await until(() => (Object.values(c.db.ap_shifts)[0].clock || []).some((x) => x.out), 5000, 'clock entry'); await shot(H, 'shifts-light'); await shot(P, 'shifts-dark'); await audit(H, 'shifts'); await audit(P, 'shifts (dark)');
  });
  await step('check-ins: Ask now posts a card; Bob answers from the card; the summary shows it live', async () => {
    await addTab(H, 'Check-ins'); await H.click('#tabView .ap-empty button.primary'); await H.click('.modal .acts button.primary'); await H.waitForSelector('.ap-cicard'); await H.click('.ap-cicard button:has-text("Ask now")');
    await tab(P, 'Chat'); await P.waitForSelector('.ap-cicardmsg'); await P.click('.ap-cicardmsg button:has-text("Answer")'); await P.fill('.modal textarea >> nth=0', 'Wrote tests'); await P.click('.modal .acts button.primary');
    await H.waitForSelector('.ap-citable td:has-text("Wrote tests")'); await shot(H, 'checkins-light'); await audit(H, 'check-ins');
    await until(() => (c.db.activity[bob.id] || []).some((a) => a.type === 'checkin'), 4000, 'check-in activity');
  });
  await step('bookings: page with Bob as staff, Host books a free time, Bob sees it and gets an activity item', async () => {
    await H.click('.rbtn[data-pane="ap_more"]'); await H.click('.popmenu button:has-text("Bookings")'); await H.click('#nav button:has-text("New booking page")');
    await H.fill('.ap-book .field:has-text("Name") input', 'Haircuts'); await H.fill('.ap-svcedit input[aria-label="Service 1"]', 'Cut');
    await H.click('.ap-staffedit .ap-pick'); await H.click('.ap-pop label:has-text("Bob")');
    const card = () => [...document.querySelectorAll('.ap-staffcard')].find((x) => x.textContent.includes('Bob'));
    await H.evaluate(`(${card})().querySelectorAll('.ap-hrow input[type=checkbox]').forEach((cb) => { if (!cb.checked) cb.click(); })`);
    await H.evaluate(`(() => { const c = (${card})(); c.querySelectorAll('input[aria-label="Starts"]').forEach((i) => { i.value = '00:00'; i.dispatchEvent(new Event('change')); }); c.querySelectorAll('input[aria-label="Ends"]').forEach((i) => { i.value = '23:59'; i.dispatchEvent(new Event('change')); }); })()`);
    await H.click('.ap-book .acts button.primary'); await H.waitForSelector('.ap-svc'); await H.selectOption('.ap-book select[aria-label="Staff"]', { label: 'Bob' });
    await H.click('.ap-day >> nth=1'); await H.click('.ap-slot >> nth=2'); await shot(H, 'bookings-light'); await audit(H, 'bookings'); await H.click('.ap-bookbar button.primary');
    await until(() => (c.db.activity[bob.id] || []).some((a) => a.type === 'booking'), 5000, 'booking activity');
    await P.click('.rbtn[data-pane="ap_more"]'); await P.click('.popmenu button:has-text("Bookings")'); await P.waitForSelector('.ap-bkrow:has-text("Cut")'); await shot(P, 'bookings-dark'); await audit(P, 'my bookings'); await P.click('.rbtn[data-pane="chat"]');
  });
  await step('website tab: a LAN page shows in a frame; a page that refuses framing shows a helpful message', async () => {
    if (!siteUrl) return console.log('     (no LAN address: skipped)');
    await H.click('.rbtn[data-pane="chat"]'); await H.click('#tabs .tab[data-tab="ap_add"]'); await H.click('.ap-gcard:has-text("Website") button.primary'); await H.fill('.modal input[type=url]', siteUrl + '/'); await H.fill('.modal input:not([type])', 'Wiki'); await H.click('.modal.top .acts button.primary, #modal .acts button.primary');
    await H.waitForSelector('iframe.ap-web'); const frame = await (await H.$('iframe.ap-web')).contentFrame(); await frame.waitForSelector('h1:has-text("Team wiki")'); await shot(H, 'website-light'); await audit(H, 'website tab');
    await P.waitForSelector('#tabs .tab:has-text("Wiki")'); await H.click('#tabs .tab[data-tab="ap_add"]'); await H.click('.ap-gcard:has-text("Website") button.primary'); await H.fill('.modal input[type=url]', siteUrl + '/deny'); await H.fill('.modal input:not([type])', 'Locked'); await H.click('#modal .acts button.primary');
    await H.waitForSelector('.ap-webnote.warn:has-text("doesn’t allow")'); if (await H.$('iframe.ap-web')) throw new Error('should not frame');
  });
  await step('apps store: pin Approvals to the app bar, then unpin', async () => {
    await H.click('.rbtn[data-pane="ap_store"]'); await H.waitForSelector('.ap-store .ap-scard'); await shot(H, 'apps-store-light'); await audit(H, 'apps store');
    await H.click('.ap-scard:has-text("Approvals") button[aria-label^="Pin"]'); await H.waitForSelector('.rbtn[data-pane="ap_approvals"]');
    await H.click('.ap-scard:has-text("Approvals") button[aria-label^="Unpin"]'); await H.waitForSelector('.rbtn[data-pane="ap_approvals"]', { state: 'detached' });
    await P.click('.rbtn[data-pane="ap_more"]'); await P.click('.popmenu button:has-text("All apps")'); await P.waitForSelector('.ap-store'); await shot(P, 'apps-store-dark'); await audit(P, 'apps store (dark)'); await P.click('.rbtn[data-pane="chat"]');
  });
  await step('phone layout: tabs, the task board and the apps menu work at 390 px', async () => {
    const M = await open(bt, 'phone', null, { width: 390, height: 780 }); await M.click('#nav .item[data-chan="general"] .itemmain'); await M.waitForSelector('#tabs .tab[data-tab="todos"]');
    await M.click('#tabs .tab[data-tab="todos"]'); await M.waitForSelector('.ap-card'); await shot(M, 'phone-tasks'); await M.click('#tabs .tab[data-tab="ap_add"]'); await M.waitForSelector('.ap-gallery'); await shot(M, 'phone-gallery'); await M.keyboard.press('Escape');
    const wide = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2); if (wide) throw new Error('page scrolls sideways'); await M.ctx.close();
  });
  if (axeSrc) console.log(`  (${audits} axe audits)`);
  console.log(errs.length ? 'ERRORS: ' + JSON.stringify(errs, null, 1) : 'no page errors');
  await br.close(); site.close(); app.stop(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  console.log(`Apps UI: ${pass}/${pass + failn} passed`); process.exit(failn || errs.length ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
