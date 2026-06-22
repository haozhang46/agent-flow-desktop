import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import { validateWorkspace, COMPONENT_PROPS } from "../../electron/workflow/workspaceSchema";

const VALID_FE_DEV = {
  version: 1,
  stepId: "fe-dev",
  layout: "tabs",
  components: [
    {
      id: "arch",
      type: "fe-architecture-plan",
      label: "分层架构",
      props: {
        output: "docs/fe-architecture.md",
        layers: ["pages", "components", "composables", "stores", "api"],
      },
    },
    {
      id: "code",
      type: "code-explorer",
      label: "代码",
      props: { root: "fe", writable: false },
    },
  ],
};

describe("validateWorkspace", () => {
  it("accepts valid fe-dev workspace", () => {
    const ws = validateWorkspace(VALID_FE_DEV);
    expect(ws.stepId).toBe("fe-dev");
    expect(ws.components).toHaveLength(2);
  });

  it("rejects missing version", () => {
    const { version: _v, ...rest } = VALID_FE_DEV;
    expect(() => validateWorkspace(rest)).toThrow(ZodError);
  });

  it("rejects invalid layout", () => {
    expect(() =>
      validateWorkspace({ ...VALID_FE_DEV, layout: "grid" }),
    ).toThrow(ZodError);
  });

  it("rejects unknown component type", () => {
    expect(() =>
      validateWorkspace({
        ...VALID_FE_DEV,
        components: [{ id: "x", type: "unknown-widget", props: {} }],
      }),
    ).toThrow(ZodError);
  });

  it("rejects invalid per-type props", () => {
    expect(() =>
      validateWorkspace({
        ...VALID_FE_DEV,
        components: [{ id: "code", type: "code-explorer", props: {} }],
      }),
    ).toThrow(ZodError);
  });

  it("rejects duplicate component ids", () => {
    expect(() =>
      validateWorkspace({
        ...VALID_FE_DEV,
        components: [
          { id: "dup", type: "cicd-config", props: {} },
          { id: "dup", type: "agent-run", props: {} },
        ],
      }),
    ).toThrow(ZodError);
  });

  it("validates all v1 component prop schemas", () => {
    const cases: Array<{ type: keyof typeof COMPONENT_PROPS; props: Record<string, unknown> }> = [
      { type: "markdown-doc", props: { docsDir: "docs" } },
      {
        type: "architecture-docs",
        props: { files: [{ path: "docs/architecture.md", label: "Architecture" }] },
      },
      { type: "code-explorer", props: { root: "fe" } },
      { type: "agent-run", props: { reportPath: "test-report.md" } },
      { type: "cicd-config", props: {} },
      {
        type: "fe-architecture-plan",
        props: { output: "docs/fe-architecture.md", layers: ["pages"] },
      },
      {
        type: "agent-rules-editor",
        props: {
          files: [
            { path: "AGENTS.md", label: "AGENTS.md" },
            { path: "CLAUDE.md", label: "CLAUDE.md" },
          ],
          editable: true,
        },
      },
      {
        type: "style-tokens-editor",
        props: { preset: "unocss", target: "fe/uno.config.ts" },
      },
      { type: "langflow-panel", props: { flowId: "chat-default", mode: "run" } },
      {
        type: "be-architecture-plan",
        props: { output: "docs/be-architecture.md", layers: ["api/routes"] },
      },
      {
        type: "schema-migrations",
        props: { migrationsDir: "backend/migrations", output: "docs/be-schema.md" },
      },
      { type: "topology-panel", props: { mode: "edit" } },
      { type: "topology-context", props: { focusNodes: ["api"] } },
      { type: "cicd-readiness", props: { gatesStepId: "cicd" } },
      {
        type: "markdown-doc",
        props: {
          mode: "file-list",
          files: [{ path: "docs/be-dataflow.md", label: "Data Flow" }],
        },
      },
    ];

    for (const { type, props } of cases) {
      const ws = validateWorkspace({
        version: 1,
        stepId: "test",
        layout: "stack",
        components: [{ id: "c1", type, props }],
      });
      expect(ws.components[0].type).toBe(type);
    }
  });

  it("rejects langflow-panel with invalid mode", () => {
    expect(() =>
      validateWorkspace({
        version: 1,
        stepId: "test",
        layout: "stack",
        components: [
          { id: "lf", type: "langflow-panel", props: { flowId: "x", mode: "edit" } },
        ],
      }),
    ).toThrow(ZodError);
  });
});
