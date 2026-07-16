import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { z } from "zod";
import { readFileTool, writeFileTool } from "../executor/tools";
import { proposeAgentflowFileWrite } from "./agentflowFileApproval";
import { isAgentflowRelativePath, normalizeWorkspaceRelativePath } from "../../shared/agentflowPaths";
import { buildAskQuestionTool } from "./askQuestionTool";
import { clarificationService } from "./clarificationService";

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
  /** When set, appends ask_question closed over this thread id. */
  clarificationThreadId?: string;
};

export function buildFileChatLangChainTools(ctx: FileChatToolContext): StructuredToolInterface[] {
  const guard = (relPath: string) => {
    if (!isPathAllowed(relPath, ctx.allowedPaths)) {
      throw new Error(`path not allowed: ${relPath}`);
    }
  };

  const tools: StructuredToolInterface[] = [
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

  if (ctx.clarificationThreadId) {
    tools.push(
      buildAskQuestionTool({
        threadId: ctx.clarificationThreadId,
        service: clarificationService,
      }),
    );
  }

  return tools;
}
