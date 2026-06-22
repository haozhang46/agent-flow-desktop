<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import { defaultRuleContent } from "./defaultRuleContent";
import { normalizeWorkspacePath } from "../../utils/normalizeWorkspacePath";
import type { PanelApi } from "../../workspace/registryComponents";

type ListFile = { path: string; label: string };
type DirectoryFile = { path: string; name: string };
type ContextMenuFile = { path: string; label: string };

const props = withDefaults(
  defineProps<{
    api: PanelApi;
    mode: "directory" | "file-list";
    docsDir?: string;
    sidebarTitle?: string;
    allowDelete?: boolean;
    files?: ListFile[];
    defaultFiles?: ListFile[];
    editable?: boolean;
    componentId?: string;
  }>(),
  {
    docsDir: "docs",
    sidebarTitle: "Documents",
    allowDelete: true,
    editable: true,
  },
);

const docsDir = computed(() => props.docsDir);
const isFileListMode = computed(() => props.mode === "file-list");
const isEditable = computed(() => props.editable !== false);

const directoryFiles = ref<DirectoryFile[]>([]);
const fileListFiles = ref<ListFile[]>([]);
const selectedPath = ref<string | null>(null);
const content = ref("");
const draft = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const isEditing = ref(false);
const isNewFile = ref(false);
const showAddForm = ref(false);
const newPath = ref("");
const newLabel = ref("");
const contextMenu = ref<{ x: number; y: number; file: ContextMenuFile } | null>(null);
const updatedPaths = ref<Set<string>>(new Set());
let unsubscribeFileWrites: (() => void) | undefined;

const isDirty = computed(() => isEditing.value && draft.value !== content.value);
const canSave = computed(() => isEditing.value && (isDirty.value || isNewFile.value));
const canAddToChat = computed(() => typeof props.api.addToChat === "function");
const selectedListFile = computed(() =>
  fileListFiles.value.find((f) => f.path === selectedPath.value),
);

function closeContextMenu() {
  contextMenu.value = null;
}

function isPathUpdated(path: string): boolean {
  return updatedPaths.value.has(normalizeWorkspacePath(path));
}

function isPathInSidebar(path: string): boolean {
  if (isFileListMode.value) {
    return fileListFiles.value.some((f) => normalizeWorkspacePath(f.path) === path);
  }
  return directoryFiles.value.some((f) => normalizeWorkspacePath(f.path) === path);
}

function clearUpdatedDot(path: string) {
  const normalized = normalizeWorkspacePath(path);
  if (!updatedPaths.value.has(normalized)) return;
  const next = new Set(updatedPaths.value);
  next.delete(normalized);
  updatedPaths.value = next;
}

