import http from "node:http";
import { dialog } from "electron";
import { logger } from "../utils/logger";
import {
  gitDiff,
  gitStatus,
  listDirTool,
  readFileTool,
  runShell,
} from "./tools";

export interface ToolRequest {
  call_id: string;
  name: string;
  args: Record<string, unknown>;
  workspace_root: string;
}

export function startExecutorServer(port = 17351): http.Server {
  // Log startup
  logger.startup("Executor", port);

  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();
    const method = req.method || "GET";
    const url = req.url || "/";

    // Capture original end
    const originalEnd = res.end.bind(res);
    res.end = (...args: unknown[]) => {
      const duration = Date.now() - startTime;
      try {
        logger.request(method, url, res.statusCode || 200, duration);
      } catch {
        // Silently ignore logging errors
      }
      return originalEnd(...args);
    };

    if (req.method !== "POST" || req.url !== "/v1/tool") {
      res.writeHead(404);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body) as ToolRequest;
        logger.info("Executing tool", { tool: payload.name, callId: payload.call_id });
        const output = await handleTool(payload);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, output }));
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Tool execution failed", error, { body: body.slice(0, 1000) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
  });

  server.on("error", (err) => {
    logger.error("Executor server error", err);
  });

  server.listen(port, "127.0.0.1", () => {
    logger.info("Executor server listening", { port, address: "127.0.0.1" });
  });
  return server;
}

async function handleTool(req: ToolRequest): Promise<string> {
  const root = req.workspace_root;
  const args = req.args || {};

  switch (req.name) {
    case "read_file":
      return readFileTool(root, String(args.path || ""));
    case "list_dir":
      return listDirTool(root, String(args.path || "."));
    case "git_status":
      return gitStatus(root);
    case "git_diff":
      return gitDiff(root, String(args.path || ""));
    case "run_shell":
      return runShell(root, String(args.command || ""), async (cmd) => {
        const { response } = await dialog.showMessageBox({
          type: "warning",
          buttons: ["Allow", "Deny"],
          defaultId: 1,
          message: `Allow shell command?\n\n${cmd}`,
        });
        return response === 0;
      });
    default:
      throw new Error(`unknown tool: ${req.name}`);
  }
}
