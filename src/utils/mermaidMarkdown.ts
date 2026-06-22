import { marked } from "marked";

const MERMAID_LANG = "mermaid";

export function isMermaidCodeBlock(lang: string | undefined): boolean {
  return (lang ?? "").trim().toLowerCase() === MERMAID_LANG;
}

export function mermaidBlockHtml(source: string): string {
  const escaped = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<div class="mermaid" data-testid="mermaid-diagram">${escaped}</div>`;
}

export function extractMermaidBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const re = /```\s*mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    blocks.push(match[1]?.trim() ?? "");
  }
  return blocks;
}

export function renderMarkdownWithMermaid(markdown: string): string {
  marked.use({
    renderer: {
      code({ text, lang }) {
        if (isMermaidCodeBlock(lang)) {
          return mermaidBlockHtml(text);
        }
        return false;
      },
    },
  });
  return marked.parse(markdown) as string;
}
