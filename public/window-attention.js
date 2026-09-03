// The "needs you" rule, shared by every surface that renders it.
//
// WHY THIS IS ITS OWN MODULE: this rule had drifted into two implementations —
// descriptorNeedsAttention() (topbar pill, tab title, favicon) and the desktop
// sidebar's own inline copy. The sidebar's copy flagged ANY unread window,
// which meant an agent actively STREAMING output landed in "Needs you" while it
// was mid-work: contentHash changes on every frame, so unread is true the whole
// time an agent is typing. Unread only means "needs you" once the turn is over.
//
// Keep the predicate here and let both surfaces call it, so the sidebar group,
// the topbar pill and the tab badge can never disagree about the same window.

// Rank order for attention reasons (lower = more urgent). "unverified" is
// always last: an honest hedge, never ranked above a confirmed need.
export const ATTENTION_RANK = { question: 0, finished: 1, unverified: 2 };

// Does this window need the user, and why?
//   "question"   — agent confidently blocked on an AskUserQuestion / exit-plan.
//   "finished"   — turn confidently ended (idle) AND content changed (unread).
//   "unverified" — detection is UNCERTAIN: a low-confidence "maybe blocked"
//                  prompt, or an unverified turn whose content changed.
// Returns null when the window does NOT need the user — notably while an agent
// is still working (turn "active"), even though its content keeps changing.
//
// `meta` is the window's metadata descriptor ({ waitingForInput,
// waitingConfidence, turn }); `unread` is the caller's comparison of the
// window's current contentHash against the local seen-hash baseline.
//
// Back-compat: a descriptor from an older agent has no *Confidence fields. A
// missing waitingConfidence on waitingForInput=true is treated as "high" (the
// old behavior — it only ever set waitingForInput when isAskQuestion fired
// strictly), so confident questions don't regress to unverified.
export function attentionReason(meta, unread) {
  const d = meta || {};
  if (d.waitingForInput) {
    return d.waitingConfidence === "low" ? "unverified" : "question";
  }
  if (!unread) return null;
  // Content changed. Only a turn that is OVER makes that the user's problem.
  if (d.turn === "idle") return "finished";
  if (d.turn === "unverified") return "unverified";
  // turn === "active" (or anything else): the agent is still working. Its
  // output changing is progress, not a request for attention.
  return null;
}

// --- disconnect presentation ------------------------------------------------

// The snapshot's pre-selection placeholder is not user content.
const SNAPSHOT_PLACEHOLDERS = new Set(["Select a window.", "Select a machine."]);

export function isSnapshotPlaceholderText(text) {
  return SNAPSHOT_PLACEHOLDERS.has(String(text || "").trim());
}

// How to present "no machine is connected".
//
// The connector-help panel is absolutely positioned OVER the snapshot, so
// showing it replaces whatever the user was reading. A machine dropping is
// routinely momentary (controller deploy, agent restart, wifi blip), and
// replacing a pane mid-read over a 20-second outage is far worse than leaving
// it visible. So the panel is for someone with nothing to lose:
//   * onboarding  — no machines and an empty/placeholder pane: show the panel.
//   * degrade     — a machine dropped but there is content on screen, or we are
//                   inside the reconnect grace window: keep the content, grey it.
//   * normal      — a machine is connected: neither.
// Returns { showHelp, preserveContent }.
export function disconnectPresentation({
  hubMode = false,
  machineCount = 0,
  snapshotText = "",
  inGrace = false,
} = {}) {
  const noMachines = Boolean(hubMode) && machineCount === 0;
  const hasContent = Boolean(String(snapshotText || "").trim()) && !isSnapshotPlaceholderText(snapshotText);
  const preserveContent = noMachines && (Boolean(inGrace) || hasContent);
  return { showHelp: noMachines && !preserveContent, preserveContent };
}

// --- attention freshness -----------------------------------------------------

// Default: how long attention data may age before the "a question is waiting"
// affordance stops being trustworthy. Generous relative to the ~5s poll —
// /api/attention brokers capturePane across every window on every machine and
// routinely takes seconds, so this decides when we ADMIT uncertainty, not when
// we hide a real signal.
export const ATTENTION_STALE_MS = 20_000;

// Should the affordance say "unknown" rather than "nothing is waiting"?
//
// The bug this exists for: /api/attention failures were swallowed ("keep the
// last known attention"), so a 21s timeout left the array stale while the dot
// sat dark — indistinguishable from a genuinely calm window. A user reported
// "Answer question doesn't seem to work" in exactly that state.
//
// `lastOkMs` is 0 when attention has NEVER loaded: that is "absent", not
// "stale", and must not light the uncertainty marker on a fresh page.
export function attentionUnknown({ lastOkMs = 0, now = Date.now(), pending = false, staleMs = ATTENTION_STALE_MS } = {}) {
  if (pending) return false;      // we have a confident signal; nothing to hedge
  if (!lastOkMs) return false;    // never loaded yet
  return now - lastOkMs > staleMs;
}
