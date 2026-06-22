<script setup lang="ts">
import { nextTick, ref } from "vue";

export interface ChatThreadItem {
  id: string;
  title: string;
  updatedAt?: string;
}

const props = defineProps<{
  threads: ChatThreadItem[];
  activeId: string | null;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  "update:collapsed": [value: boolean];
  select: [id: string];
  create: [];
  rename: [id: string, title: string];
}>();

const editingId = ref<string | null>(null);
const editTitle = ref("");
const editInputRef = ref<HTMLInputElement | null>(null);

function toggleCollapsed() {
  emit("update:collapsed", !props.collapsed);
}

function startRename(thread: ChatThreadItem) {
  editingId.value = thread.id;
  editTitle.value = thread.title;
  void nextTick(() => {
    const input = editInputRef.value;
    if (input && typeof input.focus === "function") {
      input.focus();
      input.select?.();
    }
  });
}

function cancelRename() {
  editingId.value = null;
  editTitle.value = "";
}

function commitRename(id: string) {
  const title = editTitle.value.trim();
  if (title) {
    emit("rename", id, title.slice(0, 60));
  }
  cancelRename();
}
</script>

<template>
  <aside
    class="flex flex-col shrink-0 border-r border-gray-200 bg-gray-50 transition-[width]"
    :class="collapsed ? 'w-7' : 'w-40'"
    data-testid="chat-thread-sidebar"
  >
    <template v-if="collapsed">
      <button
        type="button"
        class="flex flex-1 items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Expand thread list"
        data-testid="chat-thread-toggle"
        @click="toggleCollapsed"
      >
        ▶
      </button>
    </template>

    <template v-else>
      <div class="flex items-center gap-1 border-b border-gray-200 p-2">
        <button
          type="button"
          class="shrink-0 px-1 text-gray-500 hover:text-gray-700"
          aria-label="Collapse thread list"
          data-testid="chat-thread-toggle"
          @click="toggleCollapsed"
        >
          ◀
        </button>
        <button
          type="button"
          class="min-w-0 flex-1 truncate rounded px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          data-testid="chat-thread-create"
          @click="emit('create')"
        >
          + New
        </button>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div
          v-for="thread in threads"
          :key="thread.id"
          class="w-full"
        >
          <input
            v-if="editingId === thread.id"
            ref="editInputRef"
            v-model="editTitle"
            type="text"
            class="w-full px-3 py-2 text-sm border-b border-blue-200 bg-white outline-none"
            :data-testid="`chat-thread-edit-${thread.id}`"
            @keydown.enter.prevent="commitRename(thread.id)"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename(thread.id)"
          />
          <button
            v-else
            type="button"
            class="w-full truncate px-3 py-2 text-left text-sm hover:bg-gray-100"
            :class="activeId === thread.id ? 'bg-blue-50 text-blue-700' : ''"
            :data-testid="`chat-thread-item-${thread.id}`"
            @click="emit('select', thread.id)"
            @dblclick.stop.prevent="startRename(thread)"
          >
            {{ thread.title }}
          </button>
        </div>
      </div>
    </template>
  </aside>
</template>
