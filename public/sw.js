// Minimal service worker: lets the app shell open instantly and show "offline" gracefully. Never caches API or files.
const CACHE = 'lanchat-shell-v6';
const SHELL = ['/', '/style.css', '/js/icons.js', '/js/i18n.js', '/js/core.js', '/js/render.js', '/js/composer.js', '/js/chat.js', '/js/panels.js', '/js/collab.js', '/js/calls.js', '/js/chatux.js', '/js/people.js', '/js/meetings.js', '/js/apps.js', '/js/teams.js', '/css/chatux.css', '/css/people.css', '/css/meetings.css', '/css/apps.css', '/css/teams.css', '/css/calls.css', '/js/main.js', '/qrcode.js', '/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url); if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.pathname.startsWith('/files/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
