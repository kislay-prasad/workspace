'use strict';
// Calls area: a steady clock for drawing video frames (presenter modes, recording). Timers in a worker keep running at
// full speed when the meeting tab is in the background, unlike page timers. postMessage(ms) starts, postMessage(0) stops.
let h = null;
onmessage = (e) => { clearInterval(h); h = null; const ms = Number(e.data) || 0; if (ms > 0) h = setInterval(() => postMessage(Date.now()), ms); };
