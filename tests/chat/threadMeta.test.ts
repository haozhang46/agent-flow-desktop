// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadThreadMeta,
  saveThreadMeta,
  toggleThreadSkill,
  removeThreadSkill,
} from "../../src/composables/useChatThreadMeta";

describe("useChatThreadMeta", () => {
  const threadId = "test-thread-1";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("defaults to agent mode with no skills", () => {
    expect(loadThreadMeta(threadId)).toEqual({ mode: "agent", skills: [] });
  });

  it("persists mode and skills", () => {
    saveThreadMeta(threadId, { mode: "plan", skills: ["test-driven-development"] });
    expect(loadThreadMeta(threadId)).toEqual({
      mode: "plan",
      skills: ["test-driven-development"],
    });
  });

  it("toggleThreadSkill adds and removes", () => {
    let meta = loadThreadMeta(threadId);
    meta = toggleThreadSkill(meta, "subagent-driven-development");
    expect(meta.skills).toContain("subagent-driven-development");
    meta = toggleThreadSkill(meta, "subagent-driven-development");
    expect(meta.skills).not.toContain("subagent-driven-development");
  });

  it("removeThreadSkill removes one skill", () => {
    saveThreadMeta(threadId, { mode: "ask", skills: ["a", "b"] });
    const meta = removeThreadSkill(loadThreadMeta(threadId), "a");
    expect(meta.skills).toEqual(["b"]);
  });
});
