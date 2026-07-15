# Chat Attachment Init Missing File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When chat attachments point at missing workspace files, create path-specific stubs on disk during `expandChatMessage` so step/free chat send no longer fails.

**Architecture:** Keep workspace HTTP read fail-on-missing. Add pure helpers (`stubContentForPath`, `isMissingFileError`) and extend `expandChatMessage` with an optional `writeFile`. Wire `writeWorkspaceFile` from `WorkflowRun.vue` for both step and free chat.

**Tech Stack:** TypeScript, Vue 3, Vitest, existing `writeWorkspaceFile` / `defaultRuleContent`.

## Global Constraints

- Init only inside `expandChatMessage` when `writeFile` is provided — never change `GET /v1/workspace/file` or agent `read_file` to auto-create.
- Never overwrite an existing file; only write after a missing-file read error.
- Missing detection: error message includes `ENOENT`, `no such file`, or `not found` (case-insensitive for the last two substrings as matched by `includes` on the lowercased or raw message — implement via checking `ENOENT`, `no such file`, and `not found` on `String(err.message || err)`).
- Stub rules (verbatim):
  - `AGENTS.md` / `CLAUDE.md` (basename, case-insensitive match via existing `defaultRuleContent`) → `defaultRuleContent(path)`
  - Basename is `architecture.md` or ends with `-architecture.md` (case-insensitive) → architecture skeleton below
  - Other paths ending in `.md` (case-insensitive) → `# ${basenameWithoutExt}\n\n`
  - Else → `""`
- Architecture skeleton string (exact):

```markdown
# Architecture

## Modules

_

## Data flow

_
```

(trailing newline after the last `_` line; blank line between sections as shown)

- `.agentflow/*` writes still go through `writeWorkspaceFile` confirmation behavior.
- Process attachments serially in order.
- Do not change Architecture panel in this plan.

## File Structure

| File | Role |
|------|------|
| `src/utils/stubContentForPath.ts` | Pure stub generator + export for tests |
| `src/utils/isMissingFileError.ts` | Pure missing-file error detector |
| `src/utils/expandChatMessage.ts` | Read-or-init attachment expansion |
| `src/pages/WorkflowRun.vue` | Pass `writeWorkspaceFile` into expand (step + free) |
| `tests/utils/stubContentForPath.test.ts` | Stub unit tests |
| `tests/utils/isMissingFileError.test.ts` | Missing-error unit tests |
| `tests/utils/expandChatMessage.test.ts` | Expand + init unit tests |

---

### Task 1: `stubContentForPath` + `isMissingFileError`

**Files:**
- Create: `src/utils/stubContentForPath.ts`
- Create: `src/utils/isMissingFileError.ts`
- Create: `tests/utils/stubContentForPath.test.ts`
- Create: `tests/utils/isMissingFileError.test.ts`

**Interfaces:**
- Consumes: `defaultRuleContent` from `src/components/workflow/defaultRuleContent.ts`
- Produces:
  - `stubContentForPath(path: string): string`
  - `isMissingFileError(err: unknown): boolean`

- [ ] **Step 1: Write failing tests for stubs and missing-error helper**

Create `tests/utils/stubContentForPath.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { stubContentForPath } from "../../src/utils/stubContentForPath";

describe("stubContentForPath", () => {
  it("uses defaultRuleContent for AGENTS.md", () => {
    expect(stubContentForPath("AGENTS.md")).toContain("# Project Agent Rules");
  });

  it("uses defaultRuleContent for CLAUDE.md", () => {
    expect(stubContentForPath("CLAUDE.md")).toContain("@AGENTS.md");
  });

  it("returns architecture skeleton for docs/architecture.md", () => {
    expect(stubContentForPath("docs/architecture.md")).toBe(
      "# Architecture\n\n## Modules\n\n_\n\n## Data flow\n\n_\n",
    );
  });

  it("returns architecture skeleton for docs/fe-architecture.md", () => {
    expect(stubContentForPath("docs/fe-architecture.md")).toBe(
      "# Architecture\n\n## Modules\n\n_\n\n## Data flow\n\n_\n",
    );
  });

  it("returns title stub for other markdown", () => {
    expect(stubContentForPath("docs/PRD.md")).toBe("# PRD\n\n");
  });

  it("returns empty string for non-markdown", () => {
    expect(stubContentForPath("src/main.ts")).toBe("");
  });
});
```

