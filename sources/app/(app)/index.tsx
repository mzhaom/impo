import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Animated,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { StatusBar } from "expo-status-bar";
import { KeyboardAvoidingView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown, { type RenderRules } from "react-native-markdown-display";
import { toByteArray } from "base64-js";
import { darkTheme, lightTheme } from "@/theme";
import type { AppTheme } from "@/theme";
import {
  Check,
  Copy,
  Edit3,
  Eye,
  ExternalLink,
  FileText,
  ImagePlus,
  Link2,
  Laptop,
  LogOut,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  MoreVertical,
  Moon,
  Pin,
  Play,
  RefreshCcw,
  Send,
  Star,
  Sun,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTmuxMobileApi, useTmuxMobileAuth } from "@/tmux-mobile/auth";
import { renderAnsiText } from "@/tmux-mobile/ansi";
import {
  cardStarsKey,
  commandCenterKey,
  useCardStars,
  useCommandCenter,
  useDeletePin,
  useDeleteWindow,
  usePinFileArtifact,
  usePinInlineArtifact,
  usePins,
  useRenameWindow,
  useRenamePin,
  useSendKey,
  useSendText,
  useStartAgent,
  useToggleCardStar,
  useUploadFile,
} from "@/tmux-mobile/hooks";
import {
  agentCardKey,
  agentMachineKey,
  agentStarKey,
  agentStarKeys,
  agentSubtitle,
  agentTitle,
  isAgentStarred,
  machineKey,
  machineLabel,
} from "@/tmux-mobile/types";
import {
  filePathFromLocalHref,
  fileViewerEndpoint,
  resolveLinkedFilePath,
  splitFilePathText,
} from "@/tmux-mobile/file-links";
import type {
  AgentFileResponse,
  AgentSession,
  AgentTranscriptResponse,
  ArtifactPin,
  Machine,
  WindowViewResponse,
} from "@/tmux-mobile/types";

const AGENT_ICONS: Record<string, number> = {
  claude: require("@/assets/images/icon-claude.png"),
  codex: require("@/assets/images/icon-gpt.png"),
  gemini: require("@/assets/images/icon-gemini.png"),
};

const EMPTY_MACHINES: Machine[] = [];
const EMPTY_AGENTS: AgentSession[] = [];
const THEME_MODE_KEY = "tmux-mobile.theme-mode";
const MACHINE_CHIP_READ_AT_KEY = "tmux-mobile.machine-chip-read-at";
const MACHINE_CHIP_READ_GRACE_MS = 5_000;
type ThemeMode = "light" | "dark";
type MachineChipStats = {
  workingCount: number;
  unreadCount: number;
};

type ResponsiveLayout = {
  width: number;
  height: number;
  isWide: boolean;
  listColumns: number;
  gutter: number;
  contentMaxWidth: number;
  sheetMaxWidth: number;
  menuWidth: number;
  cardPadding: number;
  sessionPillMaxWidth: number;
};

function createResponsiveLayout(width = 390, height = 844): ResponsiveLayout {
  const isWide = width >= 760;
  const listColumns = width >= 1180 ? 3 : width >= 760 ? 2 : 1;
  const gutter = isWide ? 18 : 16;
  const contentMaxWidth = isWide ? Math.min(width - gutter * 2, 1240) : width;
  return {
    width,
    height,
    isWide,
    listColumns,
    gutter,
    contentMaxWidth,
    sheetMaxWidth: isWide ? Math.min(width - gutter * 2, 760) : width,
    menuWidth: isWide ? 300 : 226,
    cardPadding: isWide ? 16 : 14,
    sessionPillMaxWidth: isWide ? 176 : 132,
  };
}

const DEFAULT_LAYOUT = createResponsiveLayout();
type AppStyles = ReturnType<typeof createStyles>;

const ThemeContext = React.createContext<AppTheme>(lightTheme);
const StylesContext = React.createContext<AppStyles>(createStyles(lightTheme));

const PROMPT_SHORTCUTS = [
  { label: "Yes", text: "yes" },
  { label: "Slash", text: "/" },
] as const;

type TerminalKeyEntry =
  | { label: string; key: string; danger?: boolean }
  | { label: string; command: string; danger?: boolean };

const TERMINAL_KEYS: readonly TerminalKeyEntry[] = [
  { label: "Esc", key: "Escape" },
  { label: "^C", key: "C-c", danger: true },
  { label: "^Z", key: "C-z", danger: true },
  { label: "fg", command: "fg" },
  { label: "Tab", key: "Tab" },
  { label: "↑", key: "Up" },
  { label: "⌫", key: "BSpace" },
  { label: "⌫line", key: "C-u" },
  { label: "↓", key: "Down" },
] as const;

const TERMINAL_INPUT_KEYS: readonly TerminalKeyEntry[] = [
  { label: "Enter", key: "Enter" },
  { label: "Tab", key: "Tab" },
  { label: "Esc", key: "Escape" },
  { label: "↑", key: "Up" },
  { label: "↓", key: "Down" },
  { label: "←", key: "Left" },
  { label: "→", key: "Right" },
  { label: "⌫", key: "BSpace" },
  { label: "⌫line", key: "C-u" },
  { label: "^C", key: "C-c", danger: true },
  { label: "^D", key: "C-d", danger: true },
  { label: "^Z", key: "C-z", danger: true },
  { label: "fg", command: "fg" },
] as const;
const TERMINAL_INITIAL_LINES = 260;
const TERMINAL_REFRESH_LINES = 320;
const TERMINAL_ACTIVE_REFRESH_MS = 700;
const TERMINAL_IDLE_REFRESH_MS = 1400;

function terminalKeyFromNativeKey(rawKey: string): string {
  switch (rawKey) {
    case "ArrowUp":
    case "Up":
      return "Up";
    case "ArrowDown":
    case "Down":
      return "Down";
    case "ArrowLeft":
    case "Left":
      return "Left";
    case "ArrowRight":
    case "Right":
      return "Right";
    case "Enter":
    case "Return":
    case "\n":
    case "\r":
      return "Enter";
    case "Backspace":
    case "Delete":
    case "\b":
    case "\u007f":
      return "BSpace";
    case "Tab":
    case "\t":
      return "Tab";
    case "Escape":
    case "Esc":
    case "\u001b":
      return "Escape";
    case "\u0003":
      return "C-c";
    case "\u0004":
      return "C-d";
    case "\u001a":
      return "C-z";
    default:
      return "";
  }
}

type SendRetryAction =
  | { kind: "text"; label: string }
  | { kind: "terminal"; label: string; entry: TerminalKeyEntry };

type AgentFileTarget = {
  agent: AgentSession;
  path: string;
};
type MarkdownPathRuleOptions = {
  agent?: AgentSession | null;
  basePath?: string;
  selectable?: boolean;
};

function useAppTheme() {
  return React.useContext(ThemeContext);
}

function useAppStyles() {
  return React.useContext(StylesContext);
}

function activityTime(agent: AgentSession): number {
  const value = Date.parse(String(agent.lastActivityAt || ""));
  return Number.isFinite(value) ? value : 0;
}

function agentIsWorking(agent: AgentSession): boolean {
  const status = agent.waitingForInput ? "waiting" : agent.status || agent.turn || "";
  return String(status).toLowerCase() === "running";
}

function agentUnreadMessageTime(agent: AgentSession): number {
  const assistantTime = parseDateMs(agent.lastAssistantAt);
  return assistantTime || 0;
}

function formatUnreadCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

function parseDateMs(value: string | null | undefined): number {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : 0;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function exactTimeLabel(value: string | null | undefined): string {
  const ms = parseDateMs(value);
  if (!ms) return "";
  const date = new Date(ms);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay(date, now)) return `Today ${time}`;
  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })} ${time}`;
}

function relativeTimeLabel(value: string | null | undefined): string {
  const ms = parseDateMs(value);
  if (!ms) return "";
  const diffMs = Date.now() - ms;
  const future = diffMs < 0;
  const seconds = Math.max(0, Math.round(Math.abs(diffMs) / 1000));
  if (seconds < 45) return future ? "soon" : "now";
  const units = [
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
  ] as const;
  for (const [label, size] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return future ? `in ${count}${label}` : `${count}${label} ago`;
    }
  }
  return future ? "in 1m" : "1m ago";
}

const PIN_SCOPE_LABELS: Record<string, string> = {
  private: "Only me",
  users: "Specific people",
  org: "My organization",
  all: "All logged-in users",
};

function formatPinAge(value: number | undefined): string {
  if (!value) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPinSize(bytes: number | undefined): string {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function artifactSlugPart(value: string | null | undefined, fallback = "response"): string {
  const slug = String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function decodeBase64Utf8(base64: string): string {
  const bytes = toByteArray(String(base64 || ""));
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  try {
    return decodeURIComponent(escape(binary));
  } catch {
    return binary;
  }
}

function agentFileBrowserUrl(
  api: { url: (pathname: string) => URL },
  agent: AgentSession,
  filePath: string,
): string {
  const params = new URLSearchParams({
    paneId: agent.paneId || "",
    path: filePath,
  });
  const machineId = agentMachineKey(agent);
  if (machineId) params.set("machineId", machineId);
  if (agent.mux) params.set("mux", agent.mux);
  return api.url(`${fileViewerEndpoint(filePath)}?${params.toString()}`).toString();
}

function createMarkdownPathRules(
  onOpenPath: (path: string) => void,
  options: MarkdownPathRuleOptions = {},
): RenderRules {
  const selectable = options.selectable === true;
  const trimCodeContent = (value: string) =>
    value.endsWith("\n") ? value.slice(0, -1) : value;
  return {
    strong: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.strong}>
        {children}
      </Text>
    ),
    em: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.em}>
        {children}
      </Text>
    ),
    s: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.s}>
        {children}
      </Text>
    ),
    code_inline: (node, _children, _parentNodes, styles, inheritedStyles = {}) => (
      <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.code_inline]}>
        {node.content}
      </Text>
    ),
    code_block: (node, _children, _parentNodes, styles, inheritedStyles = {}) => (
      <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.code_block]}>
        {trimCodeContent(String(node.content || ""))}
      </Text>
    ),
    fence: (node, _children, _parentNodes, styles, inheritedStyles = {}) => (
      <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.fence]}>
        {trimCodeContent(String(node.content || ""))}
      </Text>
    ),
    link: (node, children, _parentNodes, styles, onLinkPress) => (
      <Text
        key={node.key}
        selectable={selectable}
        style={styles.link}
        onPress={() => {
          onLinkPress?.(String(node.attributes?.href || ""));
        }}
      >
        {children}
      </Text>
    ),
    text: (node, _children, parentNodes, styles, inheritedStyles = {}) => {
      const content = String(node.content || "");
      const insideLink = parentNodes.some((parent) => parent?.type === "link" || parent?.type === "blocklink");
      const parts = insideLink ? [{ kind: "text" as const, text: content }] : splitFilePathText(content);
      const hasFile = parts.some((part) => part.kind === "file");
      if (!hasFile) {
        return (
          <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.text]}>
            {content}
          </Text>
        );
      }
      return (
        <Text key={node.key} selectable={selectable} style={[inheritedStyles, styles.text]}>
          {parts.map((part, index) =>
            part.kind === "file" ? (
              <Text
                key={`${node.key}-file-${index}`}
                accessibilityRole="link"
                style={styles.filePathLink || styles.link}
                onPress={() => onOpenPath(resolveLinkedFilePath(part.path, options.basePath))}
              >
                {part.text}
              </Text>
            ) : (
              <Text key={`${node.key}-text-${index}`}>{part.text}</Text>
            ),
          )}
        </Text>
      );
    },
    textgroup: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.textgroup}>
        {children}
      </Text>
    ),
    hardbreak: (node, _children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.hardbreak}>
        {"\n"}
      </Text>
    ),
    softbreak: (node, _children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.softbreak}>
        {"\n"}
      </Text>
    ),
    inline: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.inline}>
        {children}
      </Text>
    ),
    span: (node, children, _parentNodes, styles) => (
      <Text key={node.key} selectable={selectable} style={styles.span}>
        {children}
      </Text>
    ),
    image: (node) => {
      const src = String(node.attributes?.src || "");
      const alt = String(node.attributes?.alt || "");
      const filePath = filePathFromLocalHref(src, options.basePath);
      return (
        <MarkdownImageBlock
          key={node.key}
          src={src}
          alt={alt}
          agent={options.agent || null}
          filePath={filePath}
          onOpenPath={onOpenPath}
        />
      );
    },
  };
}

function compareRecentActivity(a: AgentSession, b: AgentSession): number {
  return activityTime(b) - activityTime(a);
}

export default function CommandCenterRoute() {
  return <CommandCenterScreen />;
}

function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const auth = useTmuxMobileAuth();
  const queryClient = useQueryClient();
  const commandCenter = useCommandCenter();
  const cardStars = useCardStars();
  const toggleCardStar = useToggleCardStar();
  const deleteWindow = useDeleteWindow();
  const [themeMode, setThemeMode] = React.useState<ThemeMode>(
    systemScheme === "dark" ? "dark" : "light",
  );
  const [machineFilter, setMachineFilter] = React.useState("all");
  const [sendTarget, setSendTarget] = React.useState<AgentSession | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<AgentSession | null>(null);
  const [viewTarget, setViewTarget] = React.useState<AgentSession | null>(null);
  const [responseTarget, setResponseTarget] = React.useState<AgentSession | null>(null);
  const [fileTarget, setFileTarget] = React.useState<AgentFileTarget | null>(null);
  const [transcriptTarget, setTranscriptTarget] = React.useState<AgentSession | null>(null);
  const [startVisible, setStartVisible] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [pinsVisible, setPinsVisible] = React.useState(false);
  const [selectedAgent, setSelectedAgent] = React.useState<AgentSession | null>(null);
  const [machineChipReadLoaded, setMachineChipReadLoaded] = React.useState(false);
  const [machineChipReadAt, setMachineChipReadAt] = React.useState<number | null>(null);
  const appState = React.useRef(AppState.currentState);
  const copyResetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedResponseKey, setCopiedResponseKey] = React.useState("");
  const theme = themeMode === "dark" ? darkTheme : lightTheme;
  const layout = React.useMemo(
    () => createResponsiveLayout(windowWidth, windowHeight),
    [windowHeight, windowWidth],
  );
  const styles = React.useMemo(() => createStyles(theme, layout), [layout, theme]);

  React.useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((value) => {
        if (mounted && (value === "light" || value === "dark")) setThemeMode(value);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const machines = commandCenter.data?.machines || EMPTY_MACHINES;
  const rawAgents = commandCenter.data?.agents || EMPTY_AGENTS;
  const stars = React.useMemo(() => new Set(cardStars.data?.keys || []), [cardStars.data?.keys]);
  const latestUnreadMessageAt = React.useMemo(
    () => rawAgents.reduce((latest, agent) => Math.max(latest, agentUnreadMessageTime(agent)), 0),
    [rawAgents],
  );
  const machineReadThreshold = machineChipReadAt ?? Number.POSITIVE_INFINITY;
  const machineChipStats = React.useMemo(() => {
    const byMachine = new Map<string, MachineChipStats>();
    const all: MachineChipStats = { workingCount: 0, unreadCount: 0 };
    rawAgents.forEach((agent) => {
      const key = agentMachineKey(agent);
      const stats = byMachine.get(key) || { workingCount: 0, unreadCount: 0 };
      if (agentIsWorking(agent)) {
        stats.workingCount += 1;
        all.workingCount += 1;
      }
      const messageTime = agentUnreadMessageTime(agent);
      if (messageTime > machineReadThreshold) {
        stats.unreadCount += 1;
        all.unreadCount += 1;
      }
      byMachine.set(key, stats);
    });
    return { all, byMachine };
  }, [machineReadThreshold, rawAgents]);
  const agents = React.useMemo(() => {
    const filtered =
      machineFilter === "all"
        ? rawAgents
        : rawAgents.filter((agent) => agentMachineKey(agent) === machineFilter);
    const starredAgents: AgentSession[] = [];
    const unstarredAgents: AgentSession[] = [];
    filtered.forEach((agent) => {
      if (isAgentStarred(agent, stars)) starredAgents.push(agent);
      else unstarredAgents.push(agent);
    });
    return [
      ...starredAgents.sort(compareRecentActivity),
      ...unstarredAgents.sort(compareRecentActivity),
    ];
  }, [machineFilter, rawAgents, stars]);

  const toggleStar = React.useCallback(
    (agent: AgentSession) => {
      const current = new Set(cardStars.data?.keys || []);
      const keys = agentStarKeys(agent);
      const starred = keys.some((key) => current.has(key));
      if (starred) keys.forEach((key) => current.delete(key));
      else current.add(agentStarKey(agent));
      toggleCardStar.mutate({ agent, keys: [...current] });
      void Haptics.selectionAsync();
    },
    [cardStars.data?.keys, toggleCardStar],
  );

  React.useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(MACHINE_CHIP_READ_AT_KEY)
      .then((value) => {
        if (!mounted) return;
        const parsed = Number(value || "");
        setMachineChipReadAt(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
        setMachineChipReadLoaded(true);
      })
      .catch(() => {
        if (mounted) setMachineChipReadLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!machineChipReadLoaded || machineChipReadAt !== null) return;
    const initialReadAt = Math.max(Date.now() + MACHINE_CHIP_READ_GRACE_MS, latestUnreadMessageAt);
    setMachineChipReadAt(initialReadAt);
    AsyncStorage.setItem(MACHINE_CHIP_READ_AT_KEY, String(initialReadAt)).catch(() => {});
  }, [latestUnreadMessageAt, machineChipReadAt, machineChipReadLoaded]);

  const markMachineChipsRead = React.useCallback(() => {
    const nextReadAt = Math.max(Date.now() + MACHINE_CHIP_READ_GRACE_MS, latestUnreadMessageAt);
    setMachineChipReadAt(nextReadAt);
    AsyncStorage.setItem(MACHINE_CHIP_READ_AT_KEY, String(nextReadAt)).catch(() => {});
  }, [latestUnreadMessageAt]);

  const selectMachineFilter = React.useCallback(
    (nextFilter: string) => {
      setMachineFilter(nextFilter);
      markMachineChipsRead();
      void Haptics.selectionAsync();
    },
    [markMachineChipsRead],
  );

  const openStartAgent = React.useCallback(() => {
    setMenuVisible(false);
    setStartVisible(true);
    void Haptics.selectionAsync();
  }, []);

  const refreshCommandCenter = React.useCallback(() => {
    setMenuVisible(false);
    void Promise.all([commandCenter.refetch(), cardStars.refetch()]);
    void Haptics.selectionAsync();
  }, [cardStars, commandCenter]);

  const openPinnedArtifacts = React.useCallback(() => {
    setMenuVisible(false);
    setPinsVisible(true);
    void Haptics.selectionAsync();
  }, []);

  const openAgentFile = React.useCallback((agent: AgentSession, path: string) => {
    setSelectedAgent(agent);
    setFileTarget({ agent, path });
    void Haptics.selectionAsync();
  }, []);

  const signOut = React.useCallback(() => {
    setMenuVisible(false);
    void auth.signOut();
  }, [auth]);

  const toggleTheme = React.useCallback(() => {
    setMenuVisible(false);
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
      return next;
    });
    void Haptics.selectionAsync();
  }, []);

  const confirmDeleteAgent = React.useCallback(
    (agent: AgentSession) => {
      const title = agentTitle(agent);
      Alert.alert("Delete session", `Kill "${title}" on ${agent.machineHostname || agentMachineKey(agent)}?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteWindow.mutate({ agent });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]);
    },
    [deleteWindow],
  );

  const copyAssistantResponse = React.useCallback(async (agent: AgentSession) => {
    const text = agent.lastAssistantText || "";
    if (!text) return;
    await Clipboard.setStringAsync(text);
    const key = agentCardKey(agent);
    setCopiedResponseKey(key);
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => {
      setCopiedResponseKey((current) => (current === key ? "" : current));
    }, 1200);
    void Haptics.selectionAsync();
  }, []);

  React.useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;
      if ((previousState === "background" || previousState === "inactive") && nextState === "active") {
        queryClient.invalidateQueries({ queryKey: commandCenterKey }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: cardStarsKey }).catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [queryClient]);

  const withTheme = React.useCallback(
    (node: React.ReactNode) => (
      <ThemeContext.Provider value={theme}>
        <StylesContext.Provider value={styles}>{node}</StylesContext.Provider>
      </ThemeContext.Provider>
    ),
    [styles, theme],
  );

  if (auth.loading) {
    return withTheme(
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>,
    );
  }

  if (!auth.session) {
    return withTheme(<LoginScreen />);
  }

  return withTheme(
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>AMUX</Text>
          <Text style={styles.headerMeta} numberOfLines={1}>
            {auth.session.user.email || auth.baseUrl}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <IconButton
            label="Refresh"
            icon={<RefreshCcw size={19} color={theme.colors.text} />}
            onPress={refreshCommandCenter}
          />
          <IconButton
            label="Command menu"
            icon={<MoreVertical size={19} color={theme.colors.text} />}
            onPress={() => setMenuVisible(true)}
          />
        </View>
      </View>

      <MachineStrip
        machines={machines}
        active={machineFilter}
        allStats={machineChipStats.all}
        statsByMachine={machineChipStats.byMachine}
        onChange={selectMachineFilter}
      />

      <View style={styles.summaryRow}>
        <Text style={styles.countText}>
          {agents.length} session{agents.length === 1 ? "" : "s"}
        </Text>
      </View>

      {commandCenter.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{commandCenter.error.message}</Text>
        </View>
      ) : null}
      {deleteWindow.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{deleteWindow.error.message}</Text>
        </View>
      ) : null}

      <FlatList
        key={`agent-grid-${layout.listColumns}`}
        data={agents}
        keyExtractor={agentCardKey}
        style={styles.listViewport}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
          agents.length === 0 ? styles.emptyList : null,
        ]}
        numColumns={layout.listColumns}
        columnWrapperStyle={layout.listColumns > 1 ? styles.cardColumnWrapper : undefined}
        refreshControl={
          <RefreshControl
            refreshing={commandCenter.isFetching}
            onRefresh={() => commandCenter.refetch()}
            tintColor={theme.colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Terminal size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No agent sessions</Text>
            <Text style={styles.emptyText}>
              Start Codex or Claude on one of the connected machines.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const key = agentCardKey(item);
          const starred = isAgentStarred(item, stars);
          const selectAgent = () => setSelectedAgent(item);
          return (
            <View style={styles.cardGridItem}>
            <AgentCard
              agent={item}
              starred={starred}
              selected={selectedAgent ? agentCardKey(selectedAgent) === key : false}
              onToggleStar={() => toggleStar(item)}
              onSelect={selectAgent}
              onSend={() => {
                selectAgent();
                setSendTarget(item);
              }}
              onRename={() => {
                selectAgent();
                setRenameTarget(item);
              }}
              onDelete={() => {
                selectAgent();
                confirmDeleteAgent(item);
              }}
              onView={() => {
                selectAgent();
                setViewTarget(item);
              }}
              onViewResponse={() => {
                selectAgent();
                setResponseTarget(item);
              }}
              onCopyResponse={() => {
                selectAgent();
                copyAssistantResponse(item).catch(() => {});
              }}
              onOpenFile={(path) => openAgentFile(item, path)}
              responseCopied={copiedResponseKey === key}
              onTranscript={() => {
                selectAgent();
                setTranscriptTarget(item);
              }}
            />
            </View>
          );
        }}
      />

      <SendModal target={sendTarget} onClose={() => setSendTarget(null)} />
      <RenameModal target={renameTarget} onClose={() => setRenameTarget(null)} />
      <WindowViewModal target={viewTarget} onClose={() => setViewTarget(null)} />
      <ResponseModal
        target={responseTarget}
        copied={responseTarget ? copiedResponseKey === agentCardKey(responseTarget) : false}
        onCopy={(agent) => {
          copyAssistantResponse(agent).catch(() => {});
        }}
        onOpenFile={openAgentFile}
        onClose={() => setResponseTarget(null)}
      />
      <FilePreviewModal
        target={fileTarget}
        onOpenPath={(path) => {
          if (fileTarget) setFileTarget({ agent: fileTarget.agent, path });
        }}
        onClose={() => setFileTarget(null)}
      />
      <TranscriptModal
        target={transcriptTarget}
        onOpenFile={openAgentFile}
        onClose={() => setTranscriptTarget(null)}
      />
      <PinnedArtifactsModal visible={pinsVisible} onClose={() => setPinsVisible(false)} />
      <CommandMenu
        visible={menuVisible}
        topOffset={insets.top + 54}
        onClose={() => setMenuVisible(false)}
        onStartAgent={openStartAgent}
        onPinnedArtifacts={openPinnedArtifacts}
        onRefresh={refreshCommandCenter}
        onToggleTheme={toggleTheme}
        themeMode={themeMode}
        onSignOut={signOut}
      />
      <StartAgentModal
        visible={startVisible}
        machines={machines}
        selectedAgent={selectedAgent}
        onClose={() => setStartVisible(false)}
      />
    </View>,
  );
}

