import fs from "node:fs/promises";
import path from "node:path";
import yaml from "yaml";
import { assertValidDraft, type WorkflowDraft } from "./draft";
import { readGraph } from "./graphStore";
import { acquireProjectLock, releaseProjectLock } from "./projectLock";
import {
  curatedSubgraphMarkdown,
  summarizeGraph,
  type GraphSummary,
} from "./summarize";
import type { KnowledgeGraph } from "./types";
import { listWorkflows } from "../workflow/loader";
import { resolveRoots } from "../workspace/store";

export const GREENFIELD_DEFAULT_GOAL =
  "Build a practical greenfield delivery workflow for this project.";

export type GenerateWorkflowRunner = (input: {
  summaryMarkdown: string;
  curatedMarkdown: string;
  goal: string | null;
}) => Promise<unknown>;

function resolveEffectiveGoal(goal: string | null): string {
  const trimmed = goal?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : GREENFIELD_DEFAULT_GOAL;
}

function summaryToMarkdown(summary: GraphSummary): string {
  const lines = [
    `# ${summary.projectName}`,
    "",
    summary.description,
    "",
    `- Nodes: ${summary.nodeCount}`,
    `- Edges: ${summary.edgeCount}`,
    `- Analyzed at: ${summary.analyzedAt ?? "unknown"}`,
    "",
    "## Layers",
    ...(summary.layers.length > 0
      ? summary.layers.map(
          (layer) => `- **${layer.name}** (${layer.nodeCount} nodes)`,
        )
      : ["- _(none)_"]),
    "",
    "## Sample nodes",
    ...(summary.sampleNodes.length > 0
      ? summary.sampleNodes.map(
          (node) =>
            `- \`${node.id}\` (${node.type}): ${node.summary}`,
        )
      : ["- _(none)_"]),
  ];
  return lines.join("\n");
}

function resolveSelectedRootIds(
  graph: KnowledgeGraph,
  rootIds?: string[],
): string[] {
  if (rootIds !== undefined) {
    return rootIds;
  }
  if (graph.project.roots.length > 0) {
    return graph.project.roots.map((root) => root.id);
  }
  return [...new Set(graph.nodes.map((node) => node.rootId))];
}

function assertSelectedRootsAnalyzed(
  graph: KnowledgeGraph,
  rootIds: string[],
): void {
  for (const rootId of rootIds) {
    const hasNodes = graph.nodes.some((node) => node.rootId === rootId);
    if (!hasNodes) {
      throw new Error(
        `Root "${rootId}" is not analyzed (zero nodes in graph); run analyze first`,
      );
    }
  }
}

function buildGitCommitHashes(
  graph: KnowledgeGraph,
  rootIds: string[],
): Record<string, string | null> {
  const byId = new Map(
    graph.project.roots.map((root) => [root.id, root.gitCommitHash] as const),
  );
  const hashes: Record<string, string | null> = {};
  for (const rootId of rootIds) {
    hashes[rootId] = byId.get(rootId) ?? null;
  }
  return hashes;
}

function rollupGitCommitHash(
  hashes: Record<string, string | null>,
): string | null {
  const values = Object.values(hashes);
  if (values.length === 0) return null;
  const first = values[0] ?? null;
  return values.every((value) => value === first) ? first : null;
}

async function resolveNewWorkflowId(
  projectRoot: string,
  baseId: string,
): Promise<string> {
  const existing = new Set((await listWorkflows(projectRoot)).map((w) => w.id));
  if (!existing.has(baseId)) {
    return baseId;
  }
  let n = 2;
  while (existing.has(`${baseId}-${n}`)) {
    n += 1;
  }
  return `${baseId}-${n}`;
}

