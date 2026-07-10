import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  useColorScheme,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { StatusBar } from "expo-status-bar";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardAvoidingView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { darkTheme, lightTheme } from "@/theme";
import type { AppTheme } from "@/theme";
import {
  Check,
  Copy,
  Edit3,
  Eye,
  ImagePlus,
  Laptop,
  LogOut,
  Maximize2,
  MessageSquareText,
  MoreVertical,
  Moon,
  Play,
  RefreshCcw,
  Send,
  Star,
  Sun,
  Terminal,
  Trash2,
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
  useDeleteWindow,
  useRenameWindow,
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
import type { AgentSession, Machine, WindowViewResponse, AgentTranscriptResponse } from "@/tmux-mobile/types";

const AGENT_ICONS: Record<string, number> = {
  claude: require("@/assets/images/icon-claude.png"),
  codex: require("@/assets/images/icon-gpt.png"),
  gemini: require("@/assets/images/icon-gemini.png"),
};

const EMPTY_MACHINES: Machine[] = [];
const EMPTY_AGENTS: AgentSession[] = [];
const THEME_MODE_KEY = "tmux-mobile.theme-mode";
type ThemeMode = "light" | "dark";
type AppStyles = ReturnType<typeof createStyles>;

const ThemeContext = React.createContext<AppTheme>(lightTheme);
const StylesContext = React.createContext<AppStyles>(createStyles(lightTheme));

const PROMPT_SHORTCUTS = [
  { label: "Yes", text: "yes" },
  { label: "Slash", text: "/" },
  { label: "Clear", text: "/clear" },
] as const;

const TERMINAL_KEYS = [
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

function compareRecentActivity(a: AgentSession, b: AgentSession): number {
  return activityTime(b) - activityTime(a);
}

export default function CommandCenterRoute() {
  return <CommandCenterScreen />;
}

function CommandCenterScreen() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
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
  const [transcriptTarget, setTranscriptTarget] = React.useState<AgentSession | null>(null);
  const [startVisible, setStartVisible] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState(false);
  const [selectedAgent, setSelectedAgent] = React.useState<AgentSession | null>(null);
  const appState = React.useRef(AppState.currentState);
  const copyResetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedResponseKey, setCopiedResponseKey] = React.useState("");
  const theme = themeMode === "dark" ? darkTheme : lightTheme;
  const styles = React.useMemo(() => createStyles(theme), [theme]);

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
        onChange={setMachineFilter}
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
        data={agents}
        keyExtractor={agentCardKey}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + 24 },
          agents.length === 0 ? styles.emptyList : null,
        ]}
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
              responseCopied={copiedResponseKey === key}
              onTranscript={() => {
                selectAgent();
                setTranscriptTarget(item);
              }}
            />
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
        onClose={() => setResponseTarget(null)}
      />
      <TranscriptModal target={transcriptTarget} onClose={() => setTranscriptTarget(null)} />
      <CommandMenu
        visible={menuVisible}
        topOffset={insets.top + 54}
        onClose={() => setMenuVisible(false)}
        onStartAgent={openStartAgent}
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
  onChange,
}: {
  machines: Machine[];
  active: string;
  onChange: (value: string) => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  return (
    <ScrollView
      horizontal
      style={styles.machineStripViewport}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.machineStrip}
    >
      <Chip active={active === "all"} onPress={() => onChange("all")}>
        All
      </Chip>
      {machines.map((machine) => {
        const key = machineKey(machine);
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
  responseCopied: boolean;
  onTranscript: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const icon = AGENT_ICONS[String(agent.kind || "").toLowerCase()];
  const status = agent.waitingForInput ? "waiting" : agent.status || agent.turn || "unverified";
  const statusStyle =
    status === "running"
      ? styles.statusRunning
      : status === "waiting"
        ? styles.statusWaiting
        : status === "idle"
          ? styles.statusIdle
          : styles.statusUnknown;

  return (
    <Pressable style={[styles.card, selected ? styles.cardSelected : null]} onPress={onSelect}>
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
          <Text style={styles.promptText} numberOfLines={2}>
            {agent.lastUserText}
          </Text>
        ) : null}
        {agent.lastAssistantText ? (
          <View style={styles.responseBlock}>
            <Text style={styles.answerText} numberOfLines={3}>
              {agent.lastAssistantText}
            </Text>
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

function ActionButton({
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
    <Pressable accessibilityLabel={label} style={styles.actionButton} onPress={onPress}>
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
  onRefresh,
  onToggleTheme,
  themeMode,
  onSignOut,
}: {
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  onStartAgent: () => void;
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

function SendModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const sendText = useSendText();
  const sendKey = useSendKey();
  const uploadFile = useUploadFile();
  const [text, setText] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    if (target) {
      setText("");
      setStatus("");
    }
  }, [target]);

  const appendText = React.useCallback((value: string) => {
    setText((current) => {
      if (!current) return value;
      return /\s$/.test(current) ? `${current}${value}` : `${current} ${value}`;
    });
  }, []);

  const pickImage = React.useCallback(async () => {
    if (!target) return;
    setStatus("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatus("Photo library permission denied");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    setUploading(true);
    setStatus(result.assets.length === 1 ? "Uploading image..." : `Uploading ${result.assets.length} images...`);
    try {
      let count = 0;
      for (const asset of result.assets) {
        const fallbackName = asset.uri.split("/").pop() || `image-${Date.now()}.jpg`;
        const uploaded = await uploadFile.mutateAsync({
          agent: target,
          file: {
            uri: asset.uri,
            name: asset.fileName || fallbackName,
            type: asset.mimeType || "image/jpeg",
          },
        });
        if (uploaded.path) {
          appendText(uploaded.path);
          count += 1;
        }
      }
      setStatus(count === 1 ? "Image uploaded" : `${count} images uploaded`);
      void Haptics.selectionAsync();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }, [appendText, target, uploadFile]);

  const sendTerminalKey = React.useCallback(
    (entry: (typeof TERMINAL_KEYS)[number]) => {
      if (!target) return;
      const label = entry.label;
      if ("command" in entry) {
        sendText.mutate(
          { agent: target, text: entry.command, enter: true },
          {
            onSuccess: () => setStatus(`Sent ${label}`),
            onError: (error) => setStatus(error.message),
          },
        );
      } else {
        sendKey.mutate(
          { agent: target, key: entry.key },
          {
            onSuccess: () => setStatus(`Sent ${label}`),
            onError: (error) => setStatus(error.message),
          },
        );
      }
      void Haptics.selectionAsync();
    },
    [sendKey, sendText, target],
  );

  const sendCurrentText = React.useCallback(() => {
    if (!target || sendText.isPending) return;
    sendText.mutate(
      { agent: target, text, enter: true },
      {
        onSuccess: () => onClose(),
      },
    );
  }, [onClose, sendText, target, text]);

  return (
    <SheetModal visible={Boolean(target)} title="Send to pane" onClose={onClose}>
      <Text style={styles.sheetMeta} numberOfLines={2}>
        {target ? agentTitle(target) : ""}
      </Text>
      <View style={styles.shortcutRow}>
        {PROMPT_SHORTCUTS.map((shortcut) => (
          <Pressable key={shortcut.label} style={styles.shortcutChip} onPress={() => appendText(shortcut.text)}>
            <Text style={styles.shortcutText}>{shortcut.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
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
          style={[styles.toolButton, uploading ? styles.disabledButton : null]}
          disabled={uploading || !target}
          onPress={() => {
            pickImage().catch((error) => {
              setStatus(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          {uploading ? (
            <ActivityIndicator color={theme.colors.text} />
          ) : (
            <ImagePlus size={16} color={theme.colors.text} />
          )}
          <Text style={styles.toolButtonText}>Image</Text>
        </Pressable>
        <Text style={styles.sendStatus} numberOfLines={1}>
          {status || sendKey.error?.message || uploadFile.error?.message || ""}
        </Text>
      </View>
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
        style={[styles.primaryButton, sendText.isPending ? styles.disabledButton : null]}
        disabled={!target || sendText.isPending}
        onPress={sendCurrentText}
      >
        {sendText.isPending ? <ActivityIndicator color={theme.colors.surfaceRaised} /> : <Text style={styles.primaryButtonText}>Send</Text>}
      </Pressable>
      {sendText.error ? <Text style={styles.errorText}>{sendText.error.message}</Text> : null}
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
  const styles = useAppStyles();
  const api = useTmuxMobileApi();
  const [data, setData] = React.useState<WindowViewResponse | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    if (!api || !target?.windowId) return;
    setLoading(true);
    api
      .windowView(agentMachineKey(target), target.windowId, 160)
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

  const terminalText = data?.capture.text || "No output.";
  const terminalNodes = React.useMemo(() => renderAnsiText(terminalText), [terminalText]);

  return (
    <SheetModal visible={Boolean(target)} title="Pane tail" onClose={onClose} tall>
      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView style={styles.terminalBox}>
        <Text style={styles.terminalText}>{terminalNodes}</Text>
      </ScrollView>
    </SheetModal>
  );
}

function ResponseModal({
  target,
  copied,
  onCopy,
  onClose,
}: {
  target: AgentSession | null;
  copied: boolean;
  onCopy: (agent: AgentSession) => void;
  onClose: () => void;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const text = target?.lastAssistantText || "";
  return (
    <SheetModal visible={Boolean(target)} title="Last response" onClose={onClose} tall>
      <View style={styles.responseSheetMetaRow}>
        <Text style={styles.sheetMeta} numberOfLines={1}>
          {target ? agentTitle(target) : ""}
        </Text>
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
      <ScrollView style={styles.responseFullBox}>
        <Text style={styles.responseFullText}>{text || "No response."}</Text>
      </ScrollView>
    </SheetModal>
  );
}

function TranscriptModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const styles = useAppStyles();
  const api = useTmuxMobileApi();
  const [data, setData] = React.useState<AgentTranscriptResponse | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

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
    <SheetModal visible={Boolean(target)} title="Transcript" onClose={onClose} tall>
      {loading ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ScrollView style={styles.transcriptBox}>
        {turns.length === 0 ? <Text style={styles.sheetMeta}>No structured transcript.</Text> : null}
        {turns.map((turn, index) => (
          <View key={`${index}-${turn.role}`} style={styles.turnRow}>
            <Text style={styles.turnRole}>{turn.role || "turn"}</Text>
            <Text style={styles.turnText}>{turn.text || ""}</Text>
          </View>
        ))}
      </ScrollView>
    </SheetModal>
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
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
}) {
  const theme = useAppTheme();
  const styles = useAppStyles();
  const insets = useSafeAreaInsets();
  const dragY = useSharedValue(0);

  React.useEffect(() => {
    if (visible) dragY.value = 0;
  }, [dragY, visible]);

  const sheetGestureStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, dragY.value) }],
  }));

  const dismissGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          dragY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          const shouldDismiss = event.translationY > 86 || event.velocityY > 760;
          if (shouldDismiss) {
            dragY.value = withTiming(620, { duration: 150 }, (finished) => {
              dragY.value = 0;
              if (finished) runOnJS(onClose)();
            });
            return;
          }
          dragY.value = withSpring(0, {
            damping: 18,
            stiffness: 190,
            mass: 0.8,
          });
        })
        .onFinalize(() => {
          if (dragY.value > 0 && dragY.value < 620) {
            dragY.value = withSpring(0, {
              damping: 18,
              stiffness: 190,
              mass: 0.8,
            });
          }
        }),
    [dragY, onClose],
  );

  const closeSheet = React.useCallback(() => {
    dragY.value = withTiming(620, { duration: 140 }, (finished) => {
      dragY.value = 0;
      if (finished) runOnJS(onClose)();
    });
  }, [dragY, onClose]);

  const body = tall ? (
    <View style={[styles.sheetBody, styles.sheetBodyTall, styles.sheetContent, styles.sheetContentTall]}>
      {children}
    </View>
  ) : (
    <KeyboardAwareScrollView
      style={styles.sheetBody}
      contentContainerStyle={styles.sheetContent}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      bottomOffset={insets.bottom + 24}
      extraKeyboardSpace={12}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardAwareScrollView>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.modalRoot}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            automaticOffset
            style={styles.modalKeyboard}
          >
            <Animated.View
              style={[
                styles.sheet,
                tall ? styles.sheetTall : null,
                { paddingBottom: insets.bottom + 16, backgroundColor: theme.colors.surface },
                sheetGestureStyle,
              ]}
            >
              <GestureDetector gesture={dismissGesture}>
                <View style={styles.sheetGestureZone}>
                  <View style={styles.sheetDragArea}>
                    <View style={styles.sheetGrabber} />
                  </View>
                  <View style={styles.sheetHeader}>
                    <Text style={styles.sheetTitle} numberOfLines={1}>
                      {title}
                    </Text>
                    <Pressable style={styles.iconButton} onPress={closeSheet}>
                      <X size={18} color={theme.colors.text} />
                    </Pressable>
                  </View>
                </View>
              </GestureDetector>
              {body}
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function createStyles(theme: AppTheme) {
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
    paddingHorizontal: 16,
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
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 50,
  },
  machineStrip: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: "center",
    flexGrow: 0,
  },
  chip: {
    height: 34,
    maxWidth: 188,
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
    maxWidth: 164,
    minWidth: 0,
  },
  summaryRow: {
    paddingHorizontal: 16,
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
    marginHorizontal: 16,
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
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
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
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 10,
  },
  cardSelected: {
    borderColor: theme.colors.accent,
  },
  starButton: {
    position: "absolute",
    left: 14,
    top: 14,
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
    maxWidth: 132,
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
    width: 226,
    marginRight: 12,
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
    paddingHorizontal: 18,
  },
  loginPanel: {
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
  toolButtonText: {
    ...theme.typography.meta,
    color: theme.colors.text,
  },
  sendStatus: {
    flex: 1,
    minWidth: 0,
    ...theme.typography.meta,
    color: theme.colors.textMuted,
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
  modalRoot: {
    flex: 1,
  },
  modalKeyboard: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    minWidth: 0,
    alignSelf: "stretch",
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
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
  transcriptBox: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
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
