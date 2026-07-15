<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTheme } from "../composables/useTheme";
import { useWorkflow, type OpsConfig } from "../composables/useWorkflow";
import { useWorkspace } from "../composables/useWorkspace";
import type { WorkspaceRoot } from "../types/workspace";

const emit = defineEmits<{ back: [] }>();

const { theme, setTheme } = useTheme();
const workflowApi = useWorkflow();
const workspaceApi = useWorkspace();

const apiKeyStatus = ref("");
const apiKeyInput = ref("");
const resourceServerUrl = ref("");
const workspacePath = ref("");
const opsConfig = ref<OpsConfig | null>(null);
const langflowBaseUrl = ref("");
const langflowApiKeyStatus = ref("");
const langflowApiKeyInput = ref("");
const langflowAutoStart = ref(true);
const agentRecursionUnlimited = ref(true);
const agentRecursionLimit = ref(200);

const workspaceName = ref("");
const workspaceRoots = ref<WorkspaceRoot[]>([]);
const workspaceDefaults = ref<{ analyzeRootIds?: string[] } | undefined>();
const workspaceLoading = ref(false);
const workspaceSaving = ref(false);
const workspaceError = ref<string | null>(null);
const workspaceSaved = ref(false);

onMounted(async () => {
  apiKeyStatus.value = await window.desktop.getApiKeyStatus();
  resourceServerUrl.value = await window.desktop.getResourceServerUrl();
  workspacePath.value = await window.desktop.getWorkspace();
  langflowBaseUrl.value = await window.desktop.getLangflowBaseUrl();
  langflowApiKeyStatus.value = await window.desktop.getLangflowApiKeyStatus();
  langflowAutoStart.value = await window.desktop.getLangflowAutoStart();

  const recursion = await window.desktop.getAgentRecursionLimit();
  agentRecursionUnlimited.value = recursion.unlimited;
  if (recursion.limit != null) {
    agentRecursionLimit.value = recursion.limit;
  }

  if (resourceServerUrl.value.trim()) {
    try {
      opsConfig.value = await workflowApi.fetchOpsConfig();
    } catch {
      opsConfig.value = null;
    }
  }

  await loadWorkspace();
});

async function loadWorkspace(): Promise<void> {
  workspaceLoading.value = true;
  workspaceError.value = null;
  workspaceSaved.value = false;
  try {
    const res = await workspaceApi.fetchWorkspace();
    workspaceName.value = res.workspace.name;
    workspaceRoots.value = res.workspace.roots.map((r) => ({ ...r }));
    workspaceDefaults.value = res.workspace.defaults;
    if (workspaceRoots.value.length === 0) {
      const label = workspacePath.value.split(/[/\\]/).filter(Boolean).pop() ?? "main";
      workspaceRoots.value = [{ id: "main", path: ".", label }];
    }
  } catch (err) {
    workspaceError.value = err instanceof Error ? err.message : String(err);
    const label = workspacePath.value.split(/[/\\]/).filter(Boolean).pop() ?? "main";
    workspaceName.value = label;
    workspaceRoots.value = [{ id: "main", path: ".", label }];
  } finally {
    workspaceLoading.value = false;
  }
}

function addRoot(): void {
  workspaceRoots.value.push({ id: "", path: "", label: "" });
  workspaceSaved.value = false;
}

function removeRoot(index: number): void {
  workspaceRoots.value.splice(index, 1);
  workspaceSaved.value = false;
}

async function saveWorkspaceRoots(): Promise<void> {
  workspaceError.value = null;
  workspaceSaved.value = false;
  const roots = workspaceRoots.value.map((r) => ({
    id: r.id.trim(),
    path: r.path.trim(),
    label: r.label.trim() || r.id.trim(),
  }));
  if (roots.length === 0) {
    workspaceError.value = "Add at least one workspace root.";
    return;
  }
  if (roots.some((r) => !r.id || !r.path)) {
    workspaceError.value = "Each root needs an id and path.";
    return;
  }
  const ids = new Set(roots.map((r) => r.id));
  if (ids.size !== roots.length) {
    workspaceError.value = "Root ids must be unique.";
    return;
  }

  workspaceSaving.value = true;
  try {
    const res = await workspaceApi.saveWorkspace({
      version: 1,
      name: workspaceName.value.trim() || roots[0]!.id,
      roots,
      ...(workspaceDefaults.value ? { defaults: workspaceDefaults.value } : {}),
    });
    workspaceName.value = res.workspace.name;
    workspaceRoots.value = res.workspace.roots.map((r) => ({ ...r }));
    workspaceDefaults.value = res.workspace.defaults;
    workspaceSaved.value = true;
  } catch (err) {
    workspaceError.value = err instanceof Error ? err.message : String(err);
  } finally {
    workspaceSaving.value = false;
  }
}

