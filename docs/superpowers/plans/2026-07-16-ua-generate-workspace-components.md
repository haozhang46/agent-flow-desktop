# UA Generate Workspace Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When generating a workflow from the UA graph, emit a full Design workspace (`layout` + `components` + props) for every step, validate illegally shaped workspaces, and fill missing ones with deterministic heuristics.

**Architecture:** LLM still returns `WorkflowDraft`; new `normalizeDraftWorkspaces` fills missing per-step workspaces and rejects illegal ones via existing `validateWorkspace`. `WorkflowDraftSchema` requires 1:1 `workspaces` keys with steps. Draft review shows a one-line count hint. Chat/Design editing unchanged.

**Tech Stack:** Zod, Vitest, existing `electron/workflow/workspaceSchema.ts` + `WORKSPACE_REGISTRY`, Vue 3 draft review.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-ua-generate-workspace-components-design.md`
- Every step must have a valid `WorkspaceDefinition` after normalize (1:1 with `workflow.steps[].id`)
- Invalid workspace schema (unknown type, bad props, duplicate component id, extra keys) → hard block; do not write disk
- Path mismatch vs step `outputs` is soft only (do not block)
- Missing workspace for a step → deterministic fill; present-but-invalid → do not auto-repair
- Do not auto-select `langflow-panel` in fill heuristics
- Default fill `layout` is `stack`
- Draft review: light hint only (“已为 N 步生成 workspace…”); no component list / Design embed
- Do not change template workflow creation
- Reuse existing Chat `workspace_*` tools; no new Chat tools
- API prefixes stay `/v1/ua/*`

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/ua/normalizeWorkspaces.ts` | Fill missing workspaces; validate; return normalized draft or throw |
| `electron/ua/draft.ts` | Require workspaces + 1:1 step keys; each value passes `validateWorkspace` |
| `electron/ua/generateWorkflowService.ts` | Call normalize after LLM / before assert and apply |
| `skills/generate-workflow-from-graph/SKILL.md` | Require full per-step workspaces; registry digest; soft path align |
| `src/components/ua/WorkflowDraftReview.vue` | Workspace count hint |
| `src/types/ua.ts` | Frontend `WorkflowDraft.workspaces` typing if needed |
| `tests/ua/normalizeWorkspaces.test.ts` | Fill / reject / preserve cases |
| `tests/ua/generateWorkflowService.test.ts` | Update fixtures; assert require workspaces |
| `tests/components/ua/WorkflowDraftReview.test.ts` | Hint visibility (create if missing) |
| `tests/fixtures/ua/sample-workspace.json` | Minimal valid workspace fixture (optional helper) |

---

### Task 1: `normalizeDraftWorkspaces`

**Files:**
- Create: `electron/ua/normalizeWorkspaces.ts`
- Create: `tests/ua/normalizeWorkspaces.test.ts`
- Create: `tests/fixtures/ua/minimal-workspace.json` (optional inline in test is OK)

**Interfaces:**
- Consumes: `WorkflowDraft` (current loosely-typed workspaces), `validateWorkspace`, `WORKSPACE_REGISTRY` / `COMPONENT_PROPS` patterns, step fields `id` | `executor` | `outputs`
- Produces:
  - `normalizeDraftWorkspaces(draft: WorkflowDraft): WorkflowDraft`
  - Throws `Error` (or ZodError) with step/component detail on illegal present workspaces or extra keys
  - After success, `draft.workspaces` is a complete `Record<stepId, WorkspaceDefinition>`

- [ ] **Step 1: Write failing tests**

Create `tests/ua/normalizeWorkspaces.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeDraftWorkspaces } from "../../electron/ua/normalizeWorkspaces";
import type { WorkflowDraft } from "../../electron/ua/draft";
import type { WorkflowDefinition } from "../../electron/workflow/types";

function baseWorkflow(): WorkflowDefinition {
  return {
    version: 1,
    id: "demo",
    title: "Demo",
    steps: [
      {
        id: "plan",
        title: "Plan",
        executor: "deepseek",
        skills: [],
        prompt_template: "prompts/plan.md",
        outputs: ["docs/plan.md"],
        gates: [],
        requires_resources: [],
      },
      {
        id: "build",
        title: "Build",
        executor: "claude-code",
        skills: [],
        prompt_template: "prompts/build.md",
        outputs: ["src/"],
        gates: [],
        requires_resources: [],
      },
    ],
    edges: [{ from: "plan", to: "build" }],
    resources: [],
  };
}

function baseDraft(workspaces?: WorkflowDraft["workspaces"]): WorkflowDraft {
  return {
    workflow: baseWorkflow(),
    prompts: {
      "prompts/plan.md": "# Plan",
      "prompts/build.md": "# Build",
    },
    workspaces,
    meta: {
      source: "ua-graph",
      analyzedAt: null,
      gitCommitHash: null,
      gitCommitHashes: {},
      rootIds: ["main"],
      goal: null,
    },
  };
}

describe("normalizeDraftWorkspaces", () => {
  it("fills missing workspaces for every step", () => {
    const out = normalizeDraftWorkspaces(baseDraft(undefined));
    expect(Object.keys(out.workspaces!).sort()).toEqual(["build", "plan"]);
    expect(out.workspaces!.plan.stepId).toBe("plan");
    expect(out.workspaces!.plan.layout).toBe("stack");
    expect(out.workspaces!.plan.components.some((c) => c.type === "markdown-doc")).toBe(true);
    expect(out.workspaces!.build.components.some((c) => c.type === "code-explorer")).toBe(true);
  });

  it("preserves a valid LLM workspace for a step", () => {
    const custom = {
      version: 1 as const,
      stepId: "plan",
      layout: "tabs" as const,
      components: [
        {
          id: "arch",
          type: "architecture-docs",
          props: {
            files: [{ path: "docs/architecture.md", label: "Architecture" }],
          },
        },
      ],
    };
    const out = normalizeDraftWorkspaces(
      baseDraft({
        plan: custom,
        // build intentionally missing → fill
      }),
    );
    expect(out.workspaces!.plan.layout).toBe("tabs");
    expect(out.workspaces!.plan.components[0].type).toBe("architecture-docs");
    expect(out.workspaces!.build).toBeDefined();
  });

  it("rejects unknown component type without repairing", () => {
    expect(() =>
      normalizeDraftWorkspaces(
        baseDraft({
          plan: {
            version: 1,
            stepId: "plan",
            layout: "stack",
            components: [{ id: "x", type: "not-a-widget", props: {} }],
          },
          build: {
            version: 1,
            stepId: "build",
            layout: "stack",
            components: [{ id: "run", type: "agent-run", props: {} }],
          },
        }),
      ),
    ).toThrow(/not-a-widget|Unknown component/i);
  });

  it("rejects extra workspace keys", () => {
    expect(() =>
      normalizeDraftWorkspaces(
        baseDraft({
          plan: {
            version: 1,
            stepId: "plan",
            layout: "stack",
            components: [{ id: "run", type: "agent-run", props: {} }],
          },
          build: {
            version: 1,
            stepId: "build",
            layout: "stack",
            components: [{ id: "run", type: "agent-run", props: {} }],
          },
          ghost: {
            version: 1,
            stepId: "ghost",
            layout: "stack",
            components: [{ id: "run", type: "agent-run", props: {} }],
          },
        }),
      ),
    ).toThrow(/extra|unknown step|ghost/i);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/ua/normalizeWorkspaces.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `electron/ua/normalizeWorkspaces.ts`**

```ts
import type { WorkflowDraft } from "./draft";
import type { WorkflowStep } from "../workflow/types";
import {
  validateWorkspace,
  type WorkspaceDefinition,
} from "../workflow/workspaceSchema";

function docsDirFromOutputs(outputs: string[]): string {
  for (const o of outputs) {
    if (o.endsWith(".md") || o.includes("docs")) {
      const cleaned = o.replace(/\/$/, "");
      if (cleaned.endsWith(".md")) {
        const idx = cleaned.lastIndexOf("/");
        return idx >= 0 ? cleaned.slice(0, idx) || "docs" : "docs";
      }
      return cleaned || "docs";
    }
  }
  return "docs";
}

function fillForStep(step: WorkflowStep): WorkspaceDefinition {
  const outputs = step.outputs ?? [];
  const isDoc = outputs.some((o) => o.endsWith(".md") || o.includes("docs"));
  const isCode =
    step.executor === "claude-code" ||
    outputs.some((o) => o === "src/" || o.startsWith("src/") || o.endsWith("/"));

  let components: WorkspaceDefinition["components"];
  if (isDoc && !isCode) {
    components = [
      {
        id: "doc",
        type: "markdown-doc",
        props: { docsDir: docsDirFromOutputs(outputs) },
      },
      { id: "run", type: "agent-run", props: {} },
    ];
  } else if (isCode) {
    components = [
      {
        id: "code",
        type: "code-explorer",
        props: { root: ".", writable: true },
      },
      { id: "run", type: "agent-run", props: {} },
    ];
  } else {
    components = [
      { id: "run", type: "agent-run", props: {} },
      {
        id: "doc",
        type: "markdown-doc",
        props: { docsDir: "docs" },
      },
    ];
  }

  return validateWorkspace({
    version: 1,
    stepId: step.id,
    layout: "stack",
    components,
  });
}

export function normalizeDraftWorkspaces(draft: WorkflowDraft): WorkflowDraft {
  const stepIds = draft.workflow.steps.map((s) => s.id);
  const stepIdSet = new Set(stepIds);
  const incoming = { ...(draft.workspaces ?? {}) };

  for (const key of Object.keys(incoming)) {
    if (!stepIdSet.has(key)) {
      throw new Error(`Extra workspace key not in workflow steps: ${key}`);
    }
  }

  const workspaces: Record<string, WorkspaceDefinition> = {};
  for (const step of draft.workflow.steps) {
    const raw = incoming[step.id];
    if (raw === undefined) {
      workspaces[step.id] = fillForStep(step);
      continue;
    }
    // Present: must validate; do not repair
    const validated = validateWorkspace({
      ...(raw as object),
      stepId: step.id,
    });
    workspaces[step.id] = validated;
  }

  return { ...draft, workspaces };
}
```

Adjust imports if `WorkflowStep` is not exported — use `WorkflowDefinition["steps"][number]` instead.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/ua/normalizeWorkspaces.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/ua/normalizeWorkspaces.ts tests/ua/normalizeWorkspaces.test.ts
git commit -m "$(cat <<'EOF'
feat(ua): normalize draft workspaces with fill heuristics

EOF
)"
```

---

### Task 2: Draft schema + generate/apply wiring

**Files:**
- Modify: `electron/ua/draft.ts`
- Modify: `electron/ua/generateWorkflowService.ts`
- Modify: `tests/ua/generateWorkflowService.test.ts`
- Modify: `tests/ua/routes.test.ts` (draft helpers if they omit workspaces)
- Modify: `tests/ua/e2e.generate.test.ts` (same)
- Modify: `tests/ua/llmComplete.test.ts` if stub drafts omit workspaces
- Modify: `src/types/ua.ts` if frontend `WorkflowDraft` types workspaces loosely

**Interfaces:**
- Consumes: `normalizeDraftWorkspaces`, `validateWorkspace`, `WorkspaceSchema`
- Produces: `assertValidDraft` requires `workspaces` 1:1 with steps; each value validated
- `generateDraft` returns draft after `normalizeDraftWorkspaces` + `assertValidDraft`
- `applyDraft` calls `normalizeDraftWorkspaces` then `assertValidDraft` (or assume pre-normalized but still normalize for safety)

- [ ] **Step 1: Write / update failing draft tests**

In `tests/ua/generateWorkflowService.test.ts`, update `makeDraft` so valid drafts include filled workspaces OR rely on normalize. Add:

```ts
it("rejects draft missing workspaces for a step after assertValidDraft", () => {
  const draft = makeDraft({ workspaces: {} });
  expect(() => assertValidDraft(draft)).toThrow(/workspace/i);
});

it("rejects draft with illegal component type", () => {
  const draft = makeDraft({
    workspaces: {
      plan: {
        version: 1,
        stepId: "plan",
        layout: "stack",
        components: [{ id: "x", type: "nope", props: {} }],
      },
      build: {
        version: 1,
        stepId: "build",
        layout: "stack",
        components: [{ id: "run", type: "agent-run", props: {} }],
      },
    },
  });
  expect(() => assertValidDraft(draft)).toThrow(/nope|Unknown/i);
});
```

Update existing `makeDraft` / apply tests that write `workspaces: { plan: {} }` — empty `{}` must fail; use a valid minimal workspace or expect rejection.

Helper for valid workspace:

```ts
function ws(stepId: string) {
  return {
    version: 1 as const,
    stepId,
    layout: "stack" as const,
    components: [{ id: "run", type: "agent-run", props: {} }],
  };
}
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/ua/generateWorkflowService.test.ts`

Expected: FAIL on new assertions / optional workspaces still accepted

- [ ] **Step 3: Update `electron/ua/draft.ts`**

Replace optional `workspaces: z.record(z.unknown()).optional()` with required record validated via `validateWorkspace`, plus superRefine for 1:1 step ids:

```ts
import { WorkspaceSchema, validateWorkspace } from "../workflow/workspaceSchema";

// inside object:
workspaces: z.record(z.unknown()),

// in superRefine, after prompt checks:
const stepIds = new Set(draft.workflow.steps.map((s) => s.id));
const wsKeys = Object.keys(draft.workspaces);
for (const id of stepIds) {
  if (!(id in draft.workspaces)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Missing workspace for step "${id}"`,
      path: ["workspaces", id],
    });
  }
}
for (const key of wsKeys) {
  if (!stepIds.has(key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Extra workspace key "${key}"`,
      path: ["workspaces", key],
    });
  }
}
for (const [key, value] of Object.entries(draft.workspaces)) {
  if (!stepIds.has(key)) continue;
  try {
    validateWorkspace({ ...(value as object), stepId: key });
  } catch (err) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: err instanceof Error ? err.message : `Invalid workspace for "${key}"`,
      path: ["workspaces", key],
    });
  }
}
```

Wire `generateWorkflowService.ts`:

```ts
import { normalizeDraftWorkspaces } from "./normalizeWorkspaces";

// after LLM returns parsed draft, before return:
const normalized = normalizeDraftWorkspaces(parsed);
return assertValidDraft(normalized);

// applyDraftUnlocked:
const normalized = normalizeDraftWorkspaces(draft);
const validated = assertValidDraft(normalized);
```

When writing workspace files, JSON.stringify the validated `WorkspaceDefinition` (already done).

- [ ] **Step 4: Fix all broken fixtures / tests; run focused suites**

Run:

```bash
npm test -- tests/ua/generateWorkflowService.test.ts tests/ua/routes.test.ts tests/ua/e2e.generate.test.ts tests/ua/llmComplete.test.ts tests/ua/normalizeWorkspaces.test.ts
```

Expected: PASS

Update frontend `src/types/ua.ts` `WorkflowDraft` so `workspaces` is required `Record<string, unknown>` or a mirrored workspace type.

- [ ] **Step 5: Commit**

```bash
git add electron/ua/draft.ts electron/ua/generateWorkflowService.ts src/types/ua.ts tests/ua
git commit -m "$(cat <<'EOF'
feat(ua): require validated per-step workspaces on generate/apply

EOF
)"
```

---

### Task 3: Update `generate-workflow-from-graph` skill

**Files:**
- Modify: `skills/generate-workflow-from-graph/SKILL.md`

**Interfaces:**
- Consumes: registry type list from `shared/workspaceRegistryData.ts` (document in skill text)
- Produces: skill instructs LLM to emit full workspace per step

- [ ] **Step 1: Rewrite workspace section of the skill**

Replace optional workspaces guidance with required shape. Include:

1. `workspaces` required; key per step id
2. Example one full `WorkspaceDefinition`
3. Allowed types (copy labels from registry): `markdown-doc`, `architecture-docs`, `code-explorer`, `agent-run`, `cicd-config`, `fe-architecture-plan`, `be-architecture-plan`, `schema-migrations`, `topology-panel`, `topology-context`, `cicd-readiness`, `component-splitter`, `agent-rules-editor`, `style-tokens-editor`, `langflow-panel`
4. Soft: align props paths with step outputs when possible
5. Prefer not inventing unknown types; avoid `langflow-panel` unless a real `flowId` is known
6. Update the JSON example at top so `workspaces` is non-empty full objects

- [ ] **Step 2: Sanity-check skill is loaded**

Run: `npm test -- tests/ua/llmComplete.test.ts`

Expected: PASS (skill body still loads; stub may need to return valid workspaces if it parses skill-only)

- [ ] **Step 3: Commit**

```bash
git add skills/generate-workflow-from-graph/SKILL.md
git commit -m "$(cat <<'EOF'
docs(skills): require full workspace composition in generate-workflow-from-graph

EOF
)"
```

---

### Task 4: Draft review workspace hint

**Files:**
- Modify: `src/components/ua/WorkflowDraftReview.vue`
- Create or modify: `tests/components/ua/WorkflowDraftReview.test.ts` (or under `tests/components/` matching repo pattern)

**Interfaces:**
- Consumes: `draft.workspaces` key count (or `draft.workflow.steps.length` after normalize)
- Produces: UI line `data-testid="ua-draft-workspaces-hint"`

- [ ] **Step 1: Write failing component test**

```ts
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import WorkflowDraftReview from "../../../src/components/ua/WorkflowDraftReview.vue";

const draft = {
  workflow: {
    version: 1,
    id: "demo",
    title: "Demo Flow",
    steps: [
      {
        id: "plan",
        title: "Plan",
        executor: "deepseek",
        skills: [],
        prompt_template: "prompts/plan.md",
        outputs: [],
        gates: [],
        requires_resources: [],
      },
    ],
    edges: [],
    resources: [],
  },
  prompts: { "prompts/plan.md": "# Plan" },
  workspaces: {
    plan: {
      version: 1,
      stepId: "plan",
      layout: "stack",
      components: [{ id: "run", type: "agent-run", props: {} }],
    },
  },
  meta: {
    source: "ua-graph",
    analyzedAt: null,
    gitCommitHash: null,
    gitCommitHashes: {},
    rootIds: ["main"],
    goal: null,
  },
};

describe("WorkflowDraftReview", () => {
  it("shows workspace generation hint with step count", () => {
    const wrapper = mount(WorkflowDraftReview, { props: { draft } });
    const hint = wrapper.get('[data-testid="ua-draft-workspaces-hint"]');
    expect(hint.text()).toMatch(/1/);
    expect(hint.text()).toMatch(/workspace/i);
  });
});
```

Match existing Vue test setup (check `tests/components/` for mount helpers / stubs).

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/components/ua/WorkflowDraftReview.test.ts`

Expected: FAIL (hint missing)

- [ ] **Step 3: Add hint to `WorkflowDraftReview.vue`**

Under the title block or above steps:

```vue
<p
  class="text-[10px] text-gray-500 mt-1"
  data-testid="ua-draft-workspaces-hint"
>
  已为 {{ Object.keys(draft.workspaces ?? {}).length }} 步生成 workspace（可在 Design / Chat 调整）
</p>
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/components/ua/WorkflowDraftReview.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ua/WorkflowDraftReview.vue tests/components/ua/WorkflowDraftReview.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): show UA draft workspace generation hint

EOF
)"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Full composition per step | 1, 2, 3 |
| Soft path align | 3 |
| Hard schema block | 1, 2 |
| Every step required | 1, 2 |
| Deterministic fill | 1 |
| No repair of illegal present | 1 |
| No langflow auto | 1, 3 |
| Light draft review hint | 4 |
| Apply writes valid JSON | 2 |
| No new Chat tools / templates unchanged | (non-goals — no tasks) |

## Plan self-review

- No TBD placeholders
- Signatures consistent: `normalizeDraftWorkspaces(draft) → WorkflowDraft`
- Heuristics match spec table
- Fixture updates covered in Task 2
