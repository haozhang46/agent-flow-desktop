<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import MarkdownPreview from "../../components/workflow/MarkdownPreview.vue";
import { buildSchemaMarkdown, mergeTablesFromFiles } from "../../utils/parseSqlMigrations";
import type { PanelApi } from "../registryComponents";

const props = defineProps<{
  api: PanelApi;
  migrationsDir: string;
  output: string;
}>();

const migrationFiles = ref<string[]>([]);
const summary = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const dirMissing = ref(false);

const hasMigrations = computed(() => migrationFiles.value.length > 0);

function isMissingDirError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("ENOENT") || message.includes("no such file");
}

async function loadMigrations() {
  loading.value = true;
  error.value = null;
  dirMissing.value = false;
  try {
    const listing = await props.api.listWorkspace(props.migrationsDir);
    if (listing.exists === false) {
      dirMissing.value = true;
      migrationFiles.value = [];
      summary.value = buildSchemaMarkdown([], []);
      return;
    }
    const sqlPaths = listing.entries
      .filter((e) => e.type === "file" && e.name.endsWith(".sql"))
      .map((e) => e.path)
      .sort();

    migrationFiles.value = sqlPaths;

    if (sqlPaths.length === 0) {
      summary.value = buildSchemaMarkdown([], []);
    }

    const contents: { path: string; content: string }[] = [];
    for (const path of sqlPaths) {
      try {
        const file = await props.api.readWorkspaceFile(path);
        contents.push({ path, content: file.content });
      } catch {
        /* skip unreadable */
      }
    }

    summary.value = buildSchemaMarkdown(mergeTablesFromFiles(contents), sqlPaths);

    try {
      const existing = await props.api.readWorkspaceFile(props.output);
      if (existing.content.trim()) {
        summary.value = existing.content;
      }
    } catch {
      /* use generated */
    }
  } catch (err) {
    if (isMissingDirError(err)) {
      dirMissing.value = true;
      migrationFiles.value = [];
      summary.value = buildSchemaMarkdown([], []);
    } else {
      error.value = err instanceof Error ? err.message : String(err);
    }
  } finally {
    loading.value = false;
  }
}

async function regenerate() {
  saving.value = true;
  error.value = null;
  try {
    const contents: { path: string; content: string }[] = [];
    for (const path of migrationFiles.value) {
      const file = await props.api.readWorkspaceFile(path);
      contents.push({ path, content: file.content });
    }
    summary.value = buildSchemaMarkdown(mergeTablesFromFiles(contents), migrationFiles.value);
    await props.api.writeWorkspaceFile(props.output, summary.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadMigrations();
});
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside class="w-56 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
      <div class="p-3 border-b border-gray-200 flex items-center justify-between">
        <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Migrations</span>
        <button
          type="button"
          class="text-xs px-2 py-0.5 rounded bg-blue-600 text-white disabled:opacity-50"
          data-testid="schema-regenerate"
          :disabled="saving || !hasMigrations"
          @click="regenerate"
        >
          Regenerate
        </button>
      </div>
      <ul class="flex-1 overflow-y-auto p-2 space-y-1 text-sm">
        <li v-if="loading" class="px-2 text-gray-400">Loading…</li>
        <li v-else-if="dirMissing" class="px-2 text-gray-500 text-xs">
          Directory not found — create <code class="font-mono">{{ migrationsDir }}</code> when backend exists
        </li>
        <li v-else-if="!hasMigrations" class="px-2 text-gray-400">No .sql files</li>
        <li
          v-for="path in migrationFiles"
          :key="path"
          class="px-2 py-1 font-mono text-xs text-gray-700 truncate"
          :title="path"
        >
          {{ path.split("/").pop() }}
        </li>
      </ul>
      <p class="p-3 text-xs text-gray-400 border-t border-gray-200">
        SSOT: {{ migrationsDir }}
      </p>
    </aside>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="px-4 py-2 border-b border-gray-200 bg-white text-sm font-medium text-gray-700">
        Schema Summary
        <span class="text-xs font-normal text-gray-400 ml-2">{{ output }}</span>
      </div>
      <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>
      <div class="flex-1 overflow-y-auto p-6" data-testid="schema-summary">
        <MarkdownPreview :content="summary" />
      </div>
    </section>
  </div>
</template>
