# IMPO

> **tmux is everything.**

IMPO is a remote control plane for the terminal sessions you already have. It
connects the same tmux sessions to the local terminal, the web, and the mobile
app without inventing another workspace, process, or session model.

The idea is deliberately small:

```text
local terminal ───────────────┐
                              ▼
                         tmux sessions
                              ▲
mobile / web ─► Controller ─► Connector
```

If IMPO disappears, tmux keeps running. Your processes, panes, files,
scrollback, and recovery story remain ordinary local tools.

## Why IMPO is better for this job than ORCA

ORCA is an ambitious environment: it owns worktrees, sessions, terminals,
editors, files, and runtime state. That can create a polished integrated
product, but it also creates a second world that must stay synchronized with
the real one.

IMPO refuses to create that second world.

| | ORCA | IMPO |
|---|---|---|
| Source of truth | Application workspace/runtime | tmux and the operating system |
| Sessions | App-managed abstraction | Real tmux sessions and panes |
| Local access | Through the product model | Any terminal, exactly as usual |
| Remote access | Recreates the workspace remotely | Controls the same existing session |
| Failure mode | Product state may need recovery | Drop back to tmux; work keeps running |
| Extensibility | Features must fit the application | Every CLI tool already works |

This is not a claim that every integrated IDE should disappear. It is a claim
that remote terminal control does not need a new universe. For this job, the
simpler architecture is more reliable because there is less state to reconcile
and less machinery between the user and the process.

## Philosophy

1. **tmux is the source of truth.** A session is real because tmux says it is,
   not because a database row says it should be.
2. **Do not replace proven primitives.** Shells run commands, the filesystem
   stores files, SSH authenticates machines, and tmux owns terminals.
3. **Remote means access, not relocation.** Code and processes remain on the
   machine where they belong. The Controller brokers access; it does not become
   the computer.
4. **One session, every surface.** Local terminal, web, and mobile all attach to
   the same panes instead of maintaining loosely synchronized copies.
5. **Failure must be boring.** A dead phone, stale browser, or Controller deploy
   must not kill the work.
6. **Add UI, not ontology.** Better layout, touch controls, file preview, voice,
   and notifications are welcome. A parallel session model is not.

## What is in this repository

```text
IMPO/
├── server.mjs        Controller, local server, and Connector entry point
├── public/           Web Command Center
├── lib/              tmux/rmux, transport, auth, and storage primitives
├── mobile/           React Native iOS/Android client
├── scripts/          Connector, deployment, and operational tooling
└── docs/             Architecture and operating references
```

The root and `mobile/` intentionally keep separate lockfiles. The Controller is
Node/npm and the mobile client is Expo/Yarn; combining their dependency graphs
would add coupling without adding value.

## Development

Controller, Connector, and web:

```bash
npm ci
npm test
npm start
```

Mobile:

```bash
yarn --cwd mobile install
npm run mobile:typecheck
npm run mobile:test
npm run mobile:dev
```

Run all standard checks:

```bash
npm run verify
```

The production Controller is [eng.impo.ai](https://eng.impo.ai). Machines make
outbound Connector connections, so no inbound port is required. See
[Join the network](docs/join-network.md) for setup and the
[Controller reference](docs/controller-reference.md) for detailed operating
notes.

## Compatibility names

The product and repository are IMPO. Existing `TMUX_MOBILE_*` environment
variables, `~/.config/tmux-mobile` state, service labels, bundle filenames,
native app identifiers, and Expo project identity remain unchanged for
compatibility. They are implementation-level contracts, not the product name.
