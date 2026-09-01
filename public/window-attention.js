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
