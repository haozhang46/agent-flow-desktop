import { inventoryProject, type InventoryEntry } from "./inventory";
import { readGraph, writeGraph } from "./graphStore";
import type { KnowledgeGraph } from "./types";

export type AnalyzeProgress = {
  phase: "scan" | "extract" | "relate" | "write";
  message: string;
  percent?: number;
};

export type AnalyzeGraphRunner = (input: {
  projectRoot: string;
  inventory: InventoryEntry[];
  previous: KnowledgeGraph | null;
  onProgress: (p: AnalyzeProgress) => void;
  signal: AbortSignal;
}) => Promise<KnowledgeGraph>;

type BusyEntry = {
  controller: AbortController;
  promise: Promise<KnowledgeGraph>;
};

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

  isBusy(projectRoot: string): boolean {
    return this.busy.has(projectRoot);
  }

  onProgress(projectRoot: string, cb: (p: AnalyzeProgress) => void): () => void {
    let set = this.progressListeners.get(projectRoot);
    if (!set) {
      set = new Set();
      this.progressListeners.set(projectRoot, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) {
        this.progressListeners.delete(projectRoot);
      }
    };
  }

  cancel(projectRoot: string): void {
    const entry = this.busy.get(projectRoot);
    if (entry) {
      entry.controller.abort();
    }
  }

  async start(
    projectRoot: string,
    opts?: { forceFull?: boolean },
  ): Promise<KnowledgeGraph> {
    if (this.busy.has(projectRoot)) {
      throw new Error(`Analyze already running for ${projectRoot}`);
    }

    const controller = new AbortController();
    const run = this.runAnalyze(projectRoot, opts, controller);
    this.busy.set(projectRoot, { controller, promise: run });

    try {
      return await run;
    } finally {
      this.busy.delete(projectRoot);
    }
  }

  private emit(projectRoot: string, progress: AnalyzeProgress): void {
    const listeners = this.progressListeners.get(projectRoot);
    if (!listeners) return;
    for (const cb of listeners) {
      cb(progress);
    }
  }

  private async runAnalyze(
    projectRoot: string,
    opts: { forceFull?: boolean } | undefined,
    controller: AbortController,
  ): Promise<KnowledgeGraph> {
    const onProgress = (p: AnalyzeProgress) => this.emit(projectRoot, p);

    onProgress({ phase: "scan", message: "Scanning project files" });
    const inventory = await inventoryProject(projectRoot);

    const previous = opts?.forceFull ? null : await readGraph(projectRoot);

    const graph = await this.runner({
      projectRoot,
      inventory,
      previous,
      onProgress,
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      throw new Error("Analyze aborted");
    }

    onProgress({ phase: "write", message: "Writing knowledge graph" });
    await writeGraph(projectRoot, graph);
    return graph;
  }
}
