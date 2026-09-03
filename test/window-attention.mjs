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

// --- disconnect presentation ------------------------------------------------
// The regression: a momentary machine drop used to replace the pane with the
// connector-onboarding panel, destroying what the user was reading.

const { disconnectPresentation, isSnapshotPlaceholderText } = await import("../public/window-attention.js");

// A machine is connected: neither treatment, whatever the pane holds.
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 1, snapshotText: "$ vim notes.md" }),
  { showHelp: false, preserveContent: false },
);

// THE REGRESSION: machine dropped while the user had content on screen.
// Keep it (greyed); never cover it with onboarding instructions.
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 0, snapshotText: "$ vim notes.md" }),
  { showHelp: false, preserveContent: true },
  "a drop with content on screen must preserve, not replace",
);

// Inside the reconnect grace window we hold the window on screen even if the
// pane happens to be empty — a banner already explains it.
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 0, snapshotText: "", inGrace: true }),
  { showHelp: false, preserveContent: true },
);

// Onboarding is still the right answer for someone with nothing to lose.
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 0, snapshotText: "" }),
  { showHelp: true, preserveContent: false },
);
// The placeholder is not user content.
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 0, snapshotText: "Select a window." }),
  { showHelp: true, preserveContent: false },
);
assert.deepEqual(
  disconnectPresentation({ hubMode: true, machineCount: 0, snapshotText: "   \n  " }),
  { showHelp: true, preserveContent: false },
);

// Local (non-hub) mode never shows the hub onboarding panel.
assert.deepEqual(
  disconnectPresentation({ hubMode: false, machineCount: 0, snapshotText: "" }),
  { showHelp: false, preserveContent: false },
);

// Defensive: no arguments at all must not claim there is content to preserve.
assert.deepEqual(disconnectPresentation(), { showHelp: false, preserveContent: false });

assert.equal(isSnapshotPlaceholderText("Select a window."), true);
assert.equal(isSnapshotPlaceholderText("  Select a machine.  "), true);
assert.equal(isSnapshotPlaceholderText("$ real output"), false);
assert.equal(isSnapshotPlaceholderText(""), false);

console.log("window-attention: disconnect presentation ok");

// --- attention freshness -----------------------------------------------------
// Regression: /api/attention failures were swallowed, so a stale array left the
// "question waiting" dot dark — reading as "nothing is waiting" when the truth
// was "we don't know". A user hit this during a 21s timeout.

const { attentionUnknown, ATTENTION_STALE_MS } = await import("../public/window-attention.js");

const T = 1_000_000;
// THE REGRESSION: data older than the threshold must be reported as unknown.
assert.equal(
  attentionUnknown({ lastOkMs: T - (ATTENTION_STALE_MS + 1), now: T }),
  true,
  "stale attention must read as unknown, not as 'nothing waiting'",
);
// Fresh data is trusted.
assert.equal(attentionUnknown({ lastOkMs: T - 1000, now: T }), false);
// Exactly at the threshold is not yet stale (strict >).
assert.equal(attentionUnknown({ lastOkMs: T - ATTENTION_STALE_MS, now: T }), false);
// A confident pending question needs no hedge, however old the poll is.
assert.equal(
  attentionUnknown({ lastOkMs: T - 999_999, now: T, pending: true }),
  false,
  "a known pending question must never be downgraded to 'unknown'",
);
// Never loaded is absent, not stale — a fresh page must not show uncertainty.
assert.equal(attentionUnknown({ lastOkMs: 0, now: T }), false);
assert.equal(attentionUnknown(), false);
// The real reported outage: 21s timeout exceeds the 20s threshold.
assert.equal(attentionUnknown({ lastOkMs: T - 21_000, now: T }), true);

console.log("window-attention: attention freshness ok");
