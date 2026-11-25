'use strict';
// Sign-in and account security (section 24): the branded lobby on the sign-in and "waiting for approval" screens,
// invite links (#invite=CODE from Manage › People › Bulk add), the PIN / password + authenticator-code step when an
// account is protected, and Settings › Security (set a PIN, add an authenticator app with a QR code, your devices).
// Loads before main.js: it decorates the sign-in form and adds the extra fields to POST /api/join (main.js is unchanged).
(() => {
  const LC = window.LC, { el, S, $ } = LC, t = (k, v) => LC.t(k, v), U = LC.tmUi;
  LC.addStrings('en', {
    tm_invitedAs: 'You are invited as {name}.', tm_invitedGuest: 'You are invited as {name} (guest).', tm_inviteBad: 'That invite link is not valid any more. Ask the host for a new one.', tm_pinPh: 'PIN or password', tm_totpPh: 'Authenticator code',
    tm_pinNeeded: 'This account is protected. Enter its PIN or password.', tm_security: 'Security', tm_secHelp: 'Protect your account: when you sign in on a new device, LANChat asks for your PIN or password (and a code from an authenticator app if you add one).',
    tm_pinSet: 'Your account has a {kind}.', tm_pinNone: 'No PIN or password yet.', tm_kind_pin: 'PIN', tm_kind_password: 'password', tm_newPin: 'New PIN (4–12 digits) or password (8+ characters)', tm_currentPin: 'Current PIN or password', tm_setPin: 'Set PIN or password', tm_changePin: 'Change', tm_removePin: 'Remove',
    tm_2fa: 'Authenticator app (2-step check)', tm_2faOn: 'On: signing in on a new device also asks for a 6-digit code.', tm_2faOff: 'Off', tm_2faStart: 'Add an authenticator app', tm_2faScan: 'Scan this QR code with an authenticator app (it works offline), or type the key, then enter the 6-digit code it shows.',
    tm_2faKey: 'Key', tm_2faCode: '6-digit code', tm_2faConfirm: 'Turn on', tm_2faRemove: 'Turn off', tm_2faNeedPin: 'Set a PIN or password first.', tm_policyApproval: 'The host still approves new devices; your PIN is asked as well.', tm_policySkip: 'With the right PIN you can sign in on a new device without waiting for the host.',
    tm_myDevices: 'Where you are signed in', tm_showDevices: 'See my devices', tm_pinSaved: 'Saved. You will need it to sign in on a new device.', tm_secMenu: 'Security and devices',
  });
  LC.addStrings('hi', { tm_security: 'सुरक्षा', tm_pinPh: 'पिन या पासवर्ड' });
  LC.addStrings('es', { tm_security: 'Seguridad', tm_pinPh: 'PIN o contraseña' });

  // ---------- branded lobby (sign-in, waiting screen; meetings may use LC.tmBrand for their lobby) ----------
  function applyBrand(b) {
    LC.tmBrand = b || null; if (!b) return;
    for (const id of ['login', 'waiting']) {
      const box = $('#' + id); if (!box) continue; const card = box.querySelector('.card');
      if (b.color) box.style.setProperty('--brand', b.color);
      if (b.logo) { let img = card.querySelector('.logo img'); if (!img) { const l = el('div', { class: 'logo tm-brandlogo', 'aria-hidden': 'true' }, img = el('img', { alt: '', width: 56, height: 56 })); card.prepend(l); } img.src = b.logo; img.classList.add('tm-logoimg'); }
      if (b.welcome && !card.querySelector('.tm-welcome')) { const p = el('p', { class: 'tm-welcome', text: b.welcome }); const h = card.querySelector('h1'); if (h) h.after(p); else card.prepend(p); }
    }
  }
  fetch('/api/config').then((r) => r.json()).then((c) => applyBrand(c.brand)).catch(() => {});
  LC.on('tm_config', (c) => { if (c && 'brand' in c) LC.tmBrand = c.brand; });

  // ---------- invite links and the PIN step: extra fields for POST /api/join ----------
  const A = { invite: null, pin: false, totp: false };
  const m = /[#&]invite=([A-Za-z0-9-]{6,40})/.exec(location.hash);
  if (m) { A.invite = m[1]; history.replaceState(null, '', location.pathname + location.search); }
  const pinIn = el('input', { id: 'tmPin', type: 'password', class: 'hidden', autocomplete: 'current-password', placeholder: t('tm_pinPh'), 'aria-label': t('tm_pinPh'), maxlength: 128 });
  const totpIn = el('input', { id: 'tmTotp', class: 'hidden', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: t('tm_totpPh'), 'aria-label': t('tm_totpPh'), maxlength: 6, pattern: '[0-9]*' });
  const note = el('p', { class: 'hostnote hidden tm-invitenote', role: 'status' });
  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#loginForm'); if (!form) return; const btn = $('#joinBtn');
    btn.before(pinIn, totpIn); form.querySelector('h1').after(note);
    $('#nameIn').addEventListener('input', () => { if (A.pin) { A.pin = A.totp = false; pinIn.classList.add('hidden'); totpIn.classList.add('hidden'); pinIn.value = totpIn.value = ''; } });
    if (A.invite) fetch('/api/tm/invite?code=' + encodeURIComponent(A.invite)).then((r) => r.json().then((d) => ({ ok: r.ok, d }))).then(({ ok, d }) => {
      if (!ok) { A.invite = null; $('#loginErr').textContent = t('tm_inviteBad'); return; }
      const n = $('#nameIn'); n.value = d.name; n.readOnly = true; note.textContent = t(d.guest ? 'tm_invitedGuest' : 'tm_invitedAs', { name: d.name }); note.classList.remove('hidden');
      for (const id of ['approvalNote', 'passIn']) { const x = $('#' + id); if (x) x.classList.add('hidden'); }
    }).catch(() => {});
  });
  const showPin = (totp) => {
    A.pin = true; A.totp = A.totp || !!totp; pinIn.classList.remove('hidden'); totpIn.classList.toggle('hidden', !A.totp);
    setTimeout(() => (A.totp && pinIn.value ? totpIn : pinIn).focus(), 30);
  };
  const baseFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : '';
    if (url !== '/api/join' || !init || init.method !== 'POST' || typeof init.body !== 'string') return baseFetch(input, init);
    let resume = false;
    try { const b = JSON.parse(init.body); resume = !!b.token; if (!resume) { if (A.invite) b.invite = A.invite; if (A.pin) b.pin = pinIn.value; if (A.totp) b.totp = totpIn.value.trim(); init = { ...init, body: JSON.stringify(b) }; } } catch {}
    const r = await baseFetch(input, init);
    if (!resume && !r.ok) r.clone().json().then((d) => { if (d && d.needPin) showPin(d.totp); }).catch(() => {});
    if (!resume && r.ok) { A.invite = null; pinIn.value = totpIn.value = ''; }
    return r;
  };

  // ---------- Settings › Security ----------
  async function securityTab() {
    const s = await LC.api('/api/tm/me/security'), box = el('div', { class: 'tm-security' });
    const cur = el('input', { type: 'password', autocomplete: 'current-password', placeholder: t('tm_currentPin'), 'aria-label': t('tm_currentPin') }), nw = el('input', { type: 'password', autocomplete: 'new-password', placeholder: t('tm_newPin'), 'aria-label': t('tm_newPin'), maxlength: 128 });
    const reload = () => LC.settingsPanel('tm_security');
    const setPin = () => LC.api('/api/tm/me/pin', { pin: nw.value, current: cur.value }).then(() => { LC.toast(t('tm_pinSaved')); reload(); }).catch(U.fail);
    const pinSec = el('section', { class: 'tm-sec' }, el('h3', {}, LC.icon('password'), ' ' + t('tm_setPin')), el('p', { class: 'muted small', text: s.pin ? t('tm_pinSet', { kind: t('tm_kind_' + s.kind) }) : t('tm_pinNone') }),
      s.pin ? U.field(t('tm_currentPin'), cur) : null, U.field(t('tm_newPin'), nw),
      el('div', { class: 'acts' }, s.pin ? el('button', { class: 'secondary sm danger', text: t('tm_removePin'), onclick: () => LC.api('/api/tm/me/pin/remove', { current: cur.value }).then(reload).catch(U.fail) }) : null, el('button', { class: 'primary sm', text: s.pin ? t('tm_changePin') : t('tm_setPin'), onclick: setPin })),
      el('p', { class: 'muted small', text: s.pinSkipsApproval ? t('tm_policySkip') : t('tm_policyApproval') }));
    const twoBox = el('div');
    const twoSec = el('section', { class: 'tm-sec' }, el('h3', {}, LC.icon('shield_keyhole'), ' ' + t('tm_2fa')), el('p', { class: 'muted small', text: s.totp ? t('tm_2faOn') : t('tm_2faOff') }), twoBox);
    if (!s.pin) twoBox.append(el('p', { class: 'muted small', text: t('tm_2faNeedPin') }));
    else if (s.totp) { const c2 = el('input', { type: 'password', autocomplete: 'current-password', placeholder: t('tm_currentPin'), 'aria-label': t('tm_currentPin') }); twoBox.append(c2, el('div', { class: 'acts' }, el('button', { class: 'secondary sm danger', text: t('tm_2faRemove'), onclick: () => LC.api('/api/tm/me/totp/off', { current: c2.value }).then(reload).catch(U.fail) }))); }
    else twoBox.append(el('button', { class: 'secondary sm withicon', onclick: async () => {
      try {
        const { secret, uri } = await LC.api('/api/tm/me/totp/start', {}), code = el('input', { inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', 'aria-label': t('tm_2faCode'), placeholder: '123456' });
        const qr = el('div', { class: 'qr', role: 'img', 'aria-label': t('tm_2faStart') }); try { const q = qrcode(0, 'M'); q.addData(uri); q.make(); qr.append(new DOMParser().parseFromString(q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }), 'image/svg+xml').documentElement); } catch {}
        U.set(twoBox, el('p', { class: 'small', text: t('tm_2faScan') }), qr, el('p', { class: 'small' }, t('tm_2faKey') + ': ', el('code', { class: 'tm-secret', text: secret.replace(/(.{4})/g, '$1 ').trim() })), U.field(t('tm_2faCode'), code),
          el('div', { class: 'acts' }, el('button', { class: 'primary sm', text: t('tm_2faConfirm'), onclick: () => LC.api('/api/tm/me/totp/confirm', { code: code.value }).then(reload).catch(U.fail) })));
        code.focus();
      } catch (e) { U.fail(e); }
    } }, LC.icon('qr_code'), el('span', { text: t('tm_2faStart') })));
    const devSec = el('section', { class: 'tm-sec' }, el('h3', {}, LC.icon('laptop'), ' ' + t('tm_myDevices')), el('button', { class: 'secondary sm', text: t('tm_showDevices'), onclick: () => LC.tmAdmin && LC.tmAdmin.devicesDialog(S.me, true) }));
    box.append(el('p', { class: 'muted small', text: t('tm_secHelp') }), pinSec, twoSec, devSec);
    return box;
  }
  LC.ext.settingsTabs.push({ key: 'tm_security', icon: 'shield_keyhole', label: () => t('tm_security'), order: 62, render: securityTab });
  LC.ext.profileMenu.push(() => ({ icon: 'shield_keyhole', label: t('tm_secMenu'), fn: () => LC.settingsPanel('tm_security') }));
})();
