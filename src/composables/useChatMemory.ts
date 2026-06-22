import { ref, watch, unref, type Ref } from "vue";
import {
  applyToolEnd as mergeToolEnd,
  upsertToolStart,
  type ChatMessage,
  type ToolEvent,
} from "@agent-flow/shared-ui";
import type { ChatMode } from "./useChatThreadMeta";

export interface ChatThreadMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  checkpointThreadId: string;
  titleSource?: "default" | "preview" | "auto" | "user";
  mode?: ChatMode;
  skills?: string[];
}

export type ChatMemoryScope =
  | { kind: "app" }
  | { kind: "free"; workflowId: Ref<string | null> | string }
  | { kind: "step"; workflowId: Ref<string | null> | string; stepId: Ref<string | null> | string };

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

function resolveScopeRef(v: Ref<string | null> | string): string | null {
  const val = unref(v);
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed || null;
}

function buildScopeQuery(scope: ChatMemoryScope): string | null {
  if (scope.kind === "app") return "scope=app";
  if (scope.kind === "free") {
    const workflowId = resolveScopeRef(scope.workflowId);
    if (!workflowId) return null;
    return `scope=free&workflowId=${encodeURIComponent(workflowId)}`;
  }
  const workflowId = resolveScopeRef(scope.workflowId);
  const stepId = resolveScopeRef(scope.stepId);
  if (!workflowId || !stepId) return null;
  return `scope=step&workflowId=${encodeURIComponent(workflowId)}&stepId=${encodeURIComponent(stepId)}`;
}

function buildCreateBody(
  scope: ChatMemoryScope,
  title?: string,
  extra?: { mode?: ChatMode; skills?: string[] },
): Record<string, unknown> | null {
  if (scope.kind === "app") {
    const body: Record<string, unknown> = { scope: "app" };
    if (title !== undefined) body.title = title;
    if (extra?.mode) body.mode = extra.mode;
    if (extra?.skills?.length) body.skills = extra.skills;
    return body;
  }
  if (scope.kind === "free") {
    const workflowId = resolveScopeRef(scope.workflowId);
    if (!workflowId) return null;
    const body: Record<string, unknown> = { scope: "free", workflowId };
    if (title !== undefined) body.title = title;
    return body;
  }
  const workflowId = resolveScopeRef(scope.workflowId);
  const stepId = resolveScopeRef(scope.stepId);
  if (!workflowId || !stepId) return null;
  const body: Record<string, unknown> = { scope: "step", workflowId, stepId };
  if (title !== undefined) body.title = title;
  return body;
}

function scopeWatchKey(scope: ChatMemoryScope): string {
  if (scope.kind === "app") return "app";
  if (scope.kind === "free") {
    return `free:${resolveScopeRef(scope.workflowId) ?? ""}`;
  }
  return `step:${resolveScopeRef(scope.workflowId) ?? ""}:${resolveScopeRef(scope.stepId) ?? ""}`;
}

