<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { OpsConfig, TopologyNodeWithAccess } from "../../composables/useTopologyOps";
import {
  NODE_KINDS,
  defaultAccessForKind,
  isValidNodeId,
} from "../../utils/topologyNodes";
import { defaultSourceForNodeId } from "../../utils/topologySourceDefaults";

const props = defineProps<{
  mode: "create" | "edit";
  node?: TopologyNodeWithAccess | null;
  ops: OpsConfig | null;
}>();

const emit = defineEmits<{
  submit: [node: TopologyNodeWithAccess];
  cancel: [];
  delete: [];
}>();

const id = ref("");
const kind = ref<TopologyNodeWithAccess["kind"]>("service");
const engine = ref("");
const runtime = ref("");
const image = ref("");
const source = ref("");
const dockerfile = ref("Dockerfile");
const accessMode = ref<"host-ssh" | "managed-instance">("host-ssh");
const hostRef = ref("vps-dev");
const deployRef = ref("compose-dev");
const service = ref("");
const instanceRef = ref("");
const formError = ref<string | null>(null);

function resetFromNode(node: TopologyNodeWithAccess | null | undefined) {
  if (!node) return;
  id.value = node.id;
  kind.value = node.kind;
  engine.value = node.engine ?? "";
  runtime.value = node.runtime ?? "";
  image.value = node.image ?? "";
  source.value = node.source ?? "";
  dockerfile.value = node.dockerfile ?? "Dockerfile";
  accessMode.value = node.access?.mode ?? "host-ssh";
  hostRef.value = node.access?.hostRef ?? "vps-dev";
  deployRef.value = node.access?.deployRef ?? "compose-dev";
  service.value = node.access?.service ?? node.id;
  instanceRef.value = node.access?.instanceRef ?? node.id;
}

watch(
  () => props.node,
  (node) => {
    if (props.mode === "edit") resetFromNode(node);
  },
  { immediate: true },
);

watch(kind, (nextKind) => {
  if (props.mode !== "create") return;
  const access = defaultAccessForKind(nextKind, id.value.trim() || "node");
  accessMode.value = access?.mode ?? "host-ssh";
  hostRef.value = access?.hostRef ?? "vps-dev";
  deployRef.value = access?.deployRef ?? "compose-dev";
  service.value = access?.service ?? id.value.trim();
  instanceRef.value = access?.instanceRef ?? id.value.trim();
});

watch(id, (nextId) => {
  if (props.mode !== "create" || !nextId.trim()) return;
  service.value = nextId.trim();
  source.value = defaultSourceForNodeId(nextId);
  if (accessMode.value === "managed-instance") {
    instanceRef.value = nextId.trim();
  }
});

const showSourceFields = computed(
  () => kind.value === "service" || kind.value === "worker" || kind.value === "gateway",
);

const hostOptions = computed(() => props.ops?.hosts.map((h) => h.id) ?? []);
const deployOptions = computed(() => props.ops?.deployProfiles.map((p) => p.id) ?? []);

function buildNode(): TopologyNodeWithAccess | null {
  formError.value = null;
  const nodeId = id.value.trim();
  if (!isValidNodeId(nodeId)) {
    formError.value = "ID must start with a letter and use only letters, numbers, _ or -";
    return null;
  }
  const access =
    accessMode.value === "managed-instance"
      ? {
          mode: "managed-instance" as const,
          instanceRef: instanceRef.value.trim() || nodeId,
        }
      : {
          mode: "host-ssh" as const,
          hostRef: hostRef.value.trim() || "vps-dev",
          deployRef: deployRef.value.trim() || "compose-dev",
          service: service.value.trim() || nodeId,
        };
  const node: TopologyNodeWithAccess = {
    id: nodeId,
    kind: kind.value,
    engine: engine.value.trim() || undefined,
    runtime: runtime.value.trim() || undefined,
    image: image.value.trim() || null,
    ports: props.node?.ports ?? [],
    access,
  };
  if (showSourceFields.value) {
    const src = source.value.trim();
    if (src) {
      node.source = src;
      node.dockerfile = dockerfile.value.trim() || "Dockerfile";
    }
  }
  return node;
}

