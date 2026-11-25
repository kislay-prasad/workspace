'use strict';
// Calls area browser test (Playwright, fake camera/mic/screen, three people): calling, the meeting window (views, hands,
// organizer controls, hold, push to talk, muted warning, network banner, chat), sharing and presenting (screen, pause, zoom,
// annotations, whiteboard, PDF page sync), effects, recording, add people, missed call + voicemail + history, park, transfer,
// rating, walkie-talkie, Settings › Calls / Devices, phone layout. Screenshots go to $SHOTS (default <tmp>/calls-shots).
//   node tests/ui-calls.js        (servers on ports 4400-4499)
const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir(), SHOTS = process.env.SHOTS || TMP + '/calls-shots';
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const dir = TMP + '/lc-ui-calls'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(SHOTS, { recursive: true });
  const app = createApp({ dataDir: dir, name: 'Calls test', publicDir: ROOT + '/public' }); const port = await app.start(4420); const B = `http://127.0.0.1:${port}`, c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'), cy = c.makeUser('Cy'); const ht = c.newToken(host), bt = c.newToken(bob), ct = c.newToken(cy);
  const dmHB = 'dm:' + [host.id, bob.id].sort().join(':'), dmHC = 'dm:' + [host.id, cy.id].sort().join(':');
  const br = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const open = async (tok, label, o = {}) => { const ctx = await br.newContext({ viewport: o.viewport || { width: 1280, height: 800 }, permissions: ['microphone', 'camera'], ...(o.ctx || {}) }); await ctx.addInitScript((t) => { try { localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok); const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.ctx = ctx; p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|404|Failed to load resource/.test(m.text())) errs.push(label + ' console: ' + m.text().slice(0, 200)); }); await p.goto(B); await p.waitForSelector('#app:not(.hidden) .item.active'); return p; };
  let ok = 0, bad = 0; const step = async (name, fn) => { try { await fn(); ok++; console.log('  ✓', name); } catch (e) { bad++; console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 3).join(' | ')); } };
  const until = async (fn, ms = 10000, what = 'condition') => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out: ' + what); await sleep(250); } };
  const connected = (a, b) => until(async () => { const x = await a.evaluate(() => LC.callDebug()), y = await b.evaluate(() => LC.callDebug()); return x && y && x.length && y.length && x.every((s) => s.startsWith('connected')) && y.every((s) => s.startsWith('connected')); }, 20000, 'connected');
  const tick = (ms) => { for (const tk of c.ticks) { try { tk.fn(Date.now() + ms); } catch {} } };
  const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png` });
  // accessibility: axe-core over the calls screens (AXE_JS=path/to/axe.min.js, or axe-core installed); any violation fails the step
  let axeSrc = null; try { axeSrc = fs.readFileSync(process.env.AXE_JS || require.resolve('axe-core/axe.min.js'), 'utf8'); } catch {}
  const audit = async (p, label) => { if (!axeSrc) return; if (!(await p.evaluate(() => !!window.axe))) await p.evaluate(axeSrc); const v = await p.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => x.id + ' x' + x.nodes.length + ' ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | '))); if (v.length) throw new Error('axe (' + label + '): ' + v.join(' ;; ')); audits++; };
  let audits = 0;
  const H = await open(ht, 'host'), P = await open(bt, 'bob'), C = await open(ct, 'cy');
  const more = async (p, label) => { await p.click('#callUI .cbtn[data-k="more"]'); await p.click(`.popmenu button:has-text("${label}")`); };
  const leaveAll = async () => { for (const p of [H, P, C]) await p.evaluate(() => LC.leaveCall()); await until(() => !c.calls.size, 8000, 'calls ended'); for (const p of [H, P, C]) await p.evaluate(() => document.querySelectorAll('.cl-rate').forEach((x) => x.remove())); };
  const startDm = async (p, who, mode = 'video') => { await p.click(`.rbtn[data-pane="chat"]`); await p.click(`.item[data-chan^="dm:"]:has-text("${who}") .itemmain`); await p.click(`#headActions .callgroup button[aria-label="${mode === 'video' ? 'Video call' : 'Voice call'}"]`); };

  await step('1:1 video call: rings with a ringtone, connects, video both ways; chat panel sends; info panel', async () => {
    await startDm(H, 'Bob'); await P.waitForSelector('.ringbox'); await P.click('.ringbox button[aria-label="Accept with video"]'); await connected(H, P);
    await H.waitForFunction(() => [...document.querySelectorAll('#callUI .tile:not(.local) video')].some((v) => v.videoWidth > 0));
    await H.click('#callUI .cbtn[data-k="chat"]'); await H.waitForSelector('#callUI .cl-chatside textarea'); await H.fill('#callUI .cl-chatside textarea', 'hello from the meeting'); await H.press('#callUI .cl-chatside textarea', 'Enter');
    await P.click('#callUI .cbtn[data-k="chat"]'); await P.waitForSelector('#callUI .cl-chatlist .msg:has-text("hello from the meeting")');
    await H.click('#callUI .cbtn[data-k="more"]'); await H.click('.popmenu button:has-text("Meeting info")'); await H.waitForSelector('#callUI .cl-info:has-text("Started by")');
    await audit(H, 'meeting info panel'); await audit(P, 'meeting chat panel');
  });
  await step('views: speaker, together mode, large gallery, gallery; pin; hide self view; mirror', async () => {
    const view = async (label, sel) => { await H.click('#callUI .cbtn[data-k="view"]'); await H.click(`.popmenu button:has-text("${label}")`); await H.waitForSelector('#callUI ' + sel); };
    await view('Speaker', '.stage.cl-speakerview'); await view('Together mode', '.stage.cl-together .cl-seat .tile'); await shot(H, 'meeting-together');
    await view('Large gallery', '.stage.gallery.cl-large'); await view('Gallery', '.stage.duo');
    await H.hover('#callUI .tile:not(.local)'); await H.click('#callUI .tile:not(.local) .tmore'); await H.click('.popmenu button:has-text("Pin for me")'); await H.waitForSelector('#callUI .stage.cl-speakerview .cl-main .tile:not(.local)');
    await H.hover('#callUI .cl-main .tile'); await H.click('#callUI .cl-main .tile .tmore'); await H.click('.popmenu button:has-text("Unpin")'); await H.waitForSelector('#callUI .stage.duo');
    await H.click('#callUI .cbtn[data-k="view"]'); await H.click('.popmenu button:has-text("Hide my video")'); await H.waitForFunction(() => !document.querySelector('#callUI .stage .tile.local'));
    await H.click('#callUI .cbtn[data-k="view"]'); await H.click('.popmenu button:has-text("Show my video")'); await H.waitForSelector('#callUI .stage .tile.local');
    await H.click('#callUI .cbtn[data-k="view"]'); await H.click('.popmenu button:has-text("Mirror my video")'); await H.waitForSelector('#callUI .tile.local.cl-nomirror'); await H.evaluate(() => LC.setUi({ clMirror: true }));
  });
  await step('raised hands are numbered; the organizer lowers them all', async () => {
    await P.click('#callUI .cbtn[data-k="hand"]'); await H.waitForSelector('#callUI .tile:not(.local) .cl-handn b:text("1")');
    await H.click('#callUI .cbtn[data-k="hand"]'); await P.waitForSelector('#callUI .tile:not(.local) .cl-handn b:text("2")');
    await H.click('#callUI .cbtn[data-k="people"]'); await H.click('#callUI .cl-pacts button:has-text("Meeting options")'); await H.click('.popmenu button:has-text("Lower all hands")');
    await P.waitForFunction(() => !LC.callApi.me.hand); await H.waitForFunction(() => !document.querySelector('#callUI .cl-handn'));
  });
  await step('organizer controls (server-enforced): mute, hard mute blocks unmuting, allow mic, spotlight, roles, lock', async () => {
    await P.evaluate(() => { if (!LC.callApi.me.mic) LC.callApi.toggleMic(); }); await until(() => c.calls.get(dmHB).media[bob.id].mic === true, 5000, 'bob unmuted');
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button .ml:text-is("Mute")'); await P.waitForFunction(() => LC.callApi.me.mic === false);
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button:has-text("Make attendee")'); await until(() => c.calls.get(dmHB).roles[bob.id] === 'attendee', 5000, 'role');
    await H.click('#callUI .cl-pacts button:has-text("Meeting options")'); await H.click('.popmenu button:has-text("allow attendees to unmute")'); await until(() => c.calls.get(dmHB).hardMute, 5000, 'hard mute');
    await P.click('#callUI .cbtn[data-k="mic"]'); await P.waitForSelector('.toast:has-text("turned off mics")'); if (await P.evaluate(() => LC.callApi.me.mic)) throw new Error('unmuted under hard mute');
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button:has-text("Allow mic")'); await until(() => (c.calls.get(dmHB).allow[bob.id] || {}).mic, 5000, 'allow');
    await P.click('#callUI .cbtn[data-k="mic"]'); await P.waitForFunction(() => LC.callApi.me.mic === true);
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button:has-text("Spotlight for everyone")'); await P.waitForSelector('#callUI .cl-badge:has-text("Spotlight")');
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button:has-text("Stop spotlighting")');
    await H.click('#callUI .cl-pacts button:has-text("Meeting options")'); await H.click('.popmenu button:has-text("allow attendees to unmute")');
    await H.click(`#callUI .prow button[aria-label="More options for Bob"]`); await H.click('.popmenu button:has-text("Make presenter")');
    await H.click('#callUI .cl-pacts button:has-text("Meeting options")'); await H.click('.popmenu button:has-text("Lock the meeting")'); await H.waitForSelector('#callUI .cl-pill:has-text("Locked")');
    await H.click('#callUI .cl-pacts button:has-text("Meeting options")'); await H.click('.popmenu button:has-text("Unlock the meeting")');
    await shot(H, 'meeting-people-panel'); await audit(H, 'participants with organizer controls');
  });
  await step('hold and resume; push to talk (Ctrl+Space); "You\'re muted" warning; poor network banner', async () => {
    await more(H, 'Hold'); await H.waitForSelector('#callUI .cl-held'); await P.waitForSelector('#callUI .cl-banner:has-text("put the call on hold")'); await P.waitForSelector('#callUI .tile .cl-badge:has-text("On hold")');
    await H.click('#callUI .cl-held button'); await P.waitForFunction(() => !document.querySelector('#callUI .cl-banner') || !document.querySelector('#callUI .cl-banner').textContent.includes('on hold'));
    await P.evaluate(() => { if (LC.callApi.me.mic) LC.callApi.toggleMic(); }); await P.click('#callUI .stage');
    await P.keyboard.down('Control'); await P.keyboard.down('Space'); await until(() => c.calls.get(dmHB).media[bob.id].mic === true, 5000, 'ptt on'); await P.waitForSelector('#callUI .cl-banner.ptt');
    await P.keyboard.up('Space'); await P.keyboard.up('Control'); await until(() => c.calls.get(dmHB).media[bob.id].mic === false, 5000, 'ptt off');
    await P.waitForSelector('#callUI .cl-banner[data-b="muted"]', { timeout: 12000 }); await P.click('#callUI .cl-banner[data-b="muted"] button:has-text("Unmute")'); await P.waitForFunction(() => LC.callApi.me.mic === true);
    await H.evaluate(() => { LC._cx.fakeQuality = { rtt: 900, loss: 25, jitter: 200, outLoss: 25, outRtt: 900 }; }); await H.waitForSelector('#callUI .cl-banner[data-b="net"]', { timeout: 15000 }); await H.waitForSelector('#callUI .tile:not(.local) .cl-bars.q1');
    await H.evaluate(() => { LC._cx.fakeQuality = null; }); await H.click('#callUI .cl-banner[data-b="net"] button[aria-label="Dismiss"]');
  });
  await step('screen sharing: one click, the friend sees it; presenter toolbar + red frame; pause; zoom; annotations; stop', async () => {
    await H.click('#callUI .sharegroup .cbtn[data-k="share"]'); await H.waitForSelector('#callUI .selfshare'); await H.waitForSelector('#callUI .cl-ptool'); await H.waitForSelector('#callUI.cl-sharing');
    await P.waitForFunction(() => { const v = document.querySelector('#callUI .present video'); return v && v.videoWidth > 0; }, null, { timeout: 15000 }); await P.waitForSelector('#callUI .plabel:has-text("Host is presenting")');
    await shot(H, 'sharing-presenter'); await shot(P, 'sharing-viewer'); await audit(H, 'presenting (toolbar, preview)'); await audit(P, 'viewing a share (zoom, request control)');
    await H.click('#callUI .cl-ptool button[data-k="pt:pause"]'); await P.waitForSelector('#callUI .cl-pausedpill:has-text("paused")'); await H.click('#callUI .cl-ptool button[data-k="pt:pause"]'); await P.waitForSelector('#callUI .cl-pausedpill', { state: 'detached' });
    await P.click('#callUI .cl-zoombar button[aria-label="Zoom in"]'); await P.waitForFunction(() => /scale\(1\.25\)/.test(document.querySelector('#callUI .cl-zoomwrap').style.transform)); await P.click('#callUI .cl-zoombar button[aria-label="Reset zoom"]');
    await H.evaluate(() => LC.api('/api/call/ink', { chan: LC.callApi.chan, k: 'pen', pts: [1000, 1000, 9000, 9000, 9000, 1000], c: '#ff3b30', w: 6 }));
    await P.waitForFunction(() => { const cv = document.querySelector('#callUI .present .cl-ink'); if (!cv || !cv.width) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }, null, { timeout: 8000 });
    await H.click('#callUI .cl-ptool button[data-k="pt:ink"]'); await P.waitForSelector('#callUI .cl-inkbar'); await P.click('#callUI .cl-inkbar button[aria-label="Laser pointer"]'); await P.waitForSelector('#callUI .cl-ink.cl-active');
    await P.click('#callUI .cbtn[data-k="more"]').catch(() => {}); await P.keyboard.press('Escape');
    await H.click('#callUI .selfshare button'); await P.waitForSelector('#callUI .present', { state: 'detached' });
  });
  await step('whiteboard on the stage for everyone (and drawing on it reaches the chat\'s whiteboard)', async () => {
    await H.click('#callUI .cbtn[data-k="sharex"]'); await H.waitForSelector('.modal .cl-sharecard'); await audit(H, 'share tray'); await H.click('.modal .cl-sharecard:has-text("Whiteboard")'); await P.waitForSelector('#callUI .cl-boardhost canvas');
    const box = await P.locator('#callUI .cl-boardhost canvas').boundingBox(); await P.mouse.move(box.x + 40, box.y + 40); await P.mouse.down(); await P.mouse.move(box.x + 160, box.y + 90, { steps: 6 }); await P.mouse.up();
    await until(() => ((c.db.extras[dmHB] || {}).board || []).length > 0, 6000, 'stroke stored'); await H.waitForFunction(() => { const cv = document.querySelector('#callUI .cl-boardhost canvas'); const d = cv.getContext('2d').getImageData(0, 0, 1000, 700).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n > 30; });
    await shot(P, 'whiteboard-stage');
  });
  await step('PDF slides with page sync; viewers look ahead privately and sync back', async () => {
    const r = await fetch(`${B}/api/upload?name=slides.pdf`, { method: 'POST', headers: { 'x-token': ht }, body: Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF') }); const f = await r.json();
    await fetch(`${B}/api/send`, { method: 'POST', headers: { 'x-token': ht }, body: JSON.stringify({ chan: dmHB, text: 'deck', files: [{ id: f.id }] }) });
    await H.click('#callUI .cbtn[data-k="sharex"]'); await H.click('.modal .cl-sharecard:has-text("PDF slides")'); await H.click('.modal .hit:has-text("slides.pdf")');
    await P.waitForSelector('#callUI iframe.cl-pdf[src*="#page=1"]'); await H.click('#callUI .cl-pdfnav button[aria-label="Next page"]'); await P.waitForSelector('#callUI iframe.cl-pdf[src*="#page=2"]');
    await P.click('#callUI .cl-pdfnav button[aria-label="Next page"]'); await P.waitForSelector('#callUI iframe.cl-pdf[src*="#page=3"]'); await P.waitForSelector('#callUI .cl-pdfnote');
    await H.click('#callUI .cl-pdfnav button[aria-label="Next page"]'); await until(() => c.calls.get(dmHB).share.page === 3, 5000, 'page 3'); await H.click('#callUI .cl-pdfnav button[aria-label="Next page"]');
    await P.waitForSelector('#callUI .cl-pdfnav button:has-text("Sync to presenter")'); await audit(P, 'PDF slides on the stage'); await P.click('#callUI .cl-pdfnav button:has-text("Sync to presenter")'); await P.waitForSelector('#callUI iframe.cl-pdf[src*="#page=4"]');
    await H.click('#callUI .cl-ptool button[data-k="pt:stop"]'); await P.waitForSelector('#callUI .present', { state: 'detached' });
  });
  await step('video effects: blur / a picture / a filter are applied to the camera that is sent', async () => {
    await H.click('#callUI .cbtn[data-k="camx"]'); await H.click('.popmenu button:has-text("Video effects")'); await H.waitForSelector('#callUI .cl-fx');
    await H.click('#callUI .cl-fxopt[aria-label="Blur"]'); await H.waitForFunction(() => { const x = LC._cx.call; const p = [...x.peers.values()][0]; return x.camOut && p.tx.cam.sender.track === x.camOut; });
    await H.click('#callUI .cl-fxopt[aria-label="Sunset"]'); await H.click('#callUI .cl-fxopt[aria-label="Warm"]'); await H.waitForFunction(() => LC.callEffects.get().bg === 'img:sunset' && LC.callEffects.get().filter === 'warm');
    await P.waitForFunction(() => [...document.querySelectorAll('#callUI .tile:not(.local) video')].some((v) => v.videoWidth > 0)); await sleep(800); await shot(H, 'effects-panel'); await audit(H, 'video effects panel');
    await H.click('#callUI .cl-fxopt[aria-label="None"]'); await H.click('#callUI .cl-fxopt[aria-label="No filter"]'); await H.waitForFunction(() => !LC._cx.call.camOut);
  });
  await step('recording: everyone is told; the video is posted to the chat as a recording', async () => {
    await more(H, 'Start recording'); await P.waitForSelector('#callUI .cl-banner[data-b="rec"]'); await P.waitForSelector('#callUI .cl-recpill');
    await until(() => c.db.messages.some((m) => m.chan === dmHB && /started recording/.test(m.system || '')), 5000, 'system line');
    await sleep(3500); await more(H, 'Stop recording');
    await until(() => c.db.messages.some((m) => m.chan === dmHB && m.recording && m.files && m.files[0].size > 1000), 20000, 'recording message');
    await until(() => c.db.messages.some((m) => m.chan === dmHB && m.system === 'Recording stopped'), 5000, 'stopped line');
  });
  await step('add people to a 1:1 call: a group chat is made, both move there, Cy is rung and joins', async () => {
    await H.click('#callUI .cbtn[data-k="people"]').catch(() => {}); if (!(await H.$('#callUI .cl-pacts'))) await H.click('#callUI .cbtn[data-k="people"]');
    await H.click('#callUI .cl-pacts button:has-text("Add people")'); await H.click('.modal label.pick:has-text("Cy") input'); await H.click('.modal button.primary:has-text("Ring")');
    await C.waitForSelector('.ringbox'); await C.waitForSelector('.ringbox:has-text("adding you")'); await H.waitForFunction(() => LC.callChan().startsWith('g-')); await P.waitForFunction(() => LC.callChan() && LC.callChan().startsWith('g-'));
    await C.click('.ringbox button[aria-label="Accept with video"]'); await until(async () => { const a = await H.evaluate(() => LC.callDebug()); return a && a.length === 2 && a.every((s) => s.startsWith('connected')); }, 20000, '3-way');
    await H.click('#callUI .cbtn[data-k="view"]'); await H.click('.popmenu button:has-text("Gallery")'); await sleep(1200); await shot(H, 'meeting-gallery-3');
    await H.evaluate(() => LC.setUi({ theme: 'dark' })); await shot(H, 'meeting-gallery-3-dark'); await H.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('after a call: rate the quality (stored in the call log)', async () => {
    await P.evaluate(() => LC.leaveCall()); await P.waitForSelector('.cl-rate'); await shot(P, 'rate-card'); await audit(P, 'rate the call');
    await P.click('.cl-rate button[aria-label="4 stars"]'); await P.click('.cl-rate button:has-text("Submit")');
    await until(() => c.db.callLog.some((e) => e.ratings && e.ratings[bob.id] && e.ratings[bob.id].stars === 4), 5000, 'rating stored');
    await leaveAll();
  });
  await step('missed call: no answer -> leave a voicemail; the badge, history and voicemail in the Calls pane', async () => {
    await leaveAll();
    await startDm(H, 'Cy', 'voice'); await C.waitForSelector('.ringbox'); tick(31000);
    await H.waitForSelector('#callUI .cl-banner:has-text("didn’t answer")'); await C.waitForSelector('.ringbox', { state: 'detached' }); await H.click('#callUI .cl-banner button:has-text("Leave a voicemail")');
    await H.waitForSelector('.modal:has-text("Voicemail for Cy")'); await sleep(2200); await H.click('.modal button:has-text("Stop and send")'); await until(() => ((c.db.voicemail || {})[cy.id] || []).length === 1, 10000, 'voicemail stored');
    await H.waitForSelector('#callUI.hidden', { state: 'attached' });
    await C.waitForSelector('.rbtn[data-pane="calls"] .rbadge:not(.live)'); await C.click('.rbtn[data-pane="calls"]'); await C.waitForSelector('.cl-hrow.missed:has-text("Host")'); await shot(C, 'calls-pane-history'); await audit(C, 'Calls pane: history');
    await C.click('.cl-chip:has-text("Outgoing")'); await C.waitForSelector('.cl-callsmain .muted, .cl-callsmain .empty'); await C.click('.cl-chip:has-text("All")');
    await C.click('.cl-tabs .tab:has-text("Voicemail")'); await C.waitForSelector('.cl-vmrow.unheard:has-text("Host") audio'); await shot(C, 'calls-pane-voicemail'); await audit(C, 'Calls pane: voicemail');
    await C.click('.cl-vmrow button[aria-label="Mark as heard"]'); await C.waitForSelector('.cl-vmrow:not(.unheard)');
    await C.evaluate(() => LC.setUi({ theme: 'dark' })); await shot(C, 'calls-pane-voicemail-dark'); await audit(C, 'Calls pane (dark)'); await C.evaluate(() => LC.setUi({ theme: 'auto' }));
  });
  await step('park a call and pick it up with the code from the Calls pane', async () => {
    await leaveAll();
    await startDm(H, 'Bob'); await P.waitForSelector('.ringbox'); await P.click('.ringbox button[aria-label="Accept with audio"]'); await connected(H, P);
    await more(H, 'Park call'); await H.waitForSelector('.modal .cl-code'); const code = (await H.textContent('.modal .cl-code')).trim(); await H.click('.modal button:has-text("Done")');
    await P.waitForSelector(`#callUI .cl-banner:has-text("code ${code}")`);
    await H.click('.rbtn[data-pane="calls"]'); await H.fill('input[aria-label="Parked call code"]', code); await H.click('.cl-pickup button'); await connected(H, P);
  });
  await step('transfer a 1:1 call: Bob is connected to Cy\'s ringing call and the host drops off', async () => {
    await more(H, 'Transfer'); await H.click('.modal .hit:has-text("Cy")'); await H.click('.modal button.primary:has-text("Transfer")');
    await C.waitForSelector('.ringbox:has-text("Transferred by Host")'); await C.click('.ringbox button[aria-label="Accept with audio"]'); await connected(P, C);
    if (await H.evaluate(() => LC.inCall())) throw new Error('host still in a call'); if (!(await P.evaluate(() => LC.callChan()))) throw new Error('bob dropped');
    await leaveAll();
  });
  await step('Walkie Talkie: connect, hold to talk, the other side sees who is talking', async () => {
    await leaveAll();
    for (const p of [H, P]) { await p.click('.rbtn[data-pane="walkie"]'); await p.click('.cl-wrow:has-text("general")'); await p.click('.cl-walkie button:has-text("Connect")'); }
    await until(async () => (await H.evaluate(() => LC.walkie.state().peers)).every((s) => s === 'connected') && (await H.evaluate(() => LC.walkie.state().peers.length)) === 1, 15000, 'walkie connected');
    const b = await H.locator('.cl-ptt').boundingBox(); await H.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await H.mouse.down();
    await P.waitForSelector('.cl-wstatus:has-text("Host is talking")'); await H.waitForSelector('.cl-ptt.on'); await shot(H, 'walkie-talking'); await audit(P, 'walkie-talkie');
    const r = await P.evaluate(() => LC.api('/api/walkie/talk', { chan: 'general', ep: LC.walkie.state().ep, on: true }).then(() => 'granted', (e) => e.message)); if (!/talking/.test(r)) throw new Error('floor not exclusive: ' + r);
    await H.mouse.up(); await P.waitForSelector('.cl-wstatus:has-text("free")'); for (const p of [H, P]) await p.evaluate(() => LC.walkie.disconnect());
  });
  await step('Settings › Calls: forwarding, greeting, ringtones are saved; Settings › Devices: preview, level meter, test call', async () => {
    await H.evaluate(() => LC.settingsPanel('calls')); await H.waitForSelector('.modal select[aria-label="If I don’t answer (after 30 seconds) or decline"]');
    await H.selectOption('.modal select[aria-label="If I don’t answer (after 30 seconds) or decline"]', 'person'); await H.selectOption('.modal select[aria-label="Forward to · If I don’t answer (after 30 seconds) or decline"]', bob.id);
    await until(() => ((c.db.callPrefs || {})[host.id] || {}).forward && c.db.callPrefs[host.id].forward.unanswered === bob.id, 5000, 'forward saved');
    await H.fill('.modal textarea[aria-label="Voicemail greeting"]', 'Leave it at the beep'); await H.click('.modal .cl-settings button:has-text("Save")'); await until(() => c.db.callPrefs[host.id].greeting === 'Leave it at the beep', 5000, 'greeting');
    await H.selectOption('.modal select[aria-label="Calls for me"]', 'marimba'); await until(() => c.db.callPrefs[host.id].ringtone === 'marimba', 5000, 'ringtone'); await shot(H, 'settings-calls'); await audit(H, 'Settings › Calls');
    await H.click('.tabbtn:has-text("Devices")'); await H.waitForFunction(() => { const v = document.querySelector('.modal .cl-campreview'); return v && v.videoWidth > 0; }, null, { timeout: 10000 });
    await H.waitForFunction(() => Number(document.querySelector('.modal .cl-meter').getAttribute('aria-valuenow')) > 0, null, { timeout: 10000 });
    await H.click('.modal button:has-text("Make a test call")'); await H.waitForFunction(() => Number(document.querySelector('.modal .cl-devices').dataset.testcall || 0) > 0, null, { timeout: 12000 }); await shot(H, 'settings-devices'); await audit(H, 'Settings › Devices');
    await H.evaluate(() => LC.setUi({ theme: 'dark' })); await shot(H, 'settings-devices-dark'); await H.evaluate(() => LC.setUi({ theme: 'auto' })); await H.keyboard.press('Escape');
  });
  await step('phone layout: the meeting window and the Calls pane work at 390 px', async () => {
    const M = await open(bt, 'phone', { viewport: { width: 390, height: 800 }, ctx: { hasTouch: true, isMobile: true } });
    await M.tap('.rbtn[data-pane="calls"]'); await M.waitForSelector('.cl-callsmain'); await M.tap('#menuBtn'); await M.waitForSelector('.cl-dial'); await shot(M, 'phone-calls-pane');
    await H.click('.rbtn[data-pane="chat"]'); await H.click('.item[data-chan^="dm:"]:has-text("Bob") .itemmain'); await H.click('#headActions .callgroup button[aria-label="Video call"]');
    await M.waitForSelector('.ringbox'); await M.tap('.ringbox button[aria-label="Accept with video"]'); await M.waitForSelector('#callUI:not(.hidden) .ccontrols');
    const over = await M.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || [...document.querySelectorAll('#callUI .ccontrols > *')].some((n) => n.getBoundingClientRect().right > innerWidth + 1)); if (over) throw new Error('toolbar overflows the phone screen');
    await M.waitForSelector('#callUI .cbtn[data-k="people"]'); await sleep(800); await shot(M, 'phone-meeting'); await M.evaluate(() => LC.leaveCall()); await M.ctx.close(); await leaveAll();
  });
  console.log('ERRORS:', errs.length ? errs : 'none'); console.log(axeSrc ? `axe: ${audits} calls screens audited, 0 violations` : 'axe: skipped (set AXE_JS)'); console.log(`ui-calls: ${ok}/${ok + bad} passed`);
  await br.close(); app.stop(); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
