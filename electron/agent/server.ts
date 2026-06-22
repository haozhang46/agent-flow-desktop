import http from "node:http";
import { ZodError } from "zod";
import { logger } from "../utils/logger";
import { agentService, type ChatMode } from "./agentService";
import { AgentStreamFilter } from "./agentStreamFilter";
import {
  drainSseTick,
  prepareSseResponse,
  writeSse,
  writeSseMessageContent,
} from "./sseWrite";
import { streamChunkText } from "./streamChunk";
import { formatToolOutput } from "./toolEvents";
import { streamFileChat } from "./fileChatService";
import { listSkillCatalog, listSkills } from "../skills/loader";
import {
  createWorkflowFromTemplate,
  deleteWorkflow,
  ensureProjectWorkflow,
  getActiveWorkflowId,
  listTemplates,
  listWorkflows,
  loadWorkflow,
  saveWorkflow,
} from "../workflow/loader";
import { compileAndWriteWorkflow } from "../workflow/compiler";
import {
  activateWorkflow,
  advanceWorkflow,
  clearRunner,
  compareWorkflowEvals,
  getDispatchDecision,
  getResourceContext,
  getWorkflowState,
  runWorkflowEval,
  runWorkflowGates,
  runWorkflowStep,
  setWorkflowIntent,
} from "../workflow/workflowService";
import { handleLangflowRoutes } from "../langflow/routes";
import { IntentSchema, RiskSchema, WorkflowSchema } from "../workflow/types";
import {
  workspaceDeletePath,
  workspaceDeploymentConfig,
  workspaceFileExists,
  workspaceListDir,
  workspaceListFiles,
  workspaceReadFile,
  workspaceReadGates,
  workspaceReadPhase,
  workspaceWriteFile,
} from "../workspace/service";
import {
  AgentflowWriteConfirmationRequiredError,
  requireAgentflowMutation,
} from "../workspace/agentflowWriteGuard";
import {
  loadWorkspace,
  listWorkspaces,
  resolveWorkflowLegacy,
  saveWorkspace,
  workspacePath,
} from "../workflow/workspaceLoader";
import { WORKSPACE_REGISTRY } from "../workflow/workspaceRegistry";
import {
  workspaceOpsBootstrap,
  workspaceOpsBundleForStream,
  workspaceOpsDeployAll,
  workspaceOpsDeployNode,
  workspaceOpsLoad,
  workspaceOpsLogFiles,
  workspaceOpsLogRead,
  workspaceOpsLogSnapshot,
  workspaceOpsNodeStatus,
  workspaceOpsSave,
  workspaceOpsSshExec,
  workspaceOpsStartLogStream,
  workspaceOpsAudit,
  workspaceOpsSyncToServer,
} from "../workspace/opsService";
import { appendOpsAudit } from "../resources/opsAudit";
import {
  createThread,
  deleteThread,
  listThreads,
  loadThread,
  normalizeThreadMeta,
  saveMessages,
  updateThreadMeta,
} from "../chatMemory/service";
import { generateThreadTitle } from "../chatMemory/generateTitle";
import type {
  ChatMessage,
  ChatThreadMeta,
  CreateThreadInput,
  ThreadScope,
  TitleSource,
} from "../chatMemory/types";

export type AgentServerOptions = {
  port: number;
  getApiKey: () => string | null;
  getWorkspaceRoot: () => string;
  getResourceServerUrl?: () => string | null;
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

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : "");
}

function workflowIdFromQuery(reqUrl: string | undefined): string | undefined {
  const id = parseQuery(reqUrl ?? "").get("workflowId");
  return id && id.trim() ? id.trim() : undefined;
}

function zodErrorDetail(err: ZodError): { detail: string; errors: ZodError["errors"] } {
  return {
    detail: err.errors
      .map((e) => `${e.path.length ? e.path.join(".") : "root"}: ${e.message}`)
      .join("; "),
    errors: err.errors,
  };
}

function isWorkflowNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("Workflow not found:");
}

function isStepIdMismatch(err: unknown): boolean {
  return err instanceof Error && err.message.includes("stepId mismatch");
}

function isFileNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
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

function parseScopeFromQuery(
  query: URLSearchParams,
): { scope: ThreadScope } | { error: string } {
  const scopeVal = query.get("scope")?.trim();
  if (scopeVal === "app") {
    return { scope: { scope: "app" } };
  }
  if (scopeVal === "free") {
    const workflowId = query.get("workflowId")?.trim();
    if (!workflowId) {
      return { error: "workflowId required for free scope" };
    }
    return { scope: { scope: "free", workflowId } };
  }
  if (scopeVal === "step") {
    const workflowId = query.get("workflowId")?.trim();
    const stepId = query.get("stepId")?.trim();
    if (!workflowId) {
      return { error: "workflowId required for step scope" };
    }
    if (!stepId) {
      return { error: "stepId required for step scope" };
    }
    return { scope: { scope: "step", workflowId, stepId } };
  }
  return { error: "scope must be app, free, or step" };
}

