// Regression test: a decorative chat echo must never block the real action.
//
// Reported 2026-09-03 ("key like up down enter doesn't seem to respond"). The
// telemetry added for that report showed the whole click ladder firing —
// key_pointerup -> key_click -> key_send -> key_failed "The quota has been
// exceeded" — with NO /api/key call. On iOS WebKit a full localStorage raises
// QuotaExceededError, and saveChat() wrote to it UNGUARDED (unlike
// createPersistedAtom, which try/catches). The throw propagated out of addChat()
// in sendKey() before the request was issued, so the button looked dead.
//
// saveChat is not importable (public/app.js is a browser module that touches the
// DOM at import), so this pins the same contract on an extracted copy of its
// logic: the writer swallows a quota failure, evicts the pane's own log, and
// retries smaller — and NEVER throws into its caller.

import assert from "node:assert/strict";

function makeStorage({ failUntilSmall = 0, alwaysFail = false } = {}) {
  const data = new Map();
  return {
    data,
    setItem(k, v) {
      if (alwaysFail) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      if (failUntilSmall && v.length > failUntilSmall) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      data.set(k, v);
    },
    removeItem(k) { data.delete(k); },
  };
}

// The behavior under test, mirroring saveChat() in public/app.js.
function saveChat(storage, key, chat) {
  try {
    storage.setItem(key, JSON.stringify(chat.slice(-80)));
  } catch {
    try {
      storage.removeItem(key);
      storage.setItem(key, JSON.stringify(chat.slice(-10)));
    } catch {
      // unusable storage: echo lost, caller unaffected
    }
  }
}

const bigChat = Array.from({ length: 80 }, (_, i) => ({ role: "user", text: `message number ${i}` }));

// Happy path: writes through.
{
  const s = makeStorage();
  saveChat(s, "pane:1", bigChat);
  assert.ok(s.data.get("pane:1"), "normal write persists");
}

// THE REGRESSION: a quota failure must not propagate. Before the fix this threw
// out of addChat() and aborted the key send.
{
  const s = makeStorage({ alwaysFail: true });
  assert.doesNotThrow(() => saveChat(s, "pane:1", bigChat), "quota failure must never reach the caller");
}

// Eviction path: too big to store, small enough after trimming -> retried.
{
  // Budget: big enough for the 10-entry retry, too small for the 80-entry write.
  const smallLen = JSON.stringify(bigChat.slice(-10)).length;
  const fullLen = JSON.stringify(bigChat.slice(-80)).length;
  assert.ok(smallLen < fullLen, "sanity: the retry payload really is smaller");
  const s = makeStorage({ failUntilSmall: smallLen });
  saveChat(s, "pane:1", bigChat);
  const stored = s.data.get("pane:1");
  assert.ok(stored, "a trimmed echo is stored rather than dropped entirely");
  assert.ok(stored.length <= smallLen, "the retry writes the SHORTER tail");
  assert.equal(JSON.parse(stored).length, 10, "retry keeps the last 10 entries");
}

// A stale oversized entry is removed rather than left behind wasting the quota.
{
  const s = makeStorage({ alwaysFail: true });
  s.data.set("pane:1", "x".repeat(5000));
  saveChat(s, "pane:1", bigChat);
  assert.equal(s.data.has("pane:1"), false, "unusable storage evicts this pane's stale echo");
}

console.log("chat-persist-quota: ok");
