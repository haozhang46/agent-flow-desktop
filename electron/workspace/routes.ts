import http from "node:http";
import { ZodError } from "zod";
import {
  loadWorkspace,
  resolveRoots,
  saveWorkspace,
} from "./store";
import { WorkspaceFileSchema, type WorkspaceFile } from "./types";

export type WorkspaceRouteContext = {
  getWorkspaceRoot: () => string;
};

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function requireProjectRoot(
  getWorkspaceRoot: () => string,
  res: http.ServerResponse,
): string | null {
  const projectRoot = getWorkspaceRoot().trim();
  if (!projectRoot) {
    jsonResponse(res, 400, { detail: "workspace not set" });
    return null;
  }
  return projectRoot;
}

function zodErrorDetail(err: ZodError): { detail: string; errors: ZodError["errors"] } {
  return {
    detail: err.errors
      .map((e) => `${e.path.length ? e.path.join(".") : "root"}: ${e.message}`)
      .join("; "),
    errors: err.errors,
  };
}

async function workspacePayload(workspaceRoot: string, file: WorkspaceFile) {
  const roots = await resolveRoots(workspaceRoot, file);
  return { workspace: file, roots };
}

export async function handleWorkspaceRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  ctx: WorkspaceRouteContext,
): Promise<boolean> {
  // Exact match only — do not steal /v1/workspace/file, /ops, /registry, etc.
  if (pathname !== "/v1/workspace") {
    return false;
  }

  const { getWorkspaceRoot } = ctx;
  const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
  if (!projectRoot) return true;

  if (method === "GET") {
    try {
      const workspace = await loadWorkspace(projectRoot);
      jsonResponse(res, 200, await workspacePayload(projectRoot, workspace));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "PUT") {
    let payload: unknown;
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    try {
      const workspace = WorkspaceFileSchema.parse(payload);
      await saveWorkspace(projectRoot, workspace);
      jsonResponse(res, 200, await workspacePayload(projectRoot, workspace));
    } catch (err) {
      if (err instanceof ZodError) {
        jsonResponse(res, 400, zodErrorDetail(err));
        return true;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/Duplicate root id/i.test(message)) {
        jsonResponse(res, 400, { detail: message });
        return true;
      }
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  jsonResponse(res, 405, { detail: "method not allowed" });
  return true;
}
