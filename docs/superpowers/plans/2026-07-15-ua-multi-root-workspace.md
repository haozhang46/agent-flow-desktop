# UA Multi-Root Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the open folder a multi-root workspace (`workspace.json` + workspace-scoped `.ua/` / `.agentflow/`) so users can selectively analyze and generate workflows across one or many source folders / git repos.

**Architecture:** Introduce `electron/workspace/*` for `workspace.json`. Extend UA graph/draft schemas with `rootId` and `project.roots`. Analyze inventories each selected root, merges with Replace-selected into one workspace graph. Generate/summarize filter by selected roots; workflow steps may carry `rootId` for executor cwd. Single-repo without `workspace.json` remains an implicit `{ id: "main", path: "." }` root.

**Tech Stack:** Vue 3, Electron sidecar HTTP (`/v1/ua/*`, `/v1/workspace`), Zod, Vitest, existing UA services/skills.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-15-ua-multi-root-workspace-design.md`
- Two manual steps: analyze → confirm → generate (no auto-chain)
- One workspace-level `.ua/knowledge-graph.json` (not per-source-root dual-write)
- Node ids namespaced as `root:{rootId}/...`; file nodes require `rootId`; `filePath` relative to that root
- Partial re-analyze uses **Replace-selected** merge
- Implicit migration: missing `workspace.json` ⇒ single root `{ id: "main", path: ".", label: dirname }`; write file on first successful analyze or when user saves roots
- Lock granularity remains per workspace folder path (existing `projectLock` key = workspace root)
- Empty `rootIds` selection is rejected / UI-disabled
- Template “add workflow from template” path unchanged
- Apply may only write under `{workspace}/.agentflow/`; step cwd must resolve to a registered root (or workspace root when no `rootId`)
- Prompt budgeting: curated subgraph for selected roots only (cross-edges both ends in selection)
- Prefer TDD; do not commit secrets or `.ua/` runtime junk from local experiments

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/workspace/types.ts` | Zod schemas for `workspace.json` |
| `electron/workspace/store.ts` | load/save/resolve roots; implicit `main` |
| `electron/workspace/routes.ts` | `GET/PUT /v1/workspace` roots API |
| `electron/ua/types.ts` | Graph schema: `rootId`, `project.roots` |
| `electron/ua/mergeGraph.ts` | Replace-selected merge helper |
| `electron/ua/inventory.ts` | `inventoryRoot` returning entries with `rootId` |
| `electron/ua/gitMeta.ts` | Read git commit hash for a root path |
| `electron/ua/analyzeService.ts` | Multi-root inventory + merge + ensure workspace.json |
| `electron/ua/summarize.ts` | Filter curated subgraph by `rootIds` |
| `electron/ua/draft.ts` | Draft meta: `rootIds`, `gitCommitHashes`; steps `rootId` |
| `electron/ua/generateWorkflowService.ts` | Filter + validate step rootIds on apply |
| `electron/ua/routes.ts` | Accept `rootIds` on analyze/generate; expose workspace roots on status |
| `electron/workflow/types.ts` | Optional `rootId` on steps |
| `electron/workflow/stepRunner.ts` | Resolve executor `workspaceRoot` from step `rootId` |
| `skills/understand/SKILL.md` | Multi-root inventory / namespacing |
| `skills/generate-workflow-from-graph/SKILL.md` | Emit step `rootId` when repo-specific |
| `src/types/ua.ts` / `src/types/workspace.ts` | Frontend mirrors |
| `src/composables/useUa.ts` / `useWorkspace.ts` | API clients |
| `src/pages/Settings.vue` | Roots editor |
| `src/components/ua/ProjectUnderstandPanel.vue` | Root multi-select |
| `tests/workspace/*.test.ts` | Workspace unit tests |
| `tests/ua/*.test.ts` | Extend existing UA tests |
| `tests/fixtures/workspace/*` | Multi-root fixtures |

---

### Task 1: Workspace store (load / save / resolve)

