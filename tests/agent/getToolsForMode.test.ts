import { describe, expect, it } from "vitest";
import { getToolsForMode } from "../../electron/agent/agentflowPromptContext";

describe("getToolsForMode ask_question mount", () => {
  const base = { mode: "ask" as const, workspaceRoot: process.cwd() };

  it("ask mode includes only ask_question when clarificationThreadId provided", () => {
    const tools = getToolsForMode({ ...base, clarificationThreadId: "t1" });
    expect(tools.map((t) => t.name)).toEqual(["ask_question"]);
  });

  it("plan mode includes ask_question among tools", () => {
    const tools = getToolsForMode({
      mode: "plan",
      workspaceRoot: process.cwd(),
      clarificationThreadId: "t1",
    });
    expect(tools.some((t) => t.name === "ask_question")).toBe(true);
  });
});
