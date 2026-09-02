// Regression test for the REAL shape of the "silently dropped after a deploy"
// bug (observed in production 2026-09-02, after a first fix proved insufficient).
//
// Cloud Run's frontend keeps the agent's TLS connection ESTABLISHED across an
// instance replacement and keeps Engine.IO pings flowing, but the connection no
// longer reaches a live controller. So:
//   * the liveness watchdog never fires — the peer is chatty, not silent;
//   * "connect" never re-fires, so HELLO is never re-sent by that path;
//   * even a periodic HELLO is written into a connection routed nowhere, so
//     re-announcing alone does NOT recover (the first fix passed a test that
//     modelled a server which forgot but still RECEIVED — reality drops frames).
// The agent stayed invisible until the process was restarted by hand.
//
// The agent must therefore require its HELLO to be ANSWERED (the hub replies to
// every HELLO with an INFO frame) and force a fresh dial when acks stop.
//
// Here the server answers HELLO normally, then goes deaf: it ignores every
// inbound frame while holding the socket open and pinging. A correct agent
// notices the missing acks and re-dials; the reconnect lands as a NEW
// connection, which is what the test waits for.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HEARTBEAT_MS = 200;
const ACK_TIMEOUT_MS = 600;

const httpServer = createServer();
const io = new Server(httpServer, { path: "/agent/connect", transports: ["websocket"], pingInterval: 100 });

let deaf = false;
let connections = 0;
let helloesWhileDeaf = 0;

io.on("connection", (socket) => {
  connections += 1;
  socket.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.t !== "hello") return;
    if (deaf) {
      // Routed-to-nowhere: the frame arrives but no live controller answers it.
      helloesWhileDeaf += 1;
      return;
    }
    socket.send(JSON.stringify({ t: "info", transcriptArchive: false }));
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
    AGENT_MACHINE: "hello-unacked",
    AGENT_REVISION_POLL_MS: "0",
    AGENT_HELLO_HEARTBEAT_MS: String(HEARTBEAT_MS),
    AGENT_HELLO_ACK_TIMEOUT_MS: String(ACK_TIMEOUT_MS),
    // Keep the liveness watchdog out of it: this test must prove the ACK path
    // recovers, not the silent-peer path. The server keeps pinging anyway.
    AGENT_TRANSPORT_STALE_MS: "600000",
    TMUX_MOBILE_AGENT_ID: "10000000-0000-4000-8000-00000000000c",
  },
  stdio: "ignore",
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate, timeoutMs, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${label}`);
}

try {
  await waitFor(() => connections >= 1, 10_000, "the agent's first connection");
  const connectionsBefore = connections;

  // The instance behind the proxy is replaced: frames still arrive, nothing answers.
  deaf = true;

  // Confirm the agent really is talking into the void — otherwise the recovery
  // below could pass for the wrong reason (e.g. the socket simply dropped).
  await waitFor(() => helloesWhileDeaf >= 1, 10_000, "a HELLO sent while the controller is deaf");

  // Recovery must come from the agent noticing its unanswered HELLO.
  await waitFor(
    () => connections > connectionsBefore,
    15_000,
    "the agent to force a fresh connection after its HELLO went unanswered",
  );

  console.log("agent-hello-unacked: ok");
} finally {
  child.kill("SIGKILL");
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
}
