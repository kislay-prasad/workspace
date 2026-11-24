'use strict';
// Startup: admin-link handling, login, waiting-for-approval screen, session resume.
(() => {
  const LC = window.LC, { S, $ } = LC, t = (k, v) => LC.t(k, v);
  let pollTimer = null;
  const show = (id) => { for (const x of ['login', 'waiting', 'app']) $('#' + x).classList.toggle('hidden', x !== id); };
  const post = (path, body) => fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  async function enter(token) { S.token = token; LC.ls.set('lc_token', token); LC.ls.del('lc_pending'); clearInterval(pollTimer); show('app'); LC.connect(); }

  function waitFor(p) {
    show('waiting'); $('#waitingMsg').textContent = t('waitingMsg2', { name: p.name }); LC.ls.set('lc_pending', p);
    const stop = (msg) => { clearInterval(pollTimer); LC.ls.del('lc_pending'); show('login'); $('#loginErr').textContent = msg || ''; };
    $('#cancelWait').onclick = async () => { try { await post('/api/join/cancel', { id: p.id, secret: p.secret }); } catch {} stop(''); };
    const check = async () => {
      try {
        const r = await fetch(`/api/join/status?id=${encodeURIComponent(p.id)}&s=${encodeURIComponent(p.secret)}`), d = await r.json().catch(() => ({}));
        if (r.status === 404) return stop(t('requestExpired'));
        if (d.status === 'approved') { clearInterval(pollTimer); return enter(d.token); }
        if (d.status === 'denied') return stop(d.reason === 'blocked' ? t('blockedNotice') : t('deniedNotice'));
      } catch {}
    };
    clearInterval(pollTimer); pollTimer = setInterval(check, 2000); check();
  }

  async function boot() {
    LC.applyI18n();
    let adminKey = LC.ls.get('lc_admin', null); const m = /[#&]k=([A-Za-z0-9_-]{16,})/.exec(location.hash);
    if (m) { adminKey = m[1]; LC.ls.set('lc_admin', adminKey); history.replaceState(null, '', location.pathname + location.search); }
    LC.adminKey = adminKey;
    const ho = /[#&]h=([a-f0-9]{32})/.exec(location.hash); // arrived from the http:// page via "Switch to the secure page"
    if (ho) { history.replaceState(null, '', location.pathname + location.search); try { const r = await post('/api/handoff/redeem', { code: ho[1], deviceId: S.deviceId }), d = await r.json().catch(() => ({})); if (r.ok) return enter(d.token); LC.ls.set('lc_notice', 'handoff'); } catch {} }
    const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
    if (cfg.name) { S.chatName = cfg.name; document.title = cfg.name; $('#loginTitle').textContent = cfg.name; }
    $('#passIn').classList.toggle('hidden', !cfg.needPass); $('#hostNote').classList.toggle('hidden', !adminKey); $('#approvalNote').classList.toggle('hidden', !cfg.approval || !!adminKey);
    const notice = LC.ls.get('lc_notice'); if (notice) { LC.ls.del('lc_notice'); $('#loginErr').textContent = notice === 'kicked' ? t('kickedNotice') : notice === 'deleted' ? t('accountDeleted') : notice === 'handoff' ? t('handoffExpired') : t('sessionExpired'); }
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    const pending = LC.ls.get('lc_pending');
    if (S.token) {
      try { const r = await post('/api/join', { token: S.token, adminKey, deviceId: S.deviceId }); if (r.ok) return enter((await r.json()).token); LC.ls.del('lc_token'); S.token = null; }
      catch { show('app'); LC.banner(t('reconnecting')); return LC.connect(); } // offline start: keep trying
    }
    if (pending) return waitFor(pending);
    show('login'); $('#nameIn').focus();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('#loginErr'), btn = $('#joinBtn'); err.textContent = ''; btn.disabled = true;
    try {
      const r = await post('/api/join', { name: $('#nameIn').value, passcode: $('#passIn').value, deviceId: S.deviceId, adminKey: LC.adminKey }), d = await r.json().catch(() => ({}));
      if (r.status === 200) return enter(d.token);
      if (r.status === 202) return waitFor({ id: d.id, secret: d.secret, name: d.name });
      err.textContent = d.error || t('joinFailed');
    } catch { err.textContent = t('offlineErr'); } finally { btn.disabled = false; }
  });

  boot();
})();