**Files:**
- Create: `electron/workspace/types.ts`
- Create: `electron/workspace/store.ts`
- Create: `tests/workspace/store.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `WorkspaceRootSchema`: `{ id: string, path: string, label: string }`
  - `WorkspaceFileSchema`: `{ version: 1, name: string, roots: WorkspaceRoot[], defaults?: { analyzeRootIds?: string[] } }`
  - `type ResolvedRoot = { id: string; path: string; label: string; absolutePath: string }`
  - `loadWorkspace(workspaceRoot: string): Promise<WorkspaceFile>` — missing file ⇒ synthetic single `main` root (do not write)
  - `saveWorkspace(workspaceRoot: string, file: WorkspaceFile): Promise<void>`
  - `resolveRoots(workspaceRoot: string, file?: WorkspaceFile): Promise<ResolvedRoot[]>`
  - `ensureWorkspaceFile(workspaceRoot: string): Promise<WorkspaceFile>` — writes synthetic if missing

- [ ] **Step 1: Write failing tests**

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureWorkspaceFile,
  loadWorkspace,
  resolveRoots,
  saveWorkspace,
} from "../../electron/workspace/store";

describe("workspace store", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ws-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads implicit main root when workspace.json missing", async () => {
    const file = await loadWorkspace(dir);
    expect(file.roots).toEqual([
      { id: "main", path: ".", label: path.basename(dir) },
    ]);
    await expect(fs.access(path.join(dir, "workspace.json"))).rejects.toThrow();
  });

  it("resolves relative root paths against workspace root", async () => {
    const sibling = await fs.mkdtemp(path.join(os.tmpdir(), "api-"));
    await saveWorkspace(dir, {
      version: 1,
      name: "plat",
      roots: [
        { id: "main", path: ".", label: "Main" },
        { id: "api", path: path.relative(dir, sibling), label: "API" },
      ],
    });
    const roots = await resolveRoots(dir);
    expect(roots.find((r) => r.id === "api")!.absolutePath).toBe(
      path.resolve(sibling),
    );
    await fs.rm(sibling, { recursive: true, force: true });
  });

  it("ensureWorkspaceFile writes workspace.json", async () => {
    await ensureWorkspaceFile(dir);
    const raw = JSON.parse(
      await fs.readFile(path.join(dir, "workspace.json"), "utf8"),
    );
    expect(raw.roots[0].id).toBe("main");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace/store.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement types + store**

`electron/workspace/types.ts` — Zod as in Interfaces.
`electron/workspace/store.ts` — implement load/save/resolve/ensure; validate unique `id`s on save; `path.resolve(workspaceRoot, root.path)` for absolutePath.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/workspace/store.test.ts`

- [ ] **Step 5: Commit**

```bash
git add electron/workspace tests/workspace
git commit -m "feat(workspace): add workspace.json load/save and root resolution"
```

---

### Task 2: Graph schema + Replace-selected merge

**Files:**
- Modify: `electron/ua/types.ts`
- Modify: `src/types/ua.ts`
- Create: `electron/ua/mergeGraph.ts`
- Create: `tests/ua/mergeGraph.test.ts`
- Modify: `tests/fixtures/ua/minimal-graph.json` (add `rootId: "main"` on file nodes; add `project.roots`)
- Modify: existing graphStore / summarize tests only if schema breaks them

**Interfaces:**
- Consumes: `KnowledgeGraph` from types
- Produces:
  - `ProjectRootMetaSchema`: `{ id, label, path, gitCommitHash: string | null }`
  - `ProjectSchema` adds `roots: z.array(ProjectRootMetaSchema).default([])` (keep `gitCommitHash` on project for UA compat = first selected or null)
  - `GraphNodeSchema` adds `rootId: z.string().optional()` — **required** when `type === "file"` via superRefine OR always require `rootId` on all nodes (prefer: required on every node)
  - `mergeReplaceSelected(previous: KnowledgeGraph | null, fresh: KnowledgeGraph, selectedRootIds: string[]): KnowledgeGraph`

