<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useWorkflow, type OpsConfig } from "../composables/useWorkflow";

const emit = defineEmits<{ back: [] }>();

const workflowApi = useWorkflow();

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
});

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
          (<code class="text-gray-600">RESOURCE_SERVER_PORTAINER_URL</code>,
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
