<script setup lang="ts">
import { onMounted, ref } from "vue";

const emit = defineEmits<{ opened: [workspace: string] }>();

const recentProjects = ref<string[]>([]);
const loading = ref(true);

onMounted(async () => {
  recentProjects.value = await window.desktop.getRecentProjects();
  loading.value = false;
});

async function newProject() {
  const dir = await window.desktop.pickProjectDirectory();
  if (!dir) return;
  const workspace = await window.desktop.initProject(dir);
  emit("opened", workspace);
}

async function openProject() {
  const workspace = await window.desktop.pickWorkspace();
  if (workspace) emit("opened", workspace);
}

async function openRecent(dir: string) {
  const workspace = await window.desktop.openProject(dir);
  emit("opened", workspace);
}

function projectName(dir: string): string {
  const parts = dir.replace(/\/$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || dir;
}
</script>

<template>
  <div class="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
    <div class="w-full max-w-lg">
      <h1 class="text-2xl font-semibold text-gray-900 mb-2">Projects</h1>
      <p class="text-sm text-gray-500 mb-6">Open an existing workflow project or create a new one.</p>

      <div class="flex gap-3 mb-8">
        <button class="btn-primary text-sm" @click="newProject">New Project</button>
        <button class="btn-primary text-sm bg-gray-600 hover:bg-gray-700" @click="openProject">
          Open Project
        </button>
      </div>

      <section>
        <h2 class="text-sm font-medium text-gray-700 mb-3">Recent Projects</h2>
        <div v-if="loading" class="text-sm text-gray-400">Loading...</div>
        <p v-else-if="recentProjects.length === 0" class="text-sm text-gray-400">
          No recent projects yet.
        </p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="dir in recentProjects" :key="dir">
            <button
              class="w-full text-left px-4 py-3 rounded-lg border border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200 transition-colors"
              @click="openRecent(dir)"
            >
              <span class="block text-sm font-medium text-gray-900">{{ projectName(dir) }}</span>
              <span class="block text-xs text-gray-500 truncate mt-0.5" :title="dir">{{ dir }}</span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
