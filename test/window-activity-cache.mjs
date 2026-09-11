// Regression tests for the /api/window-activity load fix (2026-09-11).
//
// THE INCIDENT: the user hit Cloud Run rate limits. Measurement on the hosted
// dev controller found /api/window-activity was 879 of 1000 sampled requests
// (88%); 92 of 120 sampled calls already returned 429, with p90 latency 6.87s
// against a 3000ms client poll — so ticks overlapped and piled up. Each call
// brokers listWindows + per-window listPanes + capturePane to the agent (~58
// agent round trips for a 28-window/2-session box) and had NEITHER a TTL cache
// nor in-flight coalescing, while the ~30x cheaper window-metadata had both.
//
// Two fixes are pinned here:
//   1. server: TTL cache + in-flight promise coalescing per (scope, session).
//   2. client: a hidden-tab throttle, like metadataPollInterval().
//
// Neither server.mjs nor public/app.js is importable in a unit test (one boots
// a listener, the other touches the DOM at import), so — following the
// convention in test/chat-persist-quota.mjs — these mirror the logic and then
// assert the real sources still wire it, so the mirror cannot drift silently.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --- 1. server: TTL cache + in-flight coalescing ----------------------------

const TTL = 2000;

// Mirrors getSessionWindowActivity() in server.mjs.
function makeActivityCache({ compute, ttl = TTL }) {
  const cache = new Map();
  let now = 0;
  return {
    setNow(t) { now = t; },
    size: () => cache.size,
    get(scope, sessionId) {
      const cacheKey = `${scope}\0${sessionId}`;
      const cached = cache.get(cacheKey);
      if (cached && now - cached.at < ttl) return cached.promise;
      const promise = compute(sessionId, scope);
      cache.set(cacheKey, { at: now, promise });
      promise.catch(() => {
        if (cache.get(cacheKey)?.promise === promise) cache.delete(cacheKey);
      });
      if (cache.size > 256) {
        for (const [key, entry] of cache) {
          if (now - entry.at >= ttl) cache.delete(key);
        }
      }
      return promise;
    },
  };
}

// THE REGRESSION: concurrent callers (multiple tabs / overlapping ticks) must
// collapse onto ONE agent sweep. Uncached, three tabs = three full sweeps.
{
  let sweeps = 0;
  const cache = makeActivityCache({
    compute: async () => { sweeps += 1; return { "@1": true }; },
  });
  const [a, b, c] = await Promise.all([
    cache.get("box1", "s1"),
    cache.get("box1", "s1"),
    cache.get("box1", "s1"),
  ]);
  assert.equal(sweeps, 1, "concurrent pollers of one session must share a single sweep");
  assert.deepEqual(a, { "@1": true });
  assert.deepEqual(b, { "@1": true });
  assert.deepEqual(c, { "@1": true });
}

// Sequential calls inside the TTL are served from cache; past it, recomputed.
{
  let sweeps = 0;
  const cache = makeActivityCache({ compute: async () => { sweeps += 1; return {}; } });
  await cache.get("box1", "s1");
  cache.setNow(TTL - 1);
  await cache.get("box1", "s1");
  assert.equal(sweeps, 1, "a call inside the TTL must not re-sweep");
  cache.setNow(TTL);
  await cache.get("box1", "s1");
  assert.equal(sweeps, 2, "a call at/after the TTL must re-sweep (activity must stay live)");
}

// Scope isolation: the same session id on two machines must never share a
// result, or one box's activity dots would render for another's windows.
{
  const seen = [];
  const cache = makeActivityCache({
    compute: async (sessionId, scope) => { seen.push(`${scope}/${sessionId}`); return {}; },
  });
  await Promise.all([cache.get("boxA", "s1"), cache.get("boxB", "s1")]);
  assert.deepEqual(seen.sort(), ["boxA/s1", "boxB/s1"]);
}

