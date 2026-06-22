<script setup lang="ts">
import { onMounted, ref } from "vue";
import ChatPage from "../pages/Chat.vue";
import LangflowEditorPage from "../pages/LangflowEditor.vue";
import ProjectHomePage from "../pages/ProjectHome.vue";
import SettingsPage from "../pages/Settings.vue";
import TopologyCanvasPage from "../pages/TopologyCanvas.vue";
import WorkflowRunPage from "../pages/WorkflowRun.vue";

type AppView = "home" | "workflow" | "topology" | "chat" | "langflow" | "settings";

const view = ref<AppView>("home");
const workspace = ref("");

onMounted(async () => {
  workspace.value = await window.desktop.getWorkspace();
  const recent = await window.desktop.getRecentProjects();
  view.value =
    workspace.value && recent.includes(workspace.value) ? "workflow" : "home";

  window.addEventListener("agentflow:open-topology", () => {
    view.value = "topology";
  });
});

function onProjectOpened(path: string) {
  workspace.value = path;
  view.value = "workflow";
}

const navItems: { id: AppView; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "workflow", label: "Workflow" },
  { id: "topology", label: "Topology" },
  { id: "chat", label: "Chat" },
  { id: "langflow", label: "Langflow" },
  { id: "settings", label: "Settings" },
];
</script>

<template>
  <div class="flex flex-col h-full">
    <header class="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <strong class="text-gray-900 dark:text-gray-100">Agent Flow Desktop</strong>
      <nav class="flex gap-2 ml-4">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="text-sm px-2 py-1 rounded transition-colors"
          :class="
            view === item.id
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          "
          @click="view = item.id"
        >
          {{ item.label }}
        </button>
      </nav>
      <span class="text-xs text-gray-500 truncate flex-1">{{ workspace }}</span>
    </header>

    <ProjectHomePage v-if="view === 'home'" @opened="onProjectOpened" />
    <WorkflowRunPage v-else-if="view === 'workflow'" :workspace="workspace" />
    <TopologyCanvasPage v-else-if="view === 'topology'" :workspace="workspace" />
    <ChatPage v-else-if="view === 'chat'" v-model:workspace="workspace" />
    <LangflowEditorPage v-else-if="view === 'langflow'" :workspace="workspace" />
    <SettingsPage v-else @back="view = 'home'" />
  </div>
</template>