function LoginScreen() {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const auth = useTmuxMobileAuth();
  const [url, setUrl] = React.useState(auth.baseUrl);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.loginScreen, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <View style={styles.loginPanel}>
        <Terminal size={34} color={theme.colors.accent} />
        <Text style={styles.loginTitle}>AMUX</Text>
        <Text style={styles.loginText}>
          Native command center for Codex and Claude sessions running through tmux-mobile.
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Controller</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            onBlur={() => auth.setBaseUrl(url)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.textInput}
            placeholder="https://eng.impo.ai"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
        <Pressable
          style={[styles.primaryButton, styles.loginButton]}
          disabled={auth.signingIn}
          onPress={() => {
            auth.setBaseUrl(url);
            void auth.signIn();
          }}
        >
          {auth.signingIn ? (
            <ActivityIndicator color={theme.colors.surfaceRaised} />
          ) : (
            <Text style={styles.primaryButtonText}>Sign in with Google</Text>
          )}
        </Pressable>
        {auth.challenge ? (
          <View style={styles.challengeBox}>
            <Text style={styles.challengeLabel}>{auth.codeCopied ? "Device code copied" : "Device code"}</Text>
            <Text style={styles.challengeCode}>{auth.challenge.userCode || "Browser opened"}</Text>
          </View>
        ) : null}
        {auth.error ? <Text style={styles.errorText}>{auth.error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function MachineStrip({
  machines,
  active,
  allStats,
  statsByMachine,
  onChange,
}: {
  machines: Machine[];
  active: string;
  allStats: MachineChipStats;
  statsByMachine: Map<string, MachineChipStats>;
  onChange: (value: string) => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const renderChipStatus = (stats: MachineChipStats) => (
    <>
      {stats.workingCount > 0 ? <View style={styles.machineChipWorkingDot} /> : null}
      {stats.unreadCount > 0 ? (
        <View style={styles.chipUnreadBadge}>
          <Text style={styles.chipUnreadText}>{formatUnreadCount(stats.unreadCount)}</Text>
        </View>
      ) : null}
    </>
  );
  return (
    <ScrollView
      horizontal
      style={styles.machineStripViewport}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.machineStrip}
    >
      <Chip active={active === "all"} onPress={() => onChange("all")}>
        <View style={styles.machineChipContent}>
          <Text style={[styles.chipText, active === "all" ? styles.chipTextActive : null]} numberOfLines={1}>
            All
          </Text>
          {renderChipStatus(allStats)}
        </View>
      </Chip>
      {machines.map((machine) => {
        const key = machineKey(machine);
        const stats = statsByMachine.get(key) || { workingCount: 0, unreadCount: 0 };
        return (
          <Chip key={key} active={active === key} onPress={() => onChange(key)}>
            <View style={styles.machineChipContent}>
              <Laptop size={14} color={active === key ? theme.colors.surfaceRaised : theme.colors.textMuted} />
              <Text
                style={[
                  styles.chipText,
                  active === key ? styles.chipTextActive : null,
                ]}
                numberOfLines={1}
              >
                {machineLabel(machine)}
              </Text>
              {renderChipStatus(stats)}
            </View>
          </Chip>
        );
      })}
    </ScrollView>
  );
}

function Chip({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const styles = useAppStyles();
  return (
    <Pressable style={[styles.chip, active ? styles.chipActive : null]} onPress={onPress}>
      {typeof children === "string" ? (
        <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

function LinkedPathText({
  text,
  style,
  numberOfLines,
  selectable,
  onOpenPath,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
  onOpenPath: (path: string) => void;
}) {
  const styles = useAppStyles();
  const parts = React.useMemo(() => splitFilePathText(text), [text]);
  const hasFile = parts.some((part) => part.kind === "file");
  if (!hasFile) {
    return (
      <Text selectable={selectable} style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }
  return (
    <Text selectable={selectable} style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        part.kind === "file" ? (
          <Text
            key={`file-${index}`}
            accessibilityRole="link"
            style={styles.inlineFileLink}
            onPress={() => onOpenPath(part.path)}
          >
            {part.text}
          </Text>
        ) : (
          <Text key={`text-${index}`}>{part.text}</Text>
        ),
      )}
    </Text>
  );
}

function RunningCardEdge({ active }: { active: boolean }) {
  const styles = useAppStyles();
  const progress = React.useRef(new Animated.Value(0)).current;
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    if (!active) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2600,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [active, progress]);

  if (!active) return null;

  const width = Math.max(size.width, 1);
  const height = Math.max(size.height, 1);
  const segment = Math.max(42, Math.min(96, width * 0.34));
  const segmentY = Math.max(42, Math.min(96, height * 0.46));
  const phaseOpacity = (start: number, end: number) =>
    progress.interpolate({
      inputRange: [0, start, start + 0.02, end - 0.02, end, 1],
      outputRange: [0, 0, 1, 1, 0, 0],
      extrapolate: "clamp",
    });

  return (
    <View
      pointerEvents="none"
      style={styles.runningEdge}
      onLayout={(event) => {
        const next = event.nativeEvent.layout;
        if (next.width !== size.width || next.height !== size.height) {
          setSize({ width: next.width, height: next.height });
        }
      }}
    >
      <Animated.View
        style={[
          styles.runningEdgeSegment,
          styles.runningEdgeHorizontal,
          {
            width: segment,
            top: 0,
            opacity: phaseOpacity(0, 0.25),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 0.25],
                  outputRange: [-segment, width],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.runningEdgeSegment,
          styles.runningEdgeVertical,
          {
            height: segmentY,
            right: 0,
            opacity: phaseOpacity(0.25, 0.5),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0.25, 0.5],
                  outputRange: [-segmentY, height],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.runningEdgeSegment,
          styles.runningEdgeHorizontal,
          {
            width: segment,
            bottom: 0,
            opacity: phaseOpacity(0.5, 0.75),
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0.5, 0.75],
                  outputRange: [width, -segment],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.runningEdgeSegment,
          styles.runningEdgeVertical,
          {
            height: segmentY,
            left: 0,
            opacity: phaseOpacity(0.75, 1),
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0.75, 1],
                  outputRange: [height, -segmentY],
                  extrapolate: "clamp",
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

function MarkdownImageBlock({
  src,
  alt,
  agent,
  filePath,
  onOpenPath,
}: {
  src: string;
  alt: string;
  agent: AgentSession | null;
  filePath: string;
  onOpenPath: (path: string) => void;
}) {
  const api = useTmuxMobileApi();
  const theme = useAppTheme();
  const styles = useAppStyles();
  const remoteUri = /^(?:https?:\/\/|data:image\/)/i.test(src) ? src : "";
  const [imageUri, setImageUri] = React.useState(remoteUri);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setError("");
    if (remoteUri) {
      setImageUri(remoteUri);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setImageUri("");
    if (!api || !agent?.paneId || !filePath) return;
    setLoading(true);
    api
      .file(agentMachineKey(agent), agent.paneId, filePath)
      .then((result) => {
        if (cancelled) return;
        if (result.kind === "image" || /^image\//i.test(result.contentType || "")) {
          setImageUri(`data:${result.contentType};base64,${result.base64}`);
        } else {
          setError("Not an image");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, api, filePath, remoteUri]);

  const label = alt || filePath || src || "image";
  const openImage = React.useCallback(() => {
    if (filePath) {
      onOpenPath(filePath);
      return;
    }
    if (remoteUri) {
      Linking.openURL(remoteUri).catch(() => {});
    }
  }, [filePath, onOpenPath, remoteUri]);

  return (
    <Pressable style={styles.markdownImageBlock} onPress={openImage}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.markdownImage} resizeMode="contain" />
      ) : (
        <View style={styles.markdownImagePlaceholder}>
          {loading ? (
            <ActivityIndicator color={theme.colors.accent} />
          ) : (
            <ImagePlus size={18} color={theme.colors.textMuted} />
          )}
          <Text style={styles.markdownImageLabel} numberOfLines={2}>
            {loading ? "Loading image..." : label}
          </Text>
          {error ? (
            <Text style={styles.markdownImageError} numberOfLines={2}>
              {error}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

function AgentCard({
  agent,
  starred,
  selected,
  onToggleStar,
  onSelect,
  onSend,
  onRename,
  onDelete,
  onView,
  onViewResponse,
  onCopyResponse,
  onOpenFile,
  responseCopied,
  onTranscript,
}: {
  agent: AgentSession;
  starred: boolean;
  selected: boolean;
  onToggleStar: () => void;
  onSelect: () => void;
  onSend: () => void;
  onRename: () => void;
  onDelete: () => void;
  onView: () => void;
  onViewResponse: () => void;
  onCopyResponse: () => void;
  onOpenFile: (path: string) => void;
  responseCopied: boolean;
  onTranscript: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const icon = AGENT_ICONS[String(agent.kind || "").toLowerCase()];
  const status = agent.waitingForInput ? "waiting" : agent.status || agent.turn || "unverified";
  const running = status === "running";
  const statusStyle =
    running
      ? styles.statusRunning
      : status === "waiting"
        ? styles.statusWaiting
        : status === "idle"
          ? styles.statusIdle
          : styles.statusUnknown;

  return (
    <Pressable
      style={[styles.card, running ? styles.cardRunning : null, selected ? styles.cardSelected : null]}
      onPress={onSelect}
    >
      <RunningCardEdge active={running} />
      <Pressable
        accessibilityLabel={starred ? "Unstar session" : "Star session"}
        accessibilityState={{ selected: starred }}
        style={[styles.starButton, starred ? styles.starButtonActive : null]}
        hitSlop={12}
        onPress={onToggleStar}
      >
        <Star
          size={18}
          color={starred ? theme.colors.warning : theme.colors.textMuted}
          fill={starred ? theme.colors.warning : "transparent"}
        />
      </Pressable>
      <View style={styles.cardHeader}>
        <View style={styles.agentAvatar}>
          {icon ? (
            <Image source={icon} style={styles.agentIcon} resizeMode="contain" />
          ) : (
            <Terminal size={18} color={theme.colors.text} />
          )}
        </View>
        <View style={styles.cardTitleBlock}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {agentTitle(agent)}
            </Text>
            {agent.sessionName ? (
              <Text style={styles.sessionPill} numberOfLines={1}>
                {agent.sessionName}
              </Text>
            ) : null}
          </View>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {agent.machineHostname || agentMachineKey(agent)} · {agent.kind || "agent"} · {agent.mux || "tmux"}
          </Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, statusStyle]} />
          <Text style={styles.statusText}>{status}</Text>
          <Text style={styles.statusDivider}>·</Text>
          <Text style={styles.statusText}>{agent.turnCount || 0} turns</Text>
          {agent.cwd ? (
            <>
              <Text style={styles.statusDivider}>·</Text>
              <Text style={styles.cwdText} numberOfLines={1}>
                {agent.cwd}
              </Text>
            </>
          ) : null}
        </View>
        {agent.lastUserText ? (
          <View>
            <CardSectionHeader label="Last prompt" timestamp={agent.lastUserAt} />
            <Text style={styles.promptText} numberOfLines={2}>
              {agent.lastUserText}
            </Text>
          </View>
        ) : null}
        {agent.lastAssistantText ? (
          <View style={styles.responseBlock}>
            <CardSectionHeader label="Last response" timestamp={agent.lastAssistantAt} />
            <LinkedPathText
              text={agent.lastAssistantText}
              style={styles.answerText}
              numberOfLines={3}
              onOpenPath={onOpenFile}
            />
            <View style={styles.responseActions}>
              <ActionButton
                icon={<Maximize2 size={15} color={theme.colors.text} />}
                label="Open response"
                onPress={onViewResponse}
              />
              <ActionButton
                icon={
                  responseCopied ? (
                    <Check size={15} color={theme.colors.success} />
                  ) : (
                    <Copy size={15} color={theme.colors.text} />
                  )
                }
                label="Copy response"
                onPress={onCopyResponse}
              />
            </View>
          </View>
        ) : null}
        {!agent.lastUserText && !agent.lastAssistantText ? (
          <Text style={styles.answerText} numberOfLines={2}>
            {agentSubtitle(agent) || "No transcript yet."}
          </Text>
        ) : null}
        <View style={styles.cardActions}>
          <ActionButton icon={<Send size={15} color={theme.colors.text} />} label="Send" onPress={onSend} />
          <ActionButton icon={<Eye size={15} color={theme.colors.text} />} label="View" onPress={onView} />
          <ActionButton
            icon={<MessageSquareText size={15} color={theme.colors.text} />}
            label="Transcript"
            onPress={onTranscript}
          />
          <ActionButton icon={<Edit3 size={15} color={theme.colors.text} />} label="Rename" onPress={onRename} />
          <ActionButton icon={<Trash2 size={15} color={theme.colors.danger} />} label="Delete session" onPress={onDelete} />
        </View>
      </View>
    </Pressable>
  );
}

function CardSectionHeader({
  label,
  timestamp,
}: {
  label: string;
  timestamp?: string | null;
}) {
  const styles = useAppStyles();
  const relative = relativeTimeLabel(timestamp);
  return (
    <View style={styles.cardSectionHeader}>
      <Text style={styles.cardSectionLabel}>{label}</Text>
      {relative ? (
        <Text style={styles.cardSectionTime} accessibilityLabel={exactTimeLabel(timestamp)}>
          {relative}
        </Text>
      ) : null}
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useAppStyles();
  return (
    <Pressable
      accessibilityLabel={label}
      disabled={disabled}
      style={[styles.actionButton, disabled ? styles.disabledButton : null]}
      onPress={onPress}
    >
      {icon}
    </Pressable>
  );
}

function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  return (
    <Pressable accessibilityLabel={label} style={styles.iconButton} onPress={onPress}>
      {icon}
    </Pressable>
  );
}

function CommandMenu({
  visible,
  topOffset,
  onClose,
  onStartAgent,
  onPinnedArtifacts,
  onRefresh,
  onToggleTheme,
  themeMode,
  onSignOut,
}: {
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  onStartAgent: () => void;
  onPinnedArtifacts: () => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  themeMode: ThemeMode;
  onSignOut: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.menuLayer}>
        <Pressable accessibilityLabel="Close command menu" style={styles.menuBackdrop} onPress={onClose} />
        <View style={[styles.menuPanel, { marginTop: topOffset }]}>
          <MenuAction
            icon={<Play size={18} color={theme.colors.accent} />}
            label="Start agent"
            onPress={onStartAgent}
          />
          <MenuAction
            icon={<RefreshCcw size={18} color={theme.colors.text} />}
            label="Refresh"
            onPress={onRefresh}
          />
          <MenuAction
            icon={<FileText size={18} color={theme.colors.text} />}
            label="Pinned artifacts"
            onPress={onPinnedArtifacts}
          />
          <MenuAction
            icon={
              themeMode === "dark" ? (
                <Sun size={18} color={theme.colors.text} />
              ) : (
                <Moon size={18} color={theme.colors.text} />
              )
            }
            label={themeMode === "dark" ? "Light theme" : "Dark theme"}
            onPress={onToggleTheme}
          />
          <View style={styles.menuDivider} />
          <MenuAction
            icon={<LogOut size={18} color={theme.colors.danger} />}
            label="Sign out"
            danger
            onPress={onSignOut}
          />
        </View>
      </View>
    </Modal>
  );
}

function MenuAction({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const styles = useAppStyles();
  return (
    <Pressable style={styles.menuAction} onPress={onPress}>
      <View style={styles.menuActionIcon}>{icon}</View>
      <Text style={[styles.menuActionText, danger ? styles.menuActionTextDanger : null]}>{label}</Text>
    </Pressable>
  );
}

function VoiceWaveform() {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const bars = React.useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.35))).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        70,
        bars.map((bar, index) =>
          Animated.sequence([
            Animated.timing(bar, {
              toValue: index % 2 === 0 ? 1 : 0.78,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(bar, {
              toValue: 0.35,
              duration: 220,
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    animation.start();
    return () => {
      animation.stop();
      bars.forEach((bar) => bar.setValue(0.35));
    };
  }, [bars]);

  return (
    <View style={styles.voiceWaveform} pointerEvents="none">
      {bars.map((bar, index) => (
        <Animated.View
          key={index}
          style={[
            styles.voiceWaveformBar,
            {
              backgroundColor: theme.colors.accent,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function SendModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const sendText = useSendText();
  const sendKey = useSendKey();
  const uploadFile = useUploadFile();
  const [text, setText] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [uploadPickerVisible, setUploadPickerVisible] = React.useState(false);
  const [recognizing, setRecognizing] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [sendError, setSendError] = React.useState("");
  const [retryAction, setRetryAction] = React.useState<SendRetryAction | null>(null);
  const voiceResultRef = React.useRef("");
  const targetWindowName = target?.windowName?.trim() || "";
  const targetSessionName = target?.sessionName?.trim() || "";
  const sendSheetTitle = targetWindowName || targetSessionName || "Send to pane";
  const sendSheetMeta = target
    ? [
        "Send to pane",
        targetSessionName && targetSessionName !== sendSheetTitle ? targetSessionName : "",
        target.machineHostname || agentMachineKey(target),
        target.cwd || "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  React.useEffect(() => {
    if (target) {
      setText("");
      setStatus("");
      setSendError("");
      setRetryAction(null);
    }
  }, [target]);

  const clearSendFailure = React.useCallback(() => {
    setSendError("");
    setRetryAction(null);
  }, []);

  const appendText = React.useCallback((value: string) => {
    clearSendFailure();
    setText((current) => {
      if (!current) return value;
      return /\s$/.test(current) ? `${current}${value}` : `${current} ${value}`;
    });
  }, [clearSendFailure]);

  useSpeechRecognitionEvent("start", () => {
    setRecognizing(true);
    setStatus("Listening...");
  });

  useSpeechRecognitionEvent("end", () => {
    setRecognizing(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!event.isFinal) return;
    const transcript = event.results[0]?.transcript.trim();
    if (!transcript || transcript === voiceResultRef.current) return;
    voiceResultRef.current = transcript;
    appendText(transcript);
    setStatus("Voice added");
    void Haptics.selectionAsync();
  });

  useSpeechRecognitionEvent("error", (event) => {
    setRecognizing(false);
    setStatus(event.message || `Voice input failed: ${event.error}`);
  });

  const toggleVoiceInput = React.useCallback(async () => {
    if (recognizing) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    setStatus("");
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setStatus("Voice input is not available on this device");
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus("Voice permission denied");
      return;
    }
    voiceResultRef.current = "";
    ExpoSpeechRecognitionModule.start({
      lang: "zh-CN",
      interimResults: false,
      maxAlternatives: 1,
      continuous: false,
      addsPunctuation: true,
      contextualStrings: ["AMUX", "Codex", "Claude", "tmux", "terminal", "session", "agent"],
    });
  }, [recognizing]);

  const uploadAssets = React.useCallback(async (
    assets: Array<{ uri: string; name?: string | null; mimeType?: string | null }>,
    label: string,
  ) => {
    if (!target) return;
    if (assets.length === 0) return;
    setUploading(true);
    setUploadPickerVisible(false);
    setStatus(assets.length === 1 ? `Uploading ${label}...` : `Uploading ${assets.length} ${label}s...`);
    try {
      let count = 0;
      for (const asset of assets) {
        const fallbackName = asset.uri.split("/").pop() || `upload-${Date.now()}`;
        const uploaded = await uploadFile.mutateAsync({
          agent: target,
          file: {
            uri: asset.uri,
            name: asset.name || fallbackName,
            type: asset.mimeType || "application/octet-stream",
          },
        });
        if (uploaded.path) {
          appendText(uploaded.path);
          count += 1;
        }
      }
      setStatus(count === 1 ? `${label[0].toUpperCase()}${label.slice(1)} uploaded` : `${count} ${label}s uploaded`);
      void Haptics.selectionAsync();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }, [appendText, target, uploadFile]);

  const pickImages = React.useCallback(async () => {
    setStatus("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus("Photos permission denied");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    await uploadAssets(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || asset.uri.split("/").pop() || `image-${Date.now()}.jpg`,
        mimeType: asset.mimeType || "image/jpeg",
      })),
      "image",
    );
  }, [uploadAssets]);

  const pickFiles = React.useCallback(async () => {
    setStatus("");
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: "*/*",
    });
    if (result.canceled || result.assets.length === 0) return;
    await uploadAssets(
      result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name || asset.uri.split("/").pop() || `upload-${Date.now()}`,
        mimeType: asset.mimeType || "application/octet-stream",
      })),
      "file",
    );
  }, [uploadAssets]);

  const sendTerminalKey = React.useCallback(
    (entry: TerminalKeyEntry) => {
      if (!target) return;
      const label = entry.label;
      clearSendFailure();
      setStatus(`Sending ${label}...`);
      if ("command" in entry) {
        sendText.mutate(
          { agent: target, text: entry.command, enter: true },
          {
            onSuccess: () => setStatus(`Sent ${label}`),
            onError: (error) => {
              setStatus(`Failed ${label}`);
              setSendError(error.message);
              setRetryAction({ kind: "terminal", label: `Retry ${label}`, entry });
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          },
        );
      } else {
        sendKey.mutate(
          { agent: target, key: entry.key },
          {
            onSuccess: () => setStatus(`Sent ${label}`),
            onError: (error) => {
              setStatus(`Failed ${label}`);
              setSendError(error.message);
              setRetryAction({ kind: "terminal", label: `Retry ${label}`, entry });
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          },
        );
      }
      void Haptics.selectionAsync();
    },
    [clearSendFailure, sendKey, sendText, target],
  );

  const sendCurrentText = React.useCallback(() => {
    const value = text.trim();
    if (!target || sendText.isPending || !value) return;
    clearSendFailure();
    setStatus("Sending...");
    sendText.mutate(
      { agent: target, text: value, enter: false },
      {
        onSuccess: () => onClose(),
        onError: (error) => {
          setStatus("Send failed");
          setSendError(error.message);
          setRetryAction({ kind: "text", label: "Retry send" });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }, [clearSendFailure, onClose, sendText, target, text]);

  const retrySend = React.useCallback(() => {
    if (!retryAction) return;
    if (retryAction.kind === "terminal") {
      sendTerminalKey(retryAction.entry);
      return;
    }
    sendCurrentText();
  }, [retryAction, sendCurrentText, sendTerminalKey]);

  return (
    <SheetModal visible={Boolean(target)} title={sendSheetTitle} onClose={onClose}>
      <Text style={styles.sheetMeta} numberOfLines={2}>
        {sendSheetMeta}
      </Text>
      <View style={styles.shortcutRow}>
        {PROMPT_SHORTCUTS.map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcutChip} onPress={() => appendText(shortcut.text)}>
            <Text style={styles.shortcutText}>{shortcut.label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.shortcutChip, text.length === 0 ? styles.disabledButton : null]}
          disabled={text.length === 0}
          onPress={() => {
            setText("");
            setStatus("");
            clearSendFailure();
            voiceResultRef.current = "";
            void Haptics.selectionAsync();
          }}
        >
          <Text style={styles.shortcutText}>Clear</Text>
        </Pressable>
      </View>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          clearSendFailure();
        }}
        multiline
        autoFocus
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={sendCurrentText}
        style={[styles.textArea, { minHeight: 132 }]}
        placeholder="Type a prompt, command, or note..."
        placeholderTextColor={theme.colors.textMuted}
      />
      <View style={styles.sendToolRow}>
        <Pressable
          style={[styles.toolButton, recognizing ? styles.toolButtonActive : null]}
          disabled={!target}
          onPress={() => {
            toggleVoiceInput().catch((error) => {
              setRecognizing(false);
              setStatus(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          {recognizing ? (
            <MicOff size={16} color={theme.colors.accent} />
          ) : (
            <Mic size={16} color={theme.colors.text} />
          )}
          {recognizing ? <VoiceWaveform /> : null}
          <Text style={[styles.toolButtonText, recognizing ? styles.toolButtonTextActive : null]}>
            {recognizing ? "Stop" : "Voice"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.toolButton, uploading ? styles.disabledButton : null]}
          disabled={uploading || !target}
          onPress={() => {
            setUploadPickerVisible(true);
          }}
        >
          {uploading ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <Upload size={16} color={theme.colors.text} />
          )}
          <Text style={styles.toolButtonText}>Upload</Text>
        </Pressable>
        <Text style={styles.sendStatus} numberOfLines={1}>
          {status || sendError || sendKey.error?.message || uploadFile.error?.message || ""}
        </Text>
      </View>
      {sendError ? (
        <View style={styles.retryRow}>
          <Text style={styles.retryErrorText} numberOfLines={2}>
            {sendError}
          </Text>
          <Pressable
            style={[styles.retryButton, retryAction?.kind === "text" && !text.trim() ? styles.disabledButton : null]}
            disabled={!retryAction || sendText.isPending || sendKey.isPending || (retryAction.kind === "text" && !text.trim())}
            onPress={retrySend}
          >
            <RefreshCcw size={14} color={theme.colors.surfaceRaised} />
            <Text style={styles.retryButtonText}>{retryAction?.label || "Retry"}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.keyGrid}>
        {TERMINAL_KEYS.map((entry) => (
          <Pressable
            key={entry.label}
            style={[styles.keyButton, "danger" in entry && entry.danger ? styles.keyButtonDanger : null]}
            disabled={!target || sendKey.isPending}
            onPress={() => sendTerminalKey(entry)}
          >
            <Text style={[styles.keyButtonText, "danger" in entry && entry.danger ? styles.keyButtonTextDanger : null]}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        style={[styles.primaryButton, sendText.isPending || !text.trim() ? styles.disabledButton : null]}
        disabled={!target || sendText.isPending || !text.trim()}
        onPress={sendCurrentText}
      >
        {sendText.isPending ? <ActivityIndicator color={theme.colors.surfaceRaised} /> : <Text style={styles.primaryButtonText}>Send</Text>}
      </Pressable>
      <SheetModal visible={uploadPickerVisible} title="Upload" onClose={() => setUploadPickerVisible(false)}>
        <Pressable
          style={[styles.uploadChoiceButton, uploading ? styles.disabledButton : null]}
          disabled={uploading || !target}
          onPress={() => {
            pickImages().catch((error) => {
              setUploadPickerVisible(false);
              setStatus(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          <View style={styles.uploadChoiceIcon}>
            <ImagePlus size={20} color={theme.colors.text} />
          </View>
          <View style={styles.uploadChoiceTextBlock}>
            <Text style={styles.uploadChoiceTitle}>Image</Text>
            <Text style={styles.uploadChoiceSubtitle}>Choose photos from the library</Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.uploadChoiceButton, uploading ? styles.disabledButton : null]}
          disabled={uploading || !target}
          onPress={() => {
            pickFiles().catch((error) => {
              setUploadPickerVisible(false);
              setStatus(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          <View style={styles.uploadChoiceIcon}>
            <FileText size={20} color={theme.colors.text} />
          </View>
          <View style={styles.uploadChoiceTextBlock}>
            <Text style={styles.uploadChoiceTitle}>File</Text>
            <Text style={styles.uploadChoiceSubtitle}>Choose documents or other files</Text>
          </View>
        </Pressable>
      </SheetModal>
    </SheetModal>
  );
}

function RenameModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const styles = useAppStyles();
  const rename = useRenameWindow();
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (target) setName(target.windowName || "");
  }, [target]);

  return (
    <SheetModal visible={Boolean(target)} title="Rename window" onClose={onClose}>
      <Text style={styles.sheetMeta} numberOfLines={2}>
        {target ? agentSubtitle(target) : ""}
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        numberOfLines={1}
        style={styles.textInput}
      />
      <Pressable
        style={[styles.primaryButton, rename.isPending ? styles.disabledButton : null]}
        disabled={!target || rename.isPending || !name.trim()}
        onPress={() => {
          if (!target) return;
          rename.mutate(
            { agent: target, name: name.trim() },
            {
              onSuccess: () => onClose(),
            },
          );
        }}
      >
        <Text style={styles.primaryButtonText}>Rename</Text>
      </Pressable>
      {rename.error ? <Text style={styles.errorText}>{rename.error.message}</Text> : null}
    </SheetModal>
  );
}

function WindowViewModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const { width: windowWidth } = useWindowDimensions();
  const api = useTmuxMobileApi();
  const sendText = useSendText();
  const sendKey = useSendKey();
  const paneTailScrollRef = React.useRef<ScrollView | null>(null);
  const pollingRef = React.useRef(false);
  const terminalInputRef = React.useRef("");
  const terminalDirectNativeTextRef = React.useRef("");
  const terminalDirectSendQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());
  const terminalRefreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalSuppressChangeRef = React.useRef(false);
  const terminalSuppressChangeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const terminalVoiceActiveRef = React.useRef(false);
  const terminalVoiceResultRef = React.useRef("");
  const [data, setData] = React.useState<WindowViewResponse | null>(null);
  const [terminalText, setTerminalText] = React.useState("");
  const [terminalInput, setTerminalInput] = React.useState("");
  const [terminalRecognizing, setTerminalRecognizing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const terminalUsesHardwareKeys = windowWidth >= 760;

  React.useEffect(() => {
    terminalInputRef.current = terminalInput;
  }, [terminalInput]);

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setTerminalText("");
    setTerminalInput("");
    terminalInputRef.current = "";
    terminalDirectNativeTextRef.current = "";
    terminalSuppressChangeRef.current = false;
    if (terminalVoiceActiveRef.current) {
      ExpoSpeechRecognitionModule.stop();
    }
    setTerminalRecognizing(false);
    terminalVoiceActiveRef.current = false;
    terminalVoiceResultRef.current = "";
    setError("");
    setStatus("");
    if (!api || (!target?.windowId && !target?.paneId)) return;
    setLoading(true);
    const machine = agentMachineKey(target);
    const load = target.windowId
      ? api.windowView(machine, target.windowId, TERMINAL_INITIAL_LINES).then((result) => {
          if (cancelled) return;
          setData(result);
          setTerminalText(result.capture?.text || "");
        })
      : api.capture(machine, target.paneId || "", "tail", TERMINAL_INITIAL_LINES).then((result) => {
          if (cancelled) return;
          setData(null);
          setTerminalText(result.text || "");
        });
    load
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, target]);

  React.useEffect(() => {
    return () => {
      if (terminalRefreshTimerRef.current) clearTimeout(terminalRefreshTimerRef.current);
      if (terminalSuppressChangeTimerRef.current) clearTimeout(terminalSuppressChangeTimerRef.current);
    };
  }, []);

  const machineId = target ? agentMachineKey(target) : "";
  const activePaneId = data?.capture?.paneId || data?.activePaneId || target?.paneId || "";
  const cwd =
    data?.panes?.find((pane) => pane.id === activePaneId)?.cwd ||
    data?.directories?.cwd ||
    target?.cwd ||
    "";
  const running = target?.waitingForInput ? "waiting" : target?.status || target?.turn || "";
  const meta = [running, target?.turnCount ? `${target.turnCount} turns` : "", cwd].filter(Boolean).join(" · ");

  const refreshCapture = React.useCallback(
    async (silent = false) => {
      if (!api || !target || !activePaneId) return;
      if (!silent) {
        setRefreshing(true);
        setStatus("Refreshing...");
      }
      try {
        const result = await api.capture(machineId, activePaneId, "tail", TERMINAL_REFRESH_LINES);
        setTerminalText(result.text || "");
        setError("");
        if (!silent) setStatus("Refreshed");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        if (!silent) setStatus("Refresh failed");
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [activePaneId, api, machineId, target],
  );

  const scheduleTerminalRefresh = React.useCallback(
    (delay = 160) => {
      if (terminalRefreshTimerRef.current) return;
      terminalRefreshTimerRef.current = setTimeout(() => {
        terminalRefreshTimerRef.current = null;
        refreshCapture(true).catch(() => {});
      }, delay);
    },
    [refreshCapture],
  );

  const enqueueTerminalDirectAction = React.useCallback(
    (label: string, action: () => Promise<unknown>) => {
      if (!target) return;
      terminalDirectSendQueueRef.current = terminalDirectSendQueueRef.current
        .catch(() => {})
        .then(action)
        .then(() => {
          setError("");
          scheduleTerminalRefresh();
        })
        .catch((err) => {
          setStatus(`${label} failed`);
          setError(err instanceof Error ? err.message : String(err));
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        });
    },
    [scheduleTerminalRefresh, target],
  );

  const sendTerminalDirectText = React.useCallback(
    (text: string) => {
      if (!api || !target || !activePaneId || !text) return;
      const machine = machineId;
      const pane = activePaneId;
      enqueueTerminalDirectAction("Keyboard input", () => api.sendText(machine, pane, text, false));
    },
    [activePaneId, api, enqueueTerminalDirectAction, machineId, target],
  );

  const sendTerminalDirectKey = React.useCallback(
    (key: string) => {
      if (!api || !target || !activePaneId || !key) return;
      const machine = machineId;
      const pane = activePaneId;
      enqueueTerminalDirectAction("Keyboard shortcut", () => api.sendKey(machine, pane, key));
    },
    [activePaneId, api, enqueueTerminalDirectAction, machineId, target],
  );

  const suppressNextTerminalTextChange = React.useCallback(() => {
    terminalSuppressChangeRef.current = true;
    if (terminalSuppressChangeTimerRef.current) clearTimeout(terminalSuppressChangeTimerRef.current);
    terminalSuppressChangeTimerRef.current = setTimeout(() => {
      terminalSuppressChangeRef.current = false;
      terminalSuppressChangeTimerRef.current = null;
    }, 80);
  }, []);

  const handleTerminalInputChange = React.useCallback(
    (value: string) => {
      if (terminalSuppressChangeRef.current) {
        terminalSuppressChangeRef.current = false;
        if (terminalSuppressChangeTimerRef.current) {
          clearTimeout(terminalSuppressChangeTimerRef.current);
          terminalSuppressChangeTimerRef.current = null;
        }
        setTerminalInput(terminalInputRef.current);
        return;
      }
      const current = terminalInputRef.current;
      if (!current && !value) {
        terminalDirectNativeTextRef.current = "";
        setTerminalInput("");
        return;
      }
      if (!current && value) {
        const previousNativeText = terminalDirectNativeTextRef.current;
        const directText = value.startsWith(previousNativeText)
          ? value.slice(previousNativeText.length)
          : value;
        terminalDirectNativeTextRef.current = value;
        sendTerminalDirectText(directText);
        setTerminalInput("");
        return;
      }
      terminalDirectNativeTextRef.current = "";
      setTerminalInput(value);
    },
    [sendTerminalDirectText],
  );

  const handleTerminalKeyPress = React.useCallback(
    (event: { nativeEvent: { key: string } }) => {
      const key = terminalKeyFromNativeKey(event.nativeEvent.key);
      if (!key || key === "Enter") return;
      if (key === "BSpace" && terminalInputRef.current) return;
      suppressNextTerminalTextChange();
      sendTerminalDirectKey(key);
    },
    [sendTerminalDirectKey, suppressNextTerminalTextChange],
  );

  React.useEffect(() => {
    if (!api || !target || !activePaneId) return;
    const intervalMs = target.status === "running" || target.waitingForInput
      ? TERMINAL_ACTIVE_REFRESH_MS
      : TERMINAL_IDLE_REFRESH_MS;
    const timer = setInterval(() => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      refreshCapture(true)
        .catch(() => {})
        .finally(() => {
          pollingRef.current = false;
        });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [activePaneId, api, refreshCapture, target]);

  const terminalNodes = React.useMemo(() => renderAnsiText(terminalText), [terminalText]);
  const scrollPaneTailToEnd = React.useCallback((animated = false) => {
    requestAnimationFrame(() => {
      paneTailScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  React.useEffect(() => {
    if (terminalText) scrollPaneTailToEnd(false);
  }, [scrollPaneTailToEnd, terminalText]);

  const copyTerminalOutput = React.useCallback(async () => {
    await Clipboard.setStringAsync(terminalText || "");
    setStatus("Output copied");
    void Haptics.selectionAsync();
  }, [terminalText]);

  const appendTerminalInput = React.useCallback((value: string) => {
    const next = String(value || "").trim();
    if (!next) return;
    setTerminalInput((current) => {
      if (!current) return next;
      return /\s$/.test(current) ? `${current}${next}` : `${current} ${next}`;
    });
  }, []);

  useSpeechRecognitionEvent("start", () => {
    if (!terminalVoiceActiveRef.current) return;
    setTerminalRecognizing(true);
    setStatus("Listening...");
  });

  useSpeechRecognitionEvent("end", () => {
    if (!terminalVoiceActiveRef.current) return;
    terminalVoiceActiveRef.current = false;
    setTerminalRecognizing(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!terminalVoiceActiveRef.current || !event.isFinal) return;
    const transcript = event.results[0]?.transcript.trim();
    if (!transcript || transcript === terminalVoiceResultRef.current) return;
    terminalVoiceResultRef.current = transcript;
    appendTerminalInput(transcript);
    setStatus("Voice added");
    void Haptics.selectionAsync();
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (!terminalVoiceActiveRef.current) return;
    terminalVoiceActiveRef.current = false;
    setTerminalRecognizing(false);
    setStatus(event.message || `Voice input failed: ${event.error}`);
  });

  const toggleTerminalVoice = React.useCallback(async () => {
    if (terminalRecognizing) {
      terminalVoiceActiveRef.current = false;
      ExpoSpeechRecognitionModule.stop();
      setTerminalRecognizing(false);
      setStatus("Voice stopped");
      return;
    }
    setStatus("");
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setStatus("Voice input is not available on this device");
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setStatus("Voice permission denied");
      return;
    }
    terminalVoiceActiveRef.current = true;
    terminalVoiceResultRef.current = "";
    ExpoSpeechRecognitionModule.start({
      lang: "zh-CN",
      interimResults: false,
      maxAlternatives: 1,
      continuous: false,
      addsPunctuation: true,
      contextualStrings: ["CJMUX", "AMUX", "Codex", "Claude", "tmux", "terminal", "session", "agent"],
    });
  }, [terminalRecognizing]);

  const afterTerminalSend = React.useCallback(() => {
    setError("");
    setStatus("Sent");
    setTimeout(() => {
      refreshCapture(true).catch(() => {});
    }, 220);
  }, [refreshCapture]);

  const sendTerminalInput = React.useCallback((options?: { submit?: boolean }) => {
    if (!target || sendText.isPending || sendKey.isPending) return;
    const submit = Boolean(options?.submit);
    const value = terminalInput;
    setStatus("Sending...");
    if (!value) {
      if (!submit) {
        setStatus("");
        return;
      }
      sendKey.mutate(
        { agent: target, key: "Enter" },
        {
          onSuccess: afterTerminalSend,
          onError: (err) => {
            setStatus("Send failed");
            setError(err.message);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          },
        },
      );
      return;
    }
    sendText.mutate(
      { agent: target, text: value, enter: submit },
      {
        onSuccess: () => {
          setTerminalInput("");
          afterTerminalSend();
        },
        onError: (err) => {
          setStatus("Send failed");
          setError(err.message);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }, [afterTerminalSend, sendKey, sendText, target, terminalInput]);

  const sendTerminalKey = React.useCallback(
    (entry: TerminalKeyEntry) => {
      if (!target || sendText.isPending || sendKey.isPending) return;
      if (entry.label === "Enter" && terminalInput) {
        sendTerminalInput({ submit: true });
        return;
      }
      setStatus(`Sending ${entry.label}...`);
      if ("command" in entry) {
        sendText.mutate(
          { agent: target, text: entry.command, enter: true },
          {
            onSuccess: afterTerminalSend,
            onError: (err) => {
              setStatus(`${entry.label} failed`);
              setError(err.message);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          },
        );
        return;
      }
      sendKey.mutate(
        { agent: target, key: entry.key },
        {
          onSuccess: afterTerminalSend,
          onError: (err) => {
            setStatus(`${entry.label} failed`);
            setError(err.message);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          },
        },
      );
    },
    [afterTerminalSend, sendKey, sendText, sendTerminalInput, target, terminalInput],
  );

  return (
    <SheetModal visible={Boolean(target)} title="Terminal" onClose={onClose} tall wide fullscreenOnWide>
      <View style={styles.terminalToolbar}>
        <View style={styles.terminalMetaBlock}>
          <Text style={styles.terminalTitleLine} numberOfLines={1}>
            {target ? agentTitle(target) : ""}
          </Text>
          <Text style={styles.sheetMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.terminalToolbarActions}>
          <ActionButton
            icon={refreshing ? <ActivityIndicator color={theme.colors.text} /> : <RefreshCcw size={15} color={theme.colors.text} />}
            label="Refresh terminal"
            disabled={!target || refreshing}
            onPress={() => {
              refreshCapture(false).catch(() => {});
            }}
          />
          <ActionButton
            icon={<Copy size={15} color={theme.colors.text} />}
            label="Copy terminal output"
            disabled={!terminalText}
            onPress={() => {
              copyTerminalOutput().catch(() => {});
            }}
          />
        </View>
      </View>
      {status ? <Text style={styles.terminalStatusLine} numberOfLines={1}>{status}</Text> : null}
      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView
        ref={paneTailScrollRef}
        style={styles.terminalBox}
        onContentSizeChange={() => scrollPaneTailToEnd(false)}
      >
        <Text style={styles.terminalText}>{terminalText ? terminalNodes : "No output."}</Text>
      </ScrollView>
      <View style={styles.terminalComposer}>
        <Pressable
          accessibilityLabel={terminalRecognizing ? "Stop terminal voice input" : "Start terminal voice input"}
          style={[styles.terminalVoiceButton, terminalRecognizing ? styles.terminalVoiceButtonActive : null]}
          disabled={!target}
          onPress={() => {
            toggleTerminalVoice().catch((err) => {
              terminalVoiceActiveRef.current = false;
              setTerminalRecognizing(false);
              setStatus(err instanceof Error ? err.message : String(err));
            });
          }}
        >
          {terminalRecognizing ? (
            <VoiceWaveform />
          ) : (
            <Mic size={17} color={theme.colors.text} />
          )}
        </Pressable>
        <TextInput
          value={terminalInput}
          onChangeText={handleTerminalInputChange}
          onKeyPress={handleTerminalKeyPress}
          autoFocus={terminalUsesHardwareKeys}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          showSoftInputOnFocus={!terminalUsesHardwareKeys}
          submitBehavior="submit"
          onSubmitEditing={() => sendTerminalInput()}
          style={styles.terminalInput}
          placeholder="Type and press Enter"
          placeholderTextColor={theme.colors.textMuted}
        />
        <Pressable
          accessibilityLabel="Send terminal input"
          style={[styles.terminalSendButton, sendText.isPending || sendKey.isPending ? styles.disabledButton : null]}
          disabled={!target || sendText.isPending || sendKey.isPending || !terminalInput.trim()}
          onPress={() => sendTerminalInput()}
        >
          {sendText.isPending || sendKey.isPending ? (
            <ActivityIndicator color={theme.colors.surfaceRaised} />
          ) : (
            <Send size={17} color={theme.colors.surfaceRaised} />
          )}
        </Pressable>
      </View>
      <View style={styles.terminalKeyGrid}>
        {TERMINAL_INPUT_KEYS.map((entry) => (
          <Pressable
            key={entry.label}
            style={[styles.terminalKeyButton, entry.danger ? styles.terminalKeyButtonDanger : null]}
            disabled={!target || sendText.isPending || sendKey.isPending}
            onPress={() => sendTerminalKey(entry)}
          >
            <Text style={[styles.terminalKeyText, entry.danger ? styles.terminalKeyTextDanger : null]}>
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SheetModal>
  );
}

function ResponseModal({
  target,
  copied,
  onCopy,
  onOpenFile,
  onClose,
}: {
  target: AgentSession | null;
  copied: boolean;
  onCopy: (agent: AgentSession) => void;
  onOpenFile: (agent: AgentSession, path: string) => void;
  onClose: () => void;
}) {
  const api = useTmuxMobileApi();
  const theme = useAppTheme();
  const styles = useAppStyles();
  const pinArtifact = usePinInlineArtifact();
  const [pinStatus, setPinStatus] = React.useState("");
  const text = target?.lastAssistantText || "";
  const markdownStyle = React.useMemo(() => createMarkdownStyles(theme), [theme]);
  const openAgentFile = React.useCallback(
    (path: string) => {
      if (!target) return;
      onOpenFile(target, path);
    },
    [onOpenFile, target],
  );
  const markdownRules = React.useMemo(
    () => createMarkdownPathRules(openAgentFile, { agent: target, selectable: true }),
    [openAgentFile, target],
  );
  const handleMarkdownLinkPress = React.useCallback(
    (url: string) => {
      const filePath = filePathFromLocalHref(url);
      if (filePath) {
        openAgentFile(filePath);
        return false;
      }
      Linking.openURL(url).catch(() => {});
      return false;
    },
    [openAgentFile],
  );
  React.useEffect(() => {
    setPinStatus("");
  }, [target]);

  const pinResponse = React.useCallback(() => {
    if (!api || !target || !text.trim() || pinArtifact.isPending) return;
    const machineId = agentMachineKey(target);
    const base = artifactSlugPart(target.windowName || target.kind || "response").slice(0, 60);
    const name = /\.[a-z0-9]+$/i.test(base) ? base : `${base}.md`;
    const sourceBase = artifactSlugPart(target.windowId || target.paneId || base, "window");
    setPinStatus("Pinning...");
    pinArtifact.mutate(
      {
        agent: target,
        text,
        name,
        sourcePath: `agent-response/${machineId}/${sourceBase}`,
      },
      {
        onSuccess: async (data) => {
          const link = api.url(data.pin.shareUrl).toString();
          try {
            await Clipboard.setStringAsync(link);
            setPinStatus("Pinned. Link copied.");
          } catch {
            setPinStatus(link);
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: (error) => {
          setPinStatus(error instanceof Error ? error.message : String(error));
        },
      },
    );
  }, [api, pinArtifact, target, text]);

  return (
    <SheetModal visible={Boolean(target)} title="Last response" onClose={onClose} tall wide>
      <View style={styles.responseSheetMetaRow}>
        <Text style={styles.sheetMeta} numberOfLines={1}>
          {target ? agentTitle(target) : ""}
        </Text>
        <View style={styles.responseHeaderActions}>
          <ActionButton
            icon={
              pinArtifact.isPending ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <Pin size={15} color={theme.colors.text} />
              )
            }
            label="Pin response as artifact"
            disabled={!target || !text.trim() || pinArtifact.isPending}
            onPress={pinResponse}
          />
          <ActionButton
            icon={
              copied ? (
                <Check size={15} color={theme.colors.success} />
              ) : (
                <Copy size={15} color={theme.colors.text} />
              )
            }
            label="Copy response"
            onPress={() => {
              if (target) onCopy(target);
            }}
          />
        </View>
      </View>
      {pinStatus ? <Text style={styles.sheetMeta} numberOfLines={1}>{pinStatus}</Text> : null}
      <ScrollView style={styles.responseFullBox}>
        <Markdown
          style={markdownStyle}
          rules={markdownRules}
          onLinkPress={handleMarkdownLinkPress}
        >
          {text || "No response."}
        </Markdown>
      </ScrollView>
    </SheetModal>
  );
}

function FilePreviewModal({
  target,
  onOpenPath,
  onClose,
}: {
  target: AgentFileTarget | null;
  onOpenPath: (path: string) => void;
  onClose: () => void;
}) {
  const api = useTmuxMobileApi();
  const theme = useAppTheme();
  const styles = useAppStyles();
  const pinFile = usePinFileArtifact();
  const [data, setData] = React.useState<AgentFileResponse | null>(null);
  const [error, setError] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const markdownStyle = React.useMemo(() => createMarkdownStyles(theme), [theme]);
  const markdownRules = React.useMemo(
    () =>
      createMarkdownPathRules((path) => {
        setStatus("");
        onOpenPath(path);
      }, { agent: target?.agent || null, basePath: target?.path || "", selectable: true }),
    [onOpenPath, target],
  );
  const handleMarkdownLinkPress = React.useCallback(
    (url: string) => {
      const filePath = filePathFromLocalHref(url, target?.path || "");
      if (filePath) {
        setStatus("");
        onOpenPath(filePath);
        return false;
      }
      Linking.openURL(url).catch(() => {});
      return false;
    },
    [onOpenPath, target],
  );

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    setStatus("");
    if (!api || !target?.agent.paneId) return;
    setLoading(true);
    api
      .file(agentMachineKey(target.agent), target.agent.paneId, target.path)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, target]);

  const canRenderText =
    Boolean(data) &&
    data?.kind !== "image" &&
    (/^text\//i.test(data?.contentType || "") || data?.kind === "markdown") &&
    Number(data?.size || 0) <= 5 * 1024 * 1024;
  const textContent = React.useMemo(() => {
    if (!data || !canRenderText) return "";
    return decodeBase64Utf8(data.base64);
  }, [canRenderText, data]);

  const copyPath = React.useCallback(async () => {
    if (!target) return;
    await Clipboard.setStringAsync(target.path);
    setStatus("Path copied.");
    void Haptics.selectionAsync();
  }, [target]);

  const openInBrowser = React.useCallback(() => {
    if (!api || !target) return;
    Linking.openURL(agentFileBrowserUrl(api, target.agent, target.path)).catch((err) => {
      setStatus(err instanceof Error ? err.message : String(err));
    });
  }, [api, target]);

  const pinCurrentFile = React.useCallback(() => {
    if (!api || !target || pinFile.isPending) return;
    setStatus("Pinning...");
    pinFile.mutate(
      { agent: target.agent, path: target.path },
      {
        onSuccess: async (result) => {
          const link = api.url(result.pin.shareUrl).toString();
          try {
            await Clipboard.setStringAsync(link);
            setStatus("Pinned. Link copied.");
          } catch {
            setStatus(link);
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: (err) => {
          setStatus(err instanceof Error ? err.message : String(err));
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        },
      },
    );
  }, [api, pinFile, target]);

  const meta = [
    data?.name || target?.path || "",
    data?.contentType || "",
    formatPinSize(data?.size),
    data?.truncated ? "truncated" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SheetModal visible={Boolean(target)} title="File" onClose={onClose} tall wide>
      <View style={styles.responseSheetMetaRow}>
        <Text style={styles.sheetMeta} numberOfLines={1}>
          {meta || target?.path || ""}
        </Text>
        <View style={styles.responseHeaderActions}>
          <ActionButton
            icon={
              pinFile.isPending ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <Pin size={15} color={theme.colors.text} />
              )
            }
            label="Pin file as artifact"
            disabled={!target || !data || data.truncated || pinFile.isPending}
            onPress={pinCurrentFile}
          />
          <ActionButton
            icon={<ExternalLink size={15} color={theme.colors.text} />}
            label="Open in browser"
            disabled={!target}
            onPress={openInBrowser}
          />
          <ActionButton
            icon={<Copy size={15} color={theme.colors.text} />}
            label="Copy path"
            disabled={!target}
            onPress={() => {
              copyPath().catch(() => {});
            }}
          />
        </View>
      </View>
      {target?.path ? (
        <Text style={styles.filePathMeta} numberOfLines={2}>
          {target.path}
        </Text>
      ) : null}
      {status ? <Text style={styles.sheetMeta} numberOfLines={2}>{status}</Text> : null}
      {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {data?.kind === "image" ? (
        <View style={styles.fileImageFrame}>
          <Image
            source={{ uri: `data:${data.contentType};base64,${data.base64}` }}
            style={styles.fileImage}
            resizeMode="contain"
          />
        </View>
      ) : canRenderText ? (
        <ScrollView style={styles.responseFullBox}>
          {data?.kind === "markdown" ? (
            <Markdown
              style={markdownStyle}
              rules={markdownRules}
              onLinkPress={handleMarkdownLinkPress}
            >
              {textContent || "(empty file)"}
            </Markdown>
          ) : (
            <Text selectable style={styles.terminalText}>{textContent || "(empty file)"}</Text>
          )}
        </ScrollView>
      ) : !loading && !error ? (
        <View style={styles.fileUnsupportedBox}>
          <Text style={styles.emptyTitle}>Preview unavailable</Text>
          <Text style={styles.emptyText}>
            Open it in the browser, or pin it as a shareable artifact.
          </Text>
        </View>
      ) : null}
    </SheetModal>
  );
}

function TranscriptModal({
  target,
  onOpenFile,
  onClose,
}: {
  target: AgentSession | null;
  onOpenFile: (agent: AgentSession, path: string) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const api = useTmuxMobileApi();
  const [data, setData] = React.useState<AgentTranscriptResponse | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const markdownStyle = React.useMemo(() => createMarkdownStyles(theme), [theme]);
  const openTranscriptFile = React.useCallback(
    (path: string) => {
      if (target) onOpenFile(target, path);
    },
    [onOpenFile, target],
  );
  const markdownRules = React.useMemo(
    () => createMarkdownPathRules(openTranscriptFile, { agent: target, selectable: true }),
    [openTranscriptFile, target],
  );
  const handleMarkdownLinkPress = React.useCallback(
    (url: string) => {
      const filePath = filePathFromLocalHref(url);
      if (filePath) {
        openTranscriptFile(filePath);
        return false;
      }
      Linking.openURL(url).catch(() => {});
      return false;
    },
    [openTranscriptFile],
  );

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    if (!api || !target?.paneId) return;
    setLoading(true);
    api
      .transcript(agentMachineKey(target), target.paneId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, target]);

  const turns = data?.result?.turns || [];
  return (
    <SheetModal visible={Boolean(target)} title="Transcript" onClose={onClose} tall wide>
      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView style={styles.transcriptBox}>
        {turns.length === 0 ? <Text style={styles.sheetMeta}>No structured transcript.</Text> : null}
        {turns.map((turn, index) => (
          <View key={`${index}-${turn.role}`} style={styles.turnRow}>
            <Text style={styles.turnRole}>{turn.role || "turn"}</Text>
            {turn.role === "assistant" ? (
              <Markdown
                style={markdownStyle}
                rules={markdownRules}
                onLinkPress={handleMarkdownLinkPress}
              >
                {turn.text || ""}
              </Markdown>
            ) : (
              <LinkedPathText
                text={turn.text || ""}
                style={styles.turnText}
                selectable
                onOpenPath={openTranscriptFile}
              />
            )}
          </View>
        ))}
      </ScrollView>
    </SheetModal>
  );
}

function PinnedArtifactsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const api = useTmuxMobileApi();
  const theme = useAppTheme();
  const styles = useAppStyles();
  const pins = usePins(visible);
  const renamePin = useRenamePin();
  const deletePin = useDeletePin();
  const [status, setStatus] = React.useState("");
  const data = pins.data?.pins || [];
  const refetchPins = pins.refetch;

  React.useEffect(() => {
    if (visible) {
      setStatus("");
      void refetchPins();
    }
  }, [refetchPins, visible]);

  const absolutePinUrl = React.useCallback(
    (pin: ArtifactPin) => (api ? api.url(pin.shareUrl).toString() : pin.shareUrl),
    [api],
  );

  const openPin = React.useCallback(
    (pin: ArtifactPin) => {
      const url = absolutePinUrl(pin);
      Linking.openURL(url).catch((error) => {
        setStatus(error instanceof Error ? error.message : String(error));
      });
    },
    [absolutePinUrl],
  );

  const copyPinLink = React.useCallback(
    async (pin: ArtifactPin) => {
      const url = absolutePinUrl(pin);
      await Clipboard.setStringAsync(url);
      setStatus("Link copied");
      void Haptics.selectionAsync();
    },
    [absolutePinUrl],
  );

  const requestRenamePin = React.useCallback(
    (pin: ArtifactPin) => {
      if (!pin.owned) return;
      Alert.prompt(
        "Rename artifact",
        "",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Rename",
            onPress: (value?: string) => {
              const name = String(value || "").trim();
              if (!name || name === pin.name) return;
              renamePin.mutate(
                { id: pin.id, name },
                {
                  onSuccess: () => setStatus("Renamed"),
                  onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
                },
              );
            },
          },
        ],
        "plain-text",
        pin.name || "",
      );
    },
    [renamePin],
  );

  const confirmDeletePin = React.useCallback(
    (pin: ArtifactPin) => {
      if (!pin.owned) return;
      Alert.alert("Unpin artifact", `Remove "${pin.name || "this artifact"}" and its shared link?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unpin",
          style: "destructive",
          onPress: () => {
            deletePin.mutate(
              { id: pin.id },
              {
                onSuccess: () => setStatus("Unpinned"),
                onError: (error) => setStatus(error instanceof Error ? error.message : String(error)),
              },
            );
          },
        },
      ]);
    },
    [deletePin],
  );

  return (
    <SheetModal visible={visible} title="Pinned artifacts" onClose={onClose} tall wide>
      <View style={styles.responseSheetMetaRow}>
        <Text style={styles.sheetMeta} numberOfLines={1}>
          {pins.isLoading ? "Loading..." : `${data.length} pin${data.length === 1 ? "" : "s"}`}
        </Text>
        <ActionButton
          icon={<RefreshCcw size={15} color={theme.colors.text} />}
          label="Refresh artifacts"
          disabled={pins.isFetching}
          onPress={() => {
            void pins.refetch();
          }}
        />
      </View>
      {status || pins.error || renamePin.error || deletePin.error ? (
        <Text style={pins.error || renamePin.error || deletePin.error ? styles.errorText : styles.sheetMeta} numberOfLines={2}>
          {status ||
            pins.error?.message ||
            renamePin.error?.message ||
            deletePin.error?.message ||
            ""}
        </Text>
      ) : null}
      <FlatList
        data={data}
        style={styles.pinsViewport}
        keyExtractor={(pin) => pin.id}
        contentContainerStyle={[styles.pinsList, data.length === 0 ? styles.emptyList : null]}
        refreshControl={
          <RefreshControl
            refreshing={pins.isFetching}
            onRefresh={() => {
              void pins.refetch();
            }}
            tintColor={theme.colors.accent}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <FileText size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>No pinned artifacts</Text>
            <Text style={styles.emptyText}>Pin a response to create a shareable artifact.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ArtifactPinRow
            pin={item}
            busy={renamePin.isPending || deletePin.isPending}
            onOpen={() => openPin(item)}
            onCopy={() => {
              copyPinLink(item).catch((error) => {
                setStatus(error instanceof Error ? error.message : String(error));
              });
            }}
            onRename={() => requestRenamePin(item)}
            onDelete={() => confirmDeletePin(item)}
          />
        )}
      />
    </SheetModal>
  );
}

function ArtifactPinRow({
  pin,
  busy,
  onOpen,
  onCopy,
  onRename,
  onDelete,
}: {
  pin: ArtifactPin;
  busy: boolean;
  onOpen: () => void;
  onCopy: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const meta = [
    pin.version && pin.version > 1 ? `v${pin.version}` : "",
    formatPinSize(pin.size),
    formatPinAge(pin.createdAt),
    PIN_SCOPE_LABELS[pin.share?.scope || ""] || pin.share?.scope || "",
    !pin.owned && pin.ownerEmail ? `by ${pin.ownerEmail}` : "",
  ].filter(Boolean);
  const source =
    pin.preview ||
    (pin.sourcePath && !pin.sourcePath.startsWith("agent-response/") ? pin.sourcePath : "");

  return (
    <View style={styles.pinRow}>
      <Text style={styles.pinName} numberOfLines={2}>
        {pin.name || "(unnamed)"}
      </Text>
      {meta.length ? (
        <Text style={styles.pinMeta} numberOfLines={1}>
          {meta.join(" · ")}
        </Text>
      ) : null}
      {source ? (
        <Text style={styles.pinSource} numberOfLines={2}>
          {source}
        </Text>
      ) : null}
      <View style={styles.pinActions}>
        <ActionButton icon={<ExternalLink size={15} color={theme.colors.text} />} label="Open artifact" onPress={onOpen} />
        <ActionButton icon={<Link2 size={15} color={theme.colors.text} />} label="Copy artifact link" onPress={onCopy} />
        {pin.owned ? (
          <>
            <ActionButton
              icon={<Edit3 size={15} color={theme.colors.text} />}
              label="Rename artifact"
              disabled={busy}
              onPress={onRename}
            />
            <ActionButton
              icon={<Trash2 size={15} color={theme.colors.danger} />}
              label="Unpin artifact"
              disabled={busy}
              onPress={onDelete}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

function StartAgentModal({
  visible,
  machines,
  selectedAgent,
  onClose,
}: {
  visible: boolean;
  machines: Machine[];
  selectedAgent: AgentSession | null;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const startAgent = useStartAgent();
  const [machineId, setMachineId] = React.useState("");
  const [kind, setKind] = React.useState<"claude" | "codex">("codex");
  const [cwd, setCwd] = React.useState("~");
  const [mux, setMux] = React.useState("tmux");
  const [sessionName, setSessionName] = React.useState("");

  React.useEffect(() => {
    if (!visible) return;
    const selectedMachineId = selectedAgent ? agentMachineKey(selectedAgent) : machineKey(machines[0]);
    const machine = machines.find((item) => machineKey(item) === selectedMachineId) || machines[0];
    setMachineId(machine ? machineKey(machine) : "local");
    setKind(selectedAgent?.kind === "claude" ? "claude" : "codex");
    setCwd(selectedAgent?.cwd || machine?.agentCwd || machine?.homeDir || "~");
    setMux(selectedAgent?.mux || machine?.mux || machine?.muxes?.[0]?.mux || "tmux");
    setSessionName("");
  }, [machines, selectedAgent, visible]);

  return (
    <SheetModal visible={visible} title="Start agent" onClose={onClose}>
      <Text style={styles.inputLabel}>Agent</Text>
      <View style={styles.segmentRow}>
        <Segment active={kind === "codex"} label="Codex" onPress={() => setKind("codex")} />
        <Segment active={kind === "claude"} label="Claude" onPress={() => setKind("claude")} />
      </View>
      <Text style={styles.inputLabel}>Machine</Text>
      <ScrollView
        horizontal
        style={styles.machineStripViewport}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.machineStrip}
      >
        {machines.map((machine) => {
          const key = machineKey(machine);
          return (
            <Chip key={key} active={machineId === key} onPress={() => setMachineId(key)}>
              {machineLabel(machine)}
            </Chip>
          );
        })}
      </ScrollView>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Directory</Text>
        <TextInput value={cwd} onChangeText={setCwd} autoCapitalize="none" style={styles.textInput} />
      </View>
      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <Text style={styles.inputLabel}>Mux</Text>
          <TextInput value={mux} onChangeText={setMux} autoCapitalize="none" style={styles.textInput} />
        </View>
        <View style={styles.twoColItem}>
          <Text style={styles.inputLabel}>Session name</Text>
          <TextInput value={sessionName} onChangeText={setSessionName} autoCapitalize="none" style={styles.textInput} />
        </View>
      </View>
      <Pressable
        style={[styles.primaryButton, startAgent.isPending ? styles.disabledButton : null]}
        disabled={startAgent.isPending || !machineId || !cwd.trim()}
        onPress={() => {
          startAgent.mutate(
            {
              machineId,
              kind,
              cwd: cwd.trim(),
              mux: mux.trim() || "tmux",
              sessionName: sessionName.trim(),
            },
            {
              onSuccess: () => onClose(),
            },
          );
        }}
      >
        {startAgent.isPending ? (
          <ActivityIndicator color={theme.colors.surfaceRaised} />
        ) : (
          <Text style={styles.primaryButtonText}>Start</Text>
        )}
      </Pressable>
      {startAgent.error ? <Text style={styles.errorText}>{startAgent.error.message}</Text> : null}
    </SheetModal>
  );
}

function Segment({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  const styles = useAppStyles();
  return (
    <Pressable style={[styles.segment, active ? styles.segmentActive : null]} onPress={onPress}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function SheetModal({
  visible,
  title,
  children,
  onClose,
  tall,
  wide,
  fullscreenOnWide,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
  wide?: boolean;
  fullscreenOnWide?: boolean;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const dragY = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) dragY.setValue(0);
    else setKeyboardHeight(0);
  }, [dragY, visible]);

  React.useEffect(() => {
    if (!visible) return;
    const updateKeyboardHeight = (event: { endCoordinates?: { screenY?: number; height?: number } }) => {
      const screenY = Number(event.endCoordinates?.screenY ?? windowHeight);
      const frameHeight = Number(event.endCoordinates?.height ?? 0);
      const overlapHeight = Math.max(0, Math.min(windowHeight, windowHeight - screenY));
      const reportedHeight = Math.max(0, Math.min(windowHeight, frameHeight));
      const nextHeight = overlapHeight || reportedHeight;
      const implausibleWideFrame =
        windowWidth >= 760 && (screenY <= 0 || nextHeight > windowHeight * 0.58);
      setKeyboardHeight(implausibleWideFrame ? 0 : nextHeight);
    };
    const clearKeyboardHeight = () => setKeyboardHeight(0);
    const subscriptions =
      Platform.OS === "ios"
        ? [
            Keyboard.addListener("keyboardWillChangeFrame", updateKeyboardHeight),
            Keyboard.addListener("keyboardWillHide", clearKeyboardHeight),
          ]
        : [
            Keyboard.addListener("keyboardDidShow", updateKeyboardHeight),
            Keyboard.addListener("keyboardDidHide", clearKeyboardHeight),
          ];
    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, [visible, windowHeight, windowWidth]);

  const sheetGestureStyle = React.useMemo(
    () => ({
      transform: [
        {
          translateY: dragY.interpolate({
            inputRange: [0, 620],
            outputRange: [0, 620],
            extrapolate: "clamp",
          }),
        },
      ],
    }),
    [dragY],
  );

  const closeSheet = React.useCallback(() => {
    dragY.stopAnimation();
    dragY.setValue(0);
    onClose();
  }, [dragY, onClose]);

  const resetDrag = React.useCallback(() => {
    Animated.spring(dragY, {
      toValue: 0,
      damping: 18,
      stiffness: 190,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [dragY]);

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          gestureState.dy > 10 && Math.abs(gestureState.dx) < 36,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          gestureState.dy > 10 && Math.abs(gestureState.dx) < 36,
        onPanResponderGrant: () => {
          dragY.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          dragY.setValue(Math.max(0, gestureState.dy));
        },
        onPanResponderRelease: (_event, gestureState) => {
          const shouldDismiss = gestureState.dy > 86 || gestureState.vy > 0.76;
          if (shouldDismiss) {
            closeSheet();
            return;
          }
          resetDrag();
        },
        onPanResponderTerminate: resetDrag,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => false,
      }),
    [closeSheet, dragY, resetDrag],
  );

  const sheetIsWide = windowWidth >= 760;
  const keyboardAffectsSheet = !sheetIsWide || !tall;
  const keyboardOffset = visible && keyboardAffectsSheet ? keyboardHeight : 0;
  const keyboardGap = keyboardOffset > 0 ? 10 : 0;
  const fullscreenActive = Boolean(fullscreenOnWide && sheetIsWide);
  const availableSheetHeight = Math.max(
    220,
    windowHeight - keyboardOffset - keyboardGap - (fullscreenActive ? 0 : insets.top + 14),
  );
  const heightRatio = tall ? (wide && sheetIsWide ? 0.96 : sheetIsWide ? 0.9 : 0.94) : sheetIsWide ? 0.76 : 0.82;
  const maxSheetHeight = fullscreenActive ? availableSheetHeight : Math.min(windowHeight * heightRatio, availableSheetHeight);
  const sheetFrameStyle = {
    height: fullscreenActive || tall ? maxSheetHeight : undefined,
    maxHeight: maxSheetHeight,
    marginBottom: fullscreenActive ? keyboardOffset + keyboardGap : keyboardOffset + keyboardGap,
    paddingTop: fullscreenActive ? insets.top + 12 : undefined,
    paddingBottom: keyboardOffset > 0 ? 16 : insets.bottom + 16,
    borderTopLeftRadius: fullscreenActive ? 0 : undefined,
    borderTopRightRadius: fullscreenActive ? 0 : undefined,
    borderBottomLeftRadius: fullscreenActive ? 0 : keyboardOffset > 0 ? 18 : 0,
    borderBottomRightRadius: fullscreenActive ? 0 : keyboardOffset > 0 ? 18 : 0,
    backgroundColor: theme.colors.surface,
  };

  const body = tall ? (
    <View style={[styles.sheetBody, styles.sheetBodyTall, styles.sheetContent, styles.sheetContentTall]}>
      {children}
    </View>
  ) : (
    <KeyboardAwareScrollView
      style={styles.sheetBody}
      contentContainerStyle={[styles.sheetContent, styles.sheetContentKeyboard]}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
      extraKeyboardSpace={0}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardAwareScrollView>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.modalRoot}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityLabel="Dismiss sheet" style={styles.modalBackdropTouch} onPress={closeSheet} />
          <View
            pointerEvents="box-none"
            style={[styles.modalKeyboard, fullscreenActive ? styles.modalKeyboardFullscreen : null]}
          >
            <Animated.View
              style={[
                styles.sheet,
                wide ? styles.sheetWide : null,
                tall ? styles.sheetTall : null,
                fullscreenActive ? styles.sheetFullscreen : null,
                sheetFrameStyle,
                sheetGestureStyle,
              ]}
            >
              <View {...panResponder.panHandlers} style={styles.sheetGestureZone}>
                {fullscreenActive ? null : (
                  <View style={styles.sheetDragArea}>
                    <View style={styles.sheetGrabber} />
                  </View>
                )}
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Pressable style={styles.iconButton} onPress={closeSheet}>
                    <X size={18} color={theme.colors.text} />
                  </Pressable>
                </View>
              </View>
              {body}
            </Animated.View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createMarkdownStyles(theme: AppTheme) {
  const codeSurface = theme.dark ? "#141312" : "#f1efe6";
  const blockquoteSurface = theme.dark ? "#23211d" : "#f0eee4";
  return {
    body: {
      minWidth: 0,
      ...theme.typography.body,
      color: theme.colors.text,
    },
    text: {
      ...theme.typography.body,
      color: theme.colors.text,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: 10,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-start",
      width: "100%",
    },
    heading1: {
      ...theme.typography.title,
      color: theme.colors.text,
      marginTop: 2,
      marginBottom: 12,
    },
    heading2: {
      ...theme.typography.section,
      color: theme.colors.text,
      fontSize: 18,
      lineHeight: 24,
      marginTop: 10,
      marginBottom: 8,
    },
    heading3: {
      ...theme.typography.section,
      color: theme.colors.text,
      marginTop: 8,
      marginBottom: 6,
    },
    heading4: {
      ...theme.typography.section,
      color: theme.colors.text,
      marginTop: 6,
      marginBottom: 4,
    },
    heading5: {
      ...theme.typography.meta,
      color: theme.colors.text,
      marginTop: 6,
      marginBottom: 4,
    },
    heading6: {
      ...theme.typography.meta,
      color: theme.colors.textMuted,
      marginTop: 6,
      marginBottom: 4,
    },
    strong: {
      fontFamily: "Lato_700Bold",
      color: theme.colors.text,
    },
    em: {
      fontStyle: "italic",
      color: theme.colors.text,
    },
    link: {
      color: theme.colors.accent,
      textDecorationLine: "underline",
    },
    filePathLink: {
      color: theme.colors.accent,
      textDecorationLine: "underline",
    },
    blockquote: {
      width: "100%",
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.accent,
      backgroundColor: blockquoteSurface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginVertical: 8,
      borderRadius: theme.radii.md,
    },
    bullet_list: {
      marginBottom: 8,
    },
    ordered_list: {
      marginBottom: 8,
    },
    list_item: {
      flexDirection: "row",
      justifyContent: "flex-start",
      marginBottom: 4,
    },
    bullet_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: theme.colors.textMuted,
    },
    ordered_list_icon: {
      marginLeft: 4,
      marginRight: 8,
      color: theme.colors.textMuted,
    },
    bullet_list_content: {
      flex: 1,
      minWidth: 0,
    },
    ordered_list_content: {
      flex: 1,
      minWidth: 0,
    },
    code_inline: {
      ...theme.typography.mono,
      color: theme.colors.text,
      backgroundColor: codeSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.sm,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    code_block: {
      ...theme.typography.mono,
      width: "100%",
      color: theme.colors.text,
      backgroundColor: codeSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      padding: 10,
      marginVertical: 8,
    },
    fence: {
      ...theme.typography.mono,
      width: "100%",
      color: theme.colors.text,
      backgroundColor: codeSurface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      padding: 10,
      marginVertical: 8,
    },
    hr: {
      width: "100%",
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 12,
    },
    table: {
      width: "100%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      marginVertical: 8,
    },
    tr: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    th: {
      flex: 1,
      padding: 6,
      backgroundColor: blockquoteSurface,
    },
    td: {
      flex: 1,
      padding: 6,
    },
  } as const;
}

function createStyles(theme: AppTheme, layout: ResponsiveLayout = DEFAULT_LAYOUT) {
  const columnGap = layout.isWide ? 14 : 12;
  const listInnerWidth = Math.max(0, layout.contentMaxWidth - layout.gutter * 2);
  const cardGridMaxWidth =
    layout.listColumns > 1
      ? Math.floor((listInnerWidth - columnGap * (layout.listColumns - 1)) / layout.listColumns)
      : undefined;

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
	  header: {
	    width: "100%",
	    maxWidth: layout.contentMaxWidth,
	    alignSelf: "center",
	    paddingHorizontal: layout.gutter,
	    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  headerMeta: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
    marginLeft: 12,
  },
  iconButton: {
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
	  machineStripViewport: {
	    width: "100%",
	    maxWidth: layout.contentMaxWidth,
	    alignSelf: "center",
	    flexGrow: 0,
	    flexShrink: 0,
	    maxHeight: 50,
	  },
	  machineStrip: {
	    gap: 8,
	    paddingHorizontal: layout.gutter,
	    paddingVertical: 8,
    alignItems: "center",
    flexGrow: 0,
  },
	  chip: {
	    height: 34,
	    maxWidth: 220,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "center",
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  chipText: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    flexShrink: 1,
    minWidth: 0,
  },
	  chipTextActive: {
	    color: theme.colors.surfaceRaised,
	  },
	  machineChipContent: {
	    flexDirection: "row",
	    alignItems: "center",
	    gap: 6,
	    maxWidth: 196,
	    minWidth: 0,
	  },
	  machineChipWorkingDot: {
	    width: 7,
	    height: 7,
	    borderRadius: theme.radii.full,
	    backgroundColor: theme.colors.warning,
	    flexShrink: 0,
	  },
	  chipUnreadBadge: {
	    minWidth: 18,
	    height: 18,
	    paddingHorizontal: 5,
	    borderRadius: theme.radii.full,
	    backgroundColor: theme.colors.danger,
	    alignItems: "center",
	    justifyContent: "center",
	    flexShrink: 0,
	  },
	  chipUnreadText: {
	    fontFamily: "Lato_700Bold",
	    fontSize: 10,
	    lineHeight: 12,
	    color: theme.colors.surfaceRaised,
	  },
	  summaryRow: {
	    width: "100%",
	    maxWidth: layout.contentMaxWidth,
	    alignSelf: "center",
	    paddingHorizontal: layout.gutter,
    paddingTop: 2,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  primaryButton: {
    width: "100%",
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accent,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...theme.typography.section,
    color: theme.colors.surfaceRaised,
  },
  disabledButton: {
    opacity: 0.55,
  },
  countText: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
	  errorBox: {
	    width: "100%",
	    maxWidth: layout.contentMaxWidth - layout.gutter * 2,
	    alignSelf: "center",
	    marginVertical: 8,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: 12,
    backgroundColor: theme.colors.surface,
  },
  errorText: {
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.danger,
    marginTop: 8,
  },
	  listViewport: {
	    flex: 1,
	    width: "100%",
	    alignSelf: "stretch",
	  },
	  listContent: {
	    width: "100%",
	    maxWidth: layout.contentMaxWidth,
	    alignSelf: "center",
	    paddingHorizontal: layout.gutter,
	    paddingTop: 6,
	    gap: columnGap,
	  },
	  cardColumnWrapper: {
	    gap: columnGap,
	  },
	  cardGridItem: {
	    flex: 1,
	    minWidth: 0,
	    maxWidth: cardGridMaxWidth,
	  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyState: {
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    ...theme.typography.section,
    color: theme.colors.text,
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
	  card: {
	    position: "relative",
	    minWidth: 0,
	    borderRadius: theme.radii.xl,
	    backgroundColor: theme.colors.surfaceRaised,
	    borderWidth: 1,
	    borderColor: theme.colors.border,
	    padding: layout.cardPadding,
	    gap: 10,
	  },
	  cardRunning: {
	    borderColor: theme.dark ? "rgba(90, 150, 204, 0.42)" : "rgba(53, 89, 122, 0.42)",
	  },
	  cardSelected: {
	    borderColor: theme.colors.accent,
	  },
	  runningEdge: {
	    ...StyleSheet.absoluteFill,
	    borderRadius: theme.radii.xl,
	    overflow: "hidden",
	    zIndex: 1,
	  },
	  runningEdgeSegment: {
	    position: "absolute",
	    backgroundColor: theme.colors.accent,
	    opacity: 0.86,
	  },
	  runningEdgeHorizontal: {
	    left: 0,
	    height: 2,
	  },
	  runningEdgeVertical: {
	    top: 0,
	    width: 2,
	  },
	  starButton: {
	    position: "absolute",
	    left: layout.cardPadding,
	    top: layout.cardPadding,
    zIndex: 2,
    width: 38,
    height: 38,
    borderRadius: theme.radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  starButtonActive: {
    backgroundColor: theme.dark ? "#3a2f16" : "#fff7e0",
    borderColor: theme.colors.warning,
  },
  cardHeader: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    minHeight: 38,
    paddingLeft: 48,
    paddingRight: 2,
  },
  agentAvatar: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  agentIcon: {
    width: 22,
    height: 22,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    ...theme.typography.section,
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
  },
	  sessionPill: {
	    ...theme.typography.meta,
	    color: theme.colors.textMuted,
	    maxWidth: layout.sessionPillMaxWidth,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cardMeta: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardBody: {
    gap: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusRunning: {
    backgroundColor: theme.colors.warning,
  },
  statusWaiting: {
    backgroundColor: theme.colors.danger,
  },
  statusIdle: {
    backgroundColor: theme.colors.success,
  },
  statusUnknown: {
    backgroundColor: theme.colors.textMuted,
  },
  statusText: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  statusDivider: {
    ...theme.typography.meta,
    color: theme.colors.border,
  },
  cwdText: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    flex: 1,
    minWidth: 0,
  },
  cardSectionHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    marginBottom: 3,
  },
  cardSectionLabel: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    fontFamily: "Lato_700Bold",
    textTransform: "uppercase",
  },
  cardSectionTime: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    opacity: 0.72,
  },
  promptText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  responseBlock: {
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 10,
    gap: 8,
  },
	  answerText: {
	    ...theme.typography.body,
	    color: theme.colors.textMuted,
	  },
	  inlineFileLink: {
	    color: theme.colors.accent,
	    textDecorationLine: "underline",
	  },
	  responseActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  menuLayer: {
    flex: 1,
    alignItems: "flex-end",
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.08)",
  },
	  menuPanel: {
	    width: layout.menuWidth,
	    marginRight: layout.gutter,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingVertical: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  menuAction: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  menuActionIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  menuActionText: {
    ...theme.typography.section,
    color: theme.colors.text,
  },
  menuActionTextDanger: {
    color: theme.colors.danger,
  },
  menuDivider: {
    height: 1,
    marginVertical: 4,
    backgroundColor: theme.colors.border,
  },
	  loginScreen: {
	    flex: 1,
	    backgroundColor: theme.colors.background,
	    justifyContent: "center",
	    alignItems: "center",
	    paddingHorizontal: layout.gutter,
	  },
	  loginPanel: {
	    width: "100%",
	    maxWidth: 440,
	    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    gap: 14,
  },
  loginTitle: {
    ...theme.typography.title,
    color: theme.colors.text,
  },
  loginText: {
    ...theme.typography.body,
    color: theme.colors.textMuted,
  },
  loginButton: {
    width: "100%",
  },
  challengeBox: {
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
  },
  challengeLabel: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  challengeCode: {
    ...theme.typography.title,
    color: theme.colors.text,
    marginTop: 2,
  },
  inputGroup: {
    width: "100%",
    minWidth: 0,
    gap: 6,
  },
  inputLabel: {
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  textInput: {
    width: "100%",
    minWidth: 0,
    minHeight: 42,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...theme.typography.body,
  },
  textArea: {
    width: "100%",
    minWidth: 0,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    ...theme.typography.body,
  },
  shortcutRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  shortcutChip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    justifyContent: "center",
  },
  shortcutText: {
    ...theme.typography.meta,
    color: theme.colors.text,
  },
  sendToolRow: {
    width: "100%",
    minWidth: 0,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toolButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.dark ? "#162c3a" : "#e6f3ff",
  },
  toolButtonText: {
    ...theme.typography.meta,
    color: theme.colors.text,
  },
  toolButtonTextActive: {
    color: theme.colors.accent,
  },
  uploadChoiceButton: {
    width: "100%",
    minHeight: 62,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  uploadChoiceIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadChoiceTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  uploadChoiceTitle: {
    ...theme.typography.section,
    color: theme.colors.text,
  },
  uploadChoiceSubtitle: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  voiceWaveform: {
    height: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  voiceWaveformBar: {
    width: 3,
    height: 14,
    borderRadius: theme.radii.full,
  },
  sendStatus: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  retryRow: {
    width: "100%",
    minWidth: 0,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.dark ? "#321d1d" : "#fff0f0",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  retryErrorText: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.danger,
  },
  retryButton: {
    minHeight: 34,
    flexShrink: 0,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.danger,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  retryButtonText: {
    ...theme.typography.meta,
    fontFamily: "Lato_700Bold",
    color: theme.colors.surfaceRaised,
  },
  keyGrid: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keyButton: {
    minWidth: 46,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  keyButtonDanger: {
    borderColor: theme.colors.danger,
  },
  keyButtonText: {
    ...theme.typography.meta,
    color: theme.colors.text,
  },
  keyButtonTextDanger: {
    color: theme.colors.danger,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.36)",
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFill,
  },
  modalRoot: {
    flex: 1,
  },
	  modalKeyboard: {
	    flex: 1,
	    width: "100%",
	    paddingHorizontal: layout.isWide ? layout.gutter : 0,
	    justifyContent: "flex-end",
	  },
  modalKeyboardFullscreen: {
    paddingHorizontal: 0,
  },
	  sheet: {
	    width: "100%",
	    minWidth: 0,
	    maxWidth: layout.sheetMaxWidth,
    alignSelf: "center",
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  sheetWide: {
    maxWidth: layout.contentMaxWidth,
  },
  sheetFullscreen: {
    maxWidth: "100%",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  sheetTall: {
    height: "92%",
    maxHeight: "94%",
  },
  sheetGestureZone: {
    width: "100%",
    minWidth: 0,
  },
  sheetDragArea: {
    width: "100%",
    minWidth: 0,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -6,
    marginBottom: 2,
  },
  sheetGrabber: {
    width: 42,
    height: 4,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.border,
  },
  sheetHeader: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetTitle: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.section,
    color: theme.colors.text,
  },
  sheetMeta: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  sheetBody: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
    marginTop: 12,
  },
  sheetBodyTall: {
    flex: 1,
    minHeight: 0,
  },
  sheetContent: {
    width: "100%",
    minWidth: 0,
    gap: 12,
    paddingBottom: 4,
  },
  sheetContentKeyboard: {
    paddingBottom: 28,
  },
  sheetContentTall: {
    flexGrow: 1,
    minHeight: 0,
  },
  responseSheetMetaRow: {
    width: "100%",
    minWidth: 0,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  responseHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  responseFullBox: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: 12,
  },
	  responseFullText: {
	    minWidth: 0,
	    ...theme.typography.body,
	    color: theme.colors.text,
	  },
	  filePathMeta: {
	    minWidth: 0,
	    ...theme.typography.mono,
	    color: theme.colors.textMuted,
	  },
	  fileImageFrame: {
	    flex: 1,
	    minHeight: 0,
	    minWidth: 0,
	    borderRadius: theme.radii.lg,
	    borderWidth: 1,
	    borderColor: theme.colors.border,
	    backgroundColor: theme.colors.surfaceRaised,
	    overflow: "hidden",
	  },
	  fileImage: {
	    width: "100%",
	    height: "100%",
	  },
  fileUnsupportedBox: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
	    borderRadius: theme.radii.lg,
	    borderWidth: 1,
	    borderColor: theme.colors.border,
	    backgroundColor: theme.colors.surfaceRaised,
	    padding: 18,
	    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  markdownImageBlock: {
    width: "100%",
    minWidth: 0,
    minHeight: 180,
    maxHeight: 420,
    aspectRatio: 16 / 9,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    overflow: "hidden",
    marginVertical: 8,
  },
  markdownImage: {
    width: "100%",
    height: "100%",
    minHeight: 180,
  },
  markdownImagePlaceholder: {
    minHeight: 180,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  markdownImageLabel: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  markdownImageError: {
    ...theme.typography.meta,
    color: theme.colors.danger,
    textAlign: "center",
  },
  terminalToolbar: {
    width: "100%",
    minWidth: 0,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  terminalMetaBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  terminalTitleLine: {
    minWidth: 0,
    ...theme.typography.section,
    color: theme.colors.text,
  },
  terminalToolbarActions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  terminalStatusLine: {
    width: "100%",
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  terminalBox: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.dark ? "#0d0d0c" : "#272721",
    padding: 12,
  },
  terminalText: {
    minWidth: 0,
    ...theme.typography.mono,
    color: "#edece5",
  },
  terminalComposer: {
    width: "100%",
    minWidth: 0,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  terminalInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: 12,
    ...theme.typography.mono,
    color: theme.colors.text,
  },
  terminalVoiceButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalVoiceButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.dark ? "#162c3a" : "#e6f3ff",
  },
  terminalSendButton: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalKeyGrid: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  terminalKeyButton: {
    minWidth: 48,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalKeyButtonDanger: {
    borderColor: theme.colors.danger,
  },
  terminalKeyText: {
    ...theme.typography.meta,
    color: theme.colors.text,
  },
  terminalKeyTextDanger: {
    color: theme.colors.danger,
  },
  transcriptBox: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  pinsViewport: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  pinsList: {
    flexGrow: 1,
    gap: 10,
    paddingBottom: 4,
  },
  pinRow: {
    width: "100%",
    minWidth: 0,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: 12,
    gap: 5,
  },
  pinName: {
    minWidth: 0,
    ...theme.typography.section,
    color: theme.colors.text,
  },
  pinMeta: {
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  pinSource: {
    minWidth: 0,
    ...theme.typography.mono,
    color: theme.colors.textMuted,
  },
  pinActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },
  turnRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: 12,
    gap: 4,
  },
  turnRole: {
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.accent,
  },
  turnText: {
    minWidth: 0,
    ...theme.typography.body,
    color: theme.colors.text,
  },
  segmentRow: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceRaised,
  },
  segmentActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  segmentText: {
    minWidth: 0,
    ...theme.typography.section,
    color: theme.colors.text,
  },
  segmentTextActive: {
    color: theme.colors.surfaceRaised,
  },
  twoCol: {
    width: "100%",
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  twoColItem: {
    flex: 1,
    minWidth: 132,
    gap: 6,
  },
  });
}
