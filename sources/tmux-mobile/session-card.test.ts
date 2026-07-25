import { describe, expect, it } from "vitest";
import {
  nextExpandedSessionKey,
  sessionCardSummary,
  shouldUseCompactSessionCards,
} from "@/tmux-mobile/session-card";
import { resolveVisionControls } from "@/tmux-mobile/vision-controls";

describe("sessionCardSummary", () => {
  it("returns the fields needed to scan a compact session card", () => {
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

describe("nextExpandedSessionKey", () => {
  it("expands one card at a time and collapses the active card", () => {
    expect(nextExpandedSessionKey(null, "first")).toBe("first");
    expect(nextExpandedSessionKey("first", "second")).toBe("second");
    expect(nextExpandedSessionKey("second", "second")).toBeNull();
  });
});

describe("shouldUseCompactSessionCards", () => {
  it("uses progressive disclosure on phones", () => {
    expect(
      shouldUseCompactSessionCards({ isPad: false, isVision: false }),
    ).toBe(true);
  });

  it("keeps every card expanded on iPad and Vision Pro", () => {
    expect(
      shouldUseCompactSessionCards({ isPad: true, isVision: false }),
    ).toBe(false);
    expect(
      shouldUseCompactSessionCards({ isPad: false, isVision: true }),
    ).toBe(false);
    expect(
      shouldUseCompactSessionCards({ isPad: true, isVision: true }),
    ).toBe(false);
  });

  it("keeps cards expanded when Vision mode is enabled as a compatibility fallback", () => {
    expect(
      shouldUseCompactSessionCards({
        isPad: false,
        isVision: resolveVisionControls("on", false),
      }),
    ).toBe(false);
  });
});