async function saveApiKey() {
  await window.desktop.setApiKey(apiKeyInput.value);
  apiKeyInput.value = "";
  apiKeyStatus.value = await window.desktop.getApiKeyStatus();
}

async function clearApiKey() {
  await window.desktop.clearApiKey();
  apiKeyStatus.value = "";
}

async function saveResourceServerUrl() {
  await window.desktop.setResourceServerUrl(resourceServerUrl.value);
  opsConfig.value = null;
  if (resourceServerUrl.value.trim()) {
    try {
      opsConfig.value = await workflowApi.fetchOpsConfig();
    } catch {
      opsConfig.value = null;
    }
  }
}

const topologyEditorUrl = computed(() => {
  const base = resourceServerUrl.value.trim().replace(/\/$/, "");
  if (!base) return "";
  const project = workspacePath.value.split(/[/\\]/).filter(Boolean).pop() ?? "demo";
  return `${base}/ui/?project=${encodeURIComponent(project)}`;
});

async function saveLangflow() {
  await window.desktop.setLangflow(langflowBaseUrl.value, langflowApiKeyInput.value);
  langflowApiKeyInput.value = "";
  langflowApiKeyStatus.value = await window.desktop.getLangflowApiKeyStatus();
}

async function toggleLangflowAutoStart() {
  langflowAutoStart.value = !langflowAutoStart.value;
  await window.desktop.setLangflowAutoStart(langflowAutoStart.value);
}

async function saveAgentRecursionLimit() {
  await window.desktop.setAgentRecursionLimit({
    unlimited: agentRecursionUnlimited.value,
    limit: agentRecursionLimit.value,
  });
}
</script>