function parseCreateThreadBody(body: unknown): CreateThreadInput | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "scope required" };
  }
  const payload = body as Record<string, unknown>;
  const scope = payload.scope;
  const title = typeof payload.title === "string" ? payload.title : undefined;

  if (scope === "app") {
    const input: CreateThreadInput = { scope: "app", title };
    if (payload.mode === "ask" || payload.mode === "plan" || payload.mode === "agent") {
      input.mode = payload.mode;
    }
    if (Array.isArray(payload.skills)) {
      input.skills = payload.skills.filter((s): s is string => typeof s === "string");
    }
    return input;
  }
  if (scope === "free") {
    const workflowId =
      typeof payload.workflowId === "string" ? payload.workflowId.trim() : "";
    if (!workflowId) {
      return { error: "workflowId required for free scope" };
    }
    return { scope: "free", workflowId, title };
  }
  if (scope === "step") {
    const workflowId =
      typeof payload.workflowId === "string" ? payload.workflowId.trim() : "";
    const stepId = typeof payload.stepId === "string" ? payload.stepId.trim() : "";
    if (!workflowId) {
      return { error: "workflowId required for step scope" };
    }
    if (!stepId) {
      return { error: "stepId required for step scope" };
    }
    return { scope: "step", workflowId, stepId, title };
  }
  return { error: "scope must be app, free, or step" };
}

