import { ref, type Ref } from "vue";
import type { ClarificationSsePayload, SseEvent } from "@agent-flow/shared-ui";
import {
  submitClarification,
  type ClarificationAnswerBody,
} from "./chatTransport";

export type ClarificationCardStatus = "pending" | "submitting" | "answered" | "cancelled";

export type ClarificationAnswer = {
  selected_option_ids: string[];
  free_text?: string;
};

export type UseClarificationOptions = {
  getResumeExtras?: () => Omit<ClarificationAnswerBody, "selected_option_ids" | "free_text">;
};

export function useClarification(options: UseClarificationOptions = {}) {
  const pending: Ref<ClarificationSsePayload | null> = ref(null);
  const cardStatus: Ref<ClarificationCardStatus> = ref("pending");
  const error: Ref<string | null> = ref(null);

  function applyClarificationEvent(payload: ClarificationSsePayload) {
    pending.value = payload;
    cardStatus.value = "pending";
    error.value = null;
  }

  function cancelPending() {
    if (!pending.value) return;
    pending.value = null;
    cardStatus.value = "cancelled";
    error.value = null;
  }

  function markAnswered() {
    if (!pending.value) return;
    cardStatus.value = "answered";
    error.value = null;
  }

  /** After HTTP 200, if SSE consume fails — restore pending so the user can retry. */
  function restorePending(message: string) {
    if (cardStatus.value !== "submitting" && cardStatus.value !== "pending") return;
    cardStatus.value = "pending";
    error.value = message;
  }

  async function submit(answer: ClarificationAnswer): Promise<AsyncGenerator<SseEvent>> {
    const current = pending.value;
    if (!current) {
      throw new Error("No pending clarification");
    }
    cardStatus.value = "submitting";
    error.value = null;
    try {
      const extras = options.getResumeExtras?.() ?? {};
      const stream = await submitClarification(
        current.thread_id,
        current.clarification_id,
        {
          selected_option_ids: answer.selected_option_ids,
          free_text: answer.free_text,
          ...extras,
        },
      );
      return stream;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      error.value = message;
      cardStatus.value = "pending";
      throw err;
    }
  }

  return {
    pending,
    cardStatus,
    error,
    applyClarificationEvent,
    cancelPending,
    markAnswered,
    restorePending,
    submit,
  };
}
