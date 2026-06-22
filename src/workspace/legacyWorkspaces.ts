import type { WorkspaceDefinition } from "./registry";

const ARCH_FILES = [
  { path: "docs/architecture.md", label: "Architecture" },
  { path: "AGENTS.md", label: "AGENTS.md" },
];

export const LEGACY_WORKSPACES: Record<string, WorkspaceDefinition> = {
  prd: {
    version: 1,
    stepId: "prd",
    layout: "stack",
    components: [{ id: "doc", type: "markdown-doc", props: { docsDir: "docs" } }],
  },
  architecture: {
    version: 1,
    stepId: "architecture",
    layout: "stack",
    components: [
      {
        id: "arch",
        type: "architecture-docs",
        props: { files: ARCH_FILES },
      },
    ],
  },
  "fe-dev": {
    version: 1,
    stepId: "fe-dev",
    layout: "stack",
    components: [
      {
        id: "code",
        type: "code-explorer",
        label: "Frontend",
        props: { root: "fe", writable: false },
      },
    ],
  },
  "be-dev": {
    version: 1,
    stepId: "be-dev",
    layout: "stack",
    components: [
      {
        id: "code",
        type: "code-explorer",
        label: "Backend",
        props: { root: "backend", writable: false },
      },
    ],
  },
  test: {
    version: 1,
    stepId: "test",
    layout: "stack",
    components: [{ id: "run", type: "agent-run", props: { reportPath: "test-report.md" } }],
  },
  review: {
    version: 1,
    stepId: "review",
    layout: "stack",
    components: [{ id: "run", type: "agent-run", props: { reportPath: "review-notes.md" } }],
  },
  "test-2": {
    version: 1,
    stepId: "test-2",
    layout: "stack",
    components: [{ id: "run", type: "agent-run", props: { reportPath: "regression-report.md" } }],
  },
  cicd: {
    version: 1,
    stepId: "cicd",
    layout: "stack",
    components: [{ id: "cfg", type: "cicd-config", props: {} }],
  },
};

export function getLegacyWorkspace(stepId: string): WorkspaceDefinition | undefined {
  return LEGACY_WORKSPACES[stepId];
}