<template>
  <div class="max-w-lg mx-auto p-8">
    <button class="text-sm text-blue-600 mb-6" @click="emit('back')">← Back</button>
    <h1 class="text-xl font-semibold mb-4">Settings</h1>

    <section class="mb-8">
      <h2 class="text-sm font-medium mb-2">Appearance</h2>
      <p class="text-sm text-gray-500 mb-3">Choose light or dark theme for the app.</p>
      <div class="inline-flex rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
        <button
          type="button"
          data-testid="theme-light"
          class="text-sm px-3 py-1.5 transition-colors"
          :class="
            theme === 'light'
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="setTheme('light')"
        >
          Light
        </button>
        <button
          type="button"
          data-testid="theme-dark"
          class="text-sm px-3 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-600"
          :class="
            theme === 'dark'
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="setTheme('dark')"
        >
          Dark
        </button>
      </div>
    </section>

    <section class="mb-8" data-testid="workspace-roots-section">
      <h2 class="text-sm font-medium mb-2">Workspace roots</h2>
      <p class="text-sm text-gray-500 mb-3">
        Source folders analyzed by Understand Project. Paths are relative to the open workspace
        folder or absolute.
      </p>
      <p v-if="workspaceLoading" class="text-sm text-gray-500 mb-3">Loading workspace…</p>
      <p v-if="workspaceError" class="text-sm text-red-600 mb-3" data-testid="workspace-roots-error">
        {{ workspaceError }}
      </p>
      <p
        v-if="workspaceSaved"
        class="text-sm text-green-600 mb-3"
        data-testid="workspace-roots-saved"
      >
        Workspace saved.
      </p>
      <label class="block text-sm text-gray-600 mb-3">
        <span class="mb-1 block">Workspace name</span>
        <input
          v-model="workspaceName"
          type="text"
          class="input-field w-full"
          data-testid="workspace-name"
          placeholder="my-platform"
          @input="workspaceSaved = false"
        />
      </label>
      <div class="space-y-3 mb-3">
        <div
          v-for="(root, index) in workspaceRoots"
          :key="index"
          class="border border-gray-200 dark:border-gray-600 rounded p-3 space-y-2"
          data-testid="workspace-root-row"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-gray-500">Root {{ index + 1 }}</span>
            <button
              type="button"
              class="text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
              data-testid="workspace-root-remove"
              :disabled="workspaceRoots.length <= 1"
              @click="removeRoot(index)"
            >
              Remove
            </button>
          </div>
          <input
            v-model="root.id"
            type="text"
            class="input-field w-full"
            data-testid="workspace-root-id"
            placeholder="id (e.g. web)"
            @input="workspaceSaved = false"
          />
          <input
            v-model="root.label"
            type="text"
            class="input-field w-full"
            data-testid="workspace-root-label"
            placeholder="label"
            @input="workspaceSaved = false"
          />
          <input
            v-model="root.path"
            type="text"
            class="input-field w-full"
            data-testid="workspace-root-path"
            placeholder="path (e.g. . or ../frontend)"
            @input="workspaceSaved = false"
          />
        </div>
      </div>
      <div class="flex gap-2">
        <button
          type="button"
          class="btn-primary bg-gray-500"
          data-testid="workspace-root-add"
          @click="addRoot"
        >
          Add root
        </button>
        <button
          type="button"
          class="btn-primary"
          data-testid="workspace-roots-save"
          :disabled="workspaceSaving || workspaceLoading"
          @click="saveWorkspaceRoots"
        >
          {{ workspaceSaving ? "Saving…" : "Save workspace" }}
        </button>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="text-sm font-medium mb-2">DeepSeek API Key</h2>
      <p class="text-sm text-gray-500 mb-3">
        Status: {{ apiKeyStatus || "not set" }}
      </p>
      <input
        v-model="apiKeyInput"
        type="password"
        class="input-field mb-3 w-full"
        placeholder="sk-..."
      />
      <div class="flex gap-2">
        <button class="btn-primary" @click="saveApiKey">Save Key</button>
        <button class="btn-primary bg-gray-500" @click="clearApiKey">Clear</button>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="text-sm font-medium mb-2">Resource Server URL</h2>
      <p class="text-sm text-gray-500 mb-3">
        Optional team resource config server. AI uses connection details when generating backend
        configs (application.yml, .env). Leave empty to use project
        .agentflow/resource-instances.yaml only.
      </p>
      <input
        v-model="resourceServerUrl"
        type="url"
        class="input-field mb-3 w-full"
        placeholder="http://localhost:9000"
      />
      <button class="btn-primary" @click="saveResourceServerUrl">Save URL</button>

      <div v-if="resourceServerUrl.trim()" class="mt-4 space-y-2">
        <p class="text-xs text-gray-500">
          Ops panel URLs are configured on the Resource Server
          <code class="text-gray-600">RESOURCE_SERVER_PORTAINER_URL</code>,
          <code class="text-gray-600">RESOURCE_SERVER_MESHERY_URL</code>).
        </p>
        <p v-if="opsConfig?.portainerUrl" class="text-sm">
          <a
            :href="opsConfig.portainerUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600"
          >
            Open Portainer (Docker VPS)
          </a>
        </p>
        <p v-if="opsConfig?.mesheryUrl" class="text-sm">
          <a
            :href="opsConfig.mesheryUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600"
          >
            Open Meshery / Kanvas (Kubernetes)
          </a>
        </p>
        <p v-if="topologyEditorUrl" class="text-sm">
          <a
            :href="topologyEditorUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-gray-600"
          >
            Topology Editor (dev)
          </a>
        </p>
      </div>
    </section>

    <section class="mb-8">
      <h2 class="text-sm font-medium mb-2">Agent recursion limit</h2>
      <p class="text-sm text-gray-500 mb-3">
        Max LangGraph steps per agent run (each tool call uses multiple steps). Increase if you see
        "Recursion limit reached" during long tasks.
      </p>
      <label class="flex items-center gap-2 text-sm mb-3 cursor-pointer">
        <input
          type="checkbox"
          v-model="agentRecursionUnlimited"
        />
        Unlimited (recommended)
      </label>
      <input
        v-if="!agentRecursionUnlimited"
        v-model.number="agentRecursionLimit"
        type="number"
        min="1"
        class="input-field mb-3 w-full"
        placeholder="500"
      />
      <button class="btn-primary" @click="saveAgentRecursionLimit">Save</button>
    </section>

    <section>
      <h2 class="text-sm font-medium mb-2">Langflow Server</h2>
      <p class="text-sm text-gray-500 mb-3">
        URL of your local Langflow instance. When auto-start is on, Desktop spawns Langflow on
        port 17860 if the URL below is unreachable.
      </p>
      <label class="flex items-center gap-2 text-sm mb-3 cursor-pointer">
        <input
          type="checkbox"
          :checked="langflowAutoStart"
          @change="toggleLangflowAutoStart"
        />
        Start Langflow with Agent Flow Desktop
      </label>
      <input
        v-model="langflowBaseUrl"
        type="url"
        class="input-field mb-3 w-full"
        placeholder="http://127.0.0.1:7860"
      />
      <p class="text-sm text-gray-500 mb-3">
        API Key status: {{ langflowApiKeyStatus || "not set" }}
      </p>
      <input
        v-model="langflowApiKeyInput"
        type="password"
        class="input-field mb-3 w-full"
        placeholder="Optional Langflow API key"
      />
      <button class="btn-primary" @click="saveLangflow">Save</button>
    </section>
  </div>
</template>
