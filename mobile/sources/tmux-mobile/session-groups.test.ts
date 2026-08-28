import { describe, expect, it } from "vitest";
import { agentStarKey, type AgentSession } from "@/tmux-mobile/types";
import {
  groupAgentSessions,
  groupIndexForAgent,
  nextExpandedAgentKey,
} from "@/tmux-mobile/session-groups";

function agent(input: Partial<AgentSession>): AgentSession {
  return {
    machineId: "machine-a",
    machineHostname: "Alpha",
    mux: "tmux",
    sessionId: "$1",
    sessionName: "work",
    windowId: "@1",
    windowIndex: 0,
    windowName: "shell",
    ...input,
  };
}

describe("groupAgentSessions", () => {
  it("puts starred windows first and groups the rest like tmux-jump", () => {
    const starred = agent({
      sessionId: "$9",
      sessionName: "z-last",
      windowId: "@9",
      windowIndex: 9,
      lastActivityAt: "2026-08-21T18:00:00Z",
    });
    const source = [
      agent({ sessionId: "$2", sessionName: "beta", windowId: "@4", windowIndex: 4 }),
      starred,
      agent({ sessionId: "$1", sessionName: "alpha", windowId: "@3", windowIndex: 3 }),
      agent({ sessionId: "$1", sessionName: "alpha", windowId: "@0", windowIndex: 0 }),
    ];

    const result = groupAgentSessions(source, new Set([agentStarKey(starred)]), ["machine-a"]);

    expect(result.groups.map((group) => group.title)).toEqual(["Starred", "alpha", "beta"]);
    expect(result.groups[1]?.agents.map((item) => item.windowIndex)).toEqual([0, 3]);
    expect(result.agents.map((item) => item.windowId)).toEqual(["@9", "@0", "@3", "@4"]);
    expect(result.sessionCount).toBe(3);
  });

  it("keeps same-named sessions separate across machines and muxes", () => {
    const source = [
      agent({ machineId: "machine-b", machineHostname: "Beta", windowId: "@2" }),
      agent({ machineId: "machine-a", mux: "rmux", windowId: "@3" }),
      agent({ machineId: "machine-a", mux: "tmux", windowId: "@1" }),
    ];

    const result = groupAgentSessions(source, new Set(), ["machine-a", "machine-b"]);

    expect(result.groups.map((group) => [group.title, group.subtitle])).toEqual([
      ["work", "Alpha · rmux"],
      ["work", "Alpha · tmux"],
      ["work", "Beta · tmux"],
    ]);
  });

  it("returns the containing group for keyboard navigation", () => {
    const first = agent({ sessionId: "$1", sessionName: "alpha", windowId: "@1" });
    const second = agent({ sessionId: "$2", sessionName: "beta", windowId: "@2" });
    const { groups } = groupAgentSessions([second, first], new Set());

    expect(groupIndexForAgent(groups, second)).toBe(1);
    expect(groupIndexForAgent(groups, first)).toBe(0);
  });
});

describe("nextExpandedAgentKey", () => {
  it("opens one card, replaces it with another, and closes it on a second tap", () => {
    expect(nextExpandedAgentKey("", "card-a")).toBe("card-a");
    expect(nextExpandedAgentKey("card-a", "card-b")).toBe("card-b");
    expect(nextExpandedAgentKey("card-b", "card-b")).toBe("");
  });
});
