// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import WorkspacePropFields from "../../src/components/workflow/WorkspacePropFields.vue";
import type { PropField } from "../../src/workspace/registry";

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await flushPromises();
  }
}

const filesField: PropField = { key: "files", label: "Files", type: "file-list" };

describe("WorkspacePropFields", () => {
  it("renders file-list rows with path and label inputs", () => {
    const wrapper = mount(WorkspacePropFields, {
      props: {
        fields: [filesField],
        values: {
          files: [
            { path: "AGENTS.md", label: "AGENTS.md" },
            { path: "CLAUDE.md", label: "Claude Rules" },
          ],
        },
      },
    });

    expect(wrapper.find('[data-testid="prop-field-files"]').exists()).toBe(true);

    const rows = wrapper.findAll('[data-testid^="file-list-row-"]');
    expect(rows).toHaveLength(2);

    const row0Inputs = rows[0].findAll("input");
    expect((row0Inputs[0].element as HTMLInputElement).value).toBe("AGENTS.md");
    expect((row0Inputs[1].element as HTMLInputElement).value).toBe("AGENTS.md");

    const row1Inputs = rows[1].findAll("input");
    expect((row1Inputs[0].element as HTMLInputElement).value).toBe("CLAUDE.md");
    expect((row1Inputs[1].element as HTMLInputElement).value).toBe("Claude Rules");
  });

  it("adds, edits, and removes file-list rows with correct emitted values", async () => {
    const wrapper = mount(WorkspacePropFields, {
      props: {
        fields: [filesField],
        values: {
          files: [{ path: "AGENTS.md", label: "AGENTS.md" }],
        },
      },
    });

    await wrapper.find('[data-testid="file-list-add"]').trigger("click");
    await settle();

    let emitted = wrapper.emitted("update:prop");
    expect(emitted).toBeTruthy();
    expect(emitted![emitted!.length - 1][0]).toEqual({
      key: "files",
      value: [
        { path: "AGENTS.md", label: "AGENTS.md" },
        { path: "", label: "" },
      ],
    });

    await wrapper.setProps({
      values: {
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "", label: "" },
        ],
      },
    });

    const newRow = wrapper.find('[data-testid="file-list-row-1"]');
    const newRowInputs = newRow.findAll("input");
    await newRowInputs[0].setValue("docs/README.md");
    await settle();

    emitted = wrapper.emitted("update:prop");
    expect(emitted![emitted!.length - 1][0]).toEqual({
      key: "files",
      value: [
        { path: "AGENTS.md", label: "AGENTS.md" },
        { path: "docs/README.md", label: "" },
      ],
    });

    await wrapper.setProps({
      values: {
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "docs/README.md", label: "" },
        ],
      },
    });

    await wrapper.find('[data-testid="file-list-row-1"]').findAll("input")[1].setValue("Readme");
    await settle();

    emitted = wrapper.emitted("update:prop");
    expect(emitted![emitted!.length - 1][0]).toEqual({
      key: "files",
      value: [
        { path: "AGENTS.md", label: "AGENTS.md" },
        { path: "docs/README.md", label: "Readme" },
      ],
    });

    await wrapper.setProps({
      values: {
        files: [
          { path: "AGENTS.md", label: "AGENTS.md" },
          { path: "docs/README.md", label: "Readme" },
        ],
      },
    });

    await wrapper.find('[data-testid="file-list-remove-0"]').trigger("click");
    await settle();

    emitted = wrapper.emitted("update:prop");
    expect(emitted![emitted!.length - 1][0]).toEqual({
      key: "files",
      value: [{ path: "docs/README.md", label: "Readme" }],
    });
  });
});
