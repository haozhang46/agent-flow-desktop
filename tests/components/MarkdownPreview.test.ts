// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    run: vi.fn().mockResolvedValue(undefined),
  },
}));

import mermaid from "mermaid";
import MarkdownPreview from "../../src/components/workflow/MarkdownPreview.vue";

describe("MarkdownPreview", () => {
  beforeEach(() => {
    vi.mocked(mermaid.initialize).mockClear();
    vi.mocked(mermaid.run).mockClear();
  });

  it("renders mermaid diagram container and invokes mermaid.run", async () => {
    const wrapper = mount(MarkdownPreview, {
      props: {
        content: "```mermaid\nsequenceDiagram\n  A->>B: hi\n```",
      },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="mermaid-diagram"]').exists()).toBe(true);
    expect(mermaid.initialize).toHaveBeenCalled();
    expect(mermaid.run).toHaveBeenCalled();
  });

  it("mounts without error for plain markdown", async () => {
    const wrapper = mount(MarkdownPreview, {
      props: { content: "# Hello\n\nPlain text." },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="markdown-preview"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Hello");
  });
});
