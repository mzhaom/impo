export type AgentKind = "claude" | "codex" | "gemini" | string;
export type AgentStatus = "running" | "idle" | "waiting" | "unverified" | string;

export interface TmuxMobileUser {
  email?: string;
  userId?: string;
  hd?: string;
}

export interface TmuxMobileSession {
  baseUrl: string;
  sessionToken: string;
  expiresAt: string;
  user: TmuxMobileUser;
}

export interface DeviceLoginStart {
  id: string;
  userCode?: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  expiresIn?: number;
  interval?: number;
}

export interface DeviceLoginResult {
  sessionToken: string;
  sessionExpiresIn?: number;
  user?: TmuxMobileUser;
}

export interface MachineMux {
  mux?: string;
  kind?: string;
  muxCommand?: string;
  version?: string;
}

export interface Machine {
  id?: string;
  machineId?: string;
  rawMachineId?: string;
  hostname?: string;
  rawHostname?: string;
  machineAlias?: string;
  ownerEmail?: string;
  online?: boolean;
  stale?: boolean;
  connectorStatus?: string;
  inventoryStatus?: string;
  inventoryError?: string;
  agentCwd?: string;
  homeDir?: string;
  mux?: string;
  muxCommand?: string;
  muxVersion?: string;
  muxes?: MachineMux[];
}

export interface AgentSession {
  machineId?: string;
  machineRawId?: string;
  machineHostname?: string;
  machineOwnerId?: string;
  machineOwnerHd?: string;
  mux?: string;
  muxCommand?: string;
  muxVersion?: string;
  sessionId?: string;
  sessionName?: string;
  windowId?: string;
  windowIndex?: number;
  index?: number;
  windowName?: string;
  paneId?: string;
  cwd?: string;
  activeCommand?: string;
  kind?: AgentKind;
  agentSessionId?: string;
  transcriptPath?: string;
  lastUserText?: string;
  lastAssistantText?: string;
  lastRole?: string;
  turn?: string;
  turnConfidence?: string;
  waitingForInput?: boolean;
  waitingConfidence?: string;
  turnCount?: number;
  status?: AgentStatus;
  lastActivityAt?: string | null;
}

export interface CardStarsResponse {
  keys: string[];
  customized?: boolean;
}

export interface CommandCenterResponse {
  machines: Machine[];
  agents: AgentSession[];
}

export interface WindowViewResponse {
  activePaneId: string;
  panes: Array<{ id: string; active?: boolean; command?: string; cwd?: string }>;
  capture: {
    paneId: string;
    mode: string;
    lines: number;
    text: string;
    error?: string | null;
  };
  directories?: {
    cwd?: string;
    parent?: string;
    error?: string | null;
  };
}

export interface AgentTranscriptResponse {
  result?: {
    kind?: string;
    sessionId?: string;
    transcriptPath?: string;
    text?: string;
    turns?: Array<{ role?: string; text?: string; t?: string | null }>;
    turnsTotal?: number;
  } | null;
}

export function machineKey(machine: Machine | null | undefined): string {
  return String(machine?.id || machine?.machineId || machine?.hostname || "local");
}

export function machineLabel(machine: Machine | null | undefined): string {
  return String(machine?.machineAlias || machine?.hostname || machine?.machineId || "local");
}

export function agentMachineKey(agent: AgentSession | null | undefined): string {
  return String(agent?.machineId || agent?.machineRawId || agent?.machineHostname || "local");
}

export function agentCardKey(agent: AgentSession): string {
  return [
    agentMachineKey(agent),
    agent.mux || "tmux",
    agent.windowId || agent.paneId || agent.agentSessionId || agent.sessionName || "",
  ].join("::");
}

const CARD_STAR_KEY_VERSION = "card-star-v1";
const CARD_STAR_SEP = "\u001F";

export function agentReadKey(agent: AgentSession): string {
  return [
    agentMachineKey(agent),
    agent.mux || "tmux",
    agent.sessionId || agent.sessionName || "",
    agent.windowId || "",
    agent.paneId || "",
    agent.agentSessionId || "",
  ].join("::");
}

export function legacyAgentReadKey(agent: AgentSession): string {
  return `${agentMachineKey(agent)}::${agent.mux || "tmux"}::${
    agent.windowId || agent.paneId || agent.agentSessionId || ""
  }`;
}

export function agentStarKey(agent: AgentSession): string {
  const machineId = agentMachineKey(agent);
  const mux = agent.mux || "tmux";
  const sessionName = agent.sessionName || agent.sessionId || "";
  const index = agent.windowIndex ?? agent.index ?? "";
  if (sessionName && index !== "") {
    return [CARD_STAR_KEY_VERSION, machineId, mux, sessionName, String(index)].join(CARD_STAR_SEP);
  }

  const liveId = agent.windowId || agent.paneId || agent.agentSessionId || "";
  return [CARD_STAR_KEY_VERSION, machineId, mux, "live", liveId].join(CARD_STAR_SEP);
}

export function agentStarKeys(agent: AgentSession): string[] {
  return [...new Set([agentStarKey(agent), agentReadKey(agent), legacyAgentReadKey(agent)].filter(Boolean))];
}

export function isAgentStarred(agent: AgentSession, stars: Set<string>): boolean {
  return agentStarKeys(agent).some((key) => stars.has(key));
}

export function agentTitle(agent: AgentSession): string {
  return agent.windowName || agent.sessionName || "(unnamed)";
}

export function agentSubtitle(agent: AgentSession): string {
  const session = agent.sessionName || "";
  const cwd = agent.cwd || "";
  if (session && cwd) return `${session} · ${cwd}`;
  return session || cwd || "";
}
