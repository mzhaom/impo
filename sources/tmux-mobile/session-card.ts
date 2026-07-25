import type { AgentSession } from "@/tmux-mobile/types";
import { agentMachineKey } from "@/tmux-mobile/types";

export type SessionCardSummary = {
  windowName: string;
  sessionName: string;
  directory: string;
  machineName: string;
  lastActivityAt: string | null;
};

export type SessionCardDeviceContext = {
  isPad: boolean;
  isVision: boolean;
};

function cleanLabel(value: string | null | undefined): string {
  return String(value || "").trim();
}

function latestTimestamp(
  values: Array<string | null | undefined>,
): string | null {
  let latestValue: string | null = null;
  let latestTime = 0;
  values.forEach((value) => {
    const cleaned = cleanLabel(value);
    const time = Date.parse(cleaned);
    if (!cleaned || !Number.isFinite(time) || time <= latestTime) return;
    latestValue = cleaned;
    latestTime = time;
  });
  return latestValue;
}

export function sessionCardSummary(agent: AgentSession): SessionCardSummary {
  const sessionName = cleanLabel(agent.sessionName) || cleanLabel(agent.sessionId);
  return {
    windowName: cleanLabel(agent.windowName) || sessionName || "(unnamed)",
    sessionName,
    directory: cleanLabel(agent.cwd),
    machineName:
      cleanLabel(agent.machineHostname) || cleanLabel(agentMachineKey(agent)),
    lastActivityAt: latestTimestamp([
      agent.lastActivityAt,
      agent.lastAssistantAt,
      agent.lastUserAt,
    ]),
  };
}

export function nextExpandedSessionKey(
  currentKey: string | null,
  pressedKey: string,
): string | null {
  return currentKey === pressedKey ? null : pressedKey;
}

export function shouldUseCompactSessionCards({
  isPad,
  isVision,
}: SessionCardDeviceContext): boolean {
  return !isPad && !isVision;
}