Create `tests/utils/isMissingFileError.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isMissingFileError } from "../../src/utils/isMissingFileError";

describe("isMissingFileError", () => {
  it("detects ENOENT", () => {
    expect(isMissingFileError(new Error("ENOENT: no such file or directory"))).toBe(true);
  });

  it("detects not found", () => {
    expect(isMissingFileError(new Error("File not found: docs/architecture.md"))).toBe(true);
  });

  it("rejects other errors", () => {
    expect(isMissingFileError(new Error("EACCES: permission denied"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/stubContentForPath.test.ts tests/utils/isMissingFileError.test.ts`

Expected: FAIL — modules not found / cannot resolve.

- [ ] **Step 3: Implement helpers**

Create `src/utils/isMissingFileError.ts`:

```ts
export function isMissingFileError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  return (
    message.includes("ENOENT") ||
    lower.includes("no such file") ||
    lower.includes("not found")
  );
}
```

Create `src/utils/stubContentForPath.ts`:

```ts
import { defaultRuleContent } from "../components/workflow/defaultRuleContent";

const ARCHITECTURE_STUB =
  "# Architecture\n\n## Modules\n\n_\n\n## Data flow\n\n_\n";

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function stubContentForPath(path: string): string {
  const name = basename(path);
  const upper = name.toUpperCase();
  if (upper === "AGENTS.MD" || upper === "CLAUDE.MD") {
    return defaultRuleContent(path);
  }
  if (upper === "ARCHITECTURE.MD" || upper.endsWith("-ARCHITECTURE.MD")) {
    return ARCHITECTURE_STUB;
  }
  if (upper.endsWith(".MD")) {
    return `# ${name.replace(/\.md$/i, "")}\n\n`;
  }
  return "";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/utils/stubContentForPath.test.ts tests/utils/isMissingFileError.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/stubContentForPath.ts src/utils/isMissingFileError.ts \
  tests/utils/stubContentForPath.test.ts tests/utils/isMissingFileError.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add stub and missing-file helpers for attachment init

EOF
)"
```

---

### Task 2: `expandChatMessage` read-or-init

**Files:**
- Modify: `src/utils/expandChatMessage.ts`
- Modify: `tests/utils/expandChatMessage.test.ts`

**Interfaces:**
- Consumes: `stubContentForPath`, `isMissingFileError`, existing `formatFileForChat`
- Produces: `expandChatMessage(text, attachments, readFile, writeFile?: (path: string, content: string) => Promise<void>): Promise<string>`

- [ ] **Step 1: Extend tests for init behavior**

Append to `tests/utils/expandChatMessage.test.ts` (keep existing tests unchanged):

```ts
  it("inits missing attachment when writeFile is provided", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("ENOENT: no such file or directory");
    });
    const writeFile = vi.fn(async () => undefined);

    const result = await expandChatMessage(
      "generate it",
      [{ path: "docs/architecture.md", label: "Architecture" }],
      readFile,
      writeFile,
    );

    expect(writeFile).toHaveBeenCalledWith(
      "docs/architecture.md",
      "# Architecture\n\n## Modules\n\n_\n\n## Data flow\n\n_\n",
    );
    expect(result).toContain("--- docs/architecture.md ---");
    expect(result).toContain("# Architecture");
    expect(result).toContain("generate it");
  });

  it("does not write when file exists", async () => {
    const readFile = vi.fn(async () => ({ content: "# Existing" }));
    const writeFile = vi.fn(async () => undefined);

    await expandChatMessage(
      "hi",
      [{ path: "docs/architecture.md", label: "Architecture" }],
      readFile,
      writeFile,
    );

    expect(writeFile).not.toHaveBeenCalled();
  });

  it("rethrows missing errors when writeFile is omitted", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("ENOENT: no such file or directory");
    });

    await expect(
      expandChatMessage("hi", [{ path: "docs/architecture.md", label: "A" }], readFile),
    ).rejects.toThrow(/ENOENT/);
  });

  it("rethrows non-missing read errors without writing", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("EACCES: permission denied");
    });
    const writeFile = vi.fn(async () => undefined);

    await expect(
      expandChatMessage(
        "hi",
        [{ path: "docs/architecture.md", label: "A" }],
        readFile,
        writeFile,
      ),
    ).rejects.toThrow(/EACCES/);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("propagates write failures", async () => {
    const readFile = vi.fn(async () => {
      throw new Error("File not found: docs/architecture.md");
    });
    const writeFile = vi.fn(async () => {
      throw new Error("user_denied");
    });

    await expect(
      expandChatMessage(
        "hi",
        [{ path: "docs/architecture.md", label: "A" }],
        readFile,
        writeFile,
      ),
    ).rejects.toThrow(/user_denied/);
  });
