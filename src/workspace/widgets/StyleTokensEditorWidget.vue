<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { PanelApi } from "../registryComponents";
import {
  COLOR_SHADES,
  DEFAULT_THEME,
  deepMergeTheme,
  diffOverrides,
  SEMANTIC_PALETTE,
  SEMANTIC_TOKEN_DEFS,
  listColorPalettes,
  migrateLegacyTokens,
  sortSpacingKeys,
} from "../theme/mergeTheme";
import { parseUnoTheme } from "../theme/parseUnoTheme";
import { patchUnoConfig } from "../theme/patchUnoConfig";
import type { ColorScale, MergedTheme, SpacingScale } from "../theme/types";
import ThemeColorsPanel from "./ThemeColorsPanel.vue";
import ThemeSemanticPanel from "./ThemeSemanticPanel.vue";
import ThemeSpacingPanel from "./ThemeSpacingPanel.vue";

const props = defineProps<{
  api: PanelApi;
  preset: "unocss" | "tailwind";
  target: string;
  themeFile?: string;
}>();

type Tab = "semantic" | "colors" | "spacing";

const activeTab = ref<Tab>("semantic");
const theme = ref<MergedTheme>(deepMergeTheme(DEFAULT_THEME));
const selectedPalette = ref("blue");
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const saveMessage = ref<string | null>(null);

const semanticPreviewTokens = computed(() =>
  SEMANTIC_TOKEN_DEFS.filter((t) =>
    ["primary", "secondary", "accent", "background", "foreground", "destructive"].includes(t.key),
  ).map((t) => ({
    key: t.key,
    label: t.label,
    hex: (() => {
      const brand = theme.value.colors[SEMANTIC_PALETTE];
      if (typeof brand === "object" && brand?.[t.key]) return brand[t.key];
      const def = DEFAULT_THEME.colors[SEMANTIC_PALETTE];
      if (typeof def === "object" && def?.[t.key]) return def[t.key];
      return "#ccc";
    })(),
  })),
);

const previewShades = computed(() => {
  const name = selectedPalette.value;
  const val = theme.value.colors[name];
  if (typeof val !== "object" || val === null) return [];
  const def = DEFAULT_THEME.colors[name];
  const isStandard =
    typeof def === "object" && def !== null && "500" in def;
  const keys = isStandard ? [...COLOR_SHADES] : Object.keys(val);
  return keys.map((shade) => ({
    shade,
    hex: val[shade] ?? (typeof def === "object" ? def[shade] : "") ?? "#ccc",
  }));
});

const previewSpacingKeys = computed(() => {
  const all = sortSpacingKeys(Object.keys(theme.value.spacing));
  const picks = ["1", "2", "4", "8"].filter((k) => all.includes(k));
  return picks.length > 0 ? picks : all.slice(0, 4);
});

function jsonPath(): string {
  return props.themeFile ?? ".agentflow/theme-tokens.json";
}

function onColorsUpdate(colors: ColorScale) {
  theme.value = { ...theme.value, colors };
}

function onSpacingUpdate(spacing: SpacingScale) {
  theme.value = { ...theme.value, spacing };
}

async function loadTokens() {
  loading.value = true;
  error.value = null;
  saveMessage.value = null;

  let sidecar = migrateLegacyTokens(null);
  try {
    const file = await props.api.readWorkspaceFile(jsonPath());
    sidecar = migrateLegacyTokens(JSON.parse(file.content));
  } catch {
    /* no sidecar */
  }

  let unoTheme: Partial<MergedTheme> = {};
  if (props.preset === "unocss") {
    try {
      const file = await props.api.readWorkspaceFile(props.target);
      unoTheme = parseUnoTheme(file.content);
    } catch {
      /* use defaults */
    }
  }

  theme.value = deepMergeTheme(DEFAULT_THEME, unoTheme, {
    colors: sidecar.colors,
    spacing: sidecar.spacing,
  });

  const palettes = listColorPalettes(theme.value);
  if (!palettes.includes(selectedPalette.value)) {
    selectedPalette.value = palettes.includes("blue")
      ? "blue"
      : palettes[0] ?? "blue";
  }

  loading.value = false;
}

