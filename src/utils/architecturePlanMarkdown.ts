export function extractLayersFromMarkdown(md: string): string[] {
  const lines = md.split("\n");
  const layerSectionIdx = lines.findIndex((l) => /^##\s+layers/i.test(l.trim()));
  if (layerSectionIdx < 0) return [];

  const layers: string[] = [];
  for (let i = layerSectionIdx + 1; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (/^##\s+/.test(line)) break;
    const match = /^[-*]\s*\[[ xX]\]\s*\*\*(.+?)\*\*/.exec(line);
    if (match?.[1]) {
      layers.push(match[1].trim());
    }
  }
  return layers;
}

export function mergeLayerLists(configured: string[], fromMarkdown: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const layer of [...configured, ...fromMarkdown]) {
    const trimmed = layer.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    merged.push(trimmed);
  }
  return merged;
}

export function applyLayersToMarkdown(
  md: string,
  layers: string[],
  checkedLayers: string[],
): string {
  const lines = md.split("\n");
  const layerSectionIdx = lines.findIndex((l) => /^##\s+layers/i.test(l.trim()));
  const nextSectionIdx =
    layerSectionIdx >= 0
      ? lines.findIndex((l, i) => i > layerSectionIdx && /^##\s+/.test(l.trim()))
      : -1;

  const layerLines = layers.map((layer) => {
    const checked = checkedLayers.includes(layer);
    return `- [${checked ? "x" : " "}] **${layer}**`;
  });

  if (layerSectionIdx >= 0) {
    const before = lines.slice(0, layerSectionIdx + 1);
    const after = nextSectionIdx >= 0 ? lines.slice(nextSectionIdx) : [];
    return [...before, "", ...layerLines, "", ...after].join("\n");
  }

  return [`## Layers`, "", ...layerLines, "", md].join("\n");
}

export function buildInitialArchitectureMarkdown(title: string, layers: string[]): string {
  const lines = [`# ${title}`, "", "## Layers", ""];
  for (const layer of layers) {
    lines.push(`- [ ] **${layer}** — describe responsibilities`);
  }
  lines.push("", "## Notes", "", "_Add architecture decisions here._", "");
  return lines.join("\n");
}

export function syncCheckedLayersFromContent(md: string, layers: string[]): string[] {
  const present = layers.filter((layer) => {
    const escaped = layer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^[-*]\\s*\\[[ xX]\\]\\s*\\*\\*${escaped}\\*\\*`, "im");
    return re.test(md);
  });
  return present.length ? present : [...layers];
}
