import { loadSkillBodies } from "../skills/loader";
import type {
  AnalyzeGraphRunner,
  AnalyzeProgress,
  AnalyzeRootMeta,
} from "./analyzeService";
import { assertValidGraph, readUaConfig } from "./graphStore";
import type { InventoryEntry } from "./inventory";
import type { KnowledgeGraph } from "./types";

export type LlmAnalyzeRunnerDeps = {
  getApiKey: () => string | null;
  completeJson: (system: string, user: string) => Promise<unknown>;
};

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```$/i);
  if (fenced) {
    return fenced[1].trim();
  }
  // Tolerate leading/trailing prose around a fenced block
  const embedded = trimmed.match(/```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/i);
  if (embedded) {
    return embedded[1].trim();
  }
  return trimmed;
}

function coerceToObject(raw: unknown): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  return JSON.parse(stripMarkdownFences(raw));
}

function buildUserPrompt(input: {
  workspaceRoot: string;
  inventories: InventoryEntry[];
  selectedRootIds: string[];
  rootMetas: AnalyzeRootMeta[];
  previous: KnowledgeGraph | null;
  outputLanguage: string;
}): string {
  return JSON.stringify(
    {
      workspaceRoot: input.workspaceRoot,
      outputLanguage: input.outputLanguage,
      selectedRootIds: input.selectedRootIds,
      rootMetas: input.rootMetas,
      inventories: input.inventories,
      previous: input.previous,
      instructions: [
        "Emit a KnowledgeGraph covering only the selected roots.",
        "Namespace node ids as root:{rootId}/... and set node.rootId.",
        "filePath values are relative to that root, not the workspace.",
        "Fill project.roots with metadata for each selected root.",
      ],
    },
    null,
    2,
  );
}

export function createLlmAnalyzeRunner(
  deps: LlmAnalyzeRunnerDeps,
): AnalyzeGraphRunner {
  return async (input) => {
    if (!deps.getApiKey()) {
      throw new Error("API key not set");
    }

    if (input.signal.aborted) {
      throw new Error("Analyze aborted");
    }

    const onProgress: (p: AnalyzeProgress) => void = input.onProgress;

    onProgress({ phase: "extract", message: "Loading understand skill" });
    const [skillBody] = await loadSkillBodies(["understand"]);
    const config = await readUaConfig(input.workspaceRoot);

    const system = skillBody;
    const user = buildUserPrompt({
      workspaceRoot: input.workspaceRoot,
      inventories: input.inventories,
      selectedRootIds: input.selectedRootIds,
      rootMetas: input.rootMetas,
      previous: input.previous,
      outputLanguage: config.outputLanguage,
    });

    onProgress({ phase: "extract", message: "Analyzing project with LLM" });
    const raw = await deps.completeJson(system, user);

    if (input.signal.aborted) {
      throw new Error("Analyze aborted");
    }

    onProgress({ phase: "relate", message: "Validating knowledge graph" });
    return assertValidGraph(coerceToObject(raw));
  };
}
