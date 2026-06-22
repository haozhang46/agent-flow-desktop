import { describe, it, expect } from "vitest";
import { parseApiKeyFromCliOutput } from "../../electron/langflow/apiKey";

describe("parseApiKeyFromCliOutput", () => {
  it("extracts sk- prefixed API key from CLI banner output", () => {
    const output = `
╭──────────────────────────────────────╮
│ API Key Created Successfully:        │
│ sk-testKey123_abc-DEF                 │
│ This is the only time...             │
╰──────────────────────────────────────╯
`;
    expect(parseApiKeyFromCliOutput(output)).toBe("sk-testKey123_abc-DEF");
  });

  it("returns null when no API key is present", () => {
    expect(parseApiKeyFromCliOutput("no key here")).toBeNull();
  });
});