Merge rules:
1. Keep previous nodes whose `rootId` is **not** in `selectedRootIds`
2. Add all nodes from `fresh` (expected to be only selected roots)
3. Keep previous edges where both endpoints still exist after step 1+2 and at least one endpoint’s rootId is not in selection **or** both endpoints remain; simpler: keep any edge whose `source` and `target` both exist in the merged node set
4. Layers/tour: rebuild from fresh for selected roots’ node ids + retain previous layer entries that only reference kept nodes; or simpler v1: concatenate layers then filter `nodeIds` to existing nodes, drop empty layers
5. `project.roots`: union by id from previous + fresh; for selected ids take fresh meta

- [ ] **Step 1: Failing merge test**

```ts
import { describe, expect, it } from "vitest";
import { mergeReplaceSelected } from "../../electron/ua/mergeGraph";
import type { KnowledgeGraph } from "../../electron/ua/types";

function node(id: string, rootId: string): KnowledgeGraph["nodes"][number] {
  return {
    id,
    type: "file",
    name: id,
    filePath: "x.ts",
    summary: "s",
    tags: [],
    complexity: "low",
    rootId,
  };
}

const baseProject = {
  name: "w",
  description: "d",
  languages: [] as string[],
  frameworks: [] as string[],
  analyzedAt: "2026-07-15T00:00:00.000Z",
  gitCommitHash: null as string | null,
  roots: [] as { id: string; label: string; path: string; gitCommitHash: string | null }[],
};

it("keeps other roots when replacing selected", () => {
  const previous: KnowledgeGraph = {
    project: {
      ...baseProject,
      roots: [
        { id: "web", label: "Web", path: "../web", gitCommitHash: "aaa" },
        { id: "api", label: "API", path: "../api", gitCommitHash: "bbb" },
      ],
    },
    nodes: [node("root:web/file:a", "web"), node("root:api/file:b", "api")],
    edges: [{ source: "root:web/file:a", target: "root:api/file:b", type: "calls" }],
    layers: [],
    tour: [],
  };
  const fresh: KnowledgeGraph = {
    project: {
      ...baseProject,
      roots: [{ id: "api", label: "API", path: "../api", gitCommitHash: "ccc" }],
    },
    nodes: [node("root:api/file:b2", "api")],
    edges: [],
    layers: [],
    tour: [],
  };
  const merged = mergeReplaceSelected(previous, fresh, ["api"]);
  expect(merged.nodes.map((n) => n.id).sort()).toEqual([
    "root:api/file:b2",
    "root:web/file:a",
  ]);
  expect(merged.edges).toEqual([]); // dangling cross-edge dropped
  expect(merged.project.roots.find((r) => r.id === "api")!.gitCommitHash).toBe("ccc");
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/ua/mergeGraph.test.ts`

- [ ] **Step 3: Implement schema + mergeGraph; update fixture + fix broken unit tests**

- [ ] **Step 4: Run** `npm test -- tests/ua/mergeGraph.test.ts tests/ua/graphStore.test.ts tests/ua/summarize.test.ts`

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(ua): namespaced rootId graph schema and Replace-selected merge"
```

---

### Task 3: Multi-root inventory + git meta

**Files:**
- Modify: `electron/ua/inventory.ts`
- Create: `electron/ua/gitMeta.ts`
- Modify: `electron/ua/ignore.ts` (optional: `loadIgnorePatternsForRoot(workspaceRoot, rootAbsPath)` merging workspace ua ignore + root-local `.ua/.understandignore` if present)
- Create/modify: `tests/ua/inventory.test.ts`

**Interfaces:**
- Consumes: `resolveUaDir`, ignore helpers
- Produces:
  - `InventoryEntry`: `{ rootId: string; path: string; bytes: number }`
  - `inventoryRoot(opts: { workspaceRoot: string; rootId: string; absolutePath: string; maxFiles?: number }): Promise<InventoryEntry[]>`
  - Keep `inventoryProject(projectRoot)` as thin wrapper calling `inventoryRoot` with `rootId: "main"` for back-compat in tests OR update all call sites
  - `readGitCommitHash(absolutePath: string): Promise<string | null>` — `git rev-parse HEAD`, null on failure

Ignore: load workspace `.ua/.understandignore` patterns; if `absolutePath/.ua/.understandignore` or `absolutePath/.understandignore` exists, append those patterns (paths matched relative to that root).

- [ ] **Step 1: Failing tests** for dual-root inventory entries including `rootId`, and git hash null outside repo

- [ ] **Step 2: Implement**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ua): inventory per source root with rootId and git hash helper"
```