export async function generateDraft(
  workspaceRoot: string,
  goal: string | null,
  runner: GenerateWorkflowRunner,
  opts?: { rootIds?: string[] },
): Promise<WorkflowDraft> {
  acquireProjectLock(workspaceRoot, "generate");
  try {
    const graph = await readGraph(workspaceRoot);
    if (!graph) {
      throw new Error("No knowledge graph found; run analyze first");
    }

    const selectedRootIds = resolveSelectedRootIds(graph, opts?.rootIds);
    if (opts?.rootIds !== undefined) {
      if (selectedRootIds.length === 0) {
        throw new Error("No roots selected; roots not analyzed");
      }
      assertSelectedRootsAnalyzed(graph, selectedRootIds);
    }

    const effectiveGoal = resolveEffectiveGoal(goal);
    const summaryMarkdown = summaryToMarkdown(summarizeGraph(graph));
    const curatedMarkdown = curatedSubgraphMarkdown(graph, undefined, opts?.rootIds);

    const raw = await runner({
      summaryMarkdown,
      curatedMarkdown,
      goal: effectiveGoal,
    });

    const gitCommitHashes = buildGitCommitHashes(graph, selectedRootIds);
    const base =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
    const baseMeta =
      base.meta && typeof base.meta === "object"
        ? (base.meta as Record<string, unknown>)
        : {};

    return assertValidDraft({
      ...base,
      meta: {
        ...baseMeta,
        rootIds: selectedRootIds,
        gitCommitHashes,
        gitCommitHash: rollupGitCommitHash(gitCommitHashes),
      },
    });
  } finally {
    releaseProjectLock(workspaceRoot, "generate");
  }
}

function assertSafeRelativePath(relPath: string, label: string): void {
  if (path.isAbsolute(relPath)) {
    throw new Error(`${label} must not be an absolute path: ${relPath}`);
  }
  const normalized = path.normalize(relPath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error(`${label} must not contain "..": ${relPath}`);
  }
}

function assertSafeStepId(stepId: string): void {
  if (
    stepId.includes("..") ||
    stepId.includes("/") ||
    stepId.includes("\\")
  ) {
    throw new Error(`Invalid workspace stepId: ${stepId}`);
  }
}

function resolveUnderWorkflowRoot(root: string, relPath: string): string {
  assertSafeRelativePath(relPath, "Prompt path");
  const dest = path.resolve(root, relPath);
  const relative = path.relative(root, dest);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workflow root: ${relPath}`);
  }
  return dest;
}

export async function applyDraft(
  projectRoot: string,
  draft: WorkflowDraft,
  preferredId?: string,
): Promise<{ workflowId: string }> {
  acquireProjectLock(projectRoot, "apply");
  try {
    return await applyDraftUnlocked(projectRoot, draft, preferredId);
  } finally {
    releaseProjectLock(projectRoot, "apply");
  }
}

async function applyDraftUnlocked(
  projectRoot: string,
  draft: WorkflowDraft,
  preferredId?: string,
): Promise<{ workflowId: string }> {
  const validated = assertValidDraft(draft);
  const roots = await resolveRoots(projectRoot);
  const knownRootIds = new Set(roots.map((root) => root.id));
  for (const step of validated.workflow.steps) {
    if (step.rootId !== undefined && !knownRootIds.has(step.rootId)) {
      throw new Error(`Unknown rootId on step "${step.id}": ${step.rootId}`);
    }
  }

  const baseId =
    (preferredId?.trim() ||
      validated.workflow.id?.trim() ||
      "ua-generated") ||
    "ua-generated";
  const workflowId = await resolveNewWorkflowId(projectRoot, baseId);

  const root = path.join(projectRoot, ".agentflow/workflows", workflowId);
  await fs.mkdir(path.join(root, "prompts"), { recursive: true });

  const allowedPromptPaths = new Set(
    validated.workflow.steps.map((step) => step.prompt_template),
  );

  for (const relPath of Object.keys(validated.prompts)) {
    assertSafeRelativePath(relPath, "Prompt path");
    if (!allowedPromptPaths.has(relPath)) {
      throw new Error(
        `Unexpected prompt path not referenced by any step: ${relPath}`,
      );
    }
  }

  for (const relPath of allowedPromptPaths) {
    const body = validated.prompts[relPath];
    const dest = resolveUnderWorkflowRoot(root, relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, body, "utf8");
  }

  const workflow = { ...validated.workflow, id: workflowId };
  await fs.writeFile(
    path.join(root, "workflow.yaml"),
    yaml.stringify(workflow),
    "utf8",
  );

  if (validated.workspaces) {
    const wsDir = path.join(root, "workspaces");
    await fs.mkdir(wsDir, { recursive: true });
    for (const [stepId, config] of Object.entries(validated.workspaces)) {
      assertSafeStepId(stepId);
      await fs.writeFile(
        path.join(wsDir, `${stepId}.workspace.json`),
        JSON.stringify(config, null, 2),
        "utf8",
      );
    }
  }

  await fs.writeFile(
    path.join(root, "meta.json"),
    JSON.stringify(validated.meta, null, 2),
    "utf8",
  );

  return { workflowId };
}
