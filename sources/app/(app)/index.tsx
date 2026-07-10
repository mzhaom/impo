import * as React from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightTheme as theme } from "@/theme";
import {
  Check,
  Copy,
  Edit3,
  Eye,
  Laptop,
  LogOut,
  Maximize2,
  MessageSquareText,
  MoreVertical,
  Play,
  RefreshCcw,
  Send,
  Star,
  Terminal,
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
  useRenameWindow,
  useSendText,
  useStartAgent,
  useToggleCardStar,
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
  const auth = useTmuxMobileAuth();
  const queryClient = useQueryClient();
  const commandCenter = useCommandCenter();
  const cardStars = useCardStars();
  const toggleCardStar = useToggleCardStar();
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
    queryClient.invalidateQueries({ queryKey: commandCenterKey }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: cardStarsKey }).catch(() => {});
  }, [queryClient]);

  const signOut = React.useCallback(() => {
    setMenuVisible(false);
    void auth.signOut();
  }, [auth]);

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

  if (auth.loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!auth.session) {
    return <LoginScreen />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Tmux Mobile</Text>
          <Text style={styles.headerMeta} numberOfLines={1}>
            {auth.session.user.email || auth.baseUrl}
          </Text>
        </View>
        <View style={styles.headerButtons}>
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
          return (
            <AgentCard
              agent={item}
              starred={starred}
              onToggleStar={() => toggleStar(item)}
              onSelect={() => setSelectedAgent(item)}
              onSend={() => setSendTarget(item)}
              onRename={() => setRenameTarget(item)}
              onView={() => setViewTarget(item)}
              onViewResponse={() => setResponseTarget(item)}
              onCopyResponse={() => {
                copyAssistantResponse(item).catch(() => {});
              }}
              responseCopied={copiedResponseKey === key}
              onTranscript={() => setTranscriptTarget(item)}
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
        onSignOut={signOut}
      />
      <StartAgentModal
        visible={startVisible}
        machines={machines}
        selectedAgent={selectedAgent}
        onClose={() => setStartVisible(false)}
      />
    </View>
  );
}

