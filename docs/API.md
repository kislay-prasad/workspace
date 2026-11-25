# LANChat developer guide

LANChat runs on the host's own computer. Your scripts and services talk to it over the local network (or the
internet, if the host shares the session). There are three ways in:

| | What it is | Where it is set up |
|---|---|---|
| **API keys** | A program reads and posts as a **bot**, only in the chats that bot belongs to | Manage › Developer |
| **Incoming webhooks** | A secret address. Anything that can send an HTTP POST can post into one channel | Channel ⋯ › Connectors and webhooks |
| **Outgoing webhooks** | A channel bot. When someone @mentions it, LANChat POSTs the message to your service and posts your answer | Channel ⋯ › Connectors and webhooks (admins and team owners) |

The examples use `https://192.168.1.20:3000`. Use the address from **Invite** (top bar). The session makes its own
certificate, so tools like `curl` need `-k`, or you can use the plain `http://` address on the same port.

## API keys

Create a key in **Manage › Developer**:
- Give it a name.
- Choose the bot it acts as: an existing bot, or a new one created for the key.
- Choose what it may do: **read**, **post**, or both.

The key looks like `lck_3f9a0c7e21_…` and is **shown once**. LANChat stores only a salted hash of it. Revoke it
any time on the same tab.

Send the key in the `x-api-key` header. A bot works **only in the chats it belongs to**:
- session-wide channels (every bot is a member of the session);
- teams and channels it was added to (Manage team › Add member works for bots too);
- group chats it was added to;
- 1:1 chats people opened with it.

Requests are rate-limited: 120 a minute per key and 300 a minute per address. Wrong, missing or revoked keys get
`401`. A key that lacks the scope gets `403`.

### Who am I
```bash
curl -k -H 'x-api-key: lck_…' https://192.168.1.20:3000/api/bot/me
# {"id":"8c1…","name":"Reporter","scopes":["read","post"]}
```

### Chats the bot is in (scope: read)
```bash
curl -k -H 'x-api-key: lck_…' https://192.168.1.20:3000/api/bot/chats
# {"chats":[{"id":"general","name":"general","kind":"","team":"","teamName":""},
#           {"id":"tc-1a2b3c4d5e","name":"General","team":"7f…","teamName":"Marketing"},
#           {"id":"dm:…","kind":"dm","with":"Ana"}]}
```

### Read messages (scope: read)
`GET /api/bot/messages?chan=<id>&limit=50` returns the newest messages (up to 200). Add `&after=<seq>` to get the ones
after a message's `seq` (for polling).
```bash
curl -k -H 'x-api-key: lck_…' 'https://192.168.1.20:3000/api/bot/messages?chan=general&limit=20'
```
Each message has `id`, `seq`, `chan`, `from` (person id), `ts` (ms), `text`, and maybe `files`, `card`, `thread`
(the id of the post it replies to) and `mentions`.

