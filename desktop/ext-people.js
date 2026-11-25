'use strict';
// People area, desktop app: notifications you can answer. Each notification for a chat message opens a small quick-reply box
// for that chat when clicked (in the app window: LC.people.quickReply); on macOS you can also type the reply inside the
// notification itself (Electron's hasReply). Windows toasts can show a text box (toastXml), but Electron gives the app no way to
// read what was typed there, so on Windows and Linux the reply box opens in the app instead.
// Renderer side: public/js/people-activity.js (LC.native.invoke('x:people:notify', …), LC.native.on('x:people:quickReply' | 'x:people:reply')).
module.exports = (api) => {
  const { Notification } = api;
  const keep = new Set(); // notifications must stay referenced, or their click handlers can be garbage-collected
  let recent = [];
  const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
  api.handle('people:hello', () => ({ ok: true, inlineReply: process.platform === 'darwin' }));
  api.handle('people:notify', (_e, n) => {
    if (!n || typeof n !== 'object' || !Notification.isSupported()) return false;
    const now = Date.now(); recent = recent.filter((x) => now - x < 60000); if (recent.length >= 15) return false; recent.push(now);
    const title = str(n.title, 100) || 'LANChat', body = str(n.body, 300), chan = str(n.chan, 64), msg = str(n.msg, 32), urgent = !!n.urgent;
    const opts = { title, body, urgency: urgent ? 'critical' : 'normal', timeoutType: urgent ? 'never' : 'default' };
    if (process.platform === 'darwin' && chan && n.reply) { opts.hasReply = true; opts.replyPlaceholder = str(n.replyPlaceholder, 60) || 'Reply'; }
    const note = new Notification(opts); keep.add(note); if (keep.size > 30) keep.delete(keep.values().next().value);
    note.on('click', () => { keep.delete(note); api.showMain(); if (chan) api.sendToWin('people:quickReply', { chan, msg }); });
    note.on('reply', (_ev, text) => { keep.delete(note); if (chan && typeof text === 'string' && text.trim()) api.sendToWin('people:reply', { chan, msg, text: text.slice(0, 8000) }); });
    note.on('close', () => keep.delete(note));
    note.show();
    const w = api.getWin(); if (w && !w.isDestroyed() && !w.isFocused()) w.flashFrame(true);
    return true;
  });
  // lets the app (and tests) check the reply path end to end: main process -> window -> quick-reply box
  api.handle('people:echoQuickReply', (_e, d) => { if (!d || typeof d.chan !== 'string') return false; api.sendToWin('people:quickReply', { chan: str(d.chan, 64), msg: str(d.msg, 32) }); return true; });
};
