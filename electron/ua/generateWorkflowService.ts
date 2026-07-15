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
import { listWorkflows } from "../workflow/loader";

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
  projectRoot: string,
  goal: string | null,
  runner: GenerateWorkflowRunner,
): Promise<WorkflowDraft> {
  acquireProjectLock(projectRoot, "generate");
  try {
    const graph = await readGraph(projectRoot);
    if (!graph) {
      throw new Error("No knowledge graph found; run analyze first");
    }

    const effectiveGoal = resolveEffectiveGoal(goal);
    const summaryMarkdown = summaryToMarkdown(summarizeGraph(graph));
    const curatedMarkdown = curatedSubgraphMarkdown(graph);

    const raw = await runner({
      summaryMarkdown,
      curatedMarkdown,
      goal: effectiveGoal,
    });

    return assertValidDraft(raw);
  } finally {
    releaseProjectLock(projectRoot, "generate");
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
  const validated = assertValidDraft(draft);
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
