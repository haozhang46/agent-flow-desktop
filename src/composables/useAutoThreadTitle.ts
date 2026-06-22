import type { Ref } from "vue";
import { truncatePreviewTitle } from "../../electron/chatMemory/generateTitle";
import type { ChatMessage, TitleSource } from "../../electron/chatMemory/types";

export type ThreadTitleMeta = {
  id: string;
  titleSource?: TitleSource;
};

export function shouldAutoGenerateTitle(
  meta: Pick<ThreadTitleMeta, "titleSource">,
  messages: Pick<ChatMessage, "role">[],
): boolean {
  const source = meta.titleSource ?? "default";
  if (source === "user" || source === "auto") return false;
  const userCount = messages.filter((m) => m.role === "user").length;
  const assistantCount = messages.filter((m) => m.role === "assistant").length;
  return userCount === 1 && assistantCount >= 1;
}

export function canSetPreviewTitle(meta: Pick<ThreadTitleMeta, "titleSource">): boolean {
  const source = meta.titleSource ?? "default";
  return source === "default" || source === "preview";
}

export function useAutoThreadTitle(deps: {
  threads: Ref<ThreadTitleMeta[]>;
  messages: Ref<Pick<ChatMessage, "role">[]>;
  updateTitle: (
    id: string,
    title: string,
    options?: { titleSource?: TitleSource },
  ) => Promise<void>;
  postGenerateTitle: (id: string) => Promise<boolean>;
}) {
  async function setPreviewTitle(threadId: string, userText: string): Promise<void> {
    const thread = deps.threads.value.find((t) => t.id === threadId);
    if (!thread || !canSetPreviewTitle(thread)) return;
    const userCount = deps.messages.value.filter((m) => m.role === "user").length;
    if (userCount !== 1) return;
    await deps.updateTitle(threadId, truncatePreviewTitle(userText), {
      titleSource: "preview",
    });
  }

  async function maybeGenerateTitle(threadId: string): Promise<void> {
    const thread = deps.threads.value.find((t) => t.id === threadId);
    if (!thread || !shouldAutoGenerateTitle(thread, deps.messages.value)) return;
    await deps.postGenerateTitle(threadId);
  }

  return { setPreviewTitle, maybeGenerateTitle };
}
