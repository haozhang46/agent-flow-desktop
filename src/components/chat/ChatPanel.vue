<script setup lang="ts">
import { ref } from "vue";
import { ChatMessage, type ChatMessage as ChatMessageType } from "@agent-flow/shared-ui";
import ChatInputWithSlash, { type ChatSendPayload, type SkillOption } from "./ChatInputWithSlash.vue";
import ChatThreadSidebar from "./ChatThreadSidebar.vue";
import type { ChatThreadMeta } from "../../composables/useChatMemory";

defineProps<{
  threads: ChatThreadMeta[];
  activeThreadId: string | null;
  sidebarCollapsed: boolean;
  messages: ChatMessageType[];
  loading: boolean;
  disabled?: boolean;
  skills: SkillOption[];
  selectedSkills: string[];
  messageKey?: (index: number) => string | number;
  streaming?: (index: number) => boolean;
}>();

const emit = defineEmits<{
  "update:sidebarCollapsed": [value: boolean];
  "select-thread": [id: string];
  "create-thread": [];
  "rename-thread": [id: string, title: string];
  send: [payload: ChatSendPayload];
  "toggle-skill": [name: string];
  "remove-skill": [name: string];
}>();

const inputRef = ref<InstanceType<typeof ChatInputWithSlash> | null>(null);

function addAttachment(attachment: { path: string; label: string }) {
  inputRef.value?.addAttachment(attachment);
}

defineExpose({ addAttachment });
</script>

<template>
  <div class="flex flex-row min-w-0 min-h-0 bg-white flex-1">
    <div class="flex flex-col shrink-0 min-h-0">
      <ChatThreadSidebar
        class="flex-1 min-h-0"
        :threads="threads"
        :active-id="activeThreadId"
        :collapsed="sidebarCollapsed"
        @update:collapsed="emit('update:sidebarCollapsed', $event)"
        @select="emit('select-thread', $event)"
        @create="emit('create-thread')"
        @rename="(id, title) => emit('rename-thread', id, title)"
      />
      <slot name="sidebar-footer" />
    </div>

    <div class="flex flex-col flex-1 min-w-0 min-h-0">
      <slot name="header" />

      <div class="flex-1 overflow-y-auto p-4 min-h-0">
        <ChatMessage
          v-for="(msg, i) in messages"
          :key="messageKey ? messageKey(i) : i"
          :msg="msg"
          :streaming="streaming?.(i) ?? false"
        />
        <slot name="messages-extra" />
      </div>

      <slot name="approval" />

      <ChatInputWithSlash
        ref="inputRef"
        :loading="loading"
        :disabled="disabled"
        :skills="skills"
        :selected-skills="selectedSkills"
        @send="emit('send', $event)"
        @toggle-skill="emit('toggle-skill', $event)"
        @remove-skill="emit('remove-skill', $event)"
      />
    </div>
  </div>
</template>
