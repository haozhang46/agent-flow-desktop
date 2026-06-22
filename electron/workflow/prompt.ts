import fs from "node:fs/promises";
import path from "node:path";
import { loadSkillBodies } from "../skills/loader";
import { templatesRoot } from "./loader";

export async function buildSystemPrompt(
  agentsMdPath: string | null | undefined,
  skillNames: string[],
  workspaceRoot: string,
  resourceContext?: string,
): Promise<string> {
  const parts: string[] = [];

  const resolvedPath =
    agentsMdPath == null || agentsMdPath === "AGENTS.md"
      ? path.join(workspaceRoot, "AGENTS.md")
      : path.join(workspaceRoot, agentsMdPath);

  try {
    parts.push(await fs.readFile(resolvedPath, "utf8"));
  } catch {
    // AGENTS.md is optional
  }

  if (skillNames.length > 0) {
    const bodies = await loadSkillBodies(skillNames);
    parts.push(...bodies);
  }

  if (resourceContext?.trim()) {
    parts.push(resourceContext.trim());
  }

  return parts.filter(Boolean).join("\n\n---\n\n");
}

async function resolvePromptTemplatePath(
  templateRelPath: string,
  projectRoot: string,
  workflowId?: string,
): Promise<string | null> {
  const candidates = [path.join(projectRoot, ".agentflow", templateRelPath)];
  if (workflowId) {
    candidates.push(path.join(templatesRoot(), workflowId, templateRelPath));
  }
  candidates.push(path.join(templatesRoot(), "default-dev-cicd", templateRelPath));

  for (const templatePath of candidates) {
    try {
      await fs.access(templatePath);
      return templatePath;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function renderPromptTemplate(
  templateRelPath: string,
  projectRoot: string,
  vars: Record<string, string> = {},
  workflowId?: string,
): Promise<string> {
  const templatePath = await resolvePromptTemplatePath(templateRelPath, projectRoot, workflowId);
  if (!templatePath) {
    throw new Error(`Prompt template not found: ${templateRelPath}`);
  }
  let content = await fs.readFile(templatePath, "utf8");

  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }

  return content;
}
