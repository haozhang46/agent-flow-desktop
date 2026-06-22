import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildFileChatLangChainTools,
  isPathAllowed,
  normalizeChatPath,
} from "../../electron/agent/fileChatTools";

describe("fileChatTools", () => {
  it("normalizeChatPath strips leading ./", () => {
    expect(normalizeChatPath("./AGENTS.md")).toBe("AGENTS.md");
  });

  it("isPathAllowed matches exact paths only", () => {
    expect(isPathAllowed("AGENTS.md", ["AGENTS.md"])).toBe(true);
    expect(isPathAllowed("fe/AGENTS.md", ["AGENTS.md"])).toBe(false);
    expect(isPathAllowed("backend/secret.md", ["AGENTS.md"])).toBe(false);
  });

  describe("scoped tools", () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-filechat-"));
      await fs.writeFile(path.join(tmp, "AGENTS.md"), "# Rules\n", "utf8");
    });

    afterEach(async () => {
      await fs.rm(tmp, { recursive: true, force: true });
    });

    it("read_file allows whitelisted path", async () => {
      const tools = buildFileChatLangChainTools({
        workspaceRoot: tmp,
        allowedPaths: ["AGENTS.md"],
      });
      const readTool = tools.find((t) => t.name === "read_file")!;
      const result = await readTool.invoke({ path: "AGENTS.md" });
      expect(result).toContain("# Rules");
    });

    it("read_file rejects non-whitelisted path", async () => {
      const tools = buildFileChatLangChainTools({
        workspaceRoot: tmp,
        allowedPaths: ["AGENTS.md"],
      });
      const readTool = tools.find((t) => t.name === "read_file")!;
      await expect(readTool.invoke({ path: "fe/AGENTS.md" })).rejects.toThrow(/not allowed/);
    });

    it("write_file allows whitelisted path", async () => {
      const tools = buildFileChatLangChainTools({
        workspaceRoot: tmp,
        allowedPaths: ["AGENTS.md"],
      });
      const writeTool = tools.find((t) => t.name === "write_file")!;
      await writeTool.invoke({ path: "AGENTS.md", content: "# Updated\n" });
      const content = await fs.readFile(path.join(tmp, "AGENTS.md"), "utf8");
      expect(content).toBe("# Updated\n");
    });

    it("write_file proposes approval for .agentflow paths", async () => {
      await fs.mkdir(path.join(tmp, ".agentflow"), { recursive: true });
      await fs.writeFile(
        path.join(tmp, ".agentflow/state.json"),
        '{"version":1}\n',
        "utf8",
      );
      const tools = buildFileChatLangChainTools({
        workspaceRoot: tmp,
        allowedPaths: [".agentflow/state.json"],
      });
      const writeTool = tools.find((t) => t.name === "write_file")!;
      const result = String(
        await writeTool.invoke({
          path: ".agentflow/state.json",
          content: '{"version":2}\n',
        }),
      );
      expect(result).toContain("AGENTFLOW_FILE_PENDING_APPROVAL");
      const content = await fs.readFile(path.join(tmp, ".agentflow/state.json"), "utf8");
      expect(content).toBe('{"version":1}\n');
    });
  });
});
