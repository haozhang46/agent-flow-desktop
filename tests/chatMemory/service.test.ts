import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createThread,
  listThreads,
  loadThread,
  saveMessages,
  updateThreadMeta,
  deleteThread,
} from "../../electron/chatMemory/service";
import { metaPath } from "../../electron/chatMemory/paths";

describe("chatMemoryService", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "chat-mem-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("creates and lists free threads sorted by updatedAt desc", async () => {
    const a = await createThread(tmp, {
      scope: "free",
      workflowId: "wf-1",
      title: "First",
    });
    const b = await createThread(tmp, {
      scope: "free",
      workflowId: "wf-1",
      title: "Second",
    });
    await updateThreadMeta(
      tmp,
      { scope: "free", workflowId: "wf-1", threadId: a.id },
      { title: "First updated" },
    );
    const list = await listThreads(tmp, { scope: "free", workflowId: "wf-1" });
    expect(list.map((t) => t.id)).toContain(a.id);
    expect(list[0].title).toBeDefined();
  });

  it("loads and saves messages", async () => {
    const t = await createThread(tmp, {
      scope: "step",
      workflowId: "wf-1",
      stepId: "fe-dev",
      title: "Step chat",
    });
    await saveMessages(
      tmp,
      { scope: "step", workflowId: "wf-1", stepId: "fe-dev", threadId: t.id },
      [{ role: "user", content: "hi" }],
    );
    const loaded = await loadThread(tmp, {
      scope: "step",
      workflowId: "wf-1",
      stepId: "fe-dev",
      threadId: t.id,
    });
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.meta.checkpointThreadId).toMatch(/^step:wf-1:fe-dev:/);
  });

  it("deletes thread directory", async () => {
    const t = await createThread(tmp, { scope: "app", title: "App" });
    await deleteThread(tmp, { scope: "app", threadId: t.id });
    await expect(
      loadThread(tmp, { scope: "app", threadId: t.id }),
    ).rejects.toThrow();
  });

  it("sets titleSource on create and patch", async () => {
    const t = await createThread(tmp, { scope: "app", title: "New Chat" });
    expect(t.titleSource).toBe("default");

    const updated = await updateThreadMeta(
      tmp,
      { scope: "app", threadId: t.id },
      { title: "Hello world", titleSource: "preview" },
    );
    expect(updated.titleSource).toBe("preview");
    expect(updated.title).toBe("Hello world");
  });

  it("infers titleSource when missing from disk", async () => {
    const t = await createThread(tmp, { scope: "app", title: "Old title" });
    const file = metaPath(tmp, { scope: "app" }, t.id);
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    delete raw.titleSource;
    await fs.writeFile(file, JSON.stringify(raw, null, 2), "utf8");

    const loaded = await loadThread(tmp, { scope: "app", threadId: t.id });
    expect(loaded.meta.titleSource).toBe("preview");
  });
});
