import http from "node:http";
import { ZodError } from "zod";
import { assertValidDraft } from "./draft";
import { readGraph } from "./graphStore";
import { applyDraft, generateDraft } from "./generateWorkflowService";
import {
  cancelUaAnalyze,
  getGenerateRunner,
  getUaBusyKind,
  getUaLastProgress,
  startUaAnalyze,
  type UaRouteContext,
} from "./runtime";
import { summarizeGraph } from "./summarize";
import { setActiveWorkflowId } from "../workflow/loader";

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

function requireApiKey(
  getApiKey: () => string | null,
  res: http.ServerResponse,
): string | null {
  const apiKey = getApiKey()?.trim() ?? "";
  if (!apiKey) {
    jsonResponse(res, 401, { detail: "API key not set" });
    return null;
  }
  return apiKey;
}

function zodErrorDetail(err: ZodError): { detail: string; errors: ZodError["errors"] } {
  return {
    detail: err.errors
      .map((e) => `${e.path.length ? e.path.join(".") : "root"}: ${e.message}`)
      .join("; "),
    errors: err.errors,
  };
}

export async function handleUaRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  ctx: UaRouteContext,
): Promise<boolean> {
  if (!pathname.startsWith("/v1/ua")) {
    return false;
  }

  const { getApiKey, getWorkspaceRoot } = ctx;

  if (method === "GET" && pathname === "/v1/ua/status") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    try {
      const graph = await readGraph(projectRoot);
      const busyKind = getUaBusyKind(projectRoot);
      const summary = graph ? summarizeGraph(graph) : null;
      jsonResponse(res, 200, {
        hasGraph: graph !== null,
        busy: busyKind !== null,
        busyKind,
        summary,
        analyzedAt: graph?.project.analyzedAt ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "GET" && pathname === "/v1/ua/graph") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    try {
      const graph = await readGraph(projectRoot);
      if (!graph) {
        jsonResponse(res, 404, { detail: "knowledge graph not found" });
        return true;
      }
      jsonResponse(res, 200, graph);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "GET" && pathname === "/v1/ua/summary") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    try {
      const graph = await readGraph(projectRoot);
      if (!graph) {
        jsonResponse(res, 404, { detail: "knowledge graph not found" });
        return true;
      }
      jsonResponse(res, 200, summarizeGraph(graph));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "POST" && pathname === "/v1/ua/analyze") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    if (!requireApiKey(getApiKey, res)) return true;

    const busyKind = getUaBusyKind(projectRoot);
    if (busyKind) {
      jsonResponse(res, 409, { detail: `${busyKind} in progress` });
      return true;
    }

    let payload: { forceFull?: boolean } = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) {
        payload = JSON.parse(raw) as { forceFull?: boolean };
      }
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    try {
      void startUaAnalyze(
        projectRoot,
        { forceFull: payload.forceFull === true },
        getApiKey,
      ).catch(() => {
        // Errors are surfaced via status/progress; graph is preserved on failure.
      });
      jsonResponse(res, 202, { started: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/in progress/i.test(message)) {
        jsonResponse(res, 409, { detail: message });
        return true;
      }
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "POST" && pathname === "/v1/ua/analyze/cancel") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    try {
      cancelUaAnalyze(projectRoot, getApiKey);
      jsonResponse(res, 200, { cancelled: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "GET" && pathname === "/v1/ua/analyze/progress") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    const progress = getUaLastProgress(projectRoot);
    if (!progress) {
      res.writeHead(204);
      res.end();
      return true;
    }
    jsonResponse(res, 200, progress);
    return true;
  }

  if (method === "POST" && pathname === "/v1/ua/generate-workflow") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;
    if (!requireApiKey(getApiKey, res)) return true;

    const busyKind = getUaBusyKind(projectRoot);
    if (busyKind) {
      jsonResponse(res, 409, { detail: `${busyKind} in progress` });
      return true;
    }

    let payload: { goal?: string } = {};
    try {
      const raw = await readBody(req);
      if (raw.trim()) {
        payload = JSON.parse(raw) as { goal?: string };
      }
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    try {
      const goal =
        typeof payload.goal === "string" ? payload.goal : null;
      const draft = await generateDraft(
        projectRoot,
        goal,
        getGenerateRunner(getApiKey),
      );
      jsonResponse(res, 200, { draft });
    } catch (err) {
      if (err instanceof ZodError) {
        jsonResponse(res, 400, zodErrorDetail(err));
        return true;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/in progress/i.test(message)) {
        jsonResponse(res, 409, { detail: message });
        return true;
      }
      if (/no knowledge graph/i.test(message)) {
        jsonResponse(res, 404, { detail: message });
        return true;
      }
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "POST" && pathname === "/v1/ua/apply-workflow") {
    const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
    if (!projectRoot) return true;

    const busyKind = getUaBusyKind(projectRoot);
    if (busyKind) {
      jsonResponse(res, 409, { detail: `${busyKind} in progress` });
      return true;
    }

    let payload: { draft?: unknown; activate?: boolean };
    try {
      payload = JSON.parse(await readBody(req)) as {
        draft?: unknown;
        activate?: boolean;
      };
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    if (payload.draft === undefined) {
      jsonResponse(res, 400, { detail: "draft required" });
      return true;
    }

    try {
      const draft = assertValidDraft(payload.draft);
      const { workflowId } = await applyDraft(projectRoot, draft);
      if (payload.activate === true) {
        await setActiveWorkflowId(projectRoot, workflowId);
      }
      jsonResponse(res, 200, { workflowId });
    } catch (err) {
      if (err instanceof ZodError) {
        jsonResponse(res, 400, zodErrorDetail(err));
        return true;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (/in progress/i.test(message)) {
        jsonResponse(res, 409, { detail: message });
        return true;
      }
      jsonResponse(res, 400, { detail: message });
    }
    return true;
  }

  jsonResponse(res, 404, { detail: `unknown ua route: ${pathname}` });
  return true;
}
