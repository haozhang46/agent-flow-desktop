import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { readFileTool, writeFileTool } from "../executor/tools";
import { proposeAgentflowFileWrite } from "./agentflowFileApproval";
import { isAgentflowRelativePath, normalizeWorkspaceRelativePath } from "../../shared/agentflowPaths";

export function normalizeChatPath(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isPathAllowed(relPath: string, allowedPaths: string[]): boolean {
  const normalized = normalizeChatPath(relPath);
  const allowed = allowedPaths.map(normalizeChatPath);
  return allowed.includes(normalized);
}

export type FileChatToolContext = {
  workspaceRoot: string;
  allowedPaths: string[];
};

export function buildFileChatLangChainTools(ctx: FileChatToolContext) {
  const guard = (relPath: string) => {
    if (!isPathAllowed(relPath, ctx.allowedPaths)) {
      throw new Error(`path not allowed: ${relPath}`);
    }
  };

  return [
    tool(
      async ({ path }) => {
        guard(path);
        return readFileTool(ctx.workspaceRoot, path);
      },
      {
        name: "read_file",
        description: "Read a UTF-8 text file. Only allowed attachment paths may be read.",
        schema: z.object({ path: z.string() }),
      },
    ),
    tool(
      async ({ path, content }) => {
        guard(path);
        const normalized = normalizeWorkspaceRelativePath(path);
        if (isAgentflowRelativePath(normalized)) {
          return proposeAgentflowFileWrite(
            ctx.workspaceRoot,
            normalized,
            content,
            `Write ${normalized}`,
          );
        }
        await writeFileTool(ctx.workspaceRoot, path, content);
        return `Wrote ${path} (${content.length} bytes)`;
      },
      {
        name: "write_file",
        description: "Write UTF-8 content to a file. Only allowed attachment paths may be written.",
        schema: z.object({
          path: z.string(),
          content: z.string(),
        }),
      },
    ),
  ];
}
