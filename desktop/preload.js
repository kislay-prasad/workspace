'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const s = (v, max) => String(v == null ? '' : v).slice(0, max);
contextBridge.exposeInMainWorld('lanchatNative', {
  desktop: true,
  notify: (title, body, chan) => ipcRenderer.send('notify', { title: String(title), body: String(body), chan: chan ? String(chan) : '' }),
  badge: (n, mention) => ipcRenderer.send('badge', { n: Number(n) || 0, mention: !!mention }),
  onOpenChat: (cb) => ipcRenderer.on('open-chat', (_e, chan) => cb(chan)),
  onPanel: (cb) => ipcRenderer.on('open-panel', (_e, name) => cb(name)),
  diagnostics: () => ipcRenderer.send('open-diag'),
  platform: process.platform,
  // screen sharing: list screens/windows (with thumbnails) and choose what the next share uses ('auto' = the whole screen LANChat is on)
  screens: () => ipcRenderer.invoke('screens:list'),
  pickScreen: (id, audio) => ipcRenderer.send('screens:pick', { id: String(id || 'auto'), audio: !!audio }),
  // generic bridge for desktop feature modules (desktop/ext-*.js): only channels starting with "x:" (see docs/EXTENDING.md)
  invoke: (ch, ...a) => (typeof ch === 'string' && ch.startsWith('x:') ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('blocked channel'))),
  send: (ch, ...a) => { if (typeof ch === 'string' && ch.startsWith('x:')) ipcRenderer.send(ch, ...a); },
  on: (ch, cb) => { if (typeof ch === 'string' && ch.startsWith('x:') && typeof cb === 'function') ipcRenderer.on(ch, (_e, ...a) => cb(...a)); },
  // shell area (public/js/shell*.js): window, settings, sessions, sharing, updates. main.js checks every value again.
  shell: {
    info: () => ipcRenderer.invoke('shell:info'),
    ready: () => ipcRenderer.send('shell:ready'),
    onAction: (cb) => { if (typeof cb === 'function') ipcRenderer.on('shell:action', (_e, a) => cb(a)); },
    sessions: () => ipcRenderer.invoke('shell:sessions'),
    switchSession: (id) => ipcRenderer.invoke('shell:switch', s(id, 40)),
    manageSessions: () => ipcRenderer.send('shell:manage'),
    popout: (kind, id) => ipcRenderer.invoke('shell:popout', { kind: s(kind, 10), id: s(id, 120) }),
    setZoom: (f) => ipcRenderer.invoke('shell:zoom', Number(f) || 1),
    setPref: (k, v) => ipcRenderer.invoke('shell:pref', s(k, 30), typeof v === 'boolean' ? v : s(v, 20)),
    chooseDownloads: () => ipcRenderer.invoke('shell:chooseDownloads'),
    showDownload: (id) => ipcRenderer.send('shell:showDownload', s(id, 40)),
    cacheInfo: () => ipcRenderer.invoke('shell:cacheInfo'),
    clearCache: () => ipcRenderer.invoke('shell:clearCache'),
    setLang: (code) => ipcRenderer.send('shell:lang', s(code, 12)),
    shareRead: (id) => ipcRenderer.invoke('shell:shareRead', s(id, 40)),
    offerUpdate: (o) => ipcRenderer.invoke('shell:update', { version: s(o && o.version, 20), sha256: s(o && o.sha256, 64), size: Number(o && o.size) || 0, token: s(o && o.token, 200), host: s(o && o.host, 60), manual: !!(o && o.manual) }),
    updateFromFolder: () => ipcRenderer.send('shell:updateFolder'),
  },
});
