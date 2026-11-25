'use strict';
// Activity feed API (the store + ctx.activity() producer live in app.js so every feature can post to it).
// Items: { id, ts, read, type, chan?, msg?, from?, text? }  types: mention, reply, reaction, missedCall, voicemail,
// added, task, meeting, follow, approval, form, shift, system (see docs/EXTENDING.md).
module.exports = (ctx) => {
  const { api, json, body, str, coll, store, emit } = ctx;
  api['GET /api/activity'] = async (req, res, me, url) => {
    const list = coll('activity')[me.id] || [], type = url.searchParams.get('type') || '', unread = url.searchParams.get('unread') === '1';
    const out = list.filter((a) => (!type || a.type === type) && (!unread || !a.read)).slice(-200).reverse();
    json(res, 200, { items: out, unread: list.filter((a) => !a.read).length });
  };
  api['POST /api/activity/read'] = async (req, res, me) => {
    const b = await body(req, 8192), list = coll('activity')[me.id] || [], ids = Array.isArray(b.ids) ? new Set(b.ids.map((x) => str(x, 16))) : null, read = b.read !== false;
    for (const a of list) if (b.all || (ids && ids.has(a.id))) a.read = read;
    store.save(); emit('activityread', { ids: b.all ? 'all' : [...(ids || [])], read }, [me.id]); json(res, 200, { ok: true });
  };
};
