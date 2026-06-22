import type { ChatMessage } from "@agent-flow/shared-ui";
import type { ChatMode } from "./useChatThreadMeta";

const THREADS_KEY = "desktop:threads";
const META_PREFIX = "desktop:thread-meta:";
const MESSAGES_PREFIX = "messages:";

interface LocalThread {
  id: string;
  title: string;
  updatedAt?: string;
}

interface LocalThreadMeta {
  mode: ChatMode;
  skills: string[];
}

export interface MigrateLocalChatDeps {
  fetchApiBase: () => Promise<string>;
  loadThreads: () => Promise<void>;
  getServerThreadCount: () => number;
  createThread: (
    title?: string,
    extra?: { mode?: ChatMode; skills?: string[] },
  ) => Promise<string>;
}

function readLocalThreads(): LocalThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is LocalThread =>
        t &&
        typeof t === "object" &&
        typeof t.id === "string" &&
        typeof t.title === "string",
    );
  } catch {
    return [];
  }
}

function readLocalMessages(threadId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${MESSAGES_PREFIX}${threadId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

function readLocalMeta(threadId: string): LocalThreadMeta {
  try {
    const raw = localStorage.getItem(`${META_PREFIX}${threadId}`);
    if (!raw) return { mode: "agent", skills: [] };
    const parsed = JSON.parse(raw) as Partial<LocalThreadMeta>;
    const mode =
      parsed.mode === "ask" || parsed.mode === "plan" || parsed.mode === "agent"
        ? parsed.mode
        : "agent";
    const skills = Array.isArray(parsed.skills)
      ? parsed.skills.filter((s): s is string => typeof s === "string")
      : [];
    return { mode, skills };
  } catch {
    return { mode: "agent", skills: [] };
  }
}

function clearLocalChatStorage(): void {
  localStorage.removeItem(THREADS_KEY);
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(MESSAGES_PREFIX) || key.startsWith(META_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

async function saveMessagesForThread(
  apiBase: string,
  threadId: string,
  messages: ChatMessage[],
): Promise<void> {
  const res = await fetch(
    `${apiBase}/v1/chat-memory/threads/${encodeURIComponent(threadId)}/messages?scope=app`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    },
  );
  if (!res.ok) {
    throw new Error(`migrate saveMessages failed: ${res.status}`);
  }
}

export async function migrateLocalChatIfNeeded(deps: MigrateLocalChatDeps): Promise<boolean> {
  await deps.loadThreads();
  if (deps.getServerThreadCount() > 0) return false;

  const localThreads = readLocalThreads();
  if (localThreads.length === 0) return false;

  const apiBase = await deps.fetchApiBase();

  for (const local of localThreads) {
    const meta = readLocalMeta(local.id);
    const messages = readLocalMessages(local.id);
    const threadId = await deps.createThread(local.title, {
      mode: meta.mode,
      skills: meta.skills.length ? meta.skills : undefined,
    });
    if (messages.length > 0) {
      await saveMessagesForThread(apiBase, threadId, messages);
    }
  }

  clearLocalChatStorage();
  await deps.loadThreads();
  return true;
}
