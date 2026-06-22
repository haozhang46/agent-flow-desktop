import { describe, it, expect } from "vitest";
import {
  UNLIMITED_RECURSION_LIMIT,
  isUnlimitedRecursionLimit,
  resolveRecursionLimit,
} from "../../electron/agent/recursionLimit";

describe("resolveRecursionLimit", () => {
  it("defaults to unlimited when setting omitted", () => {
    expect(resolveRecursionLimit({})).toBe(UNLIMITED_RECURSION_LIMIT);
    expect(isUnlimitedRecursionLimit({})).toBe(true);
  });

  it("treats null and 0 as unlimited", () => {
    expect(resolveRecursionLimit({ agentRecursionLimit: null })).toBe(UNLIMITED_RECURSION_LIMIT);
    expect(resolveRecursionLimit({ agentRecursionLimit: 0 })).toBe(UNLIMITED_RECURSION_LIMIT);
    expect(isUnlimitedRecursionLimit({ agentRecursionLimit: 0 })).toBe(true);
  });

  it("uses a positive integer when configured", () => {
    expect(resolveRecursionLimit({ agentRecursionLimit: 500 })).toBe(500);
    expect(isUnlimitedRecursionLimit({ agentRecursionLimit: 500 })).toBe(false);
  });

  it("clamps invalid values to at least 1", () => {
    expect(resolveRecursionLimit({ agentRecursionLimit: -3 })).toBe(1);
    expect(resolveRecursionLimit({ agentRecursionLimit: 12.7 })).toBe(12);
  });
});
