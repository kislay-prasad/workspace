'use strict';
const { contextBridge, ipcRenderer } = require('electron');
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
});