---

### Task 4: AnalyzeService multi-root + ensure workspace file

**Files:**
- Modify: `electron/ua/analyzeService.ts`
- Modify: `electron/ua/llmAnalyzeRunner.ts` (pass multi-root inventory; instruct namespacing)
- Modify: `electron/ua/runtime.ts`
- Modify: `tests/ua/analyzeService.test.ts`

**Interfaces:**
- Consumes: `loadWorkspace`/`ensureWorkspaceFile`/`resolveRoots`, `inventoryRoot`, `mergeReplaceSelected`, `readGitCommitHash`
- Produces:
  - `AnalyzeProgress`: add optional `rootId?: string`
  - `start(workspaceRoot: string, opts?: { forceFull?: boolean; rootIds?: string[] })`
  - Default `rootIds` = `defaults.analyzeRootIds` if present else all root ids
  - Reject empty `rootIds` with Error message including `no roots selected`
  - Resolve roots; skip missing paths collecting errors; if zero successful inventories → throw, do not write
  - Runner input becomes `{ workspaceRoot, inventories: InventoryEntry[], selectedRootIds, rootMetas, previous, onProgress, signal }`
  - After runner returns fresh subgraph, `graph = mergeReplaceSelected(previous, fresh, selectedRootIds)` unless `forceFull` (then fresh only, still only selected roots content)
  - On successful write: `await ensureWorkspaceFile(workspaceRoot)`

- [ ] **Step 1: Update analyzeService tests** — multi-root start merges; missing all roots fails without write; ensure workspace.json created

- [ ] **Step 2: Implement service + adapt stub runners in tests + llmAnalyzeRunner**

- [ ] **Step 3: `npm test -- tests/ua/analyzeService.test.ts tests/ua/llmAnalyzeRunner.test.ts` PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ua): analyze selected workspace roots with Replace-selected merge"
```

---

### Task 5: Summarize / generate / draft / apply with rootIds

**Files:**
- Modify: `electron/ua/summarize.ts` — `curateSubgraph(graph, maxNodes?, rootIds?: string[])`
- Modify: `electron/ua/draft.ts` — meta `rootIds: string[]`, `gitCommitHashes: Record<string, string | null>`; keep `gitCommitHash` as nullable rollup
- Modify: `electron/workflow/types.ts` — `rootId: z.string().optional()` on steps
- Modify: `electron/ua/generateWorkflowService.ts`
- Modify: `electron/workflow/stepRunner.ts` — if step.rootId, resolve cwd via workspace roots; else workspace root
- Modify: `src/types/ua.ts`
- Modify: `tests/ua/generateWorkflowService.test.ts`, `tests/ua/summarize.test.ts`

**Interfaces:**
- `generateDraft(workspaceRoot, goal, runner, opts?: { rootIds?: string[] })`
  - Fail if any selected rootId has zero nodes in graph (`Error` includes `not analyzed`)
  - Curate with those rootIds; meta records selection + per-root hashes from `graph.project.roots`
- `applyDraft`: validate each step.rootId (if set) exists in current workspace roots; reject unknown
- StepRunner: `loadWorkspace` + match rootId → `absolutePath` as `workspaceRoot` for executor context

- [ ] **Step 1: Failing tests** for curated filter, generate precondition, apply rejects bad rootId, stepRunner cwd (unit-test resolve helper if easier than full runner)

Extract `resolveStepCwd(workspaceRoot, stepRootId: string | undefined): Promise<string>` in `electron/workspace/stepCwd.ts` for testability.

- [ ] **Step 2: Implement**

- [ ] **Step 3: Tests PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ua): generate/apply workflows scoped to selected roots with step rootId cwd"
```

