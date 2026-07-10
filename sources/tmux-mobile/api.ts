import Constants from "expo-constants";
import type {
  AgentTranscriptResponse,
  CardStarsResponse,
  CommandCenterResponse,
  DeviceLoginResult,
  DeviceLoginStart,
  WindowViewResponse,
} from "./types";

export interface UploadFileInput {
  uri: string;
  name: string;
  type?: string | null;
}

export interface UploadFileResponse {
  path?: string;
  name?: string;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status = 0, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function defaultControllerUrl(): string {
  const value = Constants.expoConfig?.extra?.tmuxMobileControllerUrl;
  return normalizeBaseUrl(typeof value === "string" ? value : "https://eng.impo.ai");
}

export function normalizeBaseUrl(value: string): string {
  let next = String(value || "https://eng.impo.ai").trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(next)) {
    const local = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(next);
    next = `${local ? "http" : "https"}://${next}`;
  }
  const url = new URL(next);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.origin;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  machineId?: string;
  headers?: Record<string, string>;
}

export class TmuxMobileApi {
  readonly baseUrl: string;
  readonly token: string;

  constructor(baseUrl = defaultControllerUrl(), token = "") {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
  }

  url(pathname: string): URL {
    return new URL(pathname, this.baseUrl);
  }

  async request<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(options.headers || {}),
    };
    const token = options.token ?? this.token;
    if (token) headers.authorization = `Bearer ${token}`;
    if (options.machineId && options.machineId !== "local") {
      headers["x-machine-id"] = options.machineId;
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      const isBlob = typeof Blob !== "undefined" && options.body instanceof Blob;
      const isArrayBuffer = options.body instanceof ArrayBuffer;
      if (
        typeof options.body === "string" ||
        options.body instanceof FormData ||
        isBlob ||
        isArrayBuffer
      ) {
        body = options.body as BodyInit;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify(options.body);
      }
    }

    let response: Response;
    try {
      response = await fetch(this.url(pathname), {
        method: options.method || (body === undefined ? "GET" : "POST"),
        headers,
        body,
      });
    } catch (error) {
      throw new ApiError(
        `Could not connect to ${this.baseUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => "");

    if (!response.ok) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error?: unknown }).error)
          : `HTTP ${response.status}`;
      throw new ApiError(message, response.status, data);
    }

    return data as T;
  }

  publicPost<T>(pathname: string, body: unknown): Promise<T> {
    return this.request<T>(pathname, { method: "POST", body, token: "" });
  }

  startDeviceLogin(): Promise<DeviceLoginStart> {
    return this.publicPost<DeviceLoginStart>("/auth/device/start", {});
  }

  pollDeviceLogin(id: string): Promise<DeviceLoginResult> {
    return this.publicPost<DeviceLoginResult>("/auth/device/poll", { id });
  }

  runtime(): Promise<{ mode: "local" | "hub" }> {
    return this.request("/api/runtime");
  }

  commandCenter(machineId?: string): Promise<CommandCenterResponse> {
    return this.request("/api/command-center", { machineId });
  }

  cardStars(): Promise<CardStarsResponse> {
    return this.request("/api/card-stars");
  }

  updateCardStars(keys: string[]): Promise<CardStarsResponse> {
    return this.request("/api/card-stars", {
      method: "PUT",
      body: { keys },
    });
  }

  renameWindow(machineId: string, windowId: string, name: string): Promise<unknown> {
    return this.request("/api/windows", {
      method: "PATCH",
      machineId,
      body: { windowId, name },
    });
  }

  deleteWindow(machineId: string, windowId: string): Promise<unknown> {
    return this.request("/api/windows", {
      method: "DELETE",
      machineId,
      body: { windowId },
    });
  }

  sendText(machineId: string, paneId: string, text: string, enter = true): Promise<unknown> {
    return this.request("/api/send", {
      method: "POST",
      machineId,
      body: { paneId, text, enter, submitNudge: enter },
    });
  }

  sendKey(machineId: string, paneId: string, key: string): Promise<unknown> {
    return this.request("/api/key", {
      method: "POST",
      machineId,
      body: { paneId, key },
    });
  }

  async uploadFile(
    machineId: string,
    paneId: string,
    file: UploadFileInput,
  ): Promise<UploadFileResponse> {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    const params = new URLSearchParams({
      paneId,
      name: file.name || "upload",
    });
    return this.request<UploadFileResponse>(`/api/upload?${params.toString()}`, {
      method: "POST",
      machineId,
      headers: {
        "content-type": file.type || blob.type || "application/octet-stream",
      },
      body: blob,
    });
  }

  windowView(machineId: string, windowId: string, lines = 120): Promise<WindowViewResponse> {
    const params = new URLSearchParams({ windowId, lines: String(lines) });
    return this.request(`/api/window-view?${params.toString()}`, { machineId });
  }

  transcript(machineId: string, paneId: string): Promise<AgentTranscriptResponse> {
    const params = new URLSearchParams({ paneId });
    return this.request(`/api/agent-transcript?${params.toString()}`, { machineId });
  }

  startAgent(input: {
    machineId: string;
    kind: "claude" | "codex";
    cwd: string;
    mux: string;
    sessionName?: string;
  }): Promise<unknown> {
    return this.request("/api/agent-sessions", {
      method: "POST",
      machineId: input.machineId,
      body: {
        kind: input.kind,
        cwd: input.cwd,
        mux: input.mux,
        sessionName: input.sessionName || "",
      },
    });
  }
}
