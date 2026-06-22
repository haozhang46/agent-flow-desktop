import { ref } from "vue";

export interface DesktopThread {
  id: string;
  title: string;
  updatedAt: string;
}

export function useDesktopThreads() {
  const threads = ref<DesktopThread[]>([]);
  const activeThreadId = ref<string | null>(null);

  function load() {
    try {
      const raw = localStorage.getItem("desktop:threads");
      threads.value = raw ? JSON.parse(raw) : [];
      if (!activeThreadId.value && threads.value[0]) {
        activeThreadId.value = threads.value[0].id;
      }
    } catch {
      threads.value = [];
    }
  }

  function save() {
    localStorage.setItem("desktop:threads", JSON.stringify(threads.value));
  }

  function create(): string {
    const id = crypto.randomUUID();
    threads.value.unshift({
      id,
      title: "New Chat",
      updatedAt: new Date().toISOString(),
    });
    activeThreadId.value = id;
    save();
    return id;
  }

  function select(id: string) {
    activeThreadId.value = id;
  }

  function remove(id: string) {
    threads.value = threads.value.filter((t) => t.id !== id);
    localStorage.removeItem(`messages:${id}`);
    save();
    if (activeThreadId.value === id) {
      activeThreadId.value = threads.value[0]?.id ?? null;
    }
  }

  function updateTitle(id: string, title: string) {
    const t = threads.value.find((x) => x.id === id);
    if (!t) return;
    t.title = title.slice(0, 60);
    t.updatedAt = new Date().toISOString();
    save();
  }

  load();

  return {
    threads,
    activeThreadId,
    create,
    select,
    remove,
    updateTitle,
  };
}
