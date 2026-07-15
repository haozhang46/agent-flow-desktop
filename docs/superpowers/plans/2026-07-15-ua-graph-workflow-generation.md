# UA Graph → Workflow Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a UA-compatible project analysis pipeline that writes `.ua/knowledge-graph.json`, let the user review summary + interactive graph, then freely generate and apply a full custom workflow under `.agentflow/workflows/`.

**Architecture:** Electron `ua/*` modules own paths, graph store, deterministic inventory, analyze/generate services with injectable LLM runners. HTTP routes under `/v1/ua/*` expose status to the Vue UI. Skills (`understand`, `generate-workflow-from-graph`) live in the existing `skills/` registry. Template creation path is untouched.

**Tech Stack:** Vue 3, Electron sidecar HTTP server, Zod, Vitest, existing DeepSeek agent/`loadSkillBodies`, yaml workflow loader patterns.

## Global Constraints

- Two manual steps: analyze → user confirms → generate (no auto-chain)
- Graph output must match UA-compatible `.ua/knowledge-graph.json` shape (nodes, edges, layers, project)
- Free workflow generation (templates are reference only, not a hard skeleton)
- Empty and existing projects both supported; goal text optional (greenfield default when absent)
- At most one analyze per `projectRoot`; analyze and generate are mutually exclusive
- Failed/cancelled analyze must not overwrite a prior valid graph
- Generation prompt uses summary + curated subgraph, not the full raw JSON
- API routes follow existing `/v1/` prefix: `/v1/ua/...` (same behavior as spec’s `/ua/...`)
- Do not change “add workflow from template” behavior
- Spec: `docs/superpowers/specs/2026-07-15-ua-graph-workflow-generation-design.md`

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/ua/paths.ts` | Resolve `.ua/` vs `.understand-anything/` |
| `electron/ua/types.ts` | Zod schemas for graph + draft |
| `electron/ua/graphStore.ts` | Read/write/validate graph + config; atomic write |
| `electron/ua/summarize.ts` | Build `GraphSummary` + curated subgraph for prompts |
| `electron/ua/ignore.ts` | Parse `.understandignore` + default excludes |
| `electron/ua/inventory.ts` | Deterministic file inventory for analyze |
| `electron/ua/analyzeService.ts` | Concurrency, progress, call LLM runner, atomic save |
| `electron/ua/generateWorkflowService.ts` | Draft from graph, schema check, apply to disk |
| `electron/ua/routes.ts` | `handleUaRoutes` for `/v1/ua/*` |
| `electron/agent/server.ts` | Wire `handleUaRoutes` |
| `skills/understand/SKILL.md` | Instructions for graph construction |
| `skills/generate-workflow-from-graph/SKILL.md` | Instructions for free workflow draft |
| `skills/registry.yaml` | Register both skills |
| `src/composables/useUa.ts` | Frontend API client for `/v1/ua/*` |
| `src/components/ua/ProjectUnderstandPanel.vue` | Status + actions |
| `src/components/ua/GraphSummaryView.vue` | Lightweight summary |
| `src/components/ua/GraphExplorerView.vue` | Interactive layer/node explorer |
| `src/components/ua/WorkflowDraftReview.vue` | Draft review UI |
| `src/pages/WorkflowRun.vue` | Entry point for panel |
| `tests/ua/*.test.ts` | Unit + route tests |
| `tests/fixtures/ua/minimal-graph.json` | Minimal valid graph fixture |

---

### Task 1: UA paths + graph schema + store

**Files:**
- Create: `electron/ua/paths.ts`
- Create: `electron/ua/types.ts`
- Create: `electron/ua/graphStore.ts`
- Create: `tests/ua/paths.test.ts`
- Create: `tests/ua/graphStore.test.ts`
- Create: `tests/fixtures/ua/minimal-graph.json`

**Interfaces:**
- Consumes: none
- Produces:
  - `resolveUaDir(projectRoot: string): Promise<string>`
  - `KnowledgeGraphSchema` (zod) + `type KnowledgeGraph`
  - `UaConfigSchema` + `type UaConfig`
  - `readGraph(projectRoot: string): Promise<KnowledgeGraph | null>`
  - `writeGraph(projectRoot: string, graph: KnowledgeGraph): Promise<void>` (atomic)
  - `readUaConfig` / `writeUaConfig`
  - `assertValidGraph(data: unknown): KnowledgeGraph`

- [ ] **Step 1: Write fixture + failing path tests**

Create `tests/fixtures/ua/minimal-graph.json`:

```json
{
  "project": {
    "name": "fixture-app",
    "description": "Minimal UA graph for tests",
    "languages": ["typescript"],
    "frameworks": ["vue"],
    "analyzedAt": "2026-07-15T00:00:00.000Z",
    "gitCommitHash": null
  },
  "nodes": [
    {
      "id": "file:src/main.ts",
      "type": "file",
      "name": "main.ts",
      "filePath": "src/main.ts",
      "summary": "App entry",
      "tags": ["entry"],
      "complexity": "low"
    }
  ],
  "edges": [],
  "layers": [
    {
      "id": "layer:ui",
      "name": "UI",
      "description": "Frontend entry",
      "nodeIds": ["file:src/main.ts"]
    }
  ],
  "tour": []
}
```

Create `tests/ua/paths.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveUaDir } from "../../electron/ua/paths";

describe("resolveUaDir", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ua-paths-"));
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("prefers legacy .understand-anything when present", async () => {
    await fs.mkdir(path.join(tmp, ".understand-anything"));
    await fs.mkdir(path.join(tmp, ".ua"));
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".understand-anything"));
  });

  it("uses .ua when legacy is absent", async () => {
    await fs.mkdir(path.join(tmp, ".ua"));
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".ua"));
  });

  it("defaults to .ua when neither exists", async () => {
    expect(await resolveUaDir(tmp)).toBe(path.join(tmp, ".ua"));
  });
});
```

- [ ] **Step 2: Run tests — expect fail**

Run: `pnpm exec vitest run tests/ua/paths.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement paths**

Create `electron/ua/paths.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

export async function resolveUaDir(projectRoot: string): Promise<string> {
  const legacy = path.join(projectRoot, ".understand-anything");
  try {
    await fs.access(legacy);
    return legacy;
  } catch {
    return path.join(projectRoot, ".ua");
  }
}

export function graphPath(uaDir: string): string {
  return path.join(uaDir, "knowledge-graph.json");
}

export function configPath(uaDir: string): string {
  return path.join(uaDir, "config.json");
}

export function ignorePath(uaDir: string): string {
  return path.join(uaDir, ".understandignore");
}
```

- [ ] **Step 4: Write failing graphStore tests**

Create `tests/ua/graphStore.test.ts` using the fixture and a temp dir. Assert `writeGraph` then `readGraph` round-trips; `readGraph` returns `null` when missing; invalid JSON throws via `assertValidGraph`; a failed write path that writes to `knowledge-graph.json.tmp` then renames; reading after corrupt write of a previous good graph is covered in analyzeService task.

- [ ] **Step 5: Implement types + graphStore**

Create `electron/ua/types.ts` with Zod for project, nodes (`id`, `type`, `name`, `filePath?`, `summary`, `tags`, `complexity`), edges (`source`, `target`, `type`, `direction?`, `weight?`), layers, tours; `KnowledgeGraphSchema`.

Create `electron/ua/graphStore.ts`:
- `assertValidGraph` → `KnowledgeGraphSchema.parse`
- `readGraph` → null if missing
- `writeGraph` → mkdir ua dir, write `.tmp` then `rename` over `knowledge-graph.json`
- config defaults `{ outputLanguage: "zh" }`

- [ ] **Step 6: Run tests — expect pass**

Run: `pnpm exec vitest run tests/ua/paths.test.ts tests/ua/graphStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add electron/ua/paths.ts electron/ua/types.ts electron/ua/graphStore.ts \
  tests/ua/paths.test.ts tests/ua/graphStore.test.ts tests/fixtures/ua/minimal-graph.json
git commit -m "feat(ua): add paths, graph schema, and atomic graph store"
```

---

### Task 2: Summary + curated subgraph

**Files:**
- Create: `electron/ua/summarize.ts`
- Create: `tests/ua/summarize.test.ts`

**Interfaces:**
- Consumes: `KnowledgeGraph` from Task 1
- Produces:
  - `export interface GraphSummary { projectName: string; description: string; nodeCount: number; edgeCount: number; layers: { id: string; name: string; nodeCount: number }[]; sampleNodes: { id: string; name: string; type: string; summary: string }[]; analyzedAt: string | null }`
  - `export function summarizeGraph(graph: KnowledgeGraph): GraphSummary`
  - `export function curatedSubgraphMarkdown(graph: KnowledgeGraph, maxNodes?: number): string`

- [ ] **Step 1: Write failing tests**

Load fixture graph; assert `nodeCount === 1`, layer named `UI`, `sampleNodes[0].id === "file:src/main.ts"`. Assert `curatedSubgraphMarkdown` includes project name and layer name, and truncates when `maxNodes` is 0 (empty project still returns a greenfield blurb string containing `"empty"` or `"greenfield"` case-insensitive).

- [ ] **Step 2: Run — expect fail**

Run: `pnpm exec vitest run tests/ua/summarize.test.ts`

- [ ] **Step 3: Implement `summarize.ts`**

Prefer layer-tagged / domain nodes for samples; include up to 40 nodes in curated markdown listing `id`, `type`, `summary`, and edges among those nodes only.

- [ ] **Step 4: Run — expect pass**

- [ ] **Step 5: Commit**

```bash
git add electron/ua/summarize.ts tests/ua/summarize.test.ts
git commit -m "feat(ua): add graph summary and curated subgraph for prompts"
```

---

### Task 3: Ignore matcher + file inventory

**Files:**
- Create: `electron/ua/ignore.ts`
- Create: `electron/ua/inventory.ts`
- Create: `tests/ua/ignore.test.ts`
- Create: `tests/ua/inventory.test.ts`

**Interfaces:**
- Consumes: `resolveUaDir`, `ignorePath`
- Produces:
  - `export function parseUnderstandIgnore(text: string): string[]`
  - `export function isIgnored(relPath: string, patterns: string[]): boolean`
  - `export async function loadIgnorePatterns(projectRoot: string): Promise<string[]>`
  - `export interface InventoryEntry { path: string; bytes: number }`
  - `export async function inventoryProject(projectRoot: string, maxFiles?: number): Promise<InventoryEntry[]>`

**Defaults always ignored** (hardcoded union with file patterns): `node_modules/`, `.git/`, `dist/`, `build/`, `.agentflow/chatMemory/`, `*.lock`, `pnpm-lock.yaml`.

- [ ] **Step 1: Failing tests for ignore**

Assert `node_modules/foo` ignored by defaults; `# comment` lines ignored; pattern `tests/` ignores `tests/a.ts`; negation `!tests/keep.ts` keeps that path.

Implement a minimal matcher (no new dependencies):
- Exact file
- `dir/` prefix
- `*.ext` suffix
- Leading `!` as negation against previous positives

- [ ] **Step 2: Implement ignore + inventory**

`inventoryProject` walks `projectRoot` recursively (async), skips ignored, returns relative posix-style paths sorted, capped by `maxFiles` (default 2000).

- [ ] **Step 3: Tests pass + commit**

```bash
git add electron/ua/ignore.ts electron/ua/inventory.ts tests/ua/ignore.test.ts tests/ua/inventory.test.ts
git commit -m "feat(ua): add understandignore matcher and file inventory"
```

---

### Task 4: Analyze service (injectable runner)

**Files:**
- Create: `electron/ua/analyzeService.ts`
- Create: `tests/ua/analyzeService.test.ts`

**Interfaces:**
- Consumes: graphStore, inventory, summarize, skill loader later
- Produces:
  - `export type AnalyzeProgress = { phase: "scan" | "extract" | "relate" | "write"; message: string; percent?: number }`
  - `export type AnalyzeGraphRunner = (input: { projectRoot: string; inventory: InventoryEntry[]; previous: KnowledgeGraph | null; onProgress: (p: AnalyzeProgress) => void; signal: AbortSignal }) => Promise<KnowledgeGraph>`
  - `export class AnalyzeService` with:
    - `constructor(runner: AnalyzeGraphRunner)`
    - `isBusy(projectRoot: string): boolean`
    - `async start(projectRoot: string, opts?: { forceFull?: boolean }): Promise<KnowledgeGraph>`
    - `cancel(projectRoot: string): void`
    - `onProgress(projectRoot: string, cb: (p: AnalyzeProgress) => void): () => void`

Behavior:
- Reject second `start` for same root while busy (`Error` message includes `already running`)
- On runner throw: do **not** call `writeGraph`; previous graph still readable
- On cancel via `AbortSignal`: runner should abort; previous graph preserved
- On success: `writeGraph`
- Empty inventory still calls runner (greenfield)

- [ ] **Step 1: Write failing tests with mock runner**

```ts
it("preserves previous graph when runner fails", async () => {
  // write good graph, runner throws, readGraph still good
});

it("rejects concurrent analyze for same root", async () => {
  // runner hangs until released; second start throws
});
```

- [ ] **Step 2: Implement AnalyzeService**

Keep runners map / AbortController per root.

- [ ] **Step 3: Tests pass + commit**

```bash
git add electron/ua/analyzeService.ts tests/ua/analyzeService.test.ts
git commit -m "feat(ua): add analyze service with concurrency and safe failure"
```

---

### Task 5: Default LLM analyze runner + understand skill

**Files:**
- Create: `skills/understand/SKILL.md`
- Modify: `skills/registry.yaml`
- Create: `electron/ua/llmAnalyzeRunner.ts`
- Create: `tests/ua/llmAnalyzeRunner.test.ts` (mock ChatOpenAI / injectable `completeJson`)
- Modify: `tests/skills/loader.test.ts` if it asserts exact skill list

**Interfaces:**
- Consumes: `loadSkillBodies(["understand"])`, inventory, previous graph
- Produces:
  - `export function createLlmAnalyzeRunner(deps: { getApiKey: () => string | null; completeJson: (system: string, user: string) => Promise<unknown> }): AnalyzeGraphRunner`
  - Runner throws if `getApiKey()` is null with message `API key not set`

Skill body must instruct the model to return **only** JSON matching KnowledgeGraph shape, use inventory paths, support zh summaries when config language is zh, and produce a minimal empty-project graph when inventory is empty.

- [ ] **Step 1: Register skill + write SKILL.md**

```yaml
  - name: understand
    description: Analyze a codebase into a UA-compatible knowledge graph
    skill_type: instruction
    spawn_subagent: false
    path: understand/SKILL.md
    visibility: public
    triggers:
      - understand
      - knowledge graph
```

- [ ] **Step 2: Implement runner that validates via `assertValidGraph`**

If model returns markdown fences, strip \`\`\`json before parse.

- [ ] **Step 3: Unit test with stub `completeJson` returning minimal graph**

- [ ] **Step 4: Commit**

```bash
git add skills/understand skills/registry.yaml electron/ua/llmAnalyzeRunner.ts tests/ua/llmAnalyzeRunner.test.ts
git commit -m "feat(ua): add understand skill and LLM analyze runner"
```

---

### Task 6: Workflow draft schema + generate + apply

**Files:**
- Create: `electron/ua/draft.ts` (or extend `types.ts`)
- Create: `electron/ua/generateWorkflowService.ts`
- Create: `skills/generate-workflow-from-graph/SKILL.md`
- Modify: `skills/registry.yaml`
- Create: `tests/ua/generateWorkflowService.test.ts`

**Interfaces:**
- Consumes: `WorkflowSchema` from `electron/workflow/types.ts`, graph summarize, `resolveNewWorkflowId` pattern (duplicate small helper or export from loader)
- Produces:
  - `WorkflowDraftSchema`: `{ workflow: WorkflowDefinition; prompts: Record<string, string>; workspaces?: Record<string, unknown>; meta: { source: "ua-graph"; analyzedAt: string | null; gitCommitHash: string | null; goal: string | null } }`
  - Each `workflow.steps[i].prompt_template` must be `prompts/<stepId>.md` and `prompts` must contain that key’s markdown body
  - `export type GenerateWorkflowRunner = (input: { summaryMarkdown: string; curatedMarkdown: string; goal: string | null }) => Promise<unknown>`
  - `export async function generateDraft(projectRoot: string, goal: string | null, runner: GenerateWorkflowRunner): Promise<WorkflowDraft>`
  - `export async function applyDraft(projectRoot: string, draft: WorkflowDraft, preferredId?: string): Promise<{ workflowId: string }>`

`applyDraft`:
1. Resolve unique id (preferred or `draft.workflow.id` or `ua-generated`)
2. Create `.agentflow/workflows/{id}/`
3. Write each prompt file under `prompts/`
4. Set `workflow.id` to resolved id; `yaml.stringify` → `workflow.yaml`
5. Optionally write `workspaces/{stepId}.workspace.json` when present
6. Write `meta.json` with draft.meta
7. Do **not** require template copy

Mutual exclusion: `GenerateWorkflowService` / module-level lock — if analyze busy for root, generate throws `analyze in progress`; if generate busy, analyze throws `generate in progress`. Implement shared `projectLock.ts`:

```ts
export type LockKind = "analyze" | "generate";
export function acquireProjectLock(root: string, kind: LockKind): void
export function releaseProjectLock(root: string, kind: LockKind): void
```

Refactor Task 4 AnalyzeService to use this lock (adjust tests).

Greenfield default goal string when `goal` is null/empty:

`Build a practical greenfield delivery workflow for this project.`

- [ ] **Step 1: Failing tests for draft validation + apply directory layout**

- [ ] **Step 2: Implement + register skill**

- [ ] **Step 3: Pass + commit**

```bash
git add electron/ua/draft.ts electron/ua/generateWorkflowService.ts electron/ua/projectLock.ts \
  skills/generate-workflow-from-graph skills/registry.yaml tests/ua/generateWorkflowService.test.ts
git commit -m "feat(ua): generate and apply workflow drafts from graph"
```

---

### Task 7: HTTP routes `/v1/ua/*`

**Files:**
- Create: `electron/ua/routes.ts`
- Create: `tests/ua/routes.test.ts`
- Modify: `electron/agent/server.ts` — call `handleUaRoutes` early (after health/langflow ok)

**Interfaces:**
- Consumes: AnalyzeService singleton with `createLlmAnalyzeRunner`, generate services, getApiKey, getWorkspaceRoot
- Produces `handleUaRoutes(req, res, pathname, method, ctx): Promise<boolean>`

Routes:

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/v1/ua/status` | `{ hasGraph, busy, busyKind, summary \| null, analyzedAt }` |
| GET | `/v1/ua/graph` | full graph or 404 |
| GET | `/v1/ua/summary` | summary or 404 |
| POST | `/v1/ua/analyze` | body `{ forceFull?: boolean }` → starts analyze; 409 if busy; 401/400 if no API key |
| POST | `/v1/ua/analyze/cancel` | cancel |
| GET | `/v1/ua/analyze/progress` | latest progress snapshot (or 204) |
| POST | `/v1/ua/generate-workflow` | body `{ goal?: string }` → returns `{ draft }` |
| POST | `/v1/ua/apply-workflow` | body `{ draft, activate?: boolean }` → `{ workflowId }` |

Wire a module-level `AnalyzeService` + progress last-event map in `routes.ts` or `ua/runtime.ts`.

- [ ] **Step 1: Route tests mirroring `tests/workflow/server.test.ts` request helper**

Use stub runners injected via `setUaTestHooks` only in test (`import { setUaRunnersForTests }` exported from runtime).

- [ ] **Step 2: Implement routes + server wire**

- [ ] **Step 3: Pass + commit**

```bash
git add electron/ua/routes.ts electron/ua/runtime.ts electron/agent/server.ts tests/ua/routes.test.ts
git commit -m "feat(ua): expose /v1/ua HTTP API on agent sidecar"
```

---

### Task 8: Frontend composable + ProjectUnderstandPanel + summary

**Files:**
- Create: `src/composables/useUa.ts`
- Create: `src/components/ua/ProjectUnderstandPanel.vue`
- Create: `src/components/ua/GraphSummaryView.vue`
- Create: `src/components/ua/GoalField.vue`
- Create: `tests/composables/useUa.test.ts` (mock fetch)
- Create: `tests/components/ProjectUnderstandPanel.test.ts`
- Modify: `src/pages/WorkflowRun.vue` — button “From project…” opens panel

**Interfaces:**
- `useUa()` → `{ fetchStatus, fetchSummary, fetchGraph, startAnalyze, cancelAnalyze, generateWorkflow, applyWorkflow, pollProgress }` using same `apiBase` pattern as `useWorkflow` (`window.desktop.getSidecarPort`)

Panel UX:
- Show status + summary when `hasGraph`
- Button Analyze: if no graph yet, `window.confirm` token-cost warning then POST analyze
- Poll progress every 1s while busy
- Generate disabled when `!hasGraph || busy`
- GoalField optional above Generate

- [ ] **Step 1: Failing composable + panel tests (happy-dom)**

- [ ] **Step 2: Implement UI + wire entry in WorkflowRun near template picker**

- [ ] **Step 3: Pass + commit**

```bash
git add src/composables/useUa.ts src/components/ua src/pages/WorkflowRun.vue \
  tests/composables/useUa.test.ts tests/components/ProjectUnderstandPanel.test.ts
git commit -m "feat(ua): add project understand panel and summary UI"
```

---

### Task 9: Graph explorer + draft review

**Files:**
- Create: `src/components/ua/GraphExplorerView.vue`
- Create: `src/components/ua/WorkflowDraftReview.vue`
- Create: `tests/components/GraphExplorerView.test.ts`
- Create: `tests/components/WorkflowDraftReview.test.ts`
- Modify: `ProjectUnderstandPanel.vue` to open explorer + draft modal

**GraphExplorerView:**
- Props: `graph: KnowledgeGraph` (frontend type mirrored or imported via shared zod-inferred type duplicated in `src/types/ua.ts` as interfaces — keep FE types in `src/types/ua.ts` without importing electron)
- Layout: layers as columns; nodes as clickable rows; detail pane shows `summary`, `filePath`, connected edge targets
- No dependency on external UA viewer package in v1 (still UA-compatible JSON; viewer embedding deferred)

**WorkflowDraftReview:**
- Props: `draft`
- Lists steps (id, title, executor, skills, outputs)
- Lists edges
- Emits `confirm` | `cancel` | `regenerate`

- [ ] **Step 1: Component tests**

- [ ] **Step 2: Implement + integrate into panel flow**

Flow: Generate → show draft review → Confirm → `applyWorkflow` → emit applied `workflowId` → WorkflowRun refreshes list / selects new workflow

- [ ] **Step 3: Pass + commit**

```bash
git add src/components/ua src/types/ua.ts tests/components/GraphExplorerView.test.ts \
  tests/components/WorkflowDraftReview.test.ts
git commit -m "feat(ua): add graph explorer and workflow draft review"
```

---

### Task 10: End-to-end fixture path + verification

**Files:**
- Create: `tests/ua/e2e.generate.test.ts` (temp project, stub runners via test hooks, full analyze→generate→apply→`loadWorkflow`)
- Modify: any docs only if needed (none required)

- [ ] **Step 1: Write e2e test**

1. Empty temp project
2. Stub analyze runner writes fixture-like graph via service
3. Stub generate runner returns 2-step draft with prompts
4. Apply → `loadWorkflow(root, id)` returns those steps
5. Template `listTemplates` still works (smoke)

- [ ] **Step 2: Run full ua + related suites**

Run: `pnpm exec vitest run tests/ua tests/skills/loader.test.ts tests/workflow/loader.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/ua/e2e.generate.test.ts
git commit -m "test(ua): cover analyze → generate → apply end-to-end with stubs"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| Embed analyze → `.ua/knowledge-graph.json` | 4, 5, 7 |
| Summary + interactive explorer | 2, 8, 9 |
| Manual two-step generate | 6, 8, 9 |
| Free generation (not template skeleton) | 6 |
| Empty + existing projects | 3, 4, 6 |
| Optional goal / greenfield default | 6, 8 |
| Atomic write / preserve old graph | 1, 4 |
| Concurrency locks | 4, 6 |
| Curated subgraph prompt budget | 2, 6 |
| Skills in registry | 5, 6 |
| `/v1/ua` API | 7 |
| Template path unchanged | 10 smoke |
| Cost confirm on first analyze | 8 |
| UA-compatible shape | 1 fixture + schema |

## Placeholders / consistency notes

- Frontend types live in `src/types/ua.ts` (do not import `electron/` from renderer).
- Routes use `/v1/ua/*` intentionally.
- Graph explorer is in-app (layer columns); external UA viewer embedding is follow-up, still compatible.
- LLM complete helper can wrap existing DeepSeek `ChatOpenAI` non-streaming call; exact HTTP wiring may reuse `AgentService` patterns but keep analyze runner isolated for testability.
