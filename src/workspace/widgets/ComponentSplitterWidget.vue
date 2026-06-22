<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import MarkdownPreview from "../../components/workflow/MarkdownPreview.vue";
import type { PanelApi } from "../registryComponents";

const props = defineProps<{
  api: PanelApi;
  output: string;
  skills?: string[];
  editable?: boolean;
}>();

type TreeNode = { id: string; label: string; level: number; children: TreeNode[] };

const content = ref("");
const draft = ref("");
const loading = ref(false);
const saving = ref(false);
const loadingSkills = ref(false);
const error = ref<string | null>(null);
const isEditing = ref(false);
const selectedId = ref<string | null>(null);

const editable = computed(() => props.editable !== false);
const isDirty = computed(() => isEditing.value && draft.value !== content.value);

function parseMarkdownTree(md: string): TreeNode[] {
  const lines = md.split("\n");
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = [];
  let counter = 0;

  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    const level = match[1].length;
    const label = match[2].replace(/\*\*/g, "").trim();
    const node: TreeNode = { id: `n-${counter++}`, label, level, children: [] };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }
    stack.push(node);
  }
  return roots;
}

const tree = computed(() => parseMarkdownTree(isEditing.value ? draft.value : content.value));

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    out.push(n);
    out.push(...flatten(n.children));
  }
  return out;
}

const flatNodes = computed(() => flatten(tree.value));

async function loadOutput() {
  loading.value = true;
  error.value = null;
  try {
    const file = await props.api.readWorkspaceFile(props.output);
    content.value = file.content;
    draft.value = file.content;
    isEditing.value = false;
    if (flatNodes.value.length) selectedId.value = flatNodes.value[0].id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("not found")) {
      content.value = "# Components\n\n_Use Load from skill or edit manually._\n";
      draft.value = content.value;
      if (editable.value) isEditing.value = true;
    } else {
      error.value = message;
    }
  } finally {
    loading.value = false;
  }
}

async function apiBase(): Promise<string> {
  const port = await window.desktop.getSidecarPort();
  return `http://127.0.0.1:${port}`;
}

function skillPaths(name: string): string[] {
  return [`skills/${name}/SKILL.md`, `skills/${name.replace(/-/g, "_")}/SKILL.md`];
}

function extractComponentOutline(skillMd: string, skillName: string): string {
  const lines = skillMd.split("\n");
  const sections: string[] = [`## ${skillName}`, ""];
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line.trim())) {
      sections.push(line.replace(/^#{1,3}/, "##"));
    }
  }
  if (sections.length <= 2) {
    sections.push("- _Review skill content for component boundaries_");
  }
  sections.push("");
  return sections.join("\n");
}

async function loadFromSkills() {
  if (!props.skills?.length) {
    error.value = "No skills configured. Add skills in workspace properties.";
    return;
  }
  loadingSkills.value = true;
  error.value = null;
  try {
    const res = await fetch(`${await apiBase()}/v1/skills?detailed=1`);
    if (!res.ok) throw new Error(`Skills fetch failed (${res.status})`);
    const catalog = (await res.json()) as { name: string; description: string }[];
    const selected = catalog.filter((s) => props.skills!.includes(s.name));

    const parts = ["# Component Split", "", "_Generated from configured skills._", ""];
    for (const skill of selected) {
      parts.push(`## ${skill.name}`, "", skill.description, "");
      let loaded = false;
      for (const relPath of skillPaths(skill.name)) {
        try {
          const file = await props.api.readWorkspaceFile(relPath);
          parts.push(extractComponentOutline(file.content, skill.name));
          loaded = true;
          break;
        } catch {
          /* try next path */
        }
      }
      if (!loaded) {
        parts.push("- _Skill file not in workspace; add skills/ to project or edit manually._", "");
      }
    }

    draft.value = parts.join("\n");
    content.value = draft.value;
    isEditing.value = editable.value;
    if (flatNodes.value.length) selectedId.value = flatNodes.value[0].id;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loadingSkills.value = false;
  }
}

async function saveDoc() {
  saving.value = true;
  error.value = null;
  try {
    const body = isEditing.value ? draft.value : content.value;
    await props.api.writeWorkspaceFile(props.output, body);
    content.value = body;
    draft.value = body;
    isEditing.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

function startEdit() {
  draft.value = content.value;
  isEditing.value = true;
}

onMounted(() => {
  void loadOutput();
});

watch(
  () => props.output,
  () => {
    void loadOutput();
  },
);
</script>

<template>
  <div class="flex flex-1 min-h-0">
    <aside class="w-56 border-r border-gray-200 bg-gray-50 flex flex-col shrink-0">
      <div class="p-2 border-b border-gray-200 flex items-center justify-between gap-1">
        <span class="text-xs font-medium text-gray-500">Components</span>
        <button
          class="text-xs text-blue-600 hover:underline disabled:opacity-50"
          :disabled="loadingSkills || !skills?.length"
          data-testid="load-from-skill"
          @click="loadFromSkills"
        >
          {{ loadingSkills ? "Loading…" : "Load from skill" }}
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <template v-for="node in flatNodes" :key="node.id">
          <button
            type="button"
            class="w-full text-left text-xs py-1 truncate rounded hover:bg-gray-100"
            :class="selectedId === node.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'"
            :style="{ paddingLeft: `${(node.level - 1) * 12 + 8}px` }"
            @click="selectedId = node.id"
          >
            {{ node.label }}
          </button>
        </template>
        <p v-if="!flatNodes.length && !loading" class="p-2 text-xs text-gray-400">
          No headings yet. Load from skill or edit markdown.
        </p>
      </div>
      <p v-if="skills?.length" class="p-2 text-xs text-gray-400 border-t border-gray-200 truncate">
        Skills: {{ skills.join(", ") }}
      </p>
    </aside>

    <section class="flex-1 flex flex-col min-w-0">
      <div class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <span class="text-sm font-medium text-gray-700 truncate">{{ output }}</span>
        <div v-if="editable" class="ml-auto flex gap-2">
          <button
            v-if="!isEditing"
            class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
            @click="startEdit"
          >
            Edit
          </button>
          <button
            v-if="isEditing"
            class="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-50"
            :disabled="saving || !isDirty"
            data-testid="save-components"
            @click="saveDoc"
          >
            Save
          </button>
          <button
            v-if="isEditing"
            class="text-xs px-2 py-1 rounded border border-gray-300"
            @click="isEditing = false; draft = content"
          >
            Cancel
          </button>
        </div>
      </div>

      <p v-if="error" class="px-4 py-1 text-xs text-red-600 bg-red-50">{{ error }}</p>

      <div v-if="loading" class="flex-1 flex items-center justify-center text-sm text-gray-400">
        Loading…
      </div>
      <textarea
        v-else-if="isEditing && editable"
        v-model="draft"
        class="flex-1 p-4 font-mono text-sm resize-none outline-none border-0"
        spellcheck="false"
        data-testid="component-editor"
      />
      <div v-else class="flex-1 overflow-y-auto p-6">
        <MarkdownPreview :content="content" />
      </div>
    </section>
  </div>
</template>
