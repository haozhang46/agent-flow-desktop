import { loadSkillBodies } from "../skills/loader";
import type { AnalyzeGraphRunner, AnalyzeProgress } from "./analyzeService";
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
  projectRoot: string;
  inventory: InventoryEntry[];
  previous: KnowledgeGraph | null;
  outputLanguage: string;
}): string {
  return JSON.stringify(
    {
      projectRoot: input.projectRoot,
      outputLanguage: input.outputLanguage,
      inventory: input.inventory,
      previous: input.previous,
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
    const config = await readUaConfig(input.projectRoot);

    const system = skillBody;
    const user = buildUserPrompt({
      projectRoot: input.projectRoot,
      inventory: input.inventory,
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
