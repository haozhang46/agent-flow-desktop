import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
vi.mock("../../electron/langflow/apiKey", () => ({
  provisionLangflowApiKey: vi.fn().mockResolvedValue(null),
}));

import { getLangflowConfig } from "../../electron/langflow/config";

describe("getLangflowConfig", () => {
  let settingsDir: string;
  let prevHome: string | undefined;

  beforeEach(async () => {
    settingsDir = await fs.mkdtemp(path.join(os.tmpdir(), "af-settings-"));
    prevHome = process.env.HOME;
    process.env.HOME = settingsDir;
    await fs.mkdir(path.join(settingsDir, ".agentflow"), { recursive: true });
  });

  afterEach(async () => {
    process.env.HOME = prevHome;
    await fs.rm(settingsDir, { recursive: true, force: true });
  });

  it("returns defaults when settings file missing", async () => {
    const cfg = await getLangflowConfig();
    expect(cfg.baseUrl).toBe("http://127.0.0.1:7860");
    expect(cfg.apiKey).toBe("");
  });

  it("reads langflowBaseUrl and langflowApiKey from settings.json", async () => {
    await fs.writeFile(
      path.join(settingsDir, ".agentflow/settings.json"),
      JSON.stringify({ langflowBaseUrl: "http://localhost:9999", langflowApiKey: "lf-key" }),
    );
    const cfg = await getLangflowConfig();
    expect(cfg.baseUrl).toBe("http://localhost:9999");
    expect(cfg.apiKey).toBe("lf-key");
  });
});
