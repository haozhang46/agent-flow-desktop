import fs from "node:fs/promises";
import path from "node:path";
import {
  WORKSPACE_REGISTRY,
  type WorkspaceRegistryEntry,
} from "../../shared/workspaceRegistryData";
import {
  parseCustomComponentType,
  type CustomComponentType,
} from "./customComponentTypeSchema";

export type ComponentTypeScope = "project" | "workflow" | "global";

/** Reject path traversal / absolute / empty workflow ids for workflow-scoped dirs. */
export function assertSafeWorkflowId(workflowId: string): string {
  const id = workflowId.trim();
  if (!id) {
    throw new Error("workflowId required for workflow scope");
  }
  if (
    path.isAbsolute(id) ||
    id.includes("..") ||
    id.includes("/") ||
    id.includes("\\") ||
    id.includes("\0")
  ) {
    throw new Error(`Invalid workflowId: ${workflowId}`);
  }
  return id;
}

export function componentTypesDir(
  workspaceRoot: string,
  scope: ComponentTypeScope,
  workflowId?: string,
  userDataRoot?: string,
): string {
  if (scope === "global") {
    if (!userDataRoot) throw new Error("userDataRoot required for global scope");
    return path.join(userDataRoot, "component-types");
  }
  if (scope === "project") {
    return path.join(workspaceRoot, ".agentflow", "component-types");
  }
  const id = assertSafeWorkflowId(workflowId ?? "");
  const workflowsRoot = path.resolve(workspaceRoot, ".agentflow", "workflows");
  const resolved = path.resolve(workflowsRoot, id, "component-types");
  const prefix = workflowsRoot.endsWith(path.sep)
    ? workflowsRoot
    : workflowsRoot + path.sep;
  if (!resolved.startsWith(prefix)) {
    throw new Error(`Invalid workflowId: ${workflowId}`);
  }
  return resolved;
}

function toEntry(t: CustomComponentType): WorkspaceRegistryEntry {
  return {
    type: t.type,
    label: t.label,
    description: t.description,
    category: t.category,
    defaultProps: t.defaultProps,
    propsFields: t.propsFields,
  };
}

async function readDirTypes(dir: string): Promise<CustomComponentType[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: CustomComponentType[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
      out.push(parseCustomComponentType(raw));
    } catch (err) {
      console.warn(
        `[componentTypeStore] skipping corrupt type file ${path.join(dir, name)}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

export async function saveComponentType(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  scope: ComponentTypeScope;
  workflowId?: string;
  typeDef: CustomComponentType;
}): Promise<string> {
  const typeDef = parseCustomComponentType(opts.typeDef);
  const dir = componentTypesDir(
    opts.workspaceRoot,
    opts.scope,
    opts.workflowId,
    opts.userDataRoot,
  );
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${typeDef.type}.json`);
  await fs.writeFile(filePath, JSON.stringify(typeDef, null, 2), "utf8");
  return filePath;
}

export async function listComponentTypes(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
}): Promise<CustomComponentType[]> {
  const map = new Map<string, CustomComponentType>();
  for (const t of await readDirTypes(
    componentTypesDir(opts.workspaceRoot, "global", undefined, opts.userDataRoot),
  )) {
    map.set(t.type, t);
  }
  for (const t of await readDirTypes(
    componentTypesDir(opts.workspaceRoot, "project"),
  )) {
    map.set(t.type, t);
  }
  if (opts.workflowId?.trim()) {
    for (const t of await readDirTypes(
      componentTypesDir(opts.workspaceRoot, "workflow", opts.workflowId),
    )) {
      map.set(t.type, t);
    }
  }
  return [...map.values()];
}

export async function mergeWorkspaceRegistry(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
}): Promise<WorkspaceRegistryEntry[]> {
  const customs = await listComponentTypes(opts);
  const reserved = new Set(WORKSPACE_REGISTRY.map((e) => e.type));
  return [
    ...WORKSPACE_REGISTRY,
    ...customs.filter((c) => !reserved.has(c.type)).map(toEntry),
  ];
}
