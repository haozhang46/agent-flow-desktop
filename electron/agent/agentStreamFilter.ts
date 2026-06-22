import type { ChatMode } from "./prompt";

export type StreamFilterAction = { type: "message"; content: string };

/**
 * Controls which LLM token chunks are forwarded to chat UI.
 * - ask / agent: stream all model tokens live (including ReAct narration before tools)
 * - plan: buffer only (plan_ready emitted separately)
 */
export class AgentStreamFilter {
  readonly mode: ChatMode;
  /** Full assistant text (for plan_ready). */
  fullText = "";

  constructor(mode: ChatMode) {
    this.mode = mode;
  }

  onModelChunk(content: string): StreamFilterAction[] {
    if (!content) return [];
    this.fullText += content;

    if (this.mode === "plan") return [];
    return [{ type: "message", content }];
  }

  onToolStart(): void {
    // no-op: agent narration before/after tools is streamed via onModelChunk
  }

  finish(): StreamFilterAction[] {
    return [];
  }
}