export function startAgentServer(options: AgentServerOptions): http.Server {
  const { port, getApiKey, getWorkspaceRoot, getResourceServerUrl } = options;

  // Log startup
  logger.startup("Agent", port);

  function syncAgent(): boolean {
    try {
      const apiKey = getApiKey();
      console.log("apiKey", apiKey);
      if (!apiKey) {
        logger.warn("API key not configured, clearing agent service");
        agentService.clear();
        return false;
      }
      agentService.configure({
        apiKey,
        workspaceRoot: getWorkspaceRoot(),
        projectRoot: getWorkspaceRoot(),
        resourceServerUrl: getResourceServerUrl?.() ?? null,
      });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Failed to sync agent", error);
      console.error("Failed to sync agent", error);
      return false;
    }
  }

  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();
    const method = req.method || "GET";
    const url = req.url || "/";

    // Capture original end to intercept status code
    const originalEnd = res.end.bind(res);
    res.end = (...args: unknown[]) => {
      const duration = Date.now() - startTime;
      try {
        logger.request(method, url, res.statusCode || 200, duration);
      } catch {
        // Silently ignore logging errors to not break response
      }
      return originalEnd(...args);
    };

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = req.url?.split("?")[0];

    if (
      await handleLangflowRoutes(req, res, pathname ?? "", req.method ?? "GET", getWorkspaceRoot)
    ) {
      return;
    }

    if (req.method === "GET" && pathname === "/health") {
      jsonResponse(res, 200, { status: "ok", mode: "desktop-js" });
      return;
    }

    if (req.method === "GET" && pathname === "/v1/health/deepseek") {
      if (!syncAgent()) {
        jsonResponse(res, 400, { detail: "DEEPSEEK_API_KEY not set" });
        return;
      }
      try {
        await agentService.probeDeepSeek();
        jsonResponse(res, 200, { status: "ok", provider: "deepseek" });
      } catch (err) {
        const name = err instanceof Error ? err.constructor.name : "Error";
        jsonResponse(res, 502, { detail: `DeepSeek probe failed: ${name}` });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workflows") {
      try {
        const workspaceRoot = getWorkspaceRoot();
        const workflows = await listWorkflows(workspaceRoot);
        let activeWorkflowId: string | null = null;
        if (workflows.length > 0) {
          try {
            activeWorkflowId = await getActiveWorkflowId(workspaceRoot);
          } catch {
            activeWorkflowId = workflows[0].id;
          }
        }
        jsonResponse(res, 200, {
          workflows: workflows.map((w) => ({
            ...w,
            isActive: w.id === activeWorkflowId,
          })),
          activeWorkflowId,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workflows/templates") {
      try {
        const templates = await listTemplates();
        jsonResponse(res, 200, { templates });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workspace/file-chat") {
      let payload: {
        paths?: string[];
        message?: string;
        skills?: string[];
        stepId?: string;
        threadId?: string;
        workflowId?: string;
      } = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          payload = JSON.parse(raw) as typeof payload;
        }
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      const paths = (payload.paths ?? []).map((p) => p.trim()).filter(Boolean);
      if (!paths.length) {
        jsonResponse(res, 400, { detail: "paths required" });
        return;
      }

      const threadId = payload.threadId?.trim();
      if (!threadId) {
        jsonResponse(res, 400, { detail: "threadId required" });
        return;
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        jsonResponse(res, 400, { detail: "DEEPSEEK_API_KEY not set" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      try {
        const workspaceRoot = getWorkspaceRoot();
        let workflowId = payload.workflowId?.trim();
        if (!workflowId) {
          try {
            workflowId = await getActiveWorkflowId(workspaceRoot);
          } catch {
            workflowId = "unknown";
          }
        }
        const stepId = payload.stepId?.trim() ?? "";
        const checkpointThreadId = `file:${workflowId}:${stepId}:${threadId}`;
        const events = streamFileChat({
          workspaceRoot,
          projectRoot: workspaceRoot,
          paths,
          message: payload.message ?? "",
          skills: payload.skills,
          stepId: payload.stepId,
          checkpointThreadId,
          apiKey,
        });
        for await (const event of events) {
          writeSse(res, event.type, event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeSse(res, "message", { type: "message", content: `Error: ${message}` });
        writeSse(res, "done", { type: "done" });
      }
      res.end();
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflows/init") {
      let payload: { templateId?: string } = {};
      try {
        const body = await readBody(req);
        if (body.trim()) {
          payload = JSON.parse(body) as { templateId?: string };
        }
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      const templateId = payload.templateId?.trim() || "default-dev-cicd";
      try {
        const workspaceRoot = getWorkspaceRoot();
        const workflowId = await ensureProjectWorkflow(workspaceRoot, templateId);
        clearRunner(workspaceRoot);
        jsonResponse(res, 200, { workflowId, templateId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflows/from-template") {
      let payload: { templateId?: string; newId?: string };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.templateId) {
        jsonResponse(res, 400, { detail: "templateId required" });
        return;
      }
      try {
        const workspaceRoot = getWorkspaceRoot();
        const workflowId = await createWorkflowFromTemplate(
          workspaceRoot,
          payload.templateId,
          payload.newId,
        );
        jsonResponse(res, 201, { workflowId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    const workflowActivateMatch = url?.match(/^\/v1\/workflows\/([^/]+)\/activate$/);
    if (req.method === "POST" && workflowActivateMatch) {
      const workflowId = decodeURIComponent(workflowActivateMatch[1]);
      try {
        await activateWorkflow(
          getWorkspaceRoot(),
          workflowId,
          getApiKey,
          getResourceServerUrl,
        );
        jsonResponse(res, 200, { workflowId, active: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    const workflowIdMatch = url?.match(/^\/v1\/workflows\/([^/]+)$/);
    if (req.method === "PUT" && workflowIdMatch) {
      const workflowId = decodeURIComponent(workflowIdMatch[1]);
      let payload: unknown;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      try {
        const definition = WorkflowSchema.parse(payload);
        if (definition.id !== workflowId) {
          jsonResponse(res, 400, { detail: "workflow id mismatch" });
          return;
        }
        await saveWorkflow(getWorkspaceRoot(), workflowId, definition);
        clearRunner(getWorkspaceRoot(), workflowId);
        jsonResponse(res, 200, definition);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "DELETE" && workflowIdMatch) {
      const workflowId = decodeURIComponent(workflowIdMatch[1]);
      try {
        await deleteWorkflow(getWorkspaceRoot(), workflowId);
        jsonResponse(res, 200, { deleted: workflowId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 400, { detail: message });
      }
      return;
    }

    const workflowWorkspaceMatch = pathname?.match(
      /^\/v1\/workflows\/([^/]+)\/workspaces\/([^/]+)$/,
    );
    if (workflowWorkspaceMatch) {
      const workflowId = decodeURIComponent(workflowWorkspaceMatch[1]);
      const stepId = decodeURIComponent(workflowWorkspaceMatch[2]);

      if (req.method === "GET") {
        try {
          const workspaceRoot = getWorkspaceRoot();
          const isLegacy = await resolveWorkflowLegacy(workspaceRoot, workflowId);
          const filePath = workspacePath(workspaceRoot, workflowId, stepId, isLegacy);
          const workspace = await loadWorkspace(filePath);
          jsonResponse(res, 200, workspace);
        } catch (err) {
          if (isWorkflowNotFound(err)) {
            jsonResponse(res, 404, { detail: (err as Error).message });
            return;
          }
          if (isFileNotFound(err)) {
            jsonResponse(res, 404, { detail: `Workspace not found: ${stepId}` });
            return;
          }
          if (err instanceof ZodError) {
            jsonResponse(res, 400, zodErrorDetail(err));
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 500, { detail: message });
        }
        return;
      }

      if (req.method === "PUT") {
        let payload: unknown;
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          jsonResponse(res, 400, { detail: "invalid JSON" });
          return;
        }

        try {
          const query = parseQuery(req.url ?? "");
          const confirmed =
            query.get("confirmed") === "1" || query.get("confirmed") === "true";
          requireAgentflowMutation(confirmed);
          const workspaceRoot = getWorkspaceRoot();
          const isLegacy = await resolveWorkflowLegacy(workspaceRoot, workflowId);
          const filePath = workspacePath(workspaceRoot, workflowId, stepId, isLegacy);
          const workspace = await saveWorkspace(filePath, payload, stepId);
          jsonResponse(res, 200, workspace);
        } catch (err) {
          if (isWorkflowNotFound(err)) {
            jsonResponse(res, 404, { detail: (err as Error).message });
            return;
          }
          if (err instanceof ZodError) {
            jsonResponse(res, 400, zodErrorDetail(err));
            return;
          }
          if (isStepIdMismatch(err)) {
            jsonResponse(res, 400, { detail: (err as Error).message });
            return;
          }
          if (err instanceof AgentflowWriteConfirmationRequiredError) {
            jsonResponse(res, 400, { detail: err.message });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 500, { detail: message });
        }
        return;
      }
    }

    const workflowWorkspacesListMatch = url?.match(/^\/v1\/workflows\/([^/]+)\/workspaces$/);
    if (req.method === "GET" && workflowWorkspacesListMatch) {
      const workflowId = decodeURIComponent(workflowWorkspacesListMatch[1]);
      try {
        const workspaceRoot = getWorkspaceRoot();
        const isLegacy = await resolveWorkflowLegacy(workspaceRoot, workflowId);
        const stepIds = await listWorkspaces(workspaceRoot, workflowId, isLegacy);
        jsonResponse(res, 200, { workflowId, stepIds });
      } catch (err) {
        if (isWorkflowNotFound(err)) {
          jsonResponse(res, 404, { detail: (err as Error).message });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workflows/current") {
      try {
        const workflowId = workflowIdFromQuery(req.url);
        const workflow = await loadWorkflow(getWorkspaceRoot(), workflowId);
        jsonResponse(res, 200, workflow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workflow/dispatch") {
      try {
        const workflowId = workflowIdFromQuery(req.url);
        const decision = await getDispatchDecision(
          getWorkspaceRoot(),
          getApiKey,
          getResourceServerUrl,
          workflowId,
        );
        jsonResponse(res, 200, decision);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflow/intent") {
      let payload: { intent?: string; risk?: string; workflowId?: string };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      const intent = IntentSchema.safeParse(payload.intent);
      const risk = RiskSchema.safeParse(payload.risk);
      if (!intent.success || !risk.success) {
        jsonResponse(res, 400, { detail: "intent and risk required (valid enum values)" });
        return;
      }

      try {
        const state = await setWorkflowIntent(
          getWorkspaceRoot(),
          getApiKey,
          intent.data,
          risk.data,
          getResourceServerUrl,
          payload.workflowId,
        );
        jsonResponse(res, 200, state);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflow/gates") {
      let payload: { stepId?: string; workflowId?: string } = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          payload = JSON.parse(raw);
        }
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      try {
        const state = await runWorkflowGates(
          getWorkspaceRoot(),
          getApiKey,
          payload.stepId,
          getResourceServerUrl,
          payload.workflowId,
        );
        jsonResponse(res, 200, state);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/eval/run") {
      try {
        const workflowId = workflowIdFromQuery(req.url);
        const report = await runWorkflowEval(
          getWorkspaceRoot(),
          getApiKey,
          getResourceServerUrl,
          workflowId,
        );
        jsonResponse(res, 200, report);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/eval/compare") {
      let payload: { baseline?: unknown; candidate?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      if (!payload.baseline || !payload.candidate) {
        jsonResponse(res, 400, { detail: "baseline and candidate eval reports required" });
        return;
      }

      try {
        const comparison = compareWorkflowEvals(
          payload.baseline as Parameters<typeof compareWorkflowEvals>[0],
          payload.candidate as Parameters<typeof compareWorkflowEvals>[1],
        );
        jsonResponse(res, 200, comparison);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workflow/state") {
      try {
        const workflowId = workflowIdFromQuery(req.url);
        const state = await getWorkflowState(
          getWorkspaceRoot(),
          getApiKey,
          getResourceServerUrl,
          workflowId,
        );
        jsonResponse(res, 200, state);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/resources/context") {
      try {
        const context = await getResourceContext(getWorkspaceRoot(), getResourceServerUrl);
        jsonResponse(res, 200, context);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/resources/topology") {
      try {
        const context = await getResourceContext(getWorkspaceRoot(), getResourceServerUrl);
        jsonResponse(res, 200, { topology: context.topology });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workspace/registry") {
      jsonResponse(res, 200, { components: WORKSPACE_REGISTRY });
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/list")) {
      const query = parseQuery(req.url ?? "");
      const relPath = query.get("path") ?? "";
      const recursive = query.get("recursive") === "1";
      try {
        const workspaceRoot = getWorkspaceRoot();
        const exists =
          relPath === "" || (await workspaceFileExists(workspaceRoot, relPath));
        const entries = exists
          ? recursive
            ? await workspaceListFiles(workspaceRoot, relPath)
            : await workspaceListDir(workspaceRoot, relPath)
          : [];
        jsonResponse(res, 200, { path: relPath, entries, exists });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 400, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/file")) {
      const query = parseQuery(req.url ?? "");
      const relPath = query.get("path");
      if (!relPath) {
        jsonResponse(res, 400, { detail: "path query required" });
        return;
      }
      try {
        const file = await workspaceReadFile(getWorkspaceRoot(), relPath);
        jsonResponse(res, 200, file);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 400, { detail: message });
      }
      return;
    }

    if (req.method === "PUT" && pathname === "/v1/workspace/file") {
      let payload: { path?: string; content?: string; confirmed?: boolean };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.path || payload.content === undefined) {
        jsonResponse(res, 400, { detail: "path and content required" });
        return;
      }
      try {
        const result = await workspaceWriteFile(
          getWorkspaceRoot(),
          payload.path,
          payload.content,
          payload.confirmed,
        );
        jsonResponse(res, 200, result);
      } catch (err) {
        if (err instanceof AgentflowWriteConfirmationRequiredError) {
          jsonResponse(res, 400, { detail: err.message });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 400, { detail: message });
      }
      return;
    }

    if (req.method === "DELETE" && url?.startsWith("/v1/workspace/file")) {
      const query = parseQuery(req.url ?? "");
      const relPath = query.get("path");
      if (!relPath) {
        jsonResponse(res, 400, { detail: "path query required" });
        return;
      }
      try {
        const confirmed =
          query.get("confirmed") === "1" || query.get("confirmed") === "true";
        const result = await workspaceDeletePath(getWorkspaceRoot(), relPath, confirmed);
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 400, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workflow/phase")) {
      const query = parseQuery(req.url ?? "");
      const stepId = query.get("stepId");
      if (!stepId) {
        jsonResponse(res, 400, { detail: "stepId query required" });
        return;
      }
      try {
        const phase = await workspaceReadPhase(getWorkspaceRoot(), stepId);
        jsonResponse(res, 200, phase);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workflow/gates")) {
      const query = parseQuery(req.url ?? "");
      const stepId = query.get("stepId");
      if (!stepId) {
        jsonResponse(res, 400, { detail: "stepId query required" });
        return;
      }
      try {
        const gates = await workspaceReadGates(getWorkspaceRoot(), stepId);
        jsonResponse(res, 200, gates);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workspace/deployment") {
      try {
        const config = await workspaceDeploymentConfig(getWorkspaceRoot(), getResourceServerUrl);
        jsonResponse(res, 200, config);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workspace/ops/bootstrap") {
      try {
        const bundle = await workspaceOpsBootstrap(getWorkspaceRoot(), getResourceServerUrl);
        jsonResponse(res, 200, bundle);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/workspace/ops") {
      try {
        const bundle = await workspaceOpsLoad(getWorkspaceRoot());
        jsonResponse(res, 200, bundle);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "PUT" && pathname === "/v1/workspace/ops") {
      let payload: { topology?: unknown; ops?: unknown; confirmed?: boolean };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.topology || !payload.ops) {
        jsonResponse(res, 400, { detail: "topology and ops required" });
        return;
      }
      try {
        requireAgentflowMutation(payload.confirmed);
        const result = await workspaceOpsSave(
          getWorkspaceRoot(),
          payload.topology as Parameters<typeof workspaceOpsSave>[1],
          payload.ops as Parameters<typeof workspaceOpsSave>[2],
        );
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/ops/status")) {
      const nodeId = parseQuery(req.url ?? "").get("nodeId");
      if (!nodeId?.trim()) {
        jsonResponse(res, 400, { detail: "nodeId required" });
        return;
      }
      try {
        const result = await workspaceOpsNodeStatus(getWorkspaceRoot(), nodeId.trim());
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workspace/ops/deploy") {
      let payload: { nodeId?: string; deployAll?: boolean; confirm?: boolean };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.confirm) {
        jsonResponse(res, 400, { detail: "confirm required" });
        return;
      }
      try {
        if (payload.deployAll) {
          const result = await workspaceOpsDeployAll(getWorkspaceRoot());
          jsonResponse(res, 200, result);
          return;
        }
        if (!payload.nodeId?.trim()) {
          jsonResponse(res, 400, { detail: "nodeId or deployAll required" });
          return;
        }
        const result = await workspaceOpsDeployNode(getWorkspaceRoot(), payload.nodeId.trim());
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workspace/ops/ssh/exec") {
      let payload: { hostRef?: string; command?: string };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.hostRef?.trim() || !payload.command?.trim()) {
        jsonResponse(res, 400, { detail: "hostRef and command required" });
        return;
      }
      try {
        const result = await workspaceOpsSshExec(
          getWorkspaceRoot(),
          payload.hostRef.trim(),
          payload.command.trim(),
        );
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/ops/audit")) {
      const limitRaw = parseQuery(req.url ?? "").get("limit");
      const limit = limitRaw ? Number(limitRaw) : undefined;
      try {
        const result = await workspaceOpsAudit(getWorkspaceRoot(), limit);
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workspace/ops/sync-server") {
      try {
        const result = await workspaceOpsSyncToServer(
          getWorkspaceRoot(),
          getResourceServerUrl?.() ?? null,
        );
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/ops/logs/stream")) {
      const nodeId = parseQuery(req.url ?? "").get("nodeId");
      if (!nodeId?.trim()) {
        jsonResponse(res, 400, { detail: "nodeId required" });
        return;
      }
      try {
        const { bundle, node } = await workspaceOpsBundleForStream(getWorkspaceRoot(), nodeId.trim());
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        const stream = workspaceOpsStartLogStream(node, bundle.ops, (text) => {
          writeSse(res, "log", { text });
        });
        if (stream.error) {
          writeSse(res, "error", { message: stream.error });
          writeSse(res, "done", {});
          res.end();
          return;
        }
        void appendOpsAudit(getWorkspaceRoot(), {
          ts: new Date().toISOString(),
          node: nodeId.trim(),
          action: "logsFollowStart",
        });
        req.on("close", () => {
          stream.close();
          void appendOpsAudit(getWorkspaceRoot(), {
            ts: new Date().toISOString(),
            node: nodeId.trim(),
            action: "logsFollowEnd",
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          jsonResponse(res, 500, { detail: message });
        } else {
          writeSse(res, "error", { message });
          writeSse(res, "done", {});
          res.end();
        }
      }
      return;
    }

    if (req.method === "GET" && url?.startsWith("/v1/workspace/ops/logs")) {
      const query = parseQuery(req.url ?? "");
      const nodeId = query.get("nodeId") ?? undefined;
      const filePath = query.get("path");
      try {
        if (filePath) {
          const data = await workspaceOpsLogRead(getWorkspaceRoot(), filePath);
          jsonResponse(res, 200, data);
          return;
        }
        const files = await workspaceOpsLogFiles(getWorkspaceRoot(), nodeId);
        jsonResponse(res, 200, { files });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workspace/ops/logs/snapshot") {
      let payload: { nodeId?: string };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!payload.nodeId?.trim()) {
        jsonResponse(res, 400, { detail: "nodeId required" });
        return;
      }
      try {
        const result = await workspaceOpsLogSnapshot(getWorkspaceRoot(), payload.nodeId.trim());
        jsonResponse(res, 200, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/v1/skills") {
      try {
        const detailed = parseQuery(req.url ?? "").get("detailed");
        if (detailed === "1") {
          const skills = await listSkillCatalog();
          jsonResponse(res, 200, skills);
        } else {
          const skills = await listSkills();
          jsonResponse(res, 200, skills);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflow/advance") {
      let payload: { action?: string; workflowId?: string };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      const action = payload.action;
      if (action !== "continue" && action !== "skip" && action !== "retry") {
        jsonResponse(res, 400, { detail: 'action must be "continue", "skip", or "retry"' });
        return;
      }

      try {
        const state = await advanceWorkflow(
          getWorkspaceRoot(),
          getApiKey,
          action,
          getResourceServerUrl,
          payload.workflowId,
        );
        jsonResponse(res, 200, state);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflow/compile") {
      let payload: { langflowJson?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      if (!payload.langflowJson || typeof payload.langflowJson !== "object") {
        jsonResponse(res, 400, { detail: "langflowJson object required" });
        return;
      }

      try {
        const workspaceRoot = getWorkspaceRoot();
        const workflow = await compileAndWriteWorkflow(
          workspaceRoot,
          payload.langflowJson as Parameters<typeof compileAndWriteWorkflow>[1],
        );
        clearRunner(workspaceRoot);
        const deprecationNote =
          "Langflow compile to workflow.yaml is deprecated. Author project workflows via workflow.yaml, templates, or Workflow Designer; use Langflow for agent flows only.";
        res.writeHead(200, {
          "Content-Type": "application/json",
          Deprecation: "true",
        });
        res.end(
          JSON.stringify({
            ...workflow,
            deprecated: true,
            deprecationNote,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/workflow/run") {
      let payload: { stepId?: string; workflowId?: string } = {};
      try {
        const raw = await readBody(req);
        if (raw.trim()) {
          payload = JSON.parse(raw);
        }
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      try {
        const events = runWorkflowStep(
          getWorkspaceRoot(),
          getApiKey,
          payload.stepId,
          getResourceServerUrl,
          payload.workflowId,
        );
        for await (const event of events) {
          writeSse(res, event.type, event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeSse(res, "message", { type: "message", content: `Error: ${message}` });
        writeSse(res, "done", { type: "done" });
      }
      res.end();
      return;
    }

    const chatMemoryMessagesMatch = pathname?.match(
      /^\/v1\/chat-memory\/threads\/([^/]+)\/messages$/,
    );
    if (req.method === "PUT" && chatMemoryMessagesMatch) {
      const threadId = decodeURIComponent(chatMemoryMessagesMatch[1]);
      const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
      if (!projectRoot) {
        return;
      }

      const scopeResult = parseScopeFromQuery(parseQuery(req.url ?? ""));
      if ("error" in scopeResult) {
        jsonResponse(res, 400, { detail: scopeResult.error });
        return;
      }

      let payload: { messages?: unknown };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }
      if (!Array.isArray(payload.messages)) {
        jsonResponse(res, 400, { detail: "messages array required" });
        return;
      }

      try {
        await saveMessages(
          projectRoot,
          { ...scopeResult.scope, threadId },
          payload.messages as ChatMessage[],
        );
        jsonResponse(res, 200, { ok: true });
      } catch (err) {
        if (isFileNotFound(err)) {
          jsonResponse(res, 404, { detail: "thread not found" });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    const chatMemoryGenerateTitleMatch = pathname?.match(
      /^\/v1\/chat-memory\/threads\/([^/]+)\/generate-title$/,
    );
    if (req.method === "POST" && chatMemoryGenerateTitleMatch) {
      const threadId = decodeURIComponent(chatMemoryGenerateTitleMatch[1]);
      const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
      if (!projectRoot) {
        return;
      }

      const scopeResult = parseScopeFromQuery(parseQuery(req.url ?? ""));
      if ("error" in scopeResult) {
        jsonResponse(res, 400, { detail: scopeResult.error });
        return;
      }

      try {
        const thread = await loadThread(projectRoot, {
          ...scopeResult.scope,
          threadId,
        });
        const meta = normalizeThreadMeta(thread.meta);
        if (meta.titleSource === "user") {
          jsonResponse(res, 409, { detail: "title was set by user" });
          return;
        }

        const apiKey = getApiKey();
        if (!apiKey) {
          jsonResponse(res, 503, { detail: "API key not set" });
          return;
        }

        const title = await generateThreadTitle(thread.messages, apiKey);
        const updated = await updateThreadMeta(
          projectRoot,
          { ...scopeResult.scope, threadId },
          { title, titleSource: "auto" },
        );
        jsonResponse(res, 200, updated);
      } catch (err) {
        if (isFileNotFound(err)) {
          jsonResponse(res, 404, { detail: "thread not found" });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    const chatMemoryThreadMatch = pathname?.match(/^\/v1\/chat-memory\/threads\/([^/]+)$/);
    if (chatMemoryThreadMatch) {
      const threadId = decodeURIComponent(chatMemoryThreadMatch[1]);
      const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
      if (!projectRoot) {
        return;
      }

      const scopeResult = parseScopeFromQuery(parseQuery(req.url ?? ""));
      if ("error" in scopeResult) {
        jsonResponse(res, 400, { detail: scopeResult.error });
        return;
      }

      if (req.method === "GET") {
        try {
          const thread = await loadThread(projectRoot, {
            ...scopeResult.scope,
            threadId,
          });
          jsonResponse(res, 200, thread);
        } catch (err) {
          if (isFileNotFound(err)) {
            jsonResponse(res, 404, { detail: "thread not found" });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 500, { detail: message });
        }
        return;
      }

      if (req.method === "PATCH") {
        let payload: { title?: unknown; titleSource?: unknown; mode?: unknown; skills?: unknown };
        try {
          payload = JSON.parse(await readBody(req));
        } catch {
          jsonResponse(res, 400, { detail: "invalid JSON" });
          return;
        }

        const patch: Partial<Pick<ChatThreadMeta, "title" | "titleSource" | "mode" | "skills">> = {};
        if (payload.title !== undefined) {
          if (typeof payload.title !== "string") {
            jsonResponse(res, 400, { detail: "title must be a string" });
            return;
          }
          patch.title = payload.title;
        }
        if (payload.titleSource !== undefined) {
          const valid: TitleSource[] = ["default", "preview", "auto", "user"];
          if (
            typeof payload.titleSource !== "string" ||
            !valid.includes(payload.titleSource as TitleSource)
          ) {
            jsonResponse(res, 400, { detail: "titleSource must be default, preview, auto, or user" });
            return;
          }
          patch.titleSource = payload.titleSource as TitleSource;
        }
        if (payload.mode !== undefined) {
          if (payload.mode !== "ask" && payload.mode !== "plan" && payload.mode !== "agent") {
            jsonResponse(res, 400, { detail: "mode must be ask, plan, or agent" });
            return;
          }
          patch.mode = payload.mode;
        }
        if (payload.skills !== undefined) {
          if (!Array.isArray(payload.skills)) {
            jsonResponse(res, 400, { detail: "skills must be an array" });
            return;
          }
          patch.skills = payload.skills.filter((s): s is string => typeof s === "string");
        }

        try {
          const meta = await updateThreadMeta(
            projectRoot,
            { ...scopeResult.scope, threadId },
            patch,
          );
          jsonResponse(res, 200, meta);
        } catch (err) {
          if (isFileNotFound(err)) {
            jsonResponse(res, 404, { detail: "thread not found" });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 500, { detail: message });
        }
        return;
      }

      if (req.method === "DELETE") {
        try {
          await deleteThread(projectRoot, { ...scopeResult.scope, threadId });
          jsonResponse(res, 200, { ok: true });
        } catch (err) {
          if (isFileNotFound(err)) {
            jsonResponse(res, 404, { detail: "thread not found" });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          jsonResponse(res, 500, { detail: message });
        }
        return;
      }
    }

    if (req.method === "GET" && pathname === "/v1/chat-memory/threads") {
      const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
      if (!projectRoot) {
        return;
      }

      const scopeResult = parseScopeFromQuery(parseQuery(req.url ?? ""));
      if ("error" in scopeResult) {
        jsonResponse(res, 400, { detail: scopeResult.error });
        return;
      }

      try {
        const threads = await listThreads(projectRoot, scopeResult.scope);
        jsonResponse(res, 200, threads);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/chat-memory/threads") {
      const projectRoot = requireProjectRoot(getWorkspaceRoot, res);
      if (!projectRoot) {
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      const input = parseCreateThreadBody(body);
      if ("error" in input) {
        jsonResponse(res, 400, { detail: input.error });
        return;
      }

      try {
        const meta = await createThread(projectRoot, input);
        jsonResponse(res, 201, meta);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        jsonResponse(res, 500, { detail: message });
      }
      return;
    }

    if (req.method === "POST" && pathname === "/v1/chat") {
      let payload: {
        flow_id?: string;
        thread_id?: string;
        message?: string;
        mode?: string;
        skills?: string[];
        stepId?: string;
        workflowId?: string;
      };
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { detail: "invalid JSON" });
        return;
      }

      let mode: ChatMode = "agent";
      if (payload.mode === "ask" || payload.mode === "plan" || payload.mode === "agent") {
        mode = payload.mode;
      } else if (payload.flow_id === "general-react") {
        mode = "agent";
      } else if (payload.flow_id) {
        jsonResponse(res, 400, { detail: `unknown flow_id: ${payload.flow_id}` });
        return;
      }
      if (!payload.thread_id || !payload.message) {
        jsonResponse(res, 400, { detail: "thread_id and message required" });
        return;
      }
      console.log("syncAgent", syncAgent());
      if (!syncAgent()) {
        jsonResponse(res, 400, { detail: "DEEPSEEK_API_KEY not set" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      prepareSseResponse(res);

      try {
        const events = agentService.streamEvents(payload.thread_id, payload.message, {
          mode,
          skills: payload.skills,
          stepId: payload.stepId,
          workflowId: payload.workflowId,
        });
        const streamFilter = new AgentStreamFilter(mode);
        for await (const event of events) {
          if (event.event === "plan_ready") {
            writeSse(res, "plan_ready", event.data ?? {});
            await drainSseTick();
            continue;
          }
          if (event.event === "on_chat_model_stream") {
            const chunk = event.data?.chunk as { content?: unknown } | undefined;
            const text = streamChunkText(chunk?.content);
            if (text) {
              for (const action of streamFilter.onModelChunk(text)) {
                await writeSseMessageContent(res, action.content);
              }
            }
          } else if (event.event === "on_tool_start") {
            streamFilter.onToolStart();
            if (mode === "agent") {
              writeSse(res, "tool_start", {
                call_id: event.run_id ?? "",
                name: event.name ?? "",
              });
              await drainSseTick();
            }
          } else if (event.event === "on_tool_end") {
            if (mode === "agent") {
              const output = formatToolOutput(event.data?.output);
              writeSse(res, "tool_end", {
                call_id: event.run_id ?? "",
                name: event.name ?? "",
                ok: true,
                ...(output !== undefined ? { output } : {}),
              });
              await drainSseTick();
            }
          }
        }
        for (const action of streamFilter.finish()) {
          await writeSseMessageContent(res, action.content);
        }
        writeSse(res, "done", {});
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        writeSse(res, "message", { content: `\n\nError: ${message}` });
        writeSse(res, "done", {});
      }
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  syncAgent();

  server.listen(port, "127.0.0.1");
  return server;
}
