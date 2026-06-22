import { describe, expect, it } from "vitest";
import {
  extractMermaidBlocks,
  isMermaidCodeBlock,
  mermaidBlockHtml,
  renderMarkdownWithMermaid,
} from "../../src/utils/mermaidMarkdown";

describe("mermaidMarkdown", () => {
  it("detects mermaid language tag", () => {
    expect(isMermaidCodeBlock("mermaid")).toBe(true);
    expect(isMermaidCodeBlock("Mermaid")).toBe(true);
    expect(isMermaidCodeBlock("javascript")).toBe(false);
  });

  it("extracts mermaid blocks from markdown", () => {
    const md = `# Title

\`\`\`mermaid
sequenceDiagram
  A->>B: hi
\`\`\`
`;
    expect(extractMermaidBlocks(md)).toEqual(["sequenceDiagram\n  A->>B: hi"]);
  });

  it("renders mermaid fences as diagram divs", () => {
    const md = `# Flow

\`\`\`mermaid
sequenceDiagram
  Client->>API: POST
\`\`\`
`;
    const html = renderMarkdownWithMermaid(md);
    expect(html).toContain('class="mermaid"');
    expect(html).toContain("sequenceDiagram");
    expect(html).toContain("Client-&gt;&gt;API");
  });

  it("renders normal code blocks unchanged", () => {
    const md = "```python\nprint('hi')\n```";
    const html = renderMarkdownWithMermaid(md);
    expect(html).toContain("print");
    expect(html).not.toContain('class="mermaid"');
  });

  it("mermaidBlockHtml escapes angle brackets", () => {
    expect(mermaidBlockHtml("A->>B")).toContain("A-&gt;&gt;B");
  });
});