### Post a message or a card (scope: post)
```bash
curl -k -X POST -H 'x-api-key: lck_…' -H 'content-type: application/json' \
  -d '{"chan":"general","text":"Nightly backup finished ✅"}' https://192.168.1.20:3000/api/bot/send
# {"ok":true,"id":"5e0…","seq":412}
```
Body: `chan` (required), `text` (Markdown: `**bold**`, `_italic_`, `` `code` ``, lists, links), `card` (see
[Cards](#cards)), and `thread` (a message id) to reply under a post. The bad-word filter, posting rules ("only
moderators start posts"), read-only channels and archived teams apply to bots too.

### Button clicks on your cards (scope: read)
Buttons with `"action": "post"` on cards your key posted are queued for you:
```bash
curl -k -H 'x-api-key: lck_…' https://192.168.1.20:3000/api/bot/events
# {"events":[{"type":"cardAction","msg":"5e0…","chan":"general","button":"approve","user":{"id":"…","name":"Ana"},"ts":1764…}]}
```
Each call returns the waiting events and clears them. The last 200 are kept.

## Incoming webhooks

In a team channel's ⋯ menu choose **Connectors and webhooks › New incoming webhook**. Give it a name and, if you
like, a picture. You get a secret address. **Copy it then, because it is shown once.** Who can add one: team owners,
and members when the team allows "add apps, tabs and connectors". In session-wide channels, admins only.

```bash
curl -k -X POST 'https://192.168.1.20:3000/api/hook/in?id=4be1c09a2f&key=Qm9…' \
  -H 'content-type: application/json' \
  -d '{"title":"Build 42 passed","text":"All **14 tests** green on `main`."}'
# {"ok":true,"id":"9d2…"}
```

- The body is `{ "text": "…" }` for a plain message, `{ "title": "…", "text": "…" }` for a simple card, or
  `{ "card": { … } }` for a full [card](#cards). The body can be up to about 300 KB.
- The key can also go in an `x-lanchat-key` header instead of `&key=`.
- A wrong or old key gets `404`. A channel gets at most 30 messages a minute from one webhook (more gets `429`).
- **New secret** makes a new address; the old one stops working at once. You can also switch a webhook off or
  delete it. Its earlier messages stay.
- Messages show the webhook's name and picture with a **Bot** badge.

## Outgoing webhooks

**Connectors and webhooks › New outgoing webhook** (admins and team owners): a name (for example `Pinger`) and the
address of your service. You get a **security token** (an HMAC key, shown once).

When someone writes `@Pinger …` in that channel, LANChat POSTs:

```json
{ "type": "message", "id": "5e0…", "chan": "tc-1a2b3c4d5e", "channel": "General", "team": "Marketing",
  "from": { "id": "8c1…", "name": "Ana" }, "text": "@Pinger status please", "ts": 1764068400000, "thread": null }
```

It sends these headers:
- `Authorization: HMAC <base64 HMAC-SHA256 of the raw body>`
- `X-LANChat-Signature: sha256=<hex of the same>`

The key is the security token, base64-decoded.

Answer within **5 seconds** with JSON `{ "text": "…" }` and/or `{ "card": { … } }`. Your answer is posted as a reply
under the message. Plain text answers are used as `text`.

How calls are limited:
- At most 20 calls a minute per webhook.
- Answers over 64 KB are refused.
- Errors (timeouts, refused connections, HTTP errors) are kept on the webhook. Admins see them in Manage › Bots and in
  the channel's Connectors list, and get one activity notice per 10 minutes.

**Check the signature** (Node.js):
```js
const crypto = require('crypto');
function verify(rawBody, header, token) {
  const mac = crypto.createHmac('sha256', Buffer.from(token, 'base64')).update(rawBody).digest('base64');
  const got = String(header || '').replace(/^HMAC /, '');
  return got.length === mac.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(mac));
}
```

**Card buttons call you back.** A button `{ "label": "Again", "action": "post", "id": "again" }` on a card your
webhook posted sends `{ "type": "invoke", "action": "again", "message": "<id>", … }` with the same signature. Your
answer is posted the same way.

## Cards

A message can carry a card (`m.card`):

```json
{
  "title": "Build 42 passed",
  "text": "All **14 tests** green.",
  "image": "data:image/png;base64,iVBORw0…",
  "facts": [ { "k": "Branch", "v": "main" }, { "k": "Duration", "v": "3 min" } ],
  "buttons": [
    { "label": "Open report", "url": "https://ci.local/42" },
    { "label": "Thanks!", "action": "reply", "value": "Thanks, build bot!" },
    { "label": "Re-run", "action": "post", "id": "rerun" }
  ]
}
```

| Field | Limits |
|---|---|
| `title` | 200 characters |
| `text` | 4,000 characters, Markdown |
| `image` | A PNG, JPEG, GIF or WebP **data: URL** under 300 KB. Pages may only load pictures from LANChat itself, so links to pictures on other sites are refused. |
| `facts` | Up to 12 name/value pairs |
| `buttons` | Up to 6 |

Kinds of button:
- `url`: opens an http(s) link in a new tab. Other link kinds are dropped.
- `action: "reply"`: posts `value` as the clicker's reply under the card.
- `action: "post"`: calls back whoever sent the card (an outgoing webhook, a workflow or an API key). Only bots
  can use it.

People can make cards too: message box ⋯ › **Create a card**.

## Workflows, bots and message extensions (no code)

- **Manage › Workflows**: "when this happens, do that".
  - When: a message is posted (in a channel, containing words), someone joins the session or a team, a reaction is
    added, a daily or weekly schedule, or someone runs it from the message box ⋯ (a **message extension**).
  - Then: post a message or a card, send a 1:1 message, add the person to a team or channel, create a task, or call
    a webhook. The webhook gets a JSON POST with `workflow`, `trigger`, `person`, `chat`, `text`, `emoji`, `input`
    and `ts`.
  - The list shows on/off, runs, last run and the last error.
- **Manage › Bots**: keyword or regex replies in chosen chats (patterns are checked with a time limit), and welcome
  messages for new people (in #general and/or as a 1:1 message).

## Other routes for signed-in apps

The web app itself uses `x-token` sessions; those routes are not a public API and may change. For your own tools,
use API keys and webhooks.
