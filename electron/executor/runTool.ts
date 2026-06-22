import { dialog } from "electron";
import {
  gitDiff,
  gitStatus,
  listDirTool,
  readFileTool,
  runShell,
} from "./tools";

export type DesktopToolContext = {
  workspaceRoot: string;
};

async function confirmShell(cmd: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Allow", "Deny"],
    defaultId: 1,
    message: `Allow shell command?\n\n${cmd}`,
  });
  return response === 0;
}

export async function runDesktopTool(
  ctx: DesktopToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "read_file":
      return readFileTool(ctx.workspaceRoot, String(args.path || ""));
    case "list_dir":
      return listDirTool(ctx.workspaceRoot, String(args.path || "."));
    case "git_status":
      return gitStatus(ctx.workspaceRoot);
    case "git_diff":
      return gitDiff(ctx.workspaceRoot, String(args.path || ""));
    case "run_shell":
      return runShell(ctx.workspaceRoot, String(args.command || ""), confirmShell);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
