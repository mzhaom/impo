import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentMachineKey } from "./types";
import type { AgentSession, CardStarsResponse, PinsResponse } from "./types";
import type { UploadFileInput } from "./api";
import { useTmuxMobileApi } from "./auth";

export const commandCenterKey = ["command-center"] as const;
export const cardStarsKey = ["card-stars"] as const;
export const pinsKey = ["pins"] as const;

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

export function usePins(enabled = true) {
  const api = useTmuxMobileApi();
  return useQuery({
    queryKey: pinsKey,
    enabled: Boolean(api) && enabled,
    queryFn: async () => {
      if (!api) throw new Error("Not signed in");
      return api.pins();
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

export function useDeleteWindow() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent }: { agent: AgentSession }) => {
      if (!api) throw new Error("Not signed in");
      if (!agent.windowId) throw new Error("No window target");
      return api.deleteWindow(agentMachineKey(agent), agent.windowId);
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

export function useSendKey() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agent, key }: { agent: AgentSession; key: string }) => {
      if (!api) throw new Error("Not signed in");
      if (!agent.paneId) throw new Error("No pane target");
      return api.sendKey(agentMachineKey(agent), agent.paneId, key);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: commandCenterKey });
    },
  });
}

export function useUploadFile() {
  const api = useTmuxMobileApi();
  return useMutation({
    mutationFn: async ({ agent, file }: { agent: AgentSession; file: UploadFileInput }) => {
      if (!api) throw new Error("Not signed in");
      if (!agent.paneId) throw new Error("No pane target");
      return api.uploadFile(agentMachineKey(agent), agent.paneId, file);
    },
  });
}

export function usePinInlineArtifact() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      agent: AgentSession;
      text: string;
      name: string;
      sourcePath: string;
    }) => {
      if (!api) throw new Error("Not signed in");
      return api.pinInlineArtifact({
        machineId: agentMachineKey(input.agent),
        text: input.text,
        name: input.name,
        sourcePath: input.sourcePath,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: pinsKey });
    },
  });
}

export function useRenamePin() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!api) throw new Error("Not signed in");
      return api.renamePin(id, name);
    },
    onSuccess: (data) => {
      queryClient.setQueryData<PinsResponse | undefined>(pinsKey, (current) => {
        if (!current) return current;
        return {
          pins: current.pins.map((pin) => (pin.id === data.pin.id ? data.pin : pin)),
        };
      });
      void queryClient.invalidateQueries({ queryKey: pinsKey });
    },
  });
}

export function useDeletePin() {
  const api = useTmuxMobileApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!api) throw new Error("Not signed in");
      return api.deletePin(id);
    },
    onSuccess: (_data, input) => {
      queryClient.setQueryData<PinsResponse | undefined>(pinsKey, (current) => {
        if (!current) return current;
        return { pins: current.pins.filter((pin) => pin.id !== input.id) };
      });
      void queryClient.invalidateQueries({ queryKey: pinsKey });
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
