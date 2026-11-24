'use strict';
// Self-signed TLS certificate for the session, made without any extra packages (tiny DER/X.509 writer).
// Browsers only allow the microphone/camera on https:// pages, so every session also answers https:// on the same port.
// The browser shows a one-time "not private" warning because nobody official signed this certificate; the traffic is still encrypted.
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------- DER helpers ----------
const len = (n) => { if (n < 128) return Buffer.from([n]); const b = []; while (n > 0) { b.unshift(n & 0xff); n = Math.floor(n / 256); } return Buffer.from([0x80 | b.length, ...b]); };
const tlv = (tag, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(body.length), body]); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const int = (buf) => { let b = Buffer.from(buf); while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return tlv(0x02, b); };
const oid = (s) => {
  const p = s.split('.').map(Number), out = [40 * p[0] + p[1]];
  for (const n of p.slice(2)) { const st = [n & 0x7f]; let v = Math.floor(n / 128); while (v > 0) { st.unshift((v & 0x7f) | 0x80); v = Math.floor(v / 128); } out.push(...st); }
  return tlv(0x06, Buffer.from(out));
};
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const octet = (buf) => tlv(0x04, buf);
const bitstr = (buf) => tlv(0x03, Buffer.from([0]), buf);
const time = (d) => {
  const pad = (n) => String(n).padStart(2, '0'), y = d.getUTCFullYear();
  const rest = pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  return y < 2050 ? tlv(0x17, Buffer.from(String(y).slice(2) + rest)) : tlv(0x18, Buffer.from(String(y) + rest));
};
const TRUE = tlv(0x01, Buffer.from([0xff]));
const ipBytes = (ip) => { const p = ip.split('.').map(Number); return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n < 256) ? Buffer.from(p) : null; };

const DAY = 86400000, VALID_DAYS = 800; // Apple refuses server certificates valid for more than 825 days

// makeCert({ key, cn, ips, names }) -> PEM certificate signed by its own key (ECDSA P-256 + SHA-256)
function makeCert({ key, cn = 'LANChat', ips = [], names = [] }) {
  const priv = typeof key === 'string' ? crypto.createPrivateKey(key) : key, pub = crypto.createPublicKey(priv);
  const name = seq(set(seq(oid('2.5.4.3'), utf8(cn.slice(0, 60)))), set(seq(oid('2.5.4.10'), utf8('LANChat'))));
  const alg = seq(oid('1.2.840.10045.4.3.2')); // ecdsa-with-SHA256
  const san = [...new Set(names)].filter(Boolean).map((n) => tlv(0x82, Buffer.from(n, 'ascii')))
    .concat([...new Set(ips)].map(ipBytes).filter(Boolean).map((b) => tlv(0x87, b)));
  const exts = seq(
    seq(oid('2.5.29.19'), TRUE, octet(seq())), // basicConstraints: not a CA
    seq(oid('2.5.29.15'), TRUE, octet(tlv(0x03, Buffer.from([0x07, 0x80])))), // keyUsage: digitalSignature
    seq(oid('2.5.29.37'), octet(seq(oid('1.3.6.1.5.5.7.3.1')))), // extKeyUsage: serverAuth
    seq(oid('2.5.29.17'), octet(seq(...san))), // subjectAltName
    seq(oid('2.5.29.14'), octet(octet(crypto.createHash('sha1').update(pub.export({ type: 'spki', format: 'der' })).digest()))), // subjectKeyIdentifier
  );
  const now = Date.now(), serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const tbs = seq(tlv(0xa0, int([2])), int(serial), alg, name, seq(time(new Date(now - DAY)), time(new Date(now + VALID_DAYS * DAY))), name, pub.export({ type: 'spki', format: 'der' }), tlv(0xa3, exts));
  const sig = crypto.sign('sha256', tbs, { key: priv, dsaEncoding: 'der' });
  const der = seq(tbs, alg, bitstr(sig));
  return '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
}

const localIps = () => Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4').map((i) => i.address);
const localNames = () => { const h = os.hostname().toLowerCase().replace(/[^a-z0-9.-]/g, ''); return ['localhost', h, h && !h.includes('.') ? h + '.local' : ''].filter(Boolean); };

// Loads the session's certificate (making or refreshing it when needed). The key never changes, so a refreshed
// certificate (new Wi-Fi address, nearly expired) keeps the same identity.
function loadOrCreate(dir, cn) {
  const kf = path.join(dir, 'tls-key.pem'), cf = path.join(dir, 'tls-cert.pem');
  let key = null, cert = null;
  try { key = fs.readFileSync(kf, 'utf8'); crypto.createPrivateKey(key); } catch { key = null; }
  if (!key) { key = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }); try { fs.writeFileSync(kf, key, { mode: 0o600 }); } catch {} }
  try { cert = fs.readFileSync(cf, 'utf8'); } catch {}
  const ips = localIps();
  let ok = false, oldIps = [];
  if (cert) {
    try {
      const x = new crypto.X509Certificate(cert), pub = crypto.createPublicKey(key);
      oldIps = (x.subjectAltName || '').split(', ').filter((s) => s.startsWith('IP Address:')).map((s) => s.slice(11));
      ok = x.verify(pub) && new Date(x.validTo).getTime() - Date.now() > 30 * DAY && ips.every((ip) => oldIps.includes(ip));
    } catch { ok = false; }
  }
  if (!ok) {
    const keep = oldIps.filter((ip) => !ips.includes(ip)).slice(0, 12); // keep recent addresses so old links keep matching
    cert = makeCert({ key, cn, ips: ['127.0.0.1', ...ips, ...keep], names: localNames() });
    try { fs.writeFileSync(cf, cert); } catch {}
  }
  const x = new crypto.X509Certificate(cert);
  return { key, cert, fingerprint: x.fingerprint256 };
}

module.exports = { makeCert, loadOrCreate };
