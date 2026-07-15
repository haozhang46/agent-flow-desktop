import { describe, expect, it, vi, beforeEach } from "vitest";
import { ClarificationService } from "../../electron/agent/clarificationService";

const interruptMock = vi.fn();

vi.mock("@langchain/langgraph", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@langchain/langgraph")>();
  return {
    ...actual,
    interrupt: (...args: unknown[]) => interruptMock(...args),
  };
});

const { buildAskQuestionTool } = await import("../../electron/agent/askQuestionTool");

function toolContent(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content: unknown }).content;
    return typeof content === "string" ? content : String(content);
  }
  return String(result);
}

describe("buildAskQuestionTool", () => {
  let service: ClarificationService;

  const args = {
    question: "Need web search?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    allow_multiple: false,
    allow_free_text: true,
  };

  beforeEach(() => {
    service = new ClarificationService();
    interruptMock.mockReset();
  });

  it("returns clarification already pending without calling interrupt when pending exists", async () => {
    service.createPending("t1", "call_1", args);
    const askTool = buildAskQuestionTool({ threadId: "t1", service });

    const result = await askTool.invoke(args, {
      toolCall: { id: "call_2", name: "ask_question", args },
    });

    expect(toolContent(result)).toBe("clarification already pending");
    expect(interruptMock).not.toHaveBeenCalled();
  });

  it("creates pending, interrupts, and returns serialized answer", async () => {
    interruptMock.mockReturnValue({
      selected_option_ids: ["yes"],
      free_text: "today",
    });
    const askTool = buildAskQuestionTool({ threadId: "t1", service });

    const result = await askTool.invoke(args, {
      toolCall: { id: "call_1", name: "ask_question", args },
    });

    expect(interruptMock).toHaveBeenCalledOnce();
    expect(service.getPending("t1", "call_1")?.status).toBe("pending");
    const parsed = JSON.parse(toolContent(result));
    expect(parsed.selected_option_ids).toEqual(["yes"]);
    expect(parsed.labels).toEqual(["Yes"]);
    expect(parsed.free_text).toBe("today");
  });

  it("returns string resume value from interrupt as-is", async () => {
    const serialized = JSON.stringify({
      selected_option_ids: ["no"],
      labels: ["No"],
    });
    interruptMock.mockReturnValue(serialized);
    const askTool = buildAskQuestionTool({ threadId: "t1", service });

    const result = await askTool.invoke(args, {
      toolCall: { id: "call_1", name: "ask_question", args },
    });

    expect(toolContent(result)).toBe(serialized);
  });
});