async function saveTokens() {
  saving.value = true;
  error.value = null;
  saveMessage.value = null;
  try {
    const overrides = diffOverrides(theme.value, DEFAULT_THEME);
    await props.api.writeWorkspaceFile(
      jsonPath(),
      JSON.stringify(overrides, null, 2),
    );

    if (props.preset === "unocss") {
      try {
        const file = await props.api.readWorkspaceFile(props.target);
        const patched = patchUnoConfig(file.content, theme.value);
        await props.api.writeWorkspaceFile(props.target, patched);
        saveMessage.value = `Saved ${jsonPath()} and patched ${props.target}`;
      } catch {
        saveMessage.value = `Saved ${jsonPath()} (config patch skipped)`;
      }
    } else {
      saveMessage.value = `Saved ${jsonPath()}`;
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void loadTokens();
});

watch(
  () => [props.target, props.themeFile, props.preset] as const,
  () => {
    void loadTokens();
  },
);
</script>

<template>
  <div class="flex flex-1 min-h-0 flex-col p-4 gap-3 overflow-hidden">
    <header class="flex items-center gap-2 shrink-0">
      <h2 class="text-sm font-semibold text-gray-800">Theme Scale</h2>
      <span class="text-xs text-gray-400">{{ preset }} → {{ themeFile ?? target }}</span>
      <button
        class="ml-auto text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50"
        :disabled="saving || loading"
        data-testid="save-tokens"
        @click="saveTokens"
      >
        {{ saving ? "Saving…" : "Save" }}
      </button>
    </header>

    <div class="flex gap-1 shrink-0 border-b border-gray-200">
      <button
        type="button"
        class="text-xs px-3 py-1.5 -mb-px border-b-2"
        :class="activeTab === 'semantic' ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'"
        data-testid="theme-tab-semantic"
        @click="activeTab = 'semantic'"
      >
        主题色
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 -mb-px border-b-2"
        :class="activeTab === 'colors' ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'"
        data-testid="theme-tab-colors"
        @click="activeTab = 'colors'"
      >
        色板
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 -mb-px border-b-2"
        :class="activeTab === 'spacing' ? 'border-blue-600 text-blue-700 font-medium' : 'border-transparent text-gray-500 hover:text-gray-700'"
        data-testid="theme-tab-spacing"
        @click="activeTab = 'spacing'"
      >
        Spacing
      </button>
    </div>

    <p v-if="error" class="text-xs text-red-600 bg-red-50 px-3 py-2 rounded shrink-0">{{ error }}</p>
    <p v-if="saveMessage" class="text-xs text-green-700 bg-green-50 px-3 py-2 rounded shrink-0">{{ saveMessage }}</p>

    <div v-if="loading" class="text-sm text-gray-400">Loading theme…</div>

    <template v-else>
      <ThemeSemanticPanel
        v-if="activeTab === 'semantic'"
        :colors="theme.colors"
        :default-colors="DEFAULT_THEME.colors"
        @update:colors="onColorsUpdate"
      />
      <ThemeColorsPanel
        v-else-if="activeTab === 'colors'"
        :colors="theme.colors"
        :default-colors="DEFAULT_THEME.colors"
        :selected-palette="selectedPalette"
        @update:colors="onColorsUpdate"
        @update:selected-palette="selectedPalette = $event"
      />
      <ThemeSpacingPanel
        v-else
        :spacing="theme.spacing"
        :default-spacing="DEFAULT_THEME.spacing"
        @update:spacing="onSpacingUpdate"
      />

      <div class="shrink-0 border border-gray-200 rounded p-3 bg-gray-50">
        <p class="text-xs text-gray-500 mb-2">Preview</p>
        <div v-if="activeTab === 'semantic'" class="flex flex-wrap gap-2">
          <div
            v-for="{ key, label, hex } in semanticPreviewTokens"
            :key="key"
            class="flex flex-col items-center gap-0.5"
            :title="`brand-${key}`"
          >
            <div
              class="w-10 h-10 rounded border border-gray-200"
              :style="{ backgroundColor: hex }"
            />
            <span class="text-[10px] text-gray-500">{{ label }}</span>
          </div>
        </div>
        <div v-else-if="activeTab === 'colors'" class="flex flex-wrap gap-1">
          <div
            v-for="{ shade, hex } in previewShades"
            :key="shade"
            class="flex flex-col items-center gap-0.5"
            :title="`${selectedPalette}-${shade}`"
          >
            <div
              class="w-8 h-8 rounded border border-gray-200"
              :style="{ backgroundColor: hex }"
            />
            <span class="text-[10px] text-gray-400 font-mono">{{ shade }}</span>
          </div>
        </div>
        <div v-else class="flex items-end gap-4">
          <div
            v-for="key in previewSpacingKeys"
            :key="key"
            class="flex flex-col items-center gap-1"
          >
            <div
              class="bg-white border border-gray-300 rounded"
              :style="{ padding: theme.spacing[key] }"
            >
              <div class="w-6 h-6 bg-blue-200 rounded-sm" />
            </div>
            <span class="text-[10px] text-gray-400 font-mono">p-{{ key }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