---

### Task 6: HTTP routes + frontend clients

**Files:**
- Create: `electron/workspace/routes.ts`
- Modify: `electron/agent/server.ts` — wire workspace routes
- Modify: `electron/ua/routes.ts` — body `rootIds`; status includes `roots`
- Create: `src/types/workspace.ts`
- Create: `src/composables/useWorkspace.ts`
- Modify: `src/composables/useUa.ts`
- Modify: `tests/ua/routes.test.ts`
- Create: `tests/workspace/routes.test.ts` (or extend server route tests)

**API:**
- `GET /v1/workspace` → `{ workspace: WorkspaceFile, roots: ResolvedRoot[] }` (ResolvedRoot may omit secrets; include absolutePath)
- `PUT /v1/workspace` → body WorkspaceFile; save; return same
- `POST /v1/ua/analyze` body: `{ forceFull?: boolean, rootIds?: string[] }`
- `POST /v1/ua/generate-workflow` body: `{ goal?: string, rootIds?: string[] }`
- `GET /v1/ua/status` adds `roots: { id, label, path }[]`

- [ ] **Step 1: Route tests failing**

- [ ] **Step 2: Implement + wire**

- [ ] **Step 3: PASS**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(workspace): expose workspace and multi-root UA HTTP APIs"
```

---

### Task 7: Settings roots editor + UA panel multi-select

**Files:**
- Modify: `src/pages/Settings.vue`
- Modify: `src/components/ua/ProjectUnderstandPanel.vue`
- Modify: `src/components/ua/GraphSummaryView.vue` / `GraphExplorerView.vue` — optional root filter (minimal: show rootId on nodes / filter chips)
- Modify: `src/types/ua.ts` progress optional `rootId`
- Test: extend `tests` Vue mount tests if present for WorkflowRun / panel

**UI behavior:**
- Settings: list roots (id, label, path); add/remove; save via `PUT /v1/workspace`
- Panel: checkbox multi-select for analyze and for generate; disable actions when none selected; pass `rootIds` to APIs
- Default selection from `defaults.analyzeRootIds` or all

- [ ] **Step 1: Implement UI + any available component tests**

- [ ] **Step 2: Manual sanity via existing mount tests** `npm test -- tests/` covering Settings/UA if any; fix breakages

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(ui): workspace roots editor and UA root multi-select"
```

---

### Task 8: Skills + e2e stub coverage

**Files:**
- Modify: `skills/understand/SKILL.md`
- Modify: `skills/generate-workflow-from-graph/SKILL.md`
- Modify: `tests/ua/e2e.generate.test.ts` — multi-root happy path with stubs

Skill requirements (explicit in markdown):
- Understand: emit `root:{id}/...` ids; set `rootId`; fill `project.roots`; accept multi-root inventory list
- Generate: set `steps[].rootId` when work belongs to a source repo; omit for workspace-level orchestration

E2E: two fake roots on disk; stub analyze runner returns namespaced nodes; generate with one root; assert draft meta.rootIds and apply succeeds.

- [ ] **Step 1: Update skills + e2e test**

- [ ] **Step 2: `npm test -- tests/ua/e2e.generate.test.ts` PASS; full `npm test` for UA/workspace**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(ua): multi-root skills guidance and e2e stub coverage"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `workspace.json` + folder-as-workspace | 1, 6, 7 |
| Implicit `main` migration + write on analyze/save | 1, 4 |
| One workspace graph, namespaced ids | 2, 4 |
| Replace-selected | 2, 4 |
| Selective analyze/generate | 4, 5, 6, 7 |
| Step `rootId` → cwd | 5 |
| Errors: missing roots, empty selection, not analyzed | 4, 5 |
| Template path unchanged | (constraint; no task edits templates) |
| Skills multi-root | 8 |

## Placeholder / consistency self-review

- Default root id fixed: `"main"`
- Runner signature renamed to multi-inventory in Task 4; tests updated in same task
- `gitCommitHash` kept on project + per-root hashes in `project.roots` / draft meta
