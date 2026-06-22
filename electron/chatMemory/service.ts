import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type {
  ChatMessage,
  ChatThreadMeta,
  CreateThreadInput,
  ThreadScope,
  TitleSource,
} from "./types";
import { metaPath, messagesPath, threadDir, threadsRoot } from "./paths";

type ScopedThread = ThreadScope & { threadId: string };

export function buildCheckpointThreadId(
  scope: ThreadScope,
  threadId: string,
  mode = "agent",
): string {
  switch (scope.scope) {
    case "app":
      return `app:${mode}:${threadId}`;
    case "free":
      return `free:${scope.workflowId}:${threadId}`;
    case "step":
      return `step:${scope.workflowId}:${scope.stepId}:${threadId}`;
  }
}

function scopeFromInput(input: CreateThreadInput): ThreadScope {
  if (input.scope === "app") {
    return { scope: "app" };
  }
  if (input.scope === "free") {
    return { scope: "free", workflowId: input.workflowId };
  }
  return { scope: "step", workflowId: input.workflowId, stepId: input.stepId };
}

function defaultTitle(): string {
  return "New Chat";
}

export function inferTitleSource(
  meta: Pick<ChatThreadMeta, "title" | "titleSource">,
): TitleSource {
  if (meta.titleSource) return meta.titleSource;
  return meta.title !== defaultTitle() ? "preview" : "default";
}

export function normalizeThreadMeta(meta: ChatThreadMeta): ChatThreadMeta {
  return { ...meta, titleSource: inferTitleSource(meta) };
}

export async function listThreads(
  projectRoot: string,
  scope: ThreadScope,
): Promise<ChatThreadMeta[]> {
  const root = threadsRoot(projectRoot, scope);
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch {
    return [];
  }

  const metas: ChatThreadMeta[] = [];
  for (const entry of entries) {
    try {
      const raw = await fs.readFile(
        metaPath(projectRoot, scope, entry),
        "utf8",
      );
      metas.push(normalizeThreadMeta(JSON.parse(raw) as ChatThreadMeta));
    } catch {
      // skip invalid thread directories
    }
  }

  return metas.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function createThread(
  projectRoot: string,
  input: CreateThreadInput,
): Promise<ChatThreadMeta> {
  const scope = scopeFromInput(input);
  const threadId = randomUUID();
  const now = new Date().toISOString();
  const mode = input.scope === "app" ? (input.mode ?? "agent") : undefined;

  const title = input.title ?? defaultTitle();
  const meta: ChatThreadMeta = {
    id: threadId,
    title,
    titleSource: title !== defaultTitle() ? "preview" : "default",
    createdAt: now,
    updatedAt: now,
    checkpointThreadId: buildCheckpointThreadId(scope, threadId, mode),
  };

  if (input.scope === "app") {
    meta.mode = mode;
    if (input.skills?.length) {
      meta.skills = [...input.skills];
    }
  }

  const dir = threadDir(projectRoot, scope, threadId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    metaPath(projectRoot, scope, threadId),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  await fs.writeFile(
    messagesPath(projectRoot, scope, threadId),
    "[]",
    "utf8",
  );

  return meta;
}

async function readMeta(
  projectRoot: string,
  scoped: ScopedThread,
): Promise<ChatThreadMeta> {
  const raw = await fs.readFile(
    metaPath(projectRoot, scoped, scoped.threadId),
    "utf8",
  );
  return normalizeThreadMeta(JSON.parse(raw) as ChatThreadMeta);
}

async function readMessages(
  projectRoot: string,
  scoped: ScopedThread,
): Promise<ChatMessage[]> {
  try {
    const raw = await fs.readFile(
      messagesPath(projectRoot, scoped, scoped.threadId),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export async function loadThread(
  projectRoot: string,
  scoped: ScopedThread,
): Promise<{ meta: ChatThreadMeta; messages: ChatMessage[] }> {
  const meta = normalizeThreadMeta(await readMeta(projectRoot, scoped));
  const messages = await readMessages(projectRoot, scoped);
  return { meta, messages };
}

export async function saveMessages(
  projectRoot: string,
  scoped: ScopedThread,
  messages: ChatMessage[],
): Promise<void> {
  const meta = await readMeta(projectRoot, scoped);
  meta.updatedAt = new Date().toISOString();
  await fs.writeFile(
    messagesPath(projectRoot, scoped, scoped.threadId),
    JSON.stringify(messages, null, 2),
    "utf8",
  );
  await fs.writeFile(
    metaPath(projectRoot, scoped, scoped.threadId),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
}

export async function updateThreadMeta(
  projectRoot: string,
  scoped: ScopedThread,
  patch: Partial<Pick<ChatThreadMeta, "title" | "titleSource" | "mode" | "skills">>,
): Promise<ChatThreadMeta> {
  const meta = await readMeta(projectRoot, scoped);

  if (patch.title !== undefined) {
    meta.title = patch.title;
  }
  if (patch.titleSource !== undefined) {
    meta.titleSource = patch.titleSource;
  }
  if (patch.mode !== undefined) {
    meta.mode = patch.mode;
    if (scoped.scope === "app") {
      meta.checkpointThreadId = buildCheckpointThreadId(
        scoped,
        scoped.threadId,
        patch.mode,
      );
    }
  }
  if (patch.skills !== undefined) {
    meta.skills = [...patch.skills];
  }

  meta.updatedAt = new Date().toISOString();
  await fs.writeFile(
    metaPath(projectRoot, scoped, scoped.threadId),
    JSON.stringify(meta, null, 2),
    "utf8",
  );

  return meta;
}

export async function deleteThread(
  projectRoot: string,
  scoped: ScopedThread,
): Promise<void> {
  await fs.rm(threadDir(projectRoot, scoped, scoped.threadId), {
    recursive: true,
    force: true,
  });
}
