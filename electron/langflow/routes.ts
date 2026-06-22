import http from "node:http";
import {
  createWorkspaceFlow,
  getLangflowStatus,
  listWorkspaceFlows,
  setActiveWorkspaceFlow,
} from "./service";

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

export async function handleLangflowRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  method: string,
  getWorkspaceRoot: () => string,
): Promise<boolean> {
  if (method === "GET" && url === "/v1/langflow/status") {
    try {
      const status = await getLangflowStatus();
      jsonResponse(res, 200, status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "GET" && url === "/v1/langflow/flows") {
    try {
      const { flows, activeFlowId } = await listWorkspaceFlows(getWorkspaceRoot());
      jsonResponse(res, 200, { flows, activeFlowId });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "POST" && url === "/v1/langflow/flows") {
    let payload: { name?: string };
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    try {
      const flow = await createWorkspaceFlow(getWorkspaceRoot(), payload.name);
      jsonResponse(res, 201, flow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 500, { detail: message });
    }
    return true;
  }

  if (method === "POST" && url === "/v1/langflow/active") {
    let payload: { flowId?: string };
    try {
      payload = JSON.parse(await readBody(req));
    } catch {
      jsonResponse(res, 400, { detail: "invalid JSON" });
      return true;
    }

    if (!payload.flowId) {
      jsonResponse(res, 400, { detail: "flowId required" });
      return true;
    }

    try {
      const workflow = await setActiveWorkspaceFlow(getWorkspaceRoot(), payload.flowId);
      jsonResponse(res, 200, workflow);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      jsonResponse(res, 400, { detail: message });
    }
    return true;
  }

  return false;
}
