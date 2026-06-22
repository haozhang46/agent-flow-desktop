import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "yaml";

function moduleDir(): string {
  if (typeof __dirname !== "undefined") {
    return __dirname;
  }
  return path.dirname(fileURLToPath(import.meta.url));
}

async function skillsRoot(): Promise<string> {
  const desktopRoot = path.join(moduleDir(), "../../");
  const desktopSkills = path.join(desktopRoot, "skills");
  try {
    await fs.access(desktopSkills);
    return desktopSkills;
  } catch {
    return path.join(desktopRoot, "../skills");
  }
}

interface RegistrySkill {
  name: string;
  path: string;
  description?: string;
}

interface Registry {
  skills: RegistrySkill[];
}

async function loadRegistry(): Promise<Registry> {
  const root = await skillsRoot();
  const raw = await fs.readFile(path.join(root, "registry.yaml"), "utf8");
  return yaml.parse(raw) as Registry;
}

export async function listSkills(): Promise<string[]> {
  const registry = await loadRegistry();
  return registry.skills.map((s) => s.name);
}

export interface SkillCatalogEntry {
  name: string;
  description: string;
}

export async function listSkillCatalog(): Promise<SkillCatalogEntry[]> {
  const registry = await loadRegistry();
  return registry.skills.map((s) => ({
    name: s.name,
    description: (s as RegistrySkill & { description?: string }).description ?? s.name,
  }));
}

export async function loadSkillBodies(names: string[]): Promise<string[]> {
  const registry = await loadRegistry();
  const root = await skillsRoot();
  const bodies: string[] = [];

  for (const name of names) {
    const skill = registry.skills.find((s) => s.name === name);
    if (!skill) {
      throw new Error(`Unknown skill: ${name}`);
    }
    const content = await fs.readFile(path.join(root, skill.path), "utf8");
    bodies.push(content);
  }

  return bodies;
}
