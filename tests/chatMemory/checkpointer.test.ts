import { describe, expect, it } from "vitest";
import {
  getProjectCheckpointer,
  resetCheckpointersForTests,
} from "../../electron/chatMemory/checkpointer";

describe("checkpointer", () => {
  it("returns singleton per project root", () => {
    resetCheckpointersForTests();
    const a = getProjectCheckpointer("/tmp/proj-a");
    const b = getProjectCheckpointer("/tmp/proj-a");
    const c = getProjectCheckpointer("/tmp/proj-b");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
