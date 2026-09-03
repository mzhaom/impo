// Fixture-driven detection tests grounded in REAL tmux pane captures (taken with
// `tmux capture-pane -p`, so ANSI is already stripped — the same text the server
// feeds detection after cleanTerminalText). These guard the honest-state contract
// against the actual grammar Claude/Codex render, not synthetic strings.
//
// Detection reliability is a definition-of-done prerequisite for the triage
// redesign (docs/PRODUCT_CONTEXT.md → "Honest state language"): the queue must
// never show false confidence on real output. Add new fixtures as you encounter
// states the detector gets wrong — this corpus is meant to grow.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { detectTurn } from "../lib/turn-detection.mjs";
import { detectAskQuestion } from "../lib/ask-question.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, "fixtures", name), "utf8");

// --- claude, idle, no prompt -------------------------------------------------
// A real idle Claude window: the empty "❯" composer + the footer chrome. The
// pane BODY must not register as a live prompt at any confidence (no checkbox tab
// bar, no cursor-bearing numbered option — only the empty composer prompt). Turn
// itself comes from the OSC title (not in the body), asserted in turn-detection.
{
  const screen = fixture("claude-idle.txt");
  assert.deepEqual(
    detectAskQuestion(screen),
    { waiting: false, confidence: "high" },
    "fixture claude-idle: body is confidently NOT a prompt",
  );
  // The matching title for this capture is the steady marker.
  assert.deepEqual(
    detectTurn("claude", { title: "✳ Claude Code" }),
    { state: "idle", confidence: "high" },
    "fixture claude-idle: steady title -> idle/high",
  );
}

// --- codex, idle -------------------------------------------------------------
// Codex's settled footer ("Goal achieved", "Context NN% left") lives in the pane
// body, so turn is detectable from the captured tail directly.
{
  const screen = fixture("codex-idle.txt");
  const tail = screen.split("\n").slice(-12).join("\n");
  assert.deepEqual(
    detectTurn("codex", { paneTail: tail }),
    { state: "idle", confidence: "high" },
    "fixture codex-idle: settled footer -> idle/high",
  );
  // And the idle codex screen is not a prompt.
  assert.deepEqual(
    detectAskQuestion(screen),
    { waiting: false, confidence: "high" },
    "fixture codex-idle: not a prompt",
  );
}

// --- codex, blocked on an approval prompt (real capture) ---------------------
// Codex's approval prompt was a false NEGATIVE (read as idle/finished) until the
// attention-watch shadow run surfaced it. Now: a confident waiting, and turn must
// not read as a calm idle.
{
  const screen = fixture("codex-approval-prompt.txt");
  assert.deepEqual(
    detectAskQuestion(screen),
    { waiting: true, confidence: "high" },
    "fixture codex-approval: waiting/high (was a false negative)",
  );
  const tail = screen.split("\n").slice(-12).join("\n");
  assert.notEqual(
    detectTurn("codex", { paneTail: tail }).state,
    "idle",
    "fixture codex-approval: turn is NOT idle while blocked",
  );
}

// --- codex, idle with a persistent "Worked for" summary (real capture) -------
// "Worked for <time>" persists in the footer after a turn ends, so this settled
// pane must read idle, NOT working (the bug the shadow run corrected).
{
  const screen = fixture("codex-idle-worked-for.txt");
  const tail = screen.split("\n").slice(-12).join("\n");
  assert.deepEqual(
    detectTurn("codex", { paneTail: tail }),
    { state: "idle", confidence: "high" },
    "fixture codex-idle-worked-for: persistent 'Worked for' -> idle/high",
  );
  assert.deepEqual(
    detectAskQuestion(screen),
    { waiting: false, confidence: "high" },
    "fixture codex-idle-worked-for: not a prompt",
  );
}

