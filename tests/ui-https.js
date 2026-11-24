'use strict';
// Browser -> app calls: a browser on the plain http:// LAN address cannot use the microphone, so LANChat offers
// "Switch to the secure page" (same server, https://, one-time sign-in code). After switching, it calls someone
// who uses the app (here a second browser on localhost, which browsers also treat as secure).
// The host name lanchat.test is mapped to 127.0.0.1 so the page is NOT localhost (like a real 192.168.x.x address).
const ROOT = require('path').resolve(__dirname, '..'), TMP = require('os').tmpdir();
const { chromium } = require('playwright'); const { createApp } = require(ROOT + '/lib/app.js'); const fs = require('fs');
(async () => {
  fs.rmSync(TMP + '/lc-https', { recursive: true, force: true });
  const app = createApp({ dataDir: TMP + '/lc-https', name: 'Secure test', publicDir: ROOT + '/public' }); const port = await app.start(3871); const c = app.ctx;
  const host = c.makeUser('Host'); c.makeOwner(host); const bob = c.makeUser('Bob'); const ht = c.newToken(host), bt = c.newToken(bob);
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'lanchat.test,127.0.0.1,localhost' } : undefined;
  const br = await chromium.launch({ proxy, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--host-resolver-rules=MAP lanchat.test 127.0.0.1'] });
  const errs = [], step = async (name, fn) => { try { await fn(); console.log('  ✓', name); } catch (e) { console.log('  ✗', name, '\n     ', e.message.split('\n')[0]); } };
  // ignoreHTTPSErrors = the person tapped "Advanced → Proceed" on the one-time certificate warning
  const mk = async (label, url, tok) => { const ctx = await br.newContext({ ignoreHTTPSErrors: true, permissions: ['microphone', 'camera'], viewport: { width: 1200, height: 780 } }); if (tok) await ctx.addInitScript((t) => { try { if (!localStorage.getItem('lc_token')) localStorage.setItem('lc_token', JSON.stringify(t)); } catch {} }, tok); const p = await ctx.newPage(); p.setDefaultTimeout(8000); p.on('pageerror', (e) => errs.push(label + ' pageerror: ' + e.message)); await p.goto(url); await p.waitForSelector('#app:not(.hidden) .item.active'); return p; };
  const B = await mk('bob-browser', `http://lanchat.test:${port}/`, bt), H = await mk('host-app', `http://127.0.0.1:${port}/`, ht);
  await step('plain http:// LAN page is not allowed to use the microphone', async () => { const r = await B.evaluate(() => ({ secure: window.isSecureContext, gum: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) })); if (r.secure || r.gum) throw new Error(JSON.stringify(r)); });
  await step('calling explains it and offers the secure page', async () => { await B.click('#headActions .callgroup button[aria-label="Video call"]'); await B.waitForSelector('.modal:has-text("Switch to the secure page")'); await B.waitForSelector('.modal:has-text("not private")'); });
  await step('switching keeps you signed in (no new approval) and the page is secure', async () => {
    await B.click('.modal button:has-text("Switch now")'); await B.waitForURL(/^https:\/\/lanchat\.test/); await B.waitForSelector('#app:not(.hidden) .item.active');
    const r = await B.evaluate(() => ({ secure: window.isSecureContext, me: LC.S.me.name, hash: location.hash, gum: !!navigator.mediaDevices.getUserMedia })); if (!r.secure || r.me !== 'Bob' || r.hash || !r.gum) throw new Error(JSON.stringify(r));
  });
  await step('the browser calls the app user and they connect', async () => {
    await B.click('#headActions .callgroup button[aria-label="Video call"]'); await B.waitForSelector('#callUI:not(.hidden) .tile');
    await H.waitForSelector('#callBar button.primary'); await H.click('#callBar button.primary');
    for (let i = 0; i < 40; i++) { const a = await B.evaluate(() => LC.callDebug()), h = await H.evaluate(() => LC.callDebug()); if (a && h && a[0] && h[0] && a[0].startsWith('connected') && h[0].startsWith('connected')) break; if (i === 39) throw new Error(JSON.stringify([a, h])); await new Promise((r) => setTimeout(r, 500)); }
    await H.waitForFunction(() => [...document.querySelectorAll('#callUI .tile:not(.local) video')].some((v) => v.videoWidth > 0));
  });
  await step('invite shows the https:// link for phones and browsers', async () => { await H.evaluate(() => LC.leaveCall()); await B.evaluate(() => LC.leaveCall()); await H.click('#inviteBtn'); await H.waitForSelector('.modal code:has-text("https://")'); await H.waitForSelector('.modal:has-text("LANChat desktop app")'); });
  console.log('ERRORS:', errs.length ? errs : 'none'); await br.close(); app.stop(); process.exit(0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(1); });
