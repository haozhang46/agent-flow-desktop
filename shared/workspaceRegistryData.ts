export type PropFieldType =
  | "string"
  | "boolean"
  | "select"
  | "string[]"
  | "file-list"
  | "skills"
  | "langflow-flow";

export type PropField = {
  key: string;
  label: string;
  type: PropFieldType;
  required?: boolean;
  options?: string[];
};

export type WorkspaceRegistryEntry = {
  type: string;
  label: string;
  description: string;
  category: string;
  defaultProps: Record<string, unknown>;
  propsFields: PropField[];
};

export const WORKSPACE_REGISTRY: WorkspaceRegistryEntry[] = [
  {
    type: "markdown-doc",
    label: "Markdown Doc",
    description: "Single document editor and preview",
    category: "docs",
    defaultProps: { docsDir: "docs" },
    propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
  },
  {
    type: "architecture-docs",
    label: "Architecture Docs",
    description: "Multi-tab architecture documentation",
    category: "docs",
    defaultProps: { files: [] },
    propsFields: [{ key: "files", label: "Files", type: "file-list" }],
  },
  {
    type: "code-explorer",
    label: "Code Explorer",
    description: "File tree with view and optional edit",
    category: "code",
    defaultProps: { root: ".", writable: false },
    propsFields: [
      { key: "root", label: "Root path", type: "string", required: true },
      { key: "writable", label: "Writable", type: "boolean" },
    ],
  },
  {
    type: "agent-run",
    label: "Agent Run",
    description: "Gates, phase, and run status panel",
    category: "workflow",
    defaultProps: {},
    propsFields: [{ key: "reportPath", label: "Report path", type: "string" }],
  },
  {
    type: "cicd-config",
    label: "CI/CD Config",
    description: "Deployment and ops summary",
    category: "ops",
    defaultProps: {},
    propsFields: [],
  },
  {
    type: "fe-architecture-plan",
    label: "FE Architecture Plan",
    description: "Frontend layered architecture planner",
    category: "frontend",
    defaultProps: { output: "docs/fe-architecture.md", layers: ["pages", "components", "composables"] },
    propsFields: [
      { key: "output", label: "Output file", type: "string", required: true },
      { key: "layers", label: "Layers", type: "string[]", required: true },
    ],
  },
  {
    type: "be-architecture-plan",
    label: "BE Architecture Plan",
    description: "Backend layered architecture planner",
    category: "backend",
    defaultProps: {
      output: "docs/be-architecture.md",
      layers: ["api/routes", "agent/graph", "flows", "rag", "auth", "skills"],
    },
    propsFields: [
      { key: "output", label: "Output file", type: "string", required: true },
      { key: "layers", label: "Layers", type: "string[]", required: true },
    ],
  },
  {
    type: "schema-migrations",
    label: "Schema Migrations",
    description: "Read-only migration scanner and schema summary",
    category: "backend",
    defaultProps: { migrationsDir: "backend/migrations", output: "docs/be-schema.md" },
    propsFields: [
      { key: "migrationsDir", label: "Migrations directory", type: "string", required: true },
      { key: "output", label: "Summary output", type: "string", required: true },
    ],
  },
  {
    type: "topology-panel",
    label: "Topology Panel",
    description: "Service topology and middleware editor",
    category: "backend",
    defaultProps: { mode: "edit", resourcesFile: ".agentflow/resources.yaml" },
    propsFields: [
      { key: "mode", label: "Mode", type: "select", options: ["edit", "view"] },
      { key: "resourcesFile", label: "Resources file", type: "string" },
    ],
  },
  {
    type: "topology-context",
    label: "Topology Context",
    description: "Read-only service topology slice for frontend context",
    category: "frontend",
    defaultProps: { focusNodes: ["api"], envKeys: ["NUXT_PUBLIC_API_BASE"] },
    propsFields: [
      { key: "focusNodes", label: "Focus nodes", type: "string[]" },
      { key: "envKeys", label: "Env keys", type: "string[]" },
    ],
  },
  {
    type: "cicd-readiness",
    label: "CI/CD Readiness",
    description: "Aggregate file, topology, and gate checks before deploy",
    category: "ops",
    defaultProps: { gatesStepId: "cicd" },
    propsFields: [{ key: "gatesStepId", label: "Gates step id", type: "string" }],
  },
  {
    type: "component-splitter",
    label: "Component Splitter",
    description: "Component tree with skill load and manual edit",
    category: "frontend",
    defaultProps: { output: "docs/components.md", skills: [], editable: true },
    propsFields: [
      { key: "output", label: "Output file", type: "string", required: true },
      { key: "skills", label: "Skills", type: "skills" },
      { key: "editable", label: "Editable", type: "boolean" },
    ],
  },
  {
    type: "agent-rules-editor",
    label: "Agent Rules Editor",
    description: "Edit and add AGENTS.md, CLAUDE.md, and similar agent instruction files",
    category: "frontend",
    defaultProps: {
      files: [
        { path: "AGENTS.md", label: "AGENTS.md" },
        { path: "CLAUDE.md", label: "CLAUDE.md" },
      ],
      editable: true,
    },
    propsFields: [
      { key: "files", label: "Files", type: "file-list" },
      { key: "editable", label: "Editable", type: "boolean" },
    ],
  },
  {
    type: "style-tokens-editor",
    label: "Style Tokens Editor",
    description: "UnoCSS or Tailwind-like token editor",
    category: "frontend",
    defaultProps: { preset: "unocss", target: "uno.config.ts" },
    propsFields: [
      { key: "preset", label: "Preset", type: "select", required: true, options: ["unocss", "tailwind"] },
      { key: "target", label: "Target file", type: "string", required: true },
      { key: "themeFile", label: "Theme file", type: "string" },
    ],
  },
  {
    type: "langflow-panel",
    label: "Langflow Panel",
    description: "Embed a Langflow flow for agent execution",
    category: "agent",
    defaultProps: { flowId: "", mode: "run" },
    propsFields: [
      { key: "flowId", label: "Flow", type: "langflow-flow", required: true },
      { key: "mode", label: "Mode", type: "select", required: true, options: ["run"] },
    ],
  },
];
