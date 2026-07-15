import { describe, it, expect } from "vitest";
import { buildChatSystemPrompt } from "../../electron/agent/prompt";

describe("buildChatSystemPrompt", () => {
  it("includes ask preamble", async () => {
    const prompt = await buildChatSystemPrompt("ask", "/tmp/project", []);
    expect(prompt).toContain("ask_question");
    expect(prompt).toContain("Tools are available");
  });

  it("includes plan read-only guidance", async () => {
    const prompt = await buildChatSystemPrompt("plan", "/tmp/project", []);
    expect(prompt).toContain("read-only");
  });

  it("includes agent tooling preamble and agentflow context", async () => {
    const prompt = await buildChatSystemPrompt("agent", "/tmp/project", []);
    expect(prompt).toContain("autonomous dev agent");
    expect(prompt).toContain("Agent Flow context");
    expect(prompt).toContain("Available tools");
  });
});
