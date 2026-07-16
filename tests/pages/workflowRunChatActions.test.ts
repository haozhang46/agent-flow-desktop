import { describe, it, expect, vi } from "vitest";
import {
  handleCreateChatThread,
  handleSelectChatThread,
  handleWorkflowContextChange,
} from "../../src/pages/workflowRunChatActions";

describe("workflowRunChatActions", () => {
  it("cancels pending clarification before selecting a thread", async () => {
    const cancelPending = vi.fn();
    const selectThread = vi.fn().mockResolvedValue({ skills: ["skill-a"] });
    const applyThreadSkills = vi.fn();

    await handleSelectChatThread("thread-1", {
      cancelPending,
      selectThread,
      applyThreadSkills,
    });

    expect(cancelPending).toHaveBeenCalledOnce();
    expect(selectThread).toHaveBeenCalledWith("thread-1");
    expect(applyThreadSkills).toHaveBeenCalledWith(["skill-a"]);
    expect(cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
      selectThread.mock.invocationCallOrder[0]!,
    );
  });

  it("cancels pending clarification before creating a thread", async () => {
    const cancelPending = vi.fn();
    const createThread = vi.fn().mockResolvedValue(undefined);
    const syncThreadSkills = vi.fn();

    handleCreateChatThread({
      cancelPending,
      createThread,
      syncThreadSkills,
    });

    expect(cancelPending).toHaveBeenCalledOnce();
    expect(createThread).toHaveBeenCalledWith("New Chat");
    await Promise.resolve();
    expect(syncThreadSkills).toHaveBeenCalledOnce();
    expect(cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
      createThread.mock.invocationCallOrder[0]!,
    );
  });

  it("cancels pending clarification on workflow or step context change", () => {
    const cancelPending = vi.fn();

    handleWorkflowContextChange(cancelPending);

    expect(cancelPending).toHaveBeenCalledOnce();
  });
});