export function useChatMemory(scope: ChatMemoryScope) {
  const threads = ref<ChatThreadMeta[]>([]);
  const activeThreadId = ref<string | null>(null);
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  let persistTimer: ReturnType<typeof setTimeout> | undefined;

  async function loadThreads(): Promise<void> {
    const query = buildScopeQuery(scope);
    if (!query) {
      threads.value = [];
      return;
    }

    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${await apiBase()}/v1/chat-memory/threads?${query}`);
      if (!res.ok) throw new Error(`loadThreads failed: ${res.status}`);
      const loadedThreads = (await res.json()) as ChatThreadMeta[];
      // Normalize skills to always be an array for all threads
      threads.value = loadedThreads.map(t => ({
        ...t,
        skills: t.skills ?? []
      }));
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  async function createThread(
    title?: string,
    extra?: { mode?: ChatMode; skills?: string[] },
  ): Promise<string> {
    const body = buildCreateBody(scope, title, extra);
    if (!body) throw new Error("invalid scope for createThread");

    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${await apiBase()}/v1/chat-memory/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`createThread failed: ${res.status}`);
      const meta = (await res.json()) as ChatThreadMeta;
      await loadThreads();
      await selectThread(meta.id);
      return meta.id;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function selectThread(id: string): Promise<ChatThreadMeta | null> {
    const query = buildScopeQuery(scope);
    if (!query) return null;

    activeThreadId.value = id;
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(
        `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}?${query}`,
      );
      if (!res.ok) throw new Error(`selectThread failed: ${res.status}`);
      const data = (await res.json()) as { meta: ChatThreadMeta; messages: ChatMessage[] };
      messages.value = data.messages;
      // Normalize skills to always be an array
      if (data.meta.skills == null) {
        data.meta.skills = [];
      }
      const idx = threads.value.findIndex((t) => t.id === id);
      if (idx >= 0) {
        threads.value[idx] = data.meta;
      }
      return data.meta;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      messages.value = [];
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function persistMessages(): Promise<void> {
    const id = activeThreadId.value;
    const query = buildScopeQuery(scope);
    if (!id || !query) return;

    const res = await fetch(
      `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}/messages?${query}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.value }),
      },
    );
    if (!res.ok) throw new Error(`persistMessages failed: ${res.status}`);
  }

  function schedulePersist(): void {
    if (!activeThreadId.value) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      void persistMessages().catch((err) => {
        error.value = err instanceof Error ? err.message : String(err);
      });
    }, 0);
  }

  async function updateThreadMeta(
    patch: Partial<Pick<ChatThreadMeta, "mode" | "skills">>,
  ): Promise<void> {
    const id = activeThreadId.value;
    const query = buildScopeQuery(scope);
    if (!id || !query) return;

    error.value = null;
    try {
      const res = await fetch(
        `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}?${query}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
      );
      if (!res.ok) throw new Error(`updateThreadMeta failed: ${res.status}`);
      const meta = (await res.json()) as ChatThreadMeta;
      // Normalize skills to always be an array
      if (meta.skills == null) {
        meta.skills = [];
      }
      const idx = threads.value.findIndex((t) => t.id === id);
      if (idx >= 0) threads.value[idx] = meta;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async function updateTitle(
    id: string,
    title: string,
    options?: { titleSource?: ChatThreadMeta["titleSource"] },
  ): Promise<void> {
    const query = buildScopeQuery(scope);
    if (!query) return;

    loading.value = true;
    error.value = null;
    try {
      const body: Record<string, string> = { title: title.slice(0, 60) };
      if (options?.titleSource) {
        body.titleSource = options.titleSource;
      }
      const res = await fetch(
        `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}?${query}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`updateTitle failed: ${res.status}`);
      const meta = (await res.json()) as ChatThreadMeta;
      // Normalize skills to always be an array
      if (meta.skills == null) {
        meta.skills = [];
      }
      const idx = threads.value.findIndex((t) => t.id === id);
      if (idx >= 0) threads.value[idx] = meta;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function postGenerateTitle(id: string): Promise<boolean> {
    const query = buildScopeQuery(scope);
    if (!query) return false;

    try {
      const res = await fetch(
        `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}/generate-title?${query}`,
        { method: "POST" },
      );
      if (!res.ok) return false;
      const meta = (await res.json()) as ChatThreadMeta;
      if (meta.skills == null) {
        meta.skills = [];
      }
      const idx = threads.value.findIndex((t) => t.id === id);
      if (idx >= 0) threads.value[idx] = meta;
      return true;
    } catch {
      return false;
    }
  }

  async function removeThread(id: string): Promise<void> {
    const query = buildScopeQuery(scope);
    if (!query) return;

    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(
        `${await apiBase()}/v1/chat-memory/threads/${encodeURIComponent(id)}?${query}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`removeThread failed: ${res.status}`);
      threads.value = threads.value.filter((t) => t.id !== id);
      if (activeThreadId.value === id) {
        activeThreadId.value = threads.value[0]?.id ?? null;
        messages.value = [];
        if (activeThreadId.value) {
          await selectThread(activeThreadId.value);
        }
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function ensureAssistantShell() {
    const last = messages.value[messages.value.length - 1];
    if (last?.role !== "assistant") {
      messages.value = [...messages.value, { role: "assistant", content: "", toolRuns: [] }];
    } else if (!last.toolRuns) {
      const idx = messages.value.length - 1;
      messages.value[idx] = { ...last, toolRuns: [] };
    }
  }

  function beginAssistantReply() {
    ensureAssistantShell();
  }

  function addUserMessage(content: string, attachments?: string[]) {
    messages.value.push({ role: "user", content, attachments });
    schedulePersist();
  }

  function applyToolStart(event: ToolEvent) {
    if (!event || typeof event !== "object") return;
    ensureAssistantShell();
    const idx = messages.value.length - 1;
    const last = messages.value[idx]!;
    messages.value[idx] = {
      ...last,
      toolRuns: upsertToolStart(last.toolRuns ?? [], event),
    };
    schedulePersist();
  }

  function applyToolEnd(event: ToolEvent) {
    if (!event || typeof event !== "object") return;
    ensureAssistantShell();
    const idx = messages.value.length - 1;
    const last = messages.value[idx]!;
    messages.value[idx] = {
      ...last,
      toolRuns: mergeToolEnd(last.toolRuns ?? [], event),
    };
    schedulePersist();
  }

  function addAssistantChunk(content: string, citations?: string[]) {
    ensureAssistantShell();
    const idx = messages.value.length - 1;
    const last = messages.value[idx]!;
    messages.value[idx] = {
      ...last,
      content: last.content + content,
      ...(citations ? { citations } : {}),
    };
    schedulePersist();
  }

  watch(
    () => scopeWatchKey(scope),
    () => {
      activeThreadId.value = null;
      messages.value = [];
      void loadThreads();
    },
    { immediate: true },
  );

  return {
    threads,
    activeThreadId,
    messages,
    loading,
    error,
    loadThreads,
    createThread,
    selectThread,
    persistMessages,
    updateTitle,
    postGenerateTitle,
    updateThreadMeta,
    removeThread,
    addUserMessage,
    beginAssistantReply,
    addAssistantChunk,
    applyToolStart,
    applyToolEnd,
  };
}