function LoginScreen() {
  const insets = useSafeAreaInsets();
  const auth = useTmuxMobileAuth();
  const [url, setUrl] = React.useState(auth.baseUrl);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.loginScreen, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
    >
      <View style={styles.loginPanel}>
        <Terminal size={34} color={theme.colors.accent} />
        <Text style={styles.loginTitle}>Tmux Mobile</Text>
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
  return (
    <ScrollView
      horizontal
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
  return (
    <Pressable style={[styles.chip, active ? styles.chipActive : null]} onPress={onPress}>
      {typeof children === "string" ? (
        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

function AgentCard({
  agent,
  starred,
  onToggleStar,
  onSelect,
  onSend,
  onRename,
  onView,
  onViewResponse,
  onCopyResponse,
  responseCopied,
  onTranscript,
}: {
  agent: AgentSession;
  starred: boolean;
  onToggleStar: () => void;
  onSelect: () => void;
  onSend: () => void;
  onRename: () => void;
  onView: () => void;
  onViewResponse: () => void;
  onCopyResponse: () => void;
  responseCopied: boolean;
  onTranscript: () => void;
}) {
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
    <Pressable style={styles.card} onPress={onSelect}>
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
  onSignOut,
}: {
  visible: boolean;
  topOffset: number;
  onClose: () => void;
  onStartAgent: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
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
  return (
    <Pressable style={styles.menuAction} onPress={onPress}>
      <View style={styles.menuActionIcon}>{icon}</View>
      <Text style={[styles.menuActionText, danger ? styles.menuActionTextDanger : null]}>{label}</Text>
    </Pressable>
  );
}

function SendModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const sendText = useSendText();
  const [text, setText] = React.useState("");
  const [enter, setEnter] = React.useState(true);

  React.useEffect(() => {
    if (target) {
      setText("");
      setEnter(true);
    }
  }, [target]);

  return (
    <SheetModal visible={Boolean(target)} title="Send to pane" onClose={onClose}>
      <Text style={styles.sheetMeta}>{target ? agentTitle(target) : ""}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        style={[styles.textArea, { minHeight: 132 }]}
        placeholder="Type a prompt, command, or note..."
        placeholderTextColor={theme.colors.textMuted}
      />
      <Pressable style={styles.toggleRow} onPress={() => setEnter((value) => !value)}>
        <View style={[styles.checkbox, enter ? styles.checkboxActive : null]}>
          {enter ? <Check size={13} color={theme.colors.surfaceRaised} /> : null}
        </View>
        <Text style={styles.toggleText}>Press Enter after sending</Text>
      </Pressable>
      <Pressable
        style={[styles.primaryButton, sendText.isPending ? styles.disabledButton : null]}
        disabled={!target || sendText.isPending}
        onPress={() => {
          if (!target) return;
          sendText.mutate(
            { agent: target, text, enter },
            {
              onSuccess: () => onClose(),
            },
          );
        }}
      >
        {sendText.isPending ? <ActivityIndicator color={theme.colors.surfaceRaised} /> : <Text style={styles.primaryButtonText}>Send</Text>}
      </Pressable>
      {sendText.error ? <Text style={styles.errorText}>{sendText.error.message}</Text> : null}
    </SheetModal>
  );
}

function RenameModal({ target, onClose }: { target: AgentSession | null; onClose: () => void }) {
  const rename = useRenameWindow();
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (target) setName(target.windowName || "");
  }, [target]);

  return (
    <SheetModal visible={Boolean(target)} title="Rename window" onClose={onClose}>
      <Text style={styles.sheetMeta}>{target ? agentSubtitle(target) : ""}</Text>
      <TextInput value={name} onChangeText={setName} autoFocus style={styles.textInput} />
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.machineStrip}>
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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          style={styles.modalKeyboard}
        >
          <View
            style={[
              styles.sheet,
              tall ? styles.sheetTall : null,
              { paddingBottom: insets.bottom + 16, backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Pressable style={styles.iconButton} onPress={onClose}>
                <X size={18} color={theme.colors.text} />
              </Pressable>
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    width: 38,
    height: 38,
    borderRadius: theme.radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  machineStrip: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  chip: {
    minHeight: 34,
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
  },
  chipTextActive: {
    color: theme.colors.surfaceRaised,
  },
  machineChipContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
    backgroundColor: "#fff7e0",
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
    gap: 6,
  },
  inputLabel: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  textInput: {
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
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.36)",
  },
  modalKeyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 12,
  },
  sheetTall: {
    minHeight: "72%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetTitle: {
    ...theme.typography.section,
    color: theme.colors.text,
  },
  sheetMeta: {
    ...theme.typography.meta,
    color: theme.colors.textMuted,
  },
  responseSheetMetaRow: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  responseFullBox: {
    flex: 1,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceRaised,
    padding: 12,
  },
  responseFullText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  toggleRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  toggleText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  terminalBox: {
    flex: 1,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.dark ? "#0d0d0c" : "#272721",
    padding: 12,
  },
  terminalText: {
    ...theme.typography.mono,
    color: "#edece5",
  },
  transcriptBox: {
    flex: 1,
  },
  turnRow: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingVertical: 12,
    gap: 4,
  },
  turnRole: {
    ...theme.typography.meta,
    color: theme.colors.accent,
  },
  turnText: {
    ...theme.typography.body,
    color: theme.colors.text,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
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
    ...theme.typography.section,
    color: theme.colors.text,
  },
  segmentTextActive: {
    color: theme.colors.surfaceRaised,
  },
  twoCol: {
    flexDirection: "row",
    gap: 10,
  },
  twoColItem: {
    flex: 1,
    gap: 6,
  },
});