// A FAILED sweep must not be pinned for the TTL: the next caller retries.
{
  let calls = 0;
  const cache = makeActivityCache({
    compute: async () => {
      calls += 1;
      if (calls === 1) throw new Error("agent went away");
      return { "@1": false };
    },
  });
  await assert.rejects(cache.get("box1", "s1"), /agent went away/);
  assert.equal(cache.size(), 0, "a rejected sweep must be evicted, not cached");
  assert.deepEqual(await cache.get("box1", "s1"), { "@1": false });
  assert.equal(calls, 2, "the next caller after a failure must retry immediately");
}

// Every concurrent caller of a FAILING sweep sees the rejection (no unhandled
// rejection, no caller silently receiving undefined).
{
  const cache = makeActivityCache({ compute: async () => { throw new Error("boom"); } });
  const results = await Promise.allSettled([cache.get("b", "s1"), cache.get("b", "s1")]);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "rejected"]);
}

// --- 2. client: hidden-tab throttle -----------------------------------------

const ACTIVITY_POLL_VISIBLE_MS = 3000;
const ACTIVITY_POLL_HIDDEN_MS = 15000;
const activityPollInterval = (hidden) =>
  hidden ? ACTIVITY_POLL_HIDDEN_MS : ACTIVITY_POLL_VISIBLE_MS;

// THE REGRESSION: the old code re-armed at a literal 3000 regardless of
// visibility, so a backgrounded tab kept brokering a full sweep every 3s for
// dots nobody could see.
assert.equal(activityPollInterval(false), 3000, "a visible tab keeps the responsive cadence");
assert.equal(activityPollInterval(true), 15000, "a hidden tab must back off");
assert.ok(
  activityPollInterval(true) > activityPollInterval(false),
  "hidden must always be slower than visible",
);

// --- 3. the real sources must still wire all of this ------------------------
// Without these, the mirrors above would keep passing after a refactor dropped
// the fix — the exact false-green this suite exists to prevent.

const serverSrc = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
assert.match(serverSrc, /const sessionActivityCache = new Map\(\)/,
  "server.mjs lost the window-activity cache");
assert.match(serverSrc, /SESSION_ACTIVITY_TTL_MS = parsePositiveInteger\(/,
  "server.mjs lost the configurable activity TTL");
assert.match(serverSrc, /async function computeSessionWindowActivity\(/,
  "server.mjs lost the uncached activity computation");
// The cached wrapper, not the raw compute, must be what the endpoint calls.
assert.match(serverSrc, /await getSessionWindowActivity\(sessionId\)/,
  "the /api/window-activity route must call the CACHED wrapper");
assert.doesNotMatch(serverSrc, /await computeSessionWindowActivity\(sessionId\)\s*\)/,
  "the route must not bypass the cache by calling compute directly");
// Scope must be part of the key (cross-machine leak guard).
assert.match(serverSrc, /const cacheKey = `\$\{currentMetadataScope\(\)\}\\0\$\{sessionId\}`/,
  "the activity cache key must include the backend+mux scope");
// Rejection eviction must survive.
assert.match(serverSrc, /sessionActivityCache\.get\(cacheKey\)\?\.promise === promise/,
  "server.mjs lost the rejected-promise eviction for activity");

const appSrc = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
assert.match(appSrc, /function activityPollInterval\(\)/, "app.js lost activityPollInterval()");
assert.match(appSrc, /window\.setTimeout\(tick, activityPollInterval\(\)\)/,
  "the activity poll must re-arm via activityPollInterval(), not a literal");
assert.match(appSrc, /ACTIVITY_POLL_HIDDEN_MS = (\d+)/, "app.js lost the hidden cadence");
assert.ok(
  Number(appSrc.match(/ACTIVITY_POLL_HIDDEN_MS = (\d+)/)[1]) >
    Number(appSrc.match(/ACTIVITY_POLL_VISIBLE_MS = (\d+)/)[1]),
  "the hidden activity cadence must be slower than the visible one",
);
// Coming back to the tab must refresh promptly rather than waiting out the
// slow cadence that was armed while hidden.
assert.match(
  appSrc,
  /visibilitychange[\s\S]{0,400}startActivityPolling\(\)/,
  "returning to a hidden tab must restart the activity poll",
);

console.log("window-activity-cache: ok");
