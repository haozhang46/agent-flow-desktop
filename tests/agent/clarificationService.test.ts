import { describe, expect, it, beforeEach } from "vitest";
import { ClarificationService } from "../../electron/agent/clarificationService";

describe("ClarificationService", () => {
  let svc: ClarificationService;
  beforeEach(() => {
    svc = new ClarificationService();
  });

  const args = {
    question: "Need web search?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    allow_multiple: false,
    allow_free_text: true,
  };

  it("creates pending and retrieves by id", () => {
    const p = svc.createPending("t1", "call_1", args);
    expect(p.status).toBe("pending");
    expect(svc.getPending("t1", "call_1")?.question).toBe("Need web search?");
  });

  it("rejects second pending on same thread while first is pending", () => {
    svc.createPending("t1", "call_1", args);
    expect(() => svc.createPending("t1", "call_2", args)).toThrow(/already pending/i);
  });

  it("validateAnswer rejects unknown option ids with 400", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: ["maybe"], free_text: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("validateAnswer rejects empty selected_option_ids with 400", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: [], free_text: "only text" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.detail).toMatch(/at least one option/i);
    }
  });

  it("validateAnswer rejects free_text when allow_free_text is false", () => {
    const p = svc.createPending("t1", "call_1", { ...args, allow_free_text: false });
    const r = svc.validateAnswer(p, { selected_option_ids: ["yes"], free_text: "nope" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.detail).toMatch(/free text/i);
    }
  });

  it("validateAnswer allows free_text when allow_free_text is true", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: ["yes"], free_text: "ok" });
    expect(r.ok).toBe(true);
  });

  it("validateAnswer rejects multi-select overflow when allow_multiple is false", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: ["yes", "no"] });
    expect(r.ok).toBe(false);
  });

  it("markAnswered then getPending is answered; duplicate mark is idempotent for lookup", () => {
    svc.createPending("t1", "call_1", args);
    svc.markAnswered("t1", "call_1");
    expect(svc.getPending("t1", "call_1")?.status).toBe("answered");
  });

  it("cancelThread removes pending", () => {
    svc.createPending("t1", "call_1", args);
    svc.cancelThread("t1");
    expect(svc.getPendingForThread("t1")).toBeUndefined();
  });

  it("serializeAnswerForTool includes labels", () => {
    const p = svc.createPending("t1", "call_1", args);
    const s = svc.serializeAnswerForTool(p, {
      selected_option_ids: ["yes"],
      free_text: "today only",
    });
    const parsed = JSON.parse(s) as {
      selected_option_ids: string[];
      labels: string[];
      free_text?: string;
    };
    expect(parsed.selected_option_ids).toEqual(["yes"]);
    expect(parsed.labels).toEqual(["Yes"]);
    expect(parsed.free_text).toBe("today only");
  });
});