// --- codex, update/notice prompt (real capture) ------------------------------
// Uses a "Press enter to continue" footer (not "confirm") — was still a false
// negative until the footer regex was broadened. A real blocking prompt.
{
  const screen = fixture("codex-update-prompt.txt");
  assert.deepEqual(
    detectAskQuestion(screen),
    { waiting: true, confidence: "high" },
    "fixture codex-update-prompt: 'Press enter to continue' -> waiting/high",
  );
}

console.log("detection-fixtures: all assertions passed");

// --- agy / Antigravity (Gemini) ----------------------------------------------
// Real captures from a live `agy` session (v1.1.25, Gemini 3.8 Flash). Its TUI
// differs from both Claude and Codex: the cursor is an ASCII ">" (not "❯"/"›"),
// and the state lives in the LEFT slot of the last footer row —
//   idle    -> "? for shortcuts"
//   working -> "esc to cancel"
// with a right-aligned "Gemini <model> · <effort>".
import { parseAskQuestion } from "../lib/ask-question.mjs";

// Idle: settled composer. Not a prompt at any confidence, and turn is idle.
{
  const s = fixture("agy-idle.txt");
  assert.deepEqual(detectTurn("gemini", { paneTail: s }), { state: "idle", confidence: "high" });
  assert.deepEqual(detectAskQuestion(s), { waiting: false, confidence: "high" });
}

// Working: mid-stream. Must NOT read as finished, and must not fake a prompt.
{
  const s = fixture("agy-working.txt");
  assert.deepEqual(detectTurn("gemini", { paneTail: s }), { state: "working", confidence: "high" });
  assert.deepEqual(detectAskQuestion(s), { waiting: false, confidence: "high" });
}

// Permission prompt: BLOCKED on the user. The trap is that agy keeps showing
// "esc to cancel" here (the request is cancellable), so the working cue alone
// would mask a blocked agent — the prompt check must win, and turn must never
// report a calm "idle" for a pane that is waiting.
{
  const s = fixture("agy-approval-prompt.txt");
  assert.deepEqual(detectAskQuestion(s), { waiting: true, confidence: "high" });
  const turn = detectTurn("gemini", { paneTail: s });
  assert.notEqual(turn.state, "idle", "a blocked agy pane must never read as finished");

  const p = parseAskQuestion(s);
  assert.equal(p.questionText, "Do you want to proceed?");
  // Exactly the four real choices — the option block is the run above the
  // keyhint row, NOT everything that looks indented. An earlier forward-scanning
  // parser swept in the previous turn's scrollback and produced 33 "options".
  assert.equal(p.options.length, 4, "must parse exactly the prompt's own options");
  assert.deepEqual(p.options.map((o) => o.n), [1, 2, 3, 4]);
  assert.equal(p.options[0].title, "Yes");
  assert.equal(p.options[3].title, "No");
  assert.equal(p.cursorIndex, 0, "cursor sits on the first choice");
  assert.equal(p.multiSelect, false);
}

// Trust prompt (first run in a folder): unnumbered choices, same chooser chrome.
{
  const s = fixture("agy-trust-prompt.txt");
  assert.deepEqual(detectAskQuestion(s), { waiting: true, confidence: "high" });
  const p = parseAskQuestion(s);
  assert.equal(p.options.length, 2);
  assert.equal(p.options[0].title, "Yes, I trust this folder");
  assert.equal(p.options[1].title, "No, exit");
  assert.equal(p.cursorIndex, 0);
}

// Cross-agent isolation: agy's ASCII ">" chooser must not be claimed by the
// codex/claude cursor patterns, and their prompts must not be read as agy.
{
  const agy = fixture("agy-approval-prompt.txt");
  assert.equal(/^\s*›\s*\d+\.\s+\S/m.test(agy), false, "agy is not a codex cursor");
  assert.equal(/^\s*❯\s*\d+\.\s+\S/m.test(agy), false, "agy is not a claude cursor");
  // A recognized agy pane with nothing captured is unknown, never idle.
  assert.deepEqual(detectTurn("gemini", { paneTail: "" }), { state: "unverified", confidence: "low" });
}

console.log("detection-fixtures: agy assertions passed");
