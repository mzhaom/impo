// Pure helpers for the window switcher list (no DOM; unit-tested in
// test/window-filter.mjs and imported by app.js):
//
//   - filterWindowTree(): type-to-jump filter over the repo -> directory ->
//     windows tree that renderWindows() builds. Every whitespace-separated token
//     must substring-match somewhere in the window's context (repo, directory,
//     branch, session, "index:name", note, agent, command).
//   - flattenWindowTree(): display-order list of window entries, used by the
//     prev/next window shortcut.
//   - splitRedundantPrefix(): the part of a window name that merely repeats its
//     directory header ("kernel/deploy-test" under the deploy-test directory of
//     repo kernel) so the row can dim it instead of showing it in bold twice.

export function normalizeQuery(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function basename(path) {
  const parts = String(path || "").replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "";
}

// One searchable string for a window in its group context.
export function windowSearchText({
  repo = "",
  cwd = "",
  branch = "",
  sessionName = "",
  index,
  name = "",
  note = "",
  agentType = "",
  command = "",
} = {}) {
  const indexed = index === undefined || index === null || index === "" ? "" : `${index}:${name}`;
  return [repo, basename(cwd), cwd, branch, sessionName, indexed, name, note, agentType, command]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .join(" ")
    .toLowerCase();
}

export function windowMatches(entry, tokens) {
  if (!tokens || tokens.length === 0) return true;
  const haystack = windowSearchText(entry);
  return tokens.every((token) => haystack.includes(token));
}

// tree: [{ label, dirList: [{ cwd, branch, worktree, wins: [{ win, meta, sessionName }] }] }]
// Returns the same tree when the query is blank; otherwise a pruned copy with
// only matching windows, and no empty directories or repos.
export function filterWindowTree(tree, query) {
  const tokens = normalizeQuery(query);
  if (tokens.length === 0) return tree;
  const out = [];
  for (const repo of tree || []) {
    const dirList = [];
    for (const dir of repo.dirList || []) {
      const wins = (dir.wins || []).filter(({ win, meta, sessionName }) =>
        windowMatches(
          {
            repo: repo.label,
            cwd: dir.cwd,
            branch: dir.branch,
            sessionName,
            index: win?.index,
            name: win?.name,
            note: win?.annotation,
            agentType: meta?.agentType,
            command: win?.activeCommand,
          },
          tokens,
        ),
      );
      if (wins.length > 0) dirList.push({ ...dir, wins });
    }
    if (dirList.length > 0) out.push({ ...repo, dirList });
  }
  return out;
}

export function flattenWindowTree(tree) {
  const out = [];
  for (const repo of tree || []) {
    for (const dir of repo.dirList || []) {
      for (const entry of dir.wins || []) out.push(entry);
    }
  }
  return out;
}

// Split a window name into { marker, prefix, rest }: `marker` is any leading
// non-alphanumeric decoration (e.g. "!" from naming tools) kept out of the dim
// span; `prefix` is the redundant "repo/dir" or "dir" head (empty when nothing
// should be dimmed); `rest` is what remains and stays prominent. The prefix
// only counts when something non-trivial follows it after a separator, so a
// name that IS the directory name is never dimmed away entirely.
export function splitRedundantPrefix(name, { repo = "", dir = "" } = {}) {
  const full = String(name || "");
  const match = full.match(/^([^A-Za-z0-9]*)([\s\S]*)$/);
  const marker = match[1];
  const body = match[2];
  const candidates = [];
  if (repo && dir) candidates.push(`${repo}/${dir}`);
  if (dir) candidates.push(dir);
  for (const candidate of candidates) {
    if (body.length > candidate.length && body.startsWith(candidate)) {
      const rest = body.slice(candidate.length);
      if (!/^[A-Za-z0-9]/.test(rest)) return { marker, prefix: candidate, rest };
    }
  }
  return { marker, prefix: "", rest: body };
}
