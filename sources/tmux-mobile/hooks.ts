import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentMachineKey } from "./types";
import type { AgentSession, CardStarsResponse } from "./types";
import { useTmuxMobileApi } from "./auth";

export const commandCenterKey = ["command-center"] as const;
export const cardStarsKey = ["card-stars"] as const;

export function useCommandCenter() {
  const api = useTmuxMobileApi();
  return useQuery({
    queryKey: commandCenterKey,
    enabled: Boolean(api),
    queryFn: async () => {
      if (!api) throw new Error("Not signed in");
      return api.commandCenter();
    },
  });
}

export function useCardStars() {
  const api = useTmuxMobileApi();
  return useQuery({
    queryKey: cardStarsKey,
    enabled: Boolean(api),
    queryFn: async () => {
      if (!api) throw new Error("Not signed in");
      return api.cardStars();
    },
  });
}

export function useToggleCardStar() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keys }: { agent: AgentSession; keys: string[] }) => {
      if (!api) throw new Error("Not signed in");
      return api.updateCardStars(keys);
    },
    onMutate: async ({ keys }) => {
      await queryClient.cancelQueries({ queryKey: cardStarsKey });
      const previous = queryClient.getQueryData<CardStarsResponse>(cardStarsKey);
      const next = { keys, customized: true };
      queryClient.setQueryData<CardStarsResponse>(cardStarsKey, next);
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(cardStarsKey, context.previous);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(cardStarsKey, data);
    },
  });
}

export function useRenameWindow() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent, name }: { agent: AgentSession; name: string }) => {
      if (!api) throw new Error("Not signed in");
      if (!agent.windowId) throw new Error("No window target");
      return api.renameWindow(agentMachineKey(agent), agent.windowId, name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commandCenterKey });
    },
  });
}

export function useSendText() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agent,
      text,
      enter,
    }: {
      agent: AgentSession;
      text: string;
      enter: boolean;
    }) => {
      if (!api) throw new Error("Not signed in");
      if (!agent.paneId) throw new Error("No pane target");
      return api.sendText(agentMachineKey(agent), agent.paneId, text, enter);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commandCenterKey });
    },
  });
}

export function useStartAgent() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      machineId: string;
      kind: "claude" | "codex";
      cwd: string;
      mux: string;
      sessionName?: string;
    }) => {
      if (!api) throw new Error("Not signed in");
      return api.startAgent(input);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commandCenterKey });
    },
  });
}
