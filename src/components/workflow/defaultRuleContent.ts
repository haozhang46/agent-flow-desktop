export function defaultRuleContent(path: string): string {
  const name = path.split("/").pop() ?? path;
  if (name.toUpperCase() === "CLAUDE.MD") {
    return "@AGENTS.md\n\n# Claude-Specific Instructions\n\n## Behavioral Rules\n\n- Follow the project rules in AGENTS.md exactly.\n";
  }
  if (name.toUpperCase() === "AGENTS.MD") {
    return "# Project Agent Rules\n\n## Stack\n\n_Describe stack and conventions here._\n\n## What NOT to Do\n\n-\n";
  }
  return `# ${name.replace(/\.md$/i, "")}\n\n_Agent instructions for this file._\n`;
}