async function reloadSelectedFile() {
  if (!selectedPath.value) return;
  loading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(selectedPath.value);
    content.value = file.content;
    draft.value = file.content;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function onExternalFileWrite(path: string) {
  const normalized = normalizeWorkspacePath(path);
  if (selectedPath.value && normalizeWorkspacePath(selectedPath.value) === normalized) {
    await reloadSelectedFile();
    clearUpdatedDot(normalized);
    return;
  }
  if (isPathInSidebar(normalized)) {
    updatedPaths.value = new Set(updatedPaths.value).add(normalized);
  }
}

function onFileContextMenu(event: MouseEvent, file: ContextMenuFile) {
  event.preventDefault();
  contextMenu.value = { x: event.clientX, y: event.clientY, file };
}

async function onAddToChat() {
  const file = contextMenu.value?.file;
  if (!file || !props.api.addToChat) return;
  closeContextMenu();
  try {
    await props.api.addToChat({ path: file.path, label: file.label });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function onDocumentClick() {
  closeContextMenu();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeContextMenu();
}

function initFileList() {
  const source = props.files?.length ? props.files : props.defaultFiles ?? [];
  fileListFiles.value = [...source];
  if (!fileListFiles.value.some((f) => f.path === selectedPath.value)) {
    selectedPath.value = fileListFiles.value[0]?.path ?? null;
  }
}

async function loadDirectoryFileList() {
  loading.value = true;
  error.value = null;
  try {
    const { entries } = await props.api.listWorkspace(docsDir.value);
    directoryFiles.value = entries
      .filter((e) => e.type === "file" && e.name.endsWith(".md"))
      .map((e) => ({ path: e.path, name: e.name }));
    if (!selectedPath.value && directoryFiles.value.length) {
      await selectDirectoryFile(directoryFiles.value[0].path);
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function selectDirectoryFile(path: string) {
  clearUpdatedDot(path);
  loading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(path);
    selectedPath.value = path;
    content.value = file.content;
    draft.value = file.content;
    isEditing.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

async function loadListFile(path: string) {
  if (!path) return;
  clearUpdatedDot(path);
  loading.value = true;
  error.value = null;
  isEditing.value = false;
  isNewFile.value = false;
  try {
    const file = await props.api.readWorkspaceFile(path);
    selectedPath.value = path;
    content.value = file.content;
    draft.value = file.content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("not found")) {
      selectedPath.value = path;
      const initial = defaultRuleContent(path);
      content.value = initial;
      draft.value = initial;
      if (isEditable.value) {
        isEditing.value = true;
        isNewFile.value = true;
      }
    } else {
      content.value = "";
      draft.value = "";
      error.value = message;
    }
  } finally {
    loading.value = false;
  }
}

async function createDoc() {
  const name = window.prompt("New document name (e.g. PRD.md):", "PRD.md");
  if (!name?.trim()) return;
  const fileName = name.endsWith(".md") ? name : `${name}.md`;
  const path = `${docsDir.value}/${fileName}`;
  await props.api.writeWorkspaceFile(path, `# ${fileName.replace(/\.md$/, "")}\n\n`);
  await loadDirectoryFileList();
  await selectDirectoryFile(path);
  isEditing.value = true;
}

async function saveDoc() {
  if (!selectedPath.value) return;
  saving.value = true;
  error.value = null;
  try {
    const body = isEditing.value ? draft.value : content.value;
    await props.api.writeWorkspaceFile(selectedPath.value, body);
    content.value = body;
    draft.value = body;
    isEditing.value = false;
    isNewFile.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

async function persistFileList() {
  if (!props.api.persistRuleFiles || !props.componentId) return;
  await props.api.persistRuleFiles(fileListFiles.value, props.componentId);
}

async function deleteDoc() {
  if (!selectedPath.value) return;
  if (!window.confirm(`Delete ${selectedPath.value}?`)) return;
  error.value = null;
  const path = selectedPath.value;
  try {
    if (!isNewFile.value) {
      await props.api.deleteWorkspacePath(path);
    }
    if (isFileListMode.value) {
      fileListFiles.value = fileListFiles.value.filter((f) => f.path !== path);
      const next = fileListFiles.value[0]?.path ?? null;
      selectedPath.value = next;
      content.value = "";
      draft.value = "";
      isEditing.value = false;
      isNewFile.value = false;
      if (next) {
        await loadListFile(next);
      }
      try {
        await persistFileList();
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
      }
    } else {
      selectedPath.value = null;
      content.value = "";
      draft.value = "";
      await loadDirectoryFileList();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

function startEdit() {
  draft.value = content.value;
  isEditing.value = true;
}

function cancelEdit() {
  draft.value = content.value;
  isEditing.value = false;
}

function openAddForm() {
  newPath.value = "";
  newLabel.value = "";
  showAddForm.value = true;
}

function cancelAdd() {
  showAddForm.value = false;
  newPath.value = "";
  newLabel.value = "";
}

async function confirmAdd() {
  const path = newPath.value.trim();
  if (!path) {
    error.value = "File path is required.";
    return;
  }
  if (fileListFiles.value.some((f) => f.path === path)) {
    error.value = `File already in list: ${path}`;
    return;
  }
  const label = newLabel.value.trim() || path.split("/").pop() || path;
  fileListFiles.value = [...fileListFiles.value, { path, label }];
  selectedPath.value = path;
  showAddForm.value = false;
  newPath.value = "";
  newLabel.value = "";
  await loadListFile(path);
  try {
    await persistFileList();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
}

onMounted(() => {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  unsubscribeFileWrites = props.api.subscribeFileWrites?.((path) => void onExternalFileWrite(path));
  if (isFileListMode.value) {
    initFileList();
    if (selectedPath.value) void loadListFile(selectedPath.value);
  } else {
    void loadDirectoryFileList();
  }
});

onUnmounted(() => {
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onDocumentKeydown);
  unsubscribeFileWrites?.();
});

watch(
  () => docsDir.value,
  () => {
    if (!isFileListMode.value) {
      void loadDirectoryFileList();
    }
  },
);

watch(
  () => props.files,
  () => {
    if (isFileListMode.value) {
      initFileList();
    }
  },
  { deep: true },
);

watch(selectedPath, (path, prev) => {
  if (isFileListMode.value && path && path !== prev) {
    void loadListFile(path);
  }
});
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside
      class="border-r border-gray-200 bg-gray-50 flex flex-col shrink-0"
      :class="isFileListMode ? 'w-52' : 'w-48'"
    >
      <div class="p-2 border-b border-gray-200 flex items-center justify-between gap-1">
        <span class="text-xs font-medium text-gray-500">{{ sidebarTitle }}</span>
        <button
          v-if="isFileListMode && isEditable"
          type="button"
          class="text-xs text-blue-600 hover:underline"
          data-testid="add-rule-file"
          @click="openAddForm"
        >
          + Add
        </button>
        <button
          v-else-if="!isFileListMode"
          class="text-xs text-blue-600 hover:underline"
          @click="createDoc"
        >
          + New
        </button>
      </div>

      <div
        v-if="isFileListMode && showAddForm"
        class="p-2 border-b border-gray-200 space-y-2 bg-white"
      >
        <input
          v-model="newPath"
          type="text"
          placeholder="fe/GEMINI.md"
          class="w-full text-xs px-2 py-1 border border-gray-300 rounded"
          data-testid="new-rule-path"
        />
        <input
          v-model="newLabel"
          type="text"
          placeholder="Label (optional)"
          class="w-full text-xs px-2 py-1 border border-gray-300 rounded"
        />
        <div class="flex gap-1">
          <button
            type="button"
            class="text-xs px-2 py-1 rounded bg-blue-600 text-white"
            data-testid="confirm-add-rule"
            @click="confirmAdd"
          >
            Add
          </button>
          <button
            type="button"
            class="text-xs px-2 py-1 rounded border border-gray-300"
            @click="cancelAdd"
          >
            Cancel
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <template v-if="isFileListMode">
          <button
            v-for="file in fileListFiles"
            :key="file.path"
            type="button"
            class="w-full text-left px-3 py-2 text-xs border-b border-gray-100 hover:bg-gray-100 truncate"
            :class="selectedPath === file.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
            @click="selectedPath = file.path"
            @contextmenu="onFileContextMenu($event, file)"
          >
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="truncate">{{ file.label }}</span>
              <span
                v-if="isPathUpdated(file.path)"
                class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                data-testid="file-updated-dot"
                aria-label="Updated by AI"
              />
            </span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="file in directoryFiles"
            :key="file.path"
            class="w-full text-left px-3 py-2 text-xs border-b border-gray-100 hover:bg-gray-100 truncate"
            :class="selectedPath === file.path ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
            data-testid="markdown-file-item"
            @click="selectDirectoryFile(file.path)"
            @contextmenu="onFileContextMenu($event, { path: file.path, label: file.name })"
          >
            <span class="flex items-center gap-1.5 min-w-0">
              <span class="truncate">{{ file.name }}</span>
              <span
                v-if="isPathUpdated(file.path)"
                class="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                data-testid="file-updated-dot"
                aria-label="Updated by AI"
              />
            </span>
          </button>
          <p v-if="!directoryFiles.length && !loading" class="p-3 text-xs text-gray-400">
            No markdown files yet.
          </p>
        </template>
      </div>
    </aside>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed z-50 min-w-[140px] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        data-testid="markdown-file-context-menu"
        @click.stop
      >
        <button
          type="button"
          class="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
          data-testid="markdown-add-to-chat"
          :disabled="!canAddToChat"
          @click="onAddToChat"
        >
          Add to chat
        </button>
      </div>
    </Teleport>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <span class="text-sm font-medium text-gray-700 truncate">
          {{
            isFileListMode
              ? (selectedListFile?.path ?? selectedPath ?? "Select a document")
              : (selectedPath ?? "Select a document")
          }}
        </span>
        <div
          v-if="!isFileListMode || isEditable"
          class="ml-auto flex gap-2"
        >
          <button
            v-if="selectedPath && !isEditing"
            type="button"
            class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            :disabled="loading || !selectedPath"
            @click="startEdit"
          >
            Edit
          </button>
          <button
            v-if="isEditing"
            type="button"
            class="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            :disabled="saving || (isFileListMode ? !canSave : !isDirty)"
            :data-testid="isFileListMode ? 'save-rule-file' : undefined"
            @click="saveDoc"
          >
            Save
          </button>
          <button
            v-if="isEditing"
            type="button"
            class="text-xs px-2 py-1 rounded border border-gray-300"
            @click="isFileListMode ? cancelEdit() : (isEditing = false, draft = content)"
          >
            Cancel
          </button>
          <button
            v-if="selectedPath && allowDelete"
            type="button"
            class="text-xs px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
            :data-testid="isFileListMode ? 'delete-rule-file' : undefined"
            @click="deleteDoc"
          >
            Delete
          </button>
        </div>
      </div>

      <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
      <textarea
        v-else-if="isEditing && (!isFileListMode || isEditable)"
        v-model="draft"
        class="flex-1 w-[95%] self-center p-4 font-mono text-sm resize-none outline-none border-0 box-border"
        spellcheck="false"
        :data-testid="isFileListMode ? 'rule-file-editor' : undefined"
      />
      <div
        v-else-if="selectedPath && content"
        class="flex-1 overflow-y-auto p-6 w-[95%] self-center box-border"
      >
        <MarkdownPreview :content="content" />
      </div>
      <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-400">
        {{
          isFileListMode
            ? "Select a rule file or add a new one."
            : "Create or select a PRD document."
        }}
      </div>
    </section>
  </div>
</template>
