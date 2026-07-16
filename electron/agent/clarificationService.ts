import {
  AskQuestionArgsSchema,
  type AskQuestionArgs,
  type ClarificationAnswer,
  type PendingClarification,
} from "./clarificationTypes";

function storeKey(threadId: string, clarificationId: string): string {
  return `${threadId}:${clarificationId}`;
}

export class ClarificationService {
  private readonly store = new Map<string, PendingClarification>();

  createPending(
    threadId: string,
    clarificationId: string,
    args: AskQuestionArgs,
  ): PendingClarification {
    const validated = AskQuestionArgsSchema.parse(args);

    const existing = this.getPendingForThread(threadId);
    if (existing?.status === "pending") {
      throw new Error("Clarification already pending for thread");
    }

    const pending: PendingClarification = {
      threadId,
      clarificationId,
      status: "pending",
      question: validated.question,
      options: validated.options,
      allow_multiple: validated.allow_multiple,
      allow_free_text: validated.allow_free_text,
    };

    this.store.set(storeKey(threadId, clarificationId), pending);
    return pending;
  }

  getPending(threadId: string, clarificationId: string): PendingClarification | undefined {
    return this.store.get(storeKey(threadId, clarificationId));
  }

  getPendingForThread(threadId: string): PendingClarification | undefined {
    for (const pending of this.store.values()) {
      if (pending.threadId === threadId && pending.status === "pending") {
        return pending;
      }
    }
    return undefined;
  }

  cancelThread(threadId: string): void {
    for (const pending of this.store.values()) {
      if (pending.threadId === threadId && pending.status === "pending") {
        pending.status = "cancelled";
      }
    }
  }

  validateAnswer(
    pending: PendingClarification,
    answer: ClarificationAnswer,
  ): { ok: true } | { ok: false; status: 400; detail: string } {
    if (answer.selected_option_ids.length === 0) {
      return { ok: false, status: 400, detail: "At least one option must be selected" };
    }

    const validIds = new Set(pending.options.map((o) => o.id));

    for (const id of answer.selected_option_ids) {
      if (!validIds.has(id)) {
        return { ok: false, status: 400, detail: `Unknown option id: ${id}` };
      }
    }

    if (!pending.allow_multiple && answer.selected_option_ids.length > 1) {
      return { ok: false, status: 400, detail: "Multiple selections not allowed" };
    }

    if (
      !pending.allow_free_text &&
      typeof answer.free_text === "string" &&
      answer.free_text.length > 0
    ) {
      return { ok: false, status: 400, detail: "Free text is not allowed" };
    }

    return { ok: true };
  }

  markAnswered(threadId: string, clarificationId: string): void {
    const pending = this.getPending(threadId, clarificationId);
    if (pending) {
      pending.status = "answered";
    }
  }

  serializeAnswerForTool(pending: PendingClarification, answer: ClarificationAnswer): string {
    const labelById = new Map(pending.options.map((o) => [o.id, o.label]));
    const labels = answer.selected_option_ids.map((id) => labelById.get(id)!);

    return JSON.stringify({
      selected_option_ids: answer.selected_option_ids,
      labels,
      free_text: answer.free_text,
    });
  }
}

export const clarificationService = new ClarificationService();
