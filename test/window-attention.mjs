// Unit tests for the shared "needs you" rule (public/window-attention.js).
//
// The regression these pin: the desktop sidebar's "Needs you" group used to
// flag ANY unread window, so an agent actively streaming output was listed as
// needing you while it was still working (contentHash changes every frame).

import assert from "node:assert/strict";
import { ATTENTION_RANK, attentionReason } from "../public/window-attention.js";

// --- the regression: a WORKING agent is never "needs you" -------------------
// turn "active" + unread = an agent mid-stream. This is the exact shape that
// misfired: output changing is progress, not a request for attention.
assert.equal(attentionReason({ turn: "active" }, true), null);
assert.equal(attentionReason({ turn: "active", waitingForInput: false }, true), null);
// Even with a low-confidence waiting hint absent, an active turn stays silent.
assert.equal(attentionReason({ turn: "active", waitingConfidence: "high" }, true), null);

// --- unread only counts once the turn is OVER -------------------------------
assert.equal(attentionReason({ turn: "idle" }, true), "finished");
assert.equal(attentionReason({ turn: "unverified" }, true), "unverified");
// No unread content: nothing to report, whatever the turn says.
assert.equal(attentionReason({ turn: "idle" }, false), null);
assert.equal(attentionReason({ turn: "unverified" }, false), null);
assert.equal(attentionReason({ turn: "active" }, false), null);

// --- a confident question outranks turn state entirely ----------------------
// A blocked agent needs you even with no unread content and no turn field.
assert.equal(attentionReason({ waitingForInput: true }, false), "question");
assert.equal(attentionReason({ waitingForInput: true, turn: "active" }, false), "question");
assert.equal(attentionReason({ waitingForInput: true, waitingConfidence: "high" }, true), "question");

// Low confidence is an honest hedge, not a confirmed ask.
assert.equal(attentionReason({ waitingForInput: true, waitingConfidence: "low" }, false), "unverified");
assert.equal(attentionReason({ waitingForInput: true, waitingConfidence: "low", turn: "active" }, true), "unverified");

// Back-compat: an older agent sends waitingForInput with no confidence field.
// That must stay a confident question, not regress to unverified.
assert.equal(attentionReason({ waitingForInput: true, waitingConfidence: undefined }, false), "question");

// --- defensive: missing / empty metadata ------------------------------------
assert.equal(attentionReason(undefined, true), null);
assert.equal(attentionReason(null, false), null);
assert.equal(attentionReason({}, true), null); // unread but no turn info -> silent
assert.equal(attentionReason({}, false), null);

// --- rank order: question < finished < unverified ---------------------------
assert.ok(ATTENTION_RANK.question < ATTENTION_RANK.finished);
assert.ok(ATTENTION_RANK.finished < ATTENTION_RANK.unverified);
// Every reason the predicate can return has a rank (or sorting silently breaks).
for (const reason of ["question", "finished", "unverified"]) {
  assert.equal(typeof ATTENTION_RANK[reason], "number", `no rank for ${reason}`);
}

console.log("window-attention: ok");
