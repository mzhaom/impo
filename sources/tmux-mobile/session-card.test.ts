import { describe, expect, it } from "vitest";
import { sessionCardSummary } from "@/tmux-mobile/session-card";

describe("sessionCardSummary", () => {
  it("returns the fields needed to describe a session card", () => {
    expect(
      sessionCardSummary({
        machineId: "machine-id",
        machineHostname: "studio",
        windowName: "Implement card view",
        sessionName: "codex-main",
        cwd: "/Users/me/src/tmux-mobile",
        lastActivityAt: "2026-07-25T18:00:00.000Z",
      }),
    ).toEqual({
      windowName: "Implement card view",
      sessionName: "codex-main",
      directory: "/Users/me/src/tmux-mobile",
      machineName: "studio",
      lastActivityAt: "2026-07-25T18:00:00.000Z",
    });
  });

  it("uses stable fallbacks and the latest valid activity timestamp", () => {
    expect(
      sessionCardSummary({
        machineId: "fallback-machine",
        sessionId: "session-id",
        lastActivityAt: null,
        lastUserAt: "2026-07-25T17:00:00.000Z",
        lastAssistantAt: "2026-07-25T17:03:00.000Z",
      }),
    ).toEqual({
      windowName: "session-id",
      sessionName: "session-id",
      directory: "",
      machineName: "fallback-machine",
      lastActivityAt: "2026-07-25T17:03:00.000Z",
    });
  });
});
