export type ThreadMeta = { skills?: string[] } | undefined;

export async function handleSelectChatThread(
  id: string,
  deps: {
    cancelPending: () => void;
    selectThread: (id: string) => Promise<ThreadMeta>;
    applyThreadSkills: (skills?: string[]) => void;
  },
): Promise<void> {
  deps.cancelPending();
  const meta = await deps.selectThread(id);
  deps.applyThreadSkills(meta?.skills);
}

export function handleCreateChatThread(deps: {
  cancelPending: () => void;
  createThread: (title: string) => Promise<unknown>;
  syncThreadSkills: () => void;
}): void {
  deps.cancelPending();
  void deps.createThread("New Chat").then(() => {
    deps.syncThreadSkills();
  });
}

export function handleWorkflowContextChange(cancelPending: () => void): void {
  cancelPending();
}
