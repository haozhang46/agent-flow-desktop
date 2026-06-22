import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildAgentflowChatContext,
  formatToolsCatalog,
  getToolsForMode,
} from "../../electron/agent/agentflowPromptContext";

describe("formatToolsCatalog", () => {
  it("formats tool name and description", () => {
    const md = formatToolsCatalog([
      { name: "read_file", description: "Read a file." } as never,
    ]);
    expect(md).toContain("**read_file**");
    expect(md).toContain("Read a file.");
  });
});

describe("buildAgentflowChatContext", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-prompt-ctx-"));
    const src = path.join(__dirname, "../../.agentflow");
    await fs.cp(src, path.join(tmp, ".agentflow"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("includes workflow, tools, and topology for agent step chat", async () => {
    const md = await buildAgentflowChatContext({
      mode: "agent",
      workspaceRoot: tmp,
      workflowId: "default-dev-cicd",
      stepId: "be-dev",
    });

    expect(md).toContain("Agent Flow context");
    expect(md).toContain("be-dev");
    expect(md).toContain("Backend Development");
    expect(md).toContain("Available tools");
    expect(md).toContain("**read_file**");
    expect(md).toContain("topology-panel");
    expect(md).toContain("Service Topology");
    expect(md).toContain("Step instructions");
  });

  it("lists fewer tools for plan mode", async () => {
    const planTools = getToolsForMode({
      mode: "plan",
      workspaceRoot: tmp,
    });
    const agentTools = getToolsForMode({
      mode: "agent",
      workspaceRoot: tmp,
    });
    expect(planTools.length).toBeLessThan(agentTools.length);
    expect(planTools.some((t) => t.name === "run_shell")).toBe(false);
  });
});
