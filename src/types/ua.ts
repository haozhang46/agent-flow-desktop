/** Frontend mirrors of UA graph / draft shapes (no electron imports). */

export type AnalyzeProgress = {
  phase: "scan" | "extract" | "relate" | "write";
  message: string;
  percent?: number;
};

export type GraphSummary = {
  projectName: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  layers: { id: string; name: string; nodeCount: number }[];
  sampleNodes: { id: string; name: string; type: string; summary: string }[];
  analyzedAt: string | null;
};

export type UaStatusRoot = {
  id: string;
  label: string;
  path: string;
};

export type UaStatus = {
  hasGraph: boolean;
  busy: boolean;
  busyKind: "analyze" | "generate" | null;
  summary: GraphSummary | null;
  analyzedAt: string | null;
  roots: UaStatusRoot[];
};

export type ProjectRootMeta = {
  id: string;
  label: string;
  path: string;
  gitCommitHash: string | null;
};

export type KnowledgeGraph = {
  version?: string;
  project: {
    name: string;
    description: string;
    languages: string[];
    frameworks: string[];
    analyzedAt: string;
    gitCommitHash: string | null;
    roots: ProjectRootMeta[];
  };
  nodes: {
    id: string;
    type: string;
    name: string;
    filePath?: string;
    summary: string;
    tags: string[];
    complexity: "low" | "medium" | "high";
    rootId: string;
  }[];
  edges: {
    source: string;
    target: string;
    type: string;
    direction?: string;
    weight?: number;
  }[];
  layers: {
    id: string;
    name: string;
    description: string;
    nodeIds: string[];
  }[];
  tour: {
    order: number;
    title: string;
    description: string;
    nodeIds: string[];
    languageLesson?: string;
  }[];
};

export type WorkflowDraft = {
  workflow: {
    version: 1;
    id: string;
    title: string;
    steps: {
      id: string;
      title: string;
      executor: string;
      skills: string[];
      outputs: string[];
      prompt_template?: string;
      gate?: string;
      rootId?: string;
    }[];
    edges: { from: string; to: string }[];
  };
  prompts: Record<string, string>;
  workspaces?: Record<string, unknown>;
  meta: {
    source: "ua-graph";
    analyzedAt: string | null;
    gitCommitHash: string | null;
    gitCommitHashes: Record<string, string | null>;
    rootIds: string[];
    goal: string | null;
  };
};
