// Unit tests for the switcher filter / navigation helpers (public/window-filter.js).

import assert from "node:assert/strict";
import {
  normalizeQuery,
  windowSearchText,
  windowMatches,
  filterWindowTree,
  flattenWindowTree,
  splitRedundantPrefix,
} from "../public/window-filter.js";

const win = (index, name, extra = {}) => ({ index, name, ...extra });
const tree = [
  {
    label: "kernel",
    dirList: [
      {
        cwd: "/home/u/wt/kernel/deploy-test",
        branch: "feat/deploy-test",
        worktree: true,
        wins: [{ win: win(12, "kernel/deploy-test:0", { activeCommand: "node" }), meta: {}, sessionName: "0" }],
      },
      {
        cwd: "/home/u/w/kernel",
        branch: "main",
        worktree: false,
        wins: [
          { win: win(0, "claude", { annotation: "waiting on CI #4567" }), meta: { agentType: "claude" }, sessionName: "0" },
          { win: win(3, "tests", { activeCommand: "node" }), meta: {}, sessionName: "1" },
        ],
      },
    ],
  },
  {
    label: "",
    dirList: [{ cwd: "/home/u/tmp", branch: "", worktree: false, wins: [{ win: win(11, "scratch"), meta: {}, sessionName: "0" }] }],
  },
];

// normalizeQuery: trims, lowercases, splits on whitespace.
assert.deepEqual(normalizeQuery("  Deploy  TEST "), ["deploy", "test"]);
assert.deepEqual(normalizeQuery(""), []);
assert.deepEqual(normalizeQuery(undefined), []);

// windowSearchText includes every context field, plus "index:name".
const text = windowSearchText({ repo: "kernel", cwd: "/x/deploy-test", branch: "feat/a", sessionName: "0", index: 12, name: "n", note: "CI", agentType: "claude", command: "node" });
for (const needle of ["kernel", "deploy-test", "/x/deploy-test", "feat/a", "12:n", "ci", "claude", "node"]) {
  assert.ok(text.includes(needle), `search text should include ${needle}: ${text}`);
}
assert.equal(windowMatches({ name: "abc" }, []), true, "no tokens matches everything");
assert.equal(windowMatches({ name: "abc", note: "xyz" }, ["abc", "xyz"]), true, "all tokens must match, any field");
assert.equal(windowMatches({ name: "abc" }, ["abc", "zzz"]), false);

// filterWindowTree: blank query returns the same object; otherwise prunes.
assert.equal(filterWindowTree(tree, "  "), tree);
const byBranch = filterWindowTree(tree, "feat/deploy");
assert.equal(byBranch.length, 1);
assert.equal(byBranch[0].dirList.length, 1);
assert.equal(byBranch[0].dirList[0].wins[0].win.index, 12);
const byNote = filterWindowTree(tree, "4567");
assert.deepEqual(flattenWindowTree(byNote).map((e) => e.win.name), ["claude"]);
const byAgent = filterWindowTree(tree, "claude");
assert.deepEqual(flattenWindowTree(byAgent).map((e) => e.win.name), ["claude"]);
const byIndexName = filterWindowTree(tree, "3:te");
assert.deepEqual(flattenWindowTree(byIndexName).map((e) => e.win.index), [3]);
const bySession = filterWindowTree(tree, "kernel 1");
assert.deepEqual(flattenWindowTree(bySession).map((e) => e.win.index), [12, 3], "token '1' hits session 1 and '12:'");
assert.deepEqual(filterWindowTree(tree, "nomatch"), []);
// No-repo bucket (empty label) is still searchable by directory.
assert.deepEqual(flattenWindowTree(filterWindowTree(tree, "tmp")).map((e) => e.win.name), ["scratch"]);
// Input tree is not mutated.
assert.equal(tree[0].dirList[1].wins.length, 2);

// flattenWindowTree keeps display order: repo, dir, window.
assert.deepEqual(flattenWindowTree(tree).map((e) => e.win.index), [12, 0, 3, 11]);
assert.deepEqual(flattenWindowTree([]), []);

// splitRedundantPrefix
assert.deepEqual(splitRedundantPrefix("kernel/deploy-test:0", { repo: "kernel", dir: "deploy-test" }), { marker: "", prefix: "kernel/deploy-test", rest: ":0" });
assert.deepEqual(splitRedundantPrefix("!kernel/better-deploy:0", { repo: "kernel", dir: "better-deploy" }), { marker: "!", prefix: "kernel/better-deploy", rest: ":0" });
assert.deepEqual(splitRedundantPrefix("gw-port:1", { repo: "kernel", dir: "gw-port" }), { marker: "", prefix: "gw-port", rest: ":1" });
// Name equal to the dir: nothing left to show, so no dimming.
assert.deepEqual(splitRedundantPrefix("deploy-test", { repo: "kernel", dir: "deploy-test" }), { marker: "", prefix: "", rest: "deploy-test" });
// Prefix must end at a separator: "gw-port" is not a prefix of "gw-portal".
assert.deepEqual(splitRedundantPrefix("gw-portal", { repo: "kernel", dir: "gw-port" }), { marker: "", prefix: "", rest: "gw-portal" });
// Unrelated names untouched; missing context is safe.
assert.deepEqual(splitRedundantPrefix("claude", { repo: "kernel", dir: "kernel" }), { marker: "", prefix: "", rest: "claude" });
assert.deepEqual(splitRedundantPrefix("claude", {}), { marker: "", prefix: "", rest: "claude" });
assert.deepEqual(splitRedundantPrefix("", {}), { marker: "", prefix: "", rest: "" });

console.log("window-filter unit tests passed");
