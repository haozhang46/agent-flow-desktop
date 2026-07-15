// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspace } from "../../src/composables/useWorkspace";
import type { WorkspaceFile } from "../../src/types/workspace";

const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}`;

describe("useWorkspace", () => {
  beforeEach(() => {
    window.desktop = {
      getSidecarPort: vi.fn().mockResolvedValue(PORT),
    } as unknown as Window["desktop"];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetchWorkspace GETs /v1/workspace", async () => {
    const payload = {
      workspace: {
        version: 1,
        name: "plat",
        roots: [{ id: "main", path: ".", label: "Main" }],
      },
      roots: [
        {
          id: "main",
          path: ".",
          label: "Main",
          absolutePath: "/tmp/plat",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        expect(String(input)).toBe(`${BASE}/v1/workspace`);
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    const { fetchWorkspace } = useWorkspace();
    await expect(fetchWorkspace()).resolves.toEqual(payload);
  });

  it("saveWorkspace PUTs WorkspaceFile body", async () => {
    const file: WorkspaceFile = {
      version: 1,
      name: "plat",
      roots: [{ id: "main", path: ".", label: "Main" }],
    };
    const response = {
      workspace: file,
      roots: [
        {
          id: "main",
          path: ".",
          label: "Main",
          absolutePath: "/tmp/plat",
        },
      ],
    };
    let method = "";
    let body: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        expect(String(input)).toBe(`${BASE}/v1/workspace`);
        method = init?.method ?? "";
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify(response), { status: 200 });
      }),
    );

    const { saveWorkspace } = useWorkspace();
    await expect(saveWorkspace(file)).resolves.toEqual(response);
    expect(method).toBe("PUT");
    expect(body).toEqual(file);
  });
});
