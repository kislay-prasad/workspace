'use strict';
// Browser test for the meetings area (sections 18, 21, 23): several browsers with fake camera / microphone.
// Scheduling form + people picker + template, invitation card + RSVP, details + tracking, before-you-join screen,
// lobby (banner, admit), join/leave sounds, #meet= links (signed in and a brand-new guest who still needs the host's
// approval), join with ID, reminder ring, Q&A, polls (vote pop-up), notes + agenda, breakout rooms (moved in and back),
// recap + attendance CSV, interpretation volumes, webinar (attendee note, registration + approval), companion device,
// phone layout, light + dark screenshots in /tmp/meetings-shots, and an axe scan of the meetings screens when AXE_JS is set.
// Ports 4500-4599 (meetings area).
const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
const SHOTS = '/tmp/meetings-shots', sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = TMP + '/lc-ui-meetings'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
  const app = createApp({ dataDir: dir, name: 'Meetings test', publicDir: ROOT + '/public' }); const port = await app.start(4520); const B = `http://127.0.0.1:${port}`; const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'), cy = c.makeUser('Cy'), dan = c.makeUser('Dan'); const ht = c.newToken(host), bt = c.newToken(bob), ct = c.newToken(cy), dt = c.newToken(dan);
  const post = (tok, p, b) => fetch(B + p, { method: 'POST', headers: { 'x-token': tok, 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  const br = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }); const errs = []; let pass = 0, fail = 0;
  const axeSrc = process.env.AXE_JS && fs.existsSync(process.env.AXE_JS) ? fs.readFileSync(process.env.AXE_JS, 'utf8') : null; const axeOut = [];
  const open = async (tok, label, o = {}) => {
    const ctx = await br.newContext({ viewport: o.viewport || { width: 1280, height: 820 }, permissions: ['microphone', 'camera', 'clipboard-read', 'clipboard-write'], acceptDownloads: true, ...(o.ctx || {}) });
    if (tok) await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok);
    const p = await ctx.newPage(); p.setDefaultTimeout(9000); p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); });
    await p.goto(B + (o.hash || '')); if (tok) await p.waitForSelector('#app:not(.hidden) .item.active'); return p;
  };
  let pages = [];
  const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message.split('\n').slice(0, 4).join(' | ')); for (const [i, p] of pages.entries()) await p.screenshot({ path: `${SHOTS}/fail-${pass + fail}-${i}.png` }).catch(() => {}); } };
  const audit = async (p, label) => { if (!axeSrc) return; await p.evaluate(axeSrc); const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); axeOut.push([label, v]); if (v.length) throw new Error('axe: ' + v.join('; ')); };
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });
  const H = await open(ht, 'host'), P = await open(bt, 'bob'), C = await open(ct, 'cy'), D = await open(dt, 'dan'); pages = [H, P, C, D];
  let mid = null, mchan = null;

  console.log('Meetings: scheduling and joining');
  await step('Meet pane: Meet now / Schedule / Join with an ID', async () => { await H.click('.rbtn[data-pane="meet"]'); await H.waitForSelector('.mt-paneacts .mt-bigbtn:has-text("Meet now")'); await H.waitForSelector('.mt-bigbtn:has-text("Join with a meeting ID")'); await shot(H, 'meet-pane-light'); await audit(H, 'meet pane'); });
  await step('New meeting form: template, people picker, weekdays repeat, options; sends', async () => {
    await H.click('.mt-bigbtn:has-text("Schedule a meeting")'); await H.waitForSelector('.mt-form');
    await H.selectOption('.mt-tpl select', 'b-review'); const title = await H.inputValue('.mt-title'); if (!title.startsWith('Review')) throw new Error(title);
    await H.fill('.mt-title', 'Review: launch plan'); await H.click('.mt-pickin input'); await H.keyboard.type('bo'); await H.waitForSelector('.mt-opt:has-text("Bob")'); await H.keyboard.press('Enter'); await H.waitForSelector('.mt-chip:has-text("Bob")');
    await H.click('.mt-optlink'); await H.fill('.mt-picker >> nth=1 >> input', 'Cy'); await H.keyboard.press('Enter'); await H.waitForSelector('.mt-chip:has-text("Cy")');
    await H.selectOption('select[aria-label="Repeat"]', 'weekdays'); await H.click('.mt-opts summary'); await H.selectOption('select[aria-label="Who can bypass the lobby?"]', 'invited');
    await audit(H, 'new meeting form'); await shot(H, 'new-meeting-light');
    await H.click('.mt-form button[type=submit]'); await H.waitForSelector('.toast:has-text("Meeting scheduled")');
    const m = Object.values(c.db.meetings).find((x) => x.title === 'Review: launch plan'); if (!m) throw new Error('not stored');
    if (m.repeat.freq !== 'weekly' || m.repeat.days.join() !== '1,2,3,4,5' || m.lobby !== 'invited' || m.optional.join() !== cy.id || !m.invitees.includes(bob.id)) throw new Error(JSON.stringify(m));
    mid = m.id; mchan = m.chan;
  });
  await step('invitation card: Join + Accept / Tentative / Decline; the organizer sees the response', async () => {
    await P.click(`.item[data-chan="${mchan}"] .itemmain`); await P.waitForSelector('.mt-card:has-text("Review: launch plan")'); await shot(P, 'card-light'); await audit(P, 'invitation card');
    await P.click('.mt-card .mt-rsvp button:has-text("Accept")'); await P.waitForSelector('.mt-card .mt-rsvp button[aria-pressed=true]:has-text("Accept")');
    await H.click(`.mt-row:has-text("Review: launch plan") .mt-rowmain`); await H.waitForSelector('.modal .mt-dhead'); await H.waitForSelector('.modal .mt-person:has-text("Bob") .pill:has-text("Accepted")');
    await H.waitForSelector('.modal .mt-code'); await shot(H, 'details-light'); await audit(H, 'meeting details'); await H.keyboard.press('Escape');
  });
  await step('meeting chat tabs: Details and Recap', async () => { await P.click('.tab[data-tab="mtdetails"]'); await P.waitForSelector('#tabView .mt-joininfo'); await P.click('.tab[data-tab="mtrecap"]'); await P.waitForSelector('#tabView .mt-recap'); await P.click('.tab[data-tab="chat"]'); });
  await step('before you join: camera preview, mic meter, devices, then the organizer starts the meeting', async () => {
    await H.evaluate((i) => { LC.meetings.join(i); }, mid); await H.waitForSelector('.mt-prejoin'); await H.waitForFunction(() => { const v = document.querySelector('.mt-pv'); return v && v.videoWidth > 0; });
    if ((await H.$$eval('.mt-prejoin select', (s) => s.length)) < 2) throw new Error('device pickers missing');
    await H.click('.mt-switch[aria-label="Camera"]'); await H.waitForSelector('.mt-pvav:not(.hidden)'); await H.click('.mt-switch[aria-label="Camera"]'); await H.waitForFunction(() => { const v = document.querySelector('.mt-pv'); return v && !v.classList.contains('hidden') && v.videoWidth > 0; });
    if (await H.$('.mt-prejoin button:has-text("Background effects")')) { await H.click('.mt-prejoin button:has-text("Background effects")'); await H.waitForSelector('.mt-fxhost:not(.hidden) .cl-fx'); }
    await shot(H, 'prejoin-light'); await audit(H, 'before you join');
    await H.click('.mt-joinbtn'); await H.waitForSelector('#callUI:not(.hidden) .tile');
    const st = await H.evaluate(() => LC.S.calls[LC.callChan()]); if (st.meeting !== mid || st.roles[st.by] !== 'organizer') throw new Error(JSON.stringify({ m: st.meeting, roles: st.roles }));
  });
  await step('lobby: someone not invited waits ("let you in soon"), the organizer admits from the banner', async () => {
    await D.goto(B + '/#meet=' + mid); await D.waitForSelector('.mt-prejoin'); await D.click('.mt-joinbtn'); await D.waitForSelector('.mt-prejoin.waiting .mt-wait:has-text("let you in soon")'); await shot(D, 'lobby-waiting');
    await H.waitForSelector('#callUI .mt-lobbybar:has-text("Dan")'); await shot(H, 'lobby-banner'); await H.click('#callUI .cbtn[aria-label="Lobby"]'); await H.waitForSelector('#callUI .cside .mt-lrow:has-text("Dan")'); await audit(H, 'lobby panel');
    await H.click('#callUI .cside .mt-lrow button:has-text("Admit")'); await D.waitForSelector('#callUI:not(.hidden) .tile', { timeout: 12000 });
    if (await D.evaluate(() => location.hash)) throw new Error('hash not cleared');
  });
  await step('an (optional) invitee goes straight in: no lobby', async () => {
    await C.click(`.item[data-chan="${mchan}"] .itemmain`); await C.click('.mt-card button:has-text("Join")'); await C.waitForSelector('.mt-prejoin'); await C.click('.mt-joinbtn'); await C.waitForSelector('#callUI:not(.hidden) .tile', { timeout: 12000 });
  });
  await step('join / leave chime for people already in the meeting', async () => {
    const before = await H.evaluate(() => LC.mt.chimes || 0);
    await P.click('.mt-card button:has-text("Join")'); await P.waitForSelector('.mt-prejoin'); await P.click('.mt-joinbtn'); await P.waitForSelector('#callUI:not(.hidden) .tile');
    await H.waitForFunction((b) => (LC.mt.chimes || 0) > b, before);
  });

  console.log('Meetings: engagement');
  await step('Q&A: anonymous question shows up live; upvote; organizer marks it answered', async () => {
    await C.click('#callUI .cbtn[aria-label="Q&A"]'); await C.fill('#callUI .mt-ask textarea', 'Can we ship on Friday?'); await C.check('#callUI .mt-ask input[type=checkbox]'); await C.click('#callUI .mt-ask button[type=submit]');
    await H.click('#callUI .cbtn[aria-label="Q&A"]'); await H.waitForSelector('#callUI .mt-q:has-text("Can we ship on Friday?") :text("Anonymous")');
    await H.click('#callUI .mt-q .mt-vote'); await C.waitForSelector('#callUI .mt-q .mt-vote:has-text("1")');
    await H.click('#callUI .mt-q button[aria-label="More options"]'); await H.click('.popmenu button:has-text("Mark as answered")'); await C.waitForSelector('#callUI .mt-q.answered'); await audit(H, 'Q&A panel'); await shot(H, 'qa-panel');
  });
  await step('polls: launched from the meeting window, everyone gets a pop-up, results are live', async () => {
    await H.click('#callUI .cbtn[aria-label="Polls"]'); await H.click('#callUI .mt-polls button:has-text("New poll")'); await H.fill('#callUI .mt-pform input >> nth=0', 'Friday release?'); await H.fill('#callUI .mt-pform input >> nth=1', 'Yes'); await H.fill('#callUI .mt-pform input >> nth=2', 'No'); await H.click('#callUI .mt-pform button[type=submit]');
    await P.waitForSelector('.mt-pollpop:has-text("Friday release?")'); await shot(P, 'poll-popup'); await P.click('.mt-pollpop .mt-popt:has-text("Yes")');
    await H.waitForSelector('#callUI .mt-poll:has-text("Friday release?") .mt-pc:has-text("1 · 100%")');
    if (!c.db.messages.some((m) => m.chan === mchan && m.poll && m.poll.q === 'Friday release?')) throw new Error('poll not in the chat');
  });
  await step('notes: agenda items and the shared meeting notes, live for others', async () => {
    await H.click('#callUI .cbtn[aria-label="Notes"]'); await H.fill('#callUI .mt-aform input:not([type=number])', 'Decide the date'); await H.fill('#callUI .mt-aform input[type=number]', '10'); await H.click('#callUI .mt-aform button');
    await P.click('#callUI .cbtn[aria-label="Notes"]'); await P.waitForSelector('#callUI .mt-aitem:has-text("Decide the date")');
    await H.fill('#callUI .mt-notearea', 'We ship on Friday.'); await P.waitForFunction(() => document.querySelector('#callUI .mt-notearea').value === 'We ship on Friday.', null, { timeout: 9000 }); await audit(P, 'notes panel');
  });
  await step('breakout rooms: open moves people into their rooms; closing brings them back', async () => {
    await H.click('#callUI .cbtn[aria-label="Breakout rooms"]'); await H.click('#callUI .cside button:has-text("Create rooms")'); await H.waitForSelector('#callUI .mt-room:has-text("Room 1")'); await audit(H, 'rooms panel'); await shot(H, 'rooms-panel');
    await H.click('#callUI .cside button:has-text("Open rooms")');
    for (const p of [P, C]) await p.waitForFunction(() => LC.inCall() && (LC.S.channels.get(LC.callChan()) || {}).kind === 'breakout', null, { timeout: 15000 });
    await H.click('#callUI .cside .mt-annform input'); await H.fill('#callUI .cside .mt-annform input', 'Five minutes left'); await H.click('#callUI .cside .mt-annform button'); await P.waitForSelector('.toast:has-text("Five minutes left")');
    await H.click('#callUI .cside button:has-text("Close rooms")');
    for (const p of [P, C]) await p.waitForFunction((ch) => LC.inCall() && LC.callChan() === ch, mchan, { timeout: 15000 });
  });
  await step('interpretation: listener picks a language, interpreter loud, original quiet', async () => {
    await post(ht, '/api/meetings/update', { id: mid, options: { interp: [{ uid: cy.id, lang: 'Español' }] } });
    await P.waitForFunction(() => { const c = LC.S.calls[LC.callChan()]; return c && c.mt && c.mt.interp && c.mt.interp.length === 1; }, null, { timeout: 9000 }).catch(() => P.evaluate((ch) => LC.api('/api/call/media', { chan: ch, mic: true, cam: false }), mchan));
    await P.click('#callUI .cbtn[aria-label="More options"]'); await P.click('.popmenu button:has-text("Language interpretation")'); await P.click('.modal label:has-text("Listen in Español") input');
    const v = await P.evaluate((ids) => [LC.callApi.volume(ids[0]), LC.callApi.volume(ids[1])], [cy.id, host.id]); if (v[0] !== 1 || Math.abs(v[1] - 0.2) > 0.01) throw new Error(JSON.stringify(v));
    const h = await H.evaluate((u) => LC.callApi.volume(u), cy.id); if (h !== 0) throw new Error('original listeners should not hear the interpreter: ' + h);
  });
  await step('attendance report (CSV) and recap from the meeting window', async () => {
    await H.click('#callUI .cbtn[aria-label="More options"]'); await H.click('.popmenu button:has-text("Attendance report")'); await H.waitForSelector('.modal table.mt-att td:has-text("Bob")'); await audit(H, 'attendance');
    const [dl] = await Promise.all([H.waitForEvent('download'), H.click('.modal button:has-text("Download CSV")')]); const csv = fs.readFileSync(await dl.path(), 'utf8'); if (!/Bob/.test(csv) || !/Minutes in meeting/.test(csv)) throw new Error(csv.slice(0, 200));
    await H.keyboard.press('Escape'); await H.click('#callUI .cbtn[aria-label="More options"]'); await H.click('.popmenu button:has-text("Recap")'); await H.waitForSelector('.modal .mt-recap .mt-rsec:has-text("Friday release?")'); await H.waitForSelector('.modal .mt-recap .mt-rsec:has-text("Decide the date")'); await shot(H, 'recap'); await audit(H, 'recap'); await H.keyboard.press('Escape');
  });
  await step('everyone leaves; the recap tab in the meeting chat has the Q&A', async () => {
    for (const p of [H, P, C, D]) await p.evaluate(() => LC.leaveCall()); await P.click('.tab[data-tab="mtrecap"]'); await P.waitForSelector('#tabView .mt-recap:has-text("Can we ship on Friday?")'); await P.click('.tab[data-tab="chat"]');
  });

  console.log('Meetings: links, reminders, companion');
  await step('join with a meeting ID and passcode', async () => {
    const m = c.db.meetings[mid]; await C.click('.rbtn[data-pane="meet"]'); await C.click('.mt-bigbtn:has-text("Join with a meeting ID")'); await C.fill('.modal input[aria-label="Meeting ID"]', m.code.replace(/(\d{3})/g, '$1 ')); await C.fill('.modal input[aria-label="Passcode"]', 'wrong1'); await C.click('.modal button[type=submit]'); await C.waitForSelector('.modal .err:has-text("Check the meeting ID")');
    await C.fill('.modal input[aria-label="Passcode"]', m.passcode); await C.click('.modal button[type=submit]'); await C.waitForSelector('.mt-prejoin'); await C.click('.mt-prejoin button:has-text("Cancel")'); await C.waitForSelector('.mt-prejoin', { state: 'detached' });
  });
  await step('reminder: a ring when the meeting starts, Join opens the before-you-join screen', async () => {
    const st = Date.now() + 60000, r = await post(ht, '/api/meetings/create', { title: 'Coffee chat', start: st, end: st + 1800000, invitees: [bob.id], tz: 'UTC' });
    for (const tk of c.ticks.filter((x) => x.mt === 'reminders')) tk.fn(st + 1000);
    await P.waitForSelector('.mt-ring:has-text("Coffee chat")'); await sleep(450); await shot(P, 'ring'); await audit(P, 'meeting ring'); await P.click('.mt-ring button:has-text("Join")'); await P.waitForSelector('.mt-prejoin h2:has-text("Coffee chat")'); await P.click('.mt-prejoin button:has-text("Cancel")'); void r;
  });
  await step('companion device: joins without audio and shows as a companion', async () => {
    await H.evaluate((i) => { LC.meetings.join(i); }, mid); await H.waitForSelector('.mt-prejoin'); await H.click('.mt-joinbtn'); await H.waitForSelector('#callUI:not(.hidden) .tile');
    const Ph = await open(ht, 'host-phone', { viewport: { width: 390, height: 780 }, ctx: { isMobile: true, hasTouch: true } });
    await Ph.evaluate((i) => { LC.meetings.join(i, { companion: true }); }, mid); await Ph.waitForSelector('.mt-prejoin .mt-mode[data-mode="companion"][aria-pressed=true]'); await shot(Ph, 'prejoin-phone-companion'); await Ph.click('.mt-joinbtn');
    await H.waitForFunction(() => (LC.S.calls[LC.callChan()].endpoints || []).some((e) => e.companion), null, { timeout: 12000 }); await Ph.evaluate(() => LC.leaveCall()); await H.evaluate(() => LC.leaveCall()); await Ph.context().close();
  });
  await step('guest by link: name → host approval (the prompt names the meeting) → before-you-join', async () => {
    const G = await open(null, 'guest', { hash: '/#meet=' + mid }); await G.waitForSelector('#login:not(.hidden) .mt-guestnote'); await G.fill('#nameIn', 'Gina'); await G.click('#joinBtn'); await G.waitForSelector('#waiting:not(.hidden)');
    await H.waitForSelector('.toast:has-text("Gina wants to join for the meeting")'); await H.click('.rbtn[data-pane="manage"]'); await H.waitForSelector('.modal .mt-reqs:has-text("Gina")'); await H.click('.req:has-text("Gina") button:has-text("Approve")'); await H.keyboard.press('Escape');
    await G.waitForSelector('#app:not(.hidden)', { timeout: 12000 }); await G.waitForSelector('.mt-prejoin h2:has-text("Review: launch plan")', { timeout: 12000 }); await shot(G, 'guest-prejoin');
    await G.click('.mt-joinbtn'); await G.waitForSelector('.mt-prejoin.waiting', { timeout: 9000 }); await G.click('.mt-prejoin .mt-wait button'); await G.waitForSelector('.mt-prejoin', { state: 'detached' }); await G.context().close();
  });

  console.log('Meetings: webinars');
  let wid = null;
  await step('webinar: registration page, organizer approves, registrant gets the link', async () => {
    const r = await post(ht, '/api/meetings/create', { title: 'Product webinar', start: Date.now() + 3600000, end: Date.now() + 7200000, tz: 'UTC', lobby: 'everyone', presenters: [], options: { viewOnly: true, present: 'specific', registration: { on: true, email: true, notes: true, question: 'Your role?', approve: true } } }); wid = r.meeting.id;
    await C.goto(B + '/#register=' + wid); await C.waitForSelector('.modal .mt-regform'); await audit(C, 'registration page'); await C.fill('.modal input[aria-label="Email"]', 'cy@example.lan'); await C.fill('.modal textarea[aria-label="Your role?"]', 'Engineer'); await shot(C, 'register'); await C.click('.modal button[type=submit]'); await C.waitForSelector('.toast:has-text("The organizer will confirm")');
    await H.evaluate((i) => LC.mt.registrations(i), wid); await H.waitForSelector('.modal table.mt-regs td:has-text("cy@example.lan")'); await audit(H, 'registrations'); await H.click('.modal table.mt-regs button:has-text("Approve")'); await H.waitForSelector('.modal .pill:has-text("Approved")'); await H.keyboard.press('Escape');
    if (!c.db.meetings[wid].invitees.includes(cy.id)) throw new Error('not invited after approval');
  });
  await step('webinar: attendees only watch (server refuses their mic), they see a note', async () => {
    await H.evaluate((i) => { LC.meetings.join(i); }, wid); await H.waitForSelector('.mt-prejoin'); await H.click('.mt-joinbtn'); await H.waitForSelector('#callUI:not(.hidden) .tile');
    await C.evaluate((i) => { LC.meetings.join(i); }, wid); await C.waitForSelector('.mt-prejoin'); await C.click('.mt-joinbtn'); await C.waitForSelector('#callUI:not(.hidden) .mt-attnote');
    const r = await C.evaluate(() => LC.api('/api/call/media', { chan: LC.callChan(), ep: LC.callApi.ep, mic: true, cam: false }).then(() => 'ok').catch((e) => e.status)); if (r !== 403) throw new Error('attendee could unmute: ' + r);
    await shot(C, 'webinar-attendee'); await C.evaluate(() => LC.leaveCall()); await H.evaluate(() => LC.leaveCall());
  });

  console.log('Meetings: themes and phone');
  await step('dark theme screenshots (pane, form, before you join)', async () => {
    await H.evaluate(() => LC.setUi({ theme: 'dark' })); await H.click('.rbtn[data-pane="meet"]'); await H.waitForSelector('.mt-paneacts'); await shot(H, 'meet-pane-dark'); await audit(H, 'meet pane (dark)');
    await H.evaluate(() => LC.meetings.schedule()); await H.waitForSelector('.mt-form'); await shot(H, 'new-meeting-dark'); await H.keyboard.press('Escape');
    await H.evaluate((i) => { LC.meetings.join(i); }, mid); await H.waitForSelector('.mt-prejoin'); await sleep(600); await shot(H, 'prejoin-dark'); await audit(H, 'before you join (dark)'); await H.click('.mt-prejoin button:has-text("Cancel")');
    await H.evaluate((i) => LC.meetings.open(i), mid); await H.waitForSelector('.modal .mt-dhead'); await shot(H, 'details-dark'); await H.keyboard.press('Escape'); await H.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('phone layout: Meet pane, the form and the card fit 390 px', async () => {
    const M = await open(bt, 'phone', { viewport: { width: 390, height: 780 }, ctx: { isMobile: true, hasTouch: true } });
    await M.waitForSelector('#app.list-mode'); await M.tap('.rbtn[data-pane="meet"]'); await M.waitForSelector('.mt-paneacts'); await shot(M, 'phone-meet-pane');
    await M.evaluate(() => LC.meetings.schedule()); await M.waitForSelector('.mt-form'); const w = await M.evaluate(() => document.querySelector('#modal .card').scrollWidth); if (w > 392) throw new Error('form wider than the phone: ' + w); await shot(M, 'phone-new-meeting'); await M.keyboard.press('Escape');
    await M.evaluate((ch) => LC.openChat(ch), mchan); await M.waitForSelector('.mt-card'); const cw = await M.evaluate(() => document.documentElement.scrollWidth); if (cw > 392) throw new Error('page scrolls sideways: ' + cw); await shot(M, 'phone-card'); await M.context().close();
  });

  console.log(axeSrc ? 'axe: ' + axeOut.map(([l, v]) => `${l}=${v.length}`).join(', ') : 'axe: skipped (set AXE_JS)');
  console.log('ERRORS:', errs.length ? errs : 'none'); console.log(`ui-meetings: ${pass}/${pass + fail} passed`);
  await br.close(); app.stop(); process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
