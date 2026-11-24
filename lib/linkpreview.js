'use strict';
// Server-side link previews with SSRF protection: only public internet hosts, never LAN/loopback addresses.
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPrivateIp(x.slice(7));
    return x === '::1' || x === '::' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff');
  }
  return true;
}

function safeLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => !isPrivateIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    if (options && options.all) cb(null, ok); else cb(null, ok[0].address, ok[0].family);
  });
}

const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' }[e])).replace(/\s+/g, ' ').trim();
const meta = (html, re) => { const m = re.exec(html); return m ? decode(m[1]) : ''; };

function fetchOnce(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(urlStr); } catch { return reject(new Error('bad url')); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error('bad url'));
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && isPrivateIp(host)) return reject(new Error('blocked address'));
    if (!net.isIP(host) && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.'))) return reject(new Error('blocked address'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { lookup: safeLookup, timeout: timeoutMs, headers: { 'user-agent': 'Mozilla/5.0 (compatible; LANChatPreview/1.0)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString() }); }
      if (res.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(res.headers['content-type'] || '')) { res.resume(); return reject(new Error('not html')); }
      let size = 0; const chunks = [];
      res.on('data', (c) => { size += c.length; chunks.push(c); if (size > 300 * 1024) { res.destroy(); resolve({ html: Buffer.concat(chunks).toString('utf8') }); } });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchPreview(url, timeoutMs = 4000) {
  let cur = url;
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetchOnce(cur, timeoutMs);
    if (r.redirect) { cur = r.redirect; continue; }
    const h = r.html, head = h.slice(0, 200000);
    const title = meta(head, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) || meta(head, /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i) || meta(head, /<title[^>]*>([^<]*)<\/title>/i);
    const description = meta(head, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) || meta(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    const site = meta(head, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i) || new URL(cur).hostname;
    if (!title) return null;
    return { url, title: title.slice(0, 140), description: description.slice(0, 240), site: site.slice(0, 60) };
  }
  return null;
}

module.exports = { fetchPreview, isPrivateIp };