```

- [ ] **Step 2: Run expand tests — new cases fail**

Run: `npx vitest run tests/utils/expandChatMessage.test.ts`

Expected: FAIL on init test (no 4th arg / no write behavior).

- [ ] **Step 3: Implement read-or-init**

Replace `src/utils/expandChatMessage.ts` with:

```ts
import { formatFileForChat } from "./formatFileForChat";
import { isMissingFileError } from "./isMissingFileError";
import { stubContentForPath } from "./stubContentForPath";
import type { ChatAttachment } from "@agent-flow/shared-ui";

export async function expandChatMessage(
  text: string,
  attachments: ChatAttachment[],
  readFile: (path: string) => Promise<{ content: string }>,
  writeFile?: (path: string, content: string) => Promise<void>,
): Promise<string> {
  const blocks: string[] = [];
  for (const a of attachments) {
    let content: string;
    try {
      const file = await readFile(a.path);
      content = file.content;
    } catch (err) {
      if (!writeFile || !isMissingFileError(err)) {
        throw err;
      }
      content = stubContentForPath(a.path);
      await writeFile(a.path, content);
    }
    blocks.push(formatFileForChat(a.path, content));
  }
  const trimmed = text.trim();
  if (blocks.length && trimmed) return `${blocks.join("\n\n")}\n\n${trimmed}`;
  if (blocks.length) return blocks.join("\n\n");
  return trimmed;
}
```

- [ ] **Step 4: Run expand tests — all pass**

Run: `npx vitest run tests/utils/expandChatMessage.test.ts`

Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/utils/expandChatMessage.ts tests/utils/expandChatMessage.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): init missing attachments during message expand

EOF
)"
```

---

### Task 3: Wire `writeWorkspaceFile` in `WorkflowRun`

**Files:**
- Modify: `src/pages/WorkflowRun.vue` (both `expandChatMessage` call sites — step chat ~716 and free chat ~826)
- Test: verify via grep/manual checklist; add a focused unit test only if the project already tests `WorkflowRun` send helpers — prefer confirming both call sites pass the 4th argument.

**Interfaces:**
- Consumes: Task 2 `expandChatMessage` signature; existing `writeWorkspaceFile` from `useWorkflow`
- Produces: step + free chat sends init missing attachments

- [ ] **Step 1: Confirm `writeWorkspaceFile` is in scope in `WorkflowRun.vue`**

Find the `useWorkflow()` destructure near the top of the script. If `writeWorkspaceFile` is not already destructured, add it alongside `readWorkspaceFile`.

- [ ] **Step 2: Pass `writeWorkspaceFile` at both expand call sites**

Change both:

```ts
expanded = await expandChatMessage(payload.text, payload.attachments, readWorkspaceFile);
```

to:

```ts
expanded = await expandChatMessage(
  payload.text,
  payload.attachments,
  readWorkspaceFile,
  writeWorkspaceFile,
);
```

- [ ] **Step 3: Sanity-check with related unit tests**

Run: `npx vitest run tests/utils/expandChatMessage.test.ts tests/utils/stubContentForPath.test.ts tests/utils/isMissingFileError.test.ts`

Expected: PASS

Also run any existing WorkflowRun-related tests if present:

Run: `npx vitest run tests/pages/WorkflowRun.test.ts`

Expected: PASS (or skip if file absent — do not invent a heavy component test).

- [ ] **Step 4: Commit**

```bash
git add src/pages/WorkflowRun.vue
git commit -m "$(cat <<'EOF'
feat(chat): wire attachment init write into WorkflowRun sends

EOF
)"
```

---

## Spec Coverage Self-Check

| Spec requirement | Task |
|------------------|------|
| expandChatMessage read-or-init | 2 |
| Path-specific stubs | 1 |
| Any attachment path | 2 + 1 stubs |
| writeWorkspaceFile from WorkflowRun step + free | 3 |
| No GET/read_file auto-create | Global / not implemented |
| Never overwrite | 2 (write only after missing) |
| Write failure aborts send | 2 + existing WorkflowRun catch |
| Serial attachments | 2 (`for` loop) |
