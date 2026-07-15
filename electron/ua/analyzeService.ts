import fs from "node:fs/promises";
import { inventoryRoot, type InventoryEntry } from "./inventory";
import { readGraph, writeGraph } from "./graphStore";
import { acquireProjectLock, releaseProjectLock } from "./projectLock";
import { mergeReplaceSelected } from "./mergeGraph";
import { readGitCommitHash } from "./gitMeta";
import type { KnowledgeGraph } from "./types";
import {
  ensureWorkspaceFile,
  loadWorkspace,
  resolveRoots,
} from "../workspace/store";

export type AnalyzeRootMeta = {
  id: string;
  label: string;
  path: string;
  gitCommitHash: string | null;
};

export type AnalyzeProgress = {
  phase: "scan" | "extract" | "relate" | "write";
  message: string;
  percent?: number;
  rootId?: string;
};

export type AnalyzeGraphRunner = (input: {
  workspaceRoot: string;
  inventories: InventoryEntry[];
  selectedRootIds: string[];
  rootMetas: AnalyzeRootMeta[];
  previous: KnowledgeGraph | null;
  onProgress: (p: AnalyzeProgress) => void;
  signal: AbortSignal;
}) => Promise<KnowledgeGraph>;

type BusyEntry = {
  controller: AbortController;
  promise: Promise<KnowledgeGraph>;
};

async function isDirectory(absolutePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export class AnalyzeService {
  private readonly runner: AnalyzeGraphRunner;
  private readonly busy = new Map<string, BusyEntry>();
  private readonly progressListeners = new Map<
    string,
    Set<(p: AnalyzeProgress) => void>
  >();

  constructor(runner: AnalyzeGraphRunner) {
    this.runner = runner;
  }

  isBusy(workspaceRoot: string): boolean {
    return this.busy.has(workspaceRoot);
  }

  onProgress(
    workspaceRoot: string,
    cb: (p: AnalyzeProgress) => void,
  ): () => void {
    let set = this.progressListeners.get(workspaceRoot);
    if (!set) {
      set = new Set();
      this.progressListeners.set(workspaceRoot, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        this.progressListeners.delete(workspaceRoot);
      }
    };
  }

  cancel(workspaceRoot: string): void {
    const entry = this.busy.get(workspaceRoot);
    if (entry) {
      entry.controller.abort();
    }
  }

  async start(
    workspaceRoot: string,
    opts?: { forceFull?: boolean; rootIds?: string[] },
  ): Promise<KnowledgeGraph> {
    acquireProjectLock(workspaceRoot, "analyze");

    const controller = new AbortController();
    const run = this.runAnalyze(workspaceRoot, opts, controller);
    this.busy.set(workspaceRoot, { controller, promise: run });

    try {
      return await run;
    } finally {
      this.busy.delete(workspaceRoot);
      releaseProjectLock(workspaceRoot, "analyze");
    }
  }

  private emit(workspaceRoot: string, progress: AnalyzeProgress): void {
    const listeners = this.progressListeners.get(workspaceRoot);
    if (!listeners) return;
    for (const cb of listeners) {
      cb(progress);
    }
  }

  private async runAnalyze(
    workspaceRoot: string,
    opts: { forceFull?: boolean; rootIds?: string[] } | undefined,
    controller: AbortController,
  ): Promise<KnowledgeGraph> {
    const onProgress = (p: AnalyzeProgress) => this.emit(workspaceRoot, p);

    const workspace = await loadWorkspace(workspaceRoot);
    const resolved = await resolveRoots(workspaceRoot, workspace);
    const resolvedById = new Map(resolved.map((root) => [root.id, root]));

    const selectedRootIds =
      opts?.rootIds ??
      workspace.defaults?.analyzeRootIds ??
      resolved.map((root) => root.id);

    if (selectedRootIds.length === 0) {
      throw new Error("no roots selected");
    }

    onProgress({ phase: "scan", message: "Scanning project files" });

    const inventories: InventoryEntry[] = [];
    const rootMetas: AnalyzeRootMeta[] = [];
    const successfulRootIds: string[] = [];
    const errors: string[] = [];

    for (const rootId of selectedRootIds) {
      const root = resolvedById.get(rootId);
      if (!root) {
        const message = `unknown root id: ${rootId}`;
        errors.push(message);
        onProgress({ phase: "scan", message, rootId });
        continue;
      }

      if (!(await isDirectory(root.absolutePath))) {
        const message = `root path missing: ${rootId} (${root.path})`;
        errors.push(message);
        onProgress({ phase: "scan", message, rootId });
        continue;
      }

      onProgress({
        phase: "scan",
        message: `Scanning ${root.label}`,
        rootId,
      });

      try {
        const entries = await inventoryRoot({
          workspaceRoot,
          rootId: root.id,
          absolutePath: root.absolutePath,
        });
        inventories.push(...entries);
        const gitCommitHash = await readGitCommitHash(root.absolutePath);
        rootMetas.push({
          id: root.id,
          label: root.label,
          path: root.path,
          gitCommitHash,
        });
        successfulRootIds.push(root.id);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        const message = `inventory failed for ${rootId}: ${detail}`;
        errors.push(message);
        onProgress({ phase: "scan", message, rootId });
      }
    }

    if (successfulRootIds.length === 0) {
      throw new Error(
        `no successful inventories; ${errors.join("; ") || "no roots selected"}`,
      );
    }

    const previous = opts?.forceFull ? null : await readGraph(workspaceRoot);

    const fresh = await this.runner({
      workspaceRoot,
      inventories,
      selectedRootIds: successfulRootIds,
      rootMetas,
      previous,
      onProgress,
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      throw new Error("Analyze aborted");
    }

    const graph = opts?.forceFull
      ? fresh
      : mergeReplaceSelected(previous, fresh, successfulRootIds);

    onProgress({ phase: "write", message: "Writing knowledge graph" });
    await writeGraph(workspaceRoot, graph);
    await ensureWorkspaceFile(workspaceRoot);
    return graph;
  }
}
