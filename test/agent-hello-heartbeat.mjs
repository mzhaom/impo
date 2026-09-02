// Regression test: an agent must re-register itself with a controller that has
// forgotten it, WITHOUT the socket ever dropping.
//
// The production failure (observed 2026-09-01): Cloud Run replaces the backend
// instance on every deploy, but its frontend keeps the agent's TLS connection
// established and Engine.IO pings keep flowing from the NEW instance. The agent
// therefore never sees a disconnect, never fires "connect", and never re-sends
// HELLO — while the new instance's in-memory machine registry has no entry for
// it. The agent believes it is registered; the UI shows "no machines"; it stays
// that way until someone restarts the process by hand.
//
// The liveness watchdog does NOT cover this: it only fires on a SILENT peer, and
// this peer is chatty. The fix is a periodic HELLO on the open socket.
//
// Here the server accepts the agent, records the first HELLO, then wipes its
// registry (simulating the instance swap) while deliberately holding the socket
// open. A correct agent re-announces on its own and the registry recovers.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HEARTBEAT_MS = 300; // test-tuned; production default is 30s

const httpServer = createServer();
const io = new Server(httpServer, { path: "/agent/connect", transports: ["websocket"], pingInterval: 100 });

// Stand-in for lib/hub.mjs's `machines` Map.
let registry = new Map();
let helloCount = 0;
let forgotten = false;

io.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t !== "hello") return;
    helloCount += 1;
    registry.set(String(msg.machine || ""), true);
  });
});

await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
const { port } = httpServer.address();

const childScript = `
import { runAgent } from ${JSON.stringify(path.join(root, "lib/agent.mjs"))};
runAgent(${JSON.stringify(`http://127.0.0.1:${port}`)}, {
  tmux: async () => "t", readdir: async () => [], branch: async () => ({ branch: "", worktree: false }),
});
`;

const child = spawn(process.execPath, ["--input-type=module", "-e", childScript], {
  env: {
    ...process.env,
    AGENT_MACHINE: "hello-heartbeat",
    AGENT_REVISION_POLL_MS: "0",
    AGENT_HELLO_HEARTBEAT_MS: String(HEARTBEAT_MS),
    TMUX_MOBILE_AGENT_ID: "10000000-0000-4000-8000-00000000000b",
  },
  stdio: "ignore",
});

const deadline = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await deadline(25);
  }
  assert.fail(`timed out waiting for ${label}`);
}

try {
  // 1. Initial registration.
  await waitFor(() => registry.has("hello-heartbeat"), 10_000, "the agent's first HELLO");
  const helloesAtRegistration = helloCount;

  // 2. The controller instance is replaced: its registry is empty, but the
  //    socket stays up and keeps pinging. The agent is told nothing.
  registry = new Map();
  forgotten = true;
  assert.equal(registry.has("hello-heartbeat"), false, "registry should start empty after the swap");

  // 3. Without a re-announce the machine is invisible forever. With the
  //    heartbeat the agent repairs its own registration.
  await waitFor(
    () => registry.has("hello-heartbeat"),
    10_000,
    "the agent to re-register with a controller that forgot it (no reconnect, socket still open)",
  );

  assert.ok(forgotten, "sanity: the registry was actually cleared before recovery");
  assert.ok(
    helloCount > helloesAtRegistration,
    `expected a repeat HELLO on the open socket (saw ${helloCount}, had ${helloesAtRegistration})`,
  );

  console.log("agent-hello-heartbeat: ok");
} finally {
  child.kill("SIGKILL");
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
}