function onSubmit() {
  const node = buildNode();
  if (!node) return;
  emit("submit", node);
}

function onDelete() {
  emit("delete");
}
</script>

<template>
  <form class="flex flex-col gap-2 text-xs" @submit.prevent="onSubmit">
    <label class="text-gray-600">
      ID
      <input
        v-model="id"
        class="input-field w-full text-xs mt-0.5 font-mono"
        :disabled="mode === 'edit'"
        placeholder="api"
        required
      />
    </label>
    <label class="text-gray-600">
      Kind
      <select v-model="kind" class="input-field w-full text-xs mt-0.5">
        <option v-for="k in NODE_KINDS" :key="k" :value="k">{{ k }}</option>
      </select>
    </label>
    <label class="text-gray-600">
      Engine
      <input
        v-model="engine"
        class="input-field w-full text-xs mt-0.5"
        placeholder="mysql, redis, node…"
      />
    </label>
    <label class="text-gray-600">
      Runtime
      <input
        v-model="runtime"
        class="input-field w-full text-xs mt-0.5"
        placeholder="node, python…"
      />
    </label>
    <label class="text-gray-600">
      Image
      <input
        v-model="image"
        class="input-field w-full text-xs mt-0.5 font-mono"
        placeholder="optional image name"
      />
    </label>

    <template v-if="showSourceFields">
      <label class="text-gray-600">
        Source (build context)
        <input
          v-model="source"
          class="input-field w-full text-xs mt-0.5 font-mono"
          placeholder="backend, fe, deploy/nginx…"
        />
      </label>
      <label class="text-gray-600">
        Dockerfile
        <input
          v-model="dockerfile"
          class="input-field w-full text-xs mt-0.5 font-mono"
          placeholder="Dockerfile"
        />
      </label>
    </template>

    <p class="text-[10px] uppercase text-gray-500 mt-1">Access</p>
    <label class="text-gray-600">
      Mode
      <select v-model="accessMode" class="input-field w-full text-xs mt-0.5">
        <option value="host-ssh">host-ssh</option>
        <option value="managed-instance">managed-instance</option>
      </select>
    </label>

    <template v-if="accessMode === 'host-ssh'">
      <label class="text-gray-600">
        Host ref
        <select v-model="hostRef" class="input-field w-full text-xs mt-0.5">
          <option v-if="!hostOptions.includes(hostRef)" :value="hostRef">{{ hostRef }}</option>
          <option v-for="h in hostOptions" :key="h" :value="h">{{ h }}</option>
        </select>
      </label>
      <label class="text-gray-600">
        Deploy profile
        <select v-model="deployRef" class="input-field w-full text-xs mt-0.5">
          <option v-if="!deployOptions.includes(deployRef)" :value="deployRef">{{ deployRef }}</option>
          <option v-for="p in deployOptions" :key="p" :value="p">{{ p }}</option>
        </select>
      </label>
      <label class="text-gray-600">
        Compose service
        <input v-model="service" class="input-field w-full text-xs mt-0.5 font-mono" />
      </label>
    </template>
    <template v-else>
      <label class="text-gray-600">
        Instance ref
        <input v-model="instanceRef" class="input-field w-full text-xs mt-0.5 font-mono" />
      </label>
    </template>

    <p v-if="formError" class="text-red-600">{{ formError }}</p>

    <div class="flex flex-wrap gap-2 mt-2">
      <button type="submit" class="btn-primary text-xs py-1 px-3">
        {{ mode === "create" ? "Add node" : "Apply" }}
      </button>
      <button
        v-if="mode === 'create'"
        type="button"
        class="text-xs py-1 px-3 border border-gray-300 rounded hover:bg-gray-50"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        v-if="mode === 'edit'"
        type="button"
        class="text-xs py-1 px-3 border border-red-300 text-red-700 rounded hover:bg-red-50 ml-auto"
        @click="onDelete"
      >
        Delete node
      </button>
    </div>
  </form>
</template>
