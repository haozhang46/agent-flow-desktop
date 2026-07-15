// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUa } from "../../src/composables/useUa";

const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;

describe("useUa", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(PORT),
    } as unknown as Window["desktop"];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchStatus GETs /v1/ua/status", async () => {
    const status = {
      hasGraph: true,
      busy: false,
      busyKind: null,
      summary: null,
      analyzedAt: "2026-07-15T00:00:00.000Z",
      roots: [{ id: "main", label: "Main", path: "." }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        expect(String(input)).toBe(`${BASE}/v1/ua/status`);
        return new Response(JSON.stringify(status), { status: 200 });
      }),
    );

    const { fetchStatus } = useUa();
    await expect(fetchStatus()).resolves.toEqual(status);
  });

  it("fetchSummary and fetchGraph hit summary/graph routes", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/ua/summary")) {
        return new Response(
          JSON.stringify({
            projectName: "fixture-app",
            description: "Minimal",
            nodeCount: 1,
            edgeCount: 0,
            layers: [],
            sampleNodes: [],
            analyzedAt: null,
          }),
          { status: 200 },
        );
      }
      if (url.endsWith("/v1/ua/graph")) {
        return new Response(JSON.stringify({ project: { name: "x" }, nodes: [] }), {
          status: 200,
        });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSummary, fetchGraph } = useUa();
    await fetchSummary();
    await fetchGraph();
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/ua/summary`, undefined);
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/v1/ua/graph`, undefined);
  });

  it("startAnalyze POSTs /v1/ua/analyze", async () => {
    let method = "";
    let body: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${BASE}/v1/ua/analyze`);
        method = init?.method ?? "";
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ started: true }), { status: 202 });
      }),
    );

    const { startAnalyze } = useUa();
    await expect(
      startAnalyze({ forceFull: true, rootIds: ["main", "api"] }),
    ).resolves.toEqual({
      started: true,
    });
    expect(method).toBe("POST");
    expect(body).toEqual({ forceFull: true, rootIds: ["main", "api"] });
  });

  it("cancelAnalyze POSTs cancel; pollProgress returns null on 204", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/ua/analyze/cancel")) {
        expect(init?.method).toBe("POST");
        return new Response(JSON.stringify({ cancelled: true }), { status: 200 });
      }
      if (url.endsWith("/v1/ua/analyze/progress")) {
        return new Response(null, { status: 204 });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { cancelAnalyze, pollProgress } = useUa();
    await expect(cancelAnalyze()).resolves.toEqual({ cancelled: true });
    await expect(pollProgress()).resolves.toBeNull();
  });

  it("pollProgress returns JSON when available", async () => {
    const progress = { phase: "scan", message: "Scanning…", percent: 10 };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(progress), { status: 200 })),
    );

    const { pollProgress } = useUa();
    await expect(pollProgress()).resolves.toEqual(progress);
  });

  it("generateWorkflow and applyWorkflow POST with bodies", async () => {
    const draft = {
      workflow: { version: 1, id: "wf", title: "T", steps: [], edges: [] },
      prompts: {},
      meta: {
        source: "ua-graph",
        analyzedAt: null,
        gitCommitHash: null,
        gitCommitHashes: {},
        rootIds: ["main"],
        goal: "ship it",
      },
    };
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("/v1/ua/generate-workflow")) {
        expect(init?.method).toBe("POST");
        expect(body).toEqual({ goal: "ship it", rootIds: ["main"] });
        return new Response(JSON.stringify({ draft }), { status: 200 });
      }
      if (url.endsWith("/v1/ua/apply-workflow")) {
        expect(body).toEqual({ draft, activate: true });
        return new Response(JSON.stringify({ workflowId: "wf" }), { status: 200 });
      }
      return new Response("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { generateWorkflow, applyWorkflow } = useUa();
    await expect(generateWorkflow("ship it", { rootIds: ["main"] })).resolves.toEqual({
      draft,
    });
    await expect(applyWorkflow(draft as never, { activate: true })).resolves.toEqual({
      workflowId: "wf",
    });
  });

  it("throws on non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const { fetchStatus } = useUa();
    await expect(fetchStatus()).rejects.toThrow(/\/v1\/ua\/status failed \(500\)/);
  });
});
