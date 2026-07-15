# Chat Custom Workspace Component Types (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Chat create declarative custom workspace component types (JSON schema + FE DeclarativePanel), with intent routing, Chat scope choice via `ask_question`, and pending approval before disk write.

**Architecture:** `intent_router` classifies create-type intent; low confidence uses `ask_question`. Create-type path asks scope (project|workflow|global), drafts schema, calls `workspace_register_component_type` (pending only). Confirm writes JSON under the chosen scope. `componentTypeStore` merges custom types into registry; `DeclarativePanelWidget` renders Phase-1 form fields. Built-in type ids remain reserved.

**Tech Stack:** Zod, Vitest, LangGraph (`reactGraph`), existing AskQuestion interrupt, Vue 3, Electron fs under `.agentflow/` + `app.getPath("userData")`.

**Spec:** `docs/superpowers/specs/2026-07-16-chat-custom-workspace-component-types-design.md`

## Global Constraints

- Phase 1 schema: **form fields only** (`propsFields` + metadata); no file bindings / actions yet
- Runtime: declarative JSON + `DeclarativePanelWidget` — **no** Vue SFC generation, **no** iframe
- Storage scopes: project | workflow | global; user chooses in Chat via `ask_question`
- Paths: project `.agentflow/component-types/{type}.json`; workflow `.agentflow/workflows/{workflowId}/component-types/{type}.json`; global `{userData}/component-types/{type}.json`
- Built-in type ids are **reserved** (custom cannot override)
- Custom merge precedence: **workflow > project > global**
- Register tool returns pending (`COMPONENT_TYPE_PENDING_APPROVAL\n`); **no disk write** until FE confirm
- Do **not** auto-add instance on register; agent may call existing `workspace_add_component` after
- `intent_router` failure → degrade to normal agent
- Depends on AskQuestion (`ask_question` + ClarificationCard) — **base the feature branch on `feature/ask-question-clarification`**
- Do not change UA generate / template workflow creation in this plan
- Reuse existing PropField shapes from `shared/workspaceRegistryData.ts`

## File Structure

| File | Responsibility |
|------|----------------|
| `shared/agentflowApprovalConstants.ts` | Add `COMPONENT_TYPE_PENDING_PREFIX` |
| `electron/workflow/customComponentTypeSchema.ts` | Zod schema for custom type JSON |
| `electron/workflow/componentTypeStore.ts` | Paths, load/save/list, merge registry |
| `electron/workflow/workspaceSchema.ts` | Validate custom types via merged registry (not only `COMPONENT_PROPS`) |
| `electron/agent/workspaceTools.ts` | `workspace_register_component_type`; list/add use merge |
| `electron/agent/intentRouter.ts` | Classify create-type intent + confidence |
| `electron/agent/reactGraph.ts` | Wire `intent_router` before agent |
| `electron/agent/prompt.ts` | Create-type path prompt guidance |
| `electron/agent/server.ts` | GET registry merge; POST apply component type |
| `src/workspace/componentTypeApproval.ts` | Parse pending payload |
| `src/components/workflow/ComponentTypeApprovalCard.vue` | Confirm/Reject UI |
| `src/composables/useWorkspaceApproval.ts` | Handle component-type pending + apply |
| `src/workspace/widgets/DeclarativePanelWidget.vue` | Phase-1 form renderer |
| `src/workspace/registryComponents.ts` | Map `declarative-panel` + resolve custom → declarative |
| `tests/workflow/customComponentTypeSchema.test.ts` | Schema tests |
| `tests/workflow/componentTypeStore.test.ts` | Store/merge tests |
| `tests/agent/workspaceRegisterComponentType.test.ts` | Register tool pending |
| `tests/agent/intentRouter.test.ts` | Router classification |
| `tests/components/DeclarativePanelWidget.test.ts` | FE form render |
| `tests/workspace/componentTypeApproval.test.ts` | Pending parse |

---

### Task 1: CustomComponentTypeSchema

**Files:**
- Create: `electron/workflow/customComponentTypeSchema.ts`
- Create: `tests/workflow/customComponentTypeSchema.test.ts`
- Modify: `shared/agentflowApprovalConstants.ts`

**Interfaces:**
- Consumes: `PropField` / `PropFieldType` from `shared/workspaceRegistryData.ts`; `WORKSPACE_REGISTRY` for reserved ids
- Produces:
  - `COMPONENT_TYPE_PENDING_PREFIX = "COMPONENT_TYPE_PENDING_APPROVAL\n"`
  - `CustomComponentTypeSchema` (zod)
  - `type CustomComponentType = z.infer<typeof CustomComponentTypeSchema>`
  - `assertNotReservedType(type: string): void` throws if `type` is in built-in registry
  - `parseCustomComponentType(input: unknown): CustomComponentType`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  parseCustomComponentType,
  assertNotReservedType,
} from "../../electron/workflow/customComponentTypeSchema";

describe("CustomComponentTypeSchema", () => {
  it("accepts a minimal Phase-1 type", () => {
    const t = parseCustomComponentType({
      type: "my-checklist",
      label: "Checklist",
      description: "Simple checklist",
      category: "custom",
      defaultProps: {},
      propsFields: [{ key: "title", label: "Title", type: "string", required: true }],
    });
    expect(t.type).toBe("my-checklist");
    expect(t.propsFields).toHaveLength(1);
  });

  it("rejects missing type", () => {
    expect(() =>
      parseCustomComponentType({
        label: "X",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      }),
    ).toThrow();
  });

  it("rejects built-in type ids", () => {
    expect(() => assertNotReservedType("markdown-doc")).toThrow(/reserved/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/customComponentTypeSchema.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement schema + constant**

Add to `shared/agentflowApprovalConstants.ts`:

```ts
export const COMPONENT_TYPE_PENDING_PREFIX = "COMPONENT_TYPE_PENDING_APPROVAL\n";
```

Create `electron/workflow/customComponentTypeSchema.ts`:

```ts
import { z } from "zod";
import { WORKSPACE_REGISTRY, type PropFieldType } from "../../shared/workspaceRegistryData";

const PropFieldTypeSchema = z.enum([
  "string",
  "boolean",
  "select",
  "string[]",
  "file-list",
  "skills",
  "langflow-flow",
] as [PropFieldType, ...PropFieldType[]]);

const PropFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: PropFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
});

export const CustomComponentTypeSchema = z.object({
  type: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "type must be kebab-case starting with a letter"),
  label: z.string().min(1),
  description: z.string(),
  category: z.string().min(1),
  defaultProps: z.record(z.unknown()).default({}),
  propsFields: z.array(PropFieldSchema),
});

export type CustomComponentType = z.infer<typeof CustomComponentTypeSchema>;

const RESERVED = new Set(WORKSPACE_REGISTRY.map((e) => e.type));

export function assertNotReservedType(type: string): void {
  if (RESERVED.has(type)) {
    throw new Error(`Component type "${type}" is reserved for a built-in widget`);
  }
}

export function parseCustomComponentType(input: unknown): CustomComponentType {
  const parsed = CustomComponentTypeSchema.parse(input);
  assertNotReservedType(parsed.type);
  return parsed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/workflow/customComponentTypeSchema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/agentflowApprovalConstants.ts electron/workflow/customComponentTypeSchema.ts tests/workflow/customComponentTypeSchema.test.ts
git commit -m "feat(workspace): add CustomComponentTypeSchema and pending prefix"
```

---

### Task 2: componentTypeStore (load/save/merge)

**Files:**
- Create: `electron/workflow/componentTypeStore.ts`
- Create: `tests/workflow/componentTypeStore.test.ts`

**Interfaces:**
- Consumes: `parseCustomComponentType`, `CustomComponentType`, `WORKSPACE_REGISTRY`, `WorkspaceRegistryEntry`
- Produces:
  - `export type ComponentTypeScope = "project" | "workflow" | "global"`
  - `componentTypesDir(workspaceRoot, scope, workflowId?: string, userDataRoot?: string): string`
  - `async saveComponentType(opts: { workspaceRoot: string; userDataRoot: string; scope: ComponentTypeScope; workflowId?: string; typeDef: CustomComponentType }): Promise<string>` // returns file path
  - `async listComponentTypes(opts: { workspaceRoot: string; userDataRoot: string; workflowId?: string | null }): Promise<CustomComponentType[]>`
  - `async mergeWorkspaceRegistry(opts: { workspaceRoot: string; userDataRoot: string; workflowId?: string | null }): Promise<WorkspaceRegistryEntry[]>`
  - Merge order when building map: start with global, then project, then workflow (later overwrites); then overlay **built-in last** so built-ins always win / reserved stay built-in. For **listing custom-only**, return without built-ins. For **merged registry for tools/UI**: built-ins first, then custom types whose ids are not reserved (workflow > project > global for same custom id).

**Merge algorithm (exact):**
1. `customs = new Map<string, CustomComponentType>()`
2. Load global → project → workflow into map (each overwrites)
3. `merged = [...WORKSPACE_REGISTRY]`
4. For each custom entry, if `!RESERVED.has(type)`, push as `WorkspaceRegistryEntry` (same shape; no extra fields required in Phase 1)
5. Return merged

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  saveComponentType,
  mergeWorkspaceRegistry,
  listComponentTypes,
} from "../../electron/workflow/componentTypeStore";

describe("componentTypeStore", () => {
  let root: string;
  let userData: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "cts-"));
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "cts-ud-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
  });

  const sample = {
    type: "my-checklist",
    label: "Checklist",
    description: "d",
    category: "custom",
    defaultProps: {},
    propsFields: [{ key: "title", label: "Title", type: "string" as const }],
  };

  it("saves project scope and merges into registry", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "project",
      typeDef: sample,
    });
    const merged = await mergeWorkspaceRegistry({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    expect(merged.some((e) => e.type === "my-checklist")).toBe(true);
    expect(merged.some((e) => e.type === "markdown-doc")).toBe(true);
  });

  it("workflow overrides project for same type id", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "project",
      typeDef: { ...sample, label: "Project" },
    });
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "workflow",
      workflowId: "wf1",
      typeDef: { ...sample, label: "Workflow" },
    });
    const merged = await mergeWorkspaceRegistry({
      workspaceRoot: root,
      userDataRoot: userData,
      workflowId: "wf1",
    });
    expect(merged.find((e) => e.type === "my-checklist")?.label).toBe("Workflow");
  });

  it("listComponentTypes returns customs only", async () => {
    await saveComponentType({
      workspaceRoot: root,
      userDataRoot: userData,
      scope: "global",
      typeDef: sample,
    });
    const list = await listComponentTypes({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    expect(list.map((t) => t.type)).toEqual(["my-checklist"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workflow/componentTypeStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement store**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  WORKSPACE_REGISTRY,
  type WorkspaceRegistryEntry,
} from "../../shared/workspaceRegistryData";
import {
  parseCustomComponentType,
  type CustomComponentType,
} from "./customComponentTypeSchema";

export type ComponentTypeScope = "project" | "workflow" | "global";

export function componentTypesDir(
  workspaceRoot: string,
  scope: ComponentTypeScope,
  workflowId?: string,
  userDataRoot?: string,
): string {
  if (scope === "global") {
    if (!userDataRoot) throw new Error("userDataRoot required for global scope");
    return path.join(userDataRoot, "component-types");
  }
  if (scope === "project") {
    return path.join(workspaceRoot, ".agentflow", "component-types");
  }
  if (!workflowId?.trim()) throw new Error("workflowId required for workflow scope");
  return path.join(
    workspaceRoot,
    ".agentflow",
    "workflows",
    workflowId.trim(),
    "component-types",
  );
}

function toEntry(t: CustomComponentType): WorkspaceRegistryEntry {
  return {
    type: t.type,
    label: t.label,
    description: t.description,
    category: t.category,
    defaultProps: t.defaultProps,
    propsFields: t.propsFields,
  };
}

async function readDirTypes(dir: string): Promise<CustomComponentType[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: CustomComponentType[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
    out.push(parseCustomComponentType(raw));
  }
  return out;
}

export async function saveComponentType(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  scope: ComponentTypeScope;
  workflowId?: string;
  typeDef: CustomComponentType;
}): Promise<string> {
  const typeDef = parseCustomComponentType(opts.typeDef);
  const dir = componentTypesDir(
    opts.workspaceRoot,
    opts.scope,
    opts.workflowId,
    opts.userDataRoot,
  );
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${typeDef.type}.json`);
  await fs.writeFile(filePath, JSON.stringify(typeDef, null, 2), "utf8");
  return filePath;
}

export async function listComponentTypes(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
}): Promise<CustomComponentType[]> {
  const map = new Map<string, CustomComponentType>();
  for (const t of await readDirTypes(
    componentTypesDir(opts.workspaceRoot, "global", undefined, opts.userDataRoot),
  )) {
    map.set(t.type, t);
  }
  for (const t of await readDirTypes(
    componentTypesDir(opts.workspaceRoot, "project"),
  )) {
    map.set(t.type, t);
  }
  if (opts.workflowId?.trim()) {
    for (const t of await readDirTypes(
      componentTypesDir(opts.workspaceRoot, "workflow", opts.workflowId),
    )) {
      map.set(t.type, t);
    }
  }
  return [...map.values()];
}

export async function mergeWorkspaceRegistry(opts: {
  workspaceRoot: string;
  userDataRoot: string;
  workflowId?: string | null;
}): Promise<WorkspaceRegistryEntry[]> {
  const customs = await listComponentTypes(opts);
  const reserved = new Set(WORKSPACE_REGISTRY.map((e) => e.type));
  return [
    ...WORKSPACE_REGISTRY,
    ...customs.filter((c) => !reserved.has(c.type)).map(toEntry),
  ];
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/workflow/componentTypeStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/workflow/componentTypeStore.ts tests/workflow/componentTypeStore.test.ts
git commit -m "feat(workspace): componentTypeStore load/save/merge for custom types"
```

---

### Task 3: Register tool + validateWorkspace for customs

**Files:**
- Modify: `electron/agent/workspaceTools.ts`
- Modify: `electron/workflow/workspaceSchema.ts`
- Create: `tests/agent/workspaceRegisterComponentType.test.ts`
- Modify: `tests/agent/tools.test.ts` (expect new tool name when Agent tools built)

**Interfaces:**
- Consumes: `mergeWorkspaceRegistry`, `parseCustomComponentType`, `COMPONENT_TYPE_PENDING_PREFIX`, `ComponentTypeScope`
- Produces:
  - Tool `workspace_register_component_type` args: `{ type_def: object, scope: "project"|"workflow"|"global", workflow_id?: string, confirm?: boolean }`
  - Returns string: `COMPONENT_TYPE_PENDING_PREFIX + JSON.stringify({ scope, workflowId?, typeDef, overwrite: boolean, summary: string })`
  - Does **not** call `saveComponentType`
  - `workspace_list_registry` uses `mergeWorkspaceRegistry` (needs `userDataRoot` on ctx)
  - Extend `WorkspaceToolContext` with `userDataRoot: string`
  - `validateWorkspace(def, options?: { customTypes?: Map<string, z.ZodTypeAny> | CustomComponentType[] })` — if component type not in `COMPONENT_PROPS`, validate props loosely: all `propsFields` keys optional/required per field; unknown keys allowed as `z.record` for Phase 1 OR build zod object from propsFields

**Props validation helper for custom types:**

```ts
export function zodFromPropsFields(fields: PropField[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let s: z.ZodTypeAny =
      f.type === "boolean"
        ? z.boolean()
        : f.type === "string[]" || f.type === "file-list" || f.type === "skills"
          ? z.array(z.string())
          : z.string(); // select / string / langflow-flow as string for Phase 1
    if (!f.required) s = s.optional();
    shape[f.key] = s;
  }
  return z.object(shape).passthrough();
}
```

- [ ] **Step 1: Write failing register-tool test**

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildWorkspaceLangChainTools } from "../../electron/agent/workspaceTools";

describe("workspace_register_component_type", () => {
  let root: string;
  let userData: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "reg-"));
    userData = await fs.mkdtemp(path.join(os.tmpdir(), "reg-ud-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
  });

  it("returns pending approval without writing files", async () => {
    const tools = buildWorkspaceLangChainTools({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    const tool = tools.find((t) => t.name === "workspace_register_component_type");
    expect(tool).toBeTruthy();
    const result = await tool!.invoke({
      scope: "project",
      type_def: {
        type: "my-checklist",
        label: "Checklist",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [{ key: "title", label: "Title", type: "string" }],
      },
    });
    expect(String(result)).toContain("COMPONENT_TYPE_PENDING_APPROVAL");
    await expect(
      fs.access(path.join(root, ".agentflow/component-types/my-checklist.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects reserved built-in type", async () => {
    const tools = buildWorkspaceLangChainTools({
      workspaceRoot: root,
      userDataRoot: userData,
    });
    const tool = tools.find((t) => t.name === "workspace_register_component_type")!;
    const result = await tool.invoke({
      scope: "project",
      type_def: {
        type: "markdown-doc",
        label: "X",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      },
    });
    expect(String(result)).toMatch(/reserved/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/agent/workspaceRegisterComponentType.test.ts`

- [ ] **Step 3: Implement tool + ctx.userDataRoot + list_registry merge + validateWorkspace custom path**

Wire `userDataRoot` through every `buildWorkspaceLangChainTools` / `buildReadOnlyWorkspaceTools` call site (grep and update). If a call site lacks Electron `app`, pass `path.join(os.homedir(), ".agentflow-desktop")` or existing settings userData helper — prefer `app.getPath("userData")` when `app` is available; for tests pass temp dir.

For `workspace_list_registry`, replace static `WORKSPACE_REGISTRY.map` with `await mergeWorkspaceRegistry({ workspaceRoot: ctx.workspaceRoot, userDataRoot: ctx.userDataRoot, workflowId: ctx.workflowId })`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/agent/workspaceRegisterComponentType.test.ts tests/agent/workspaceTools.test.ts tests/agent/tools.test.ts`
Expected: PASS (update tools.test expectations to include new tool in Agent mode)

- [ ] **Step 5: Commit**

```bash
git add electron/agent/workspaceTools.ts electron/workflow/workspaceSchema.ts tests/agent/workspaceRegisterComponentType.test.ts tests/agent/tools.test.ts
git commit -m "feat(agent): workspace_register_component_type pending approval tool"
```

---

### Task 4: Apply API + ComponentTypeApprovalCard

**Files:**
- Modify: `electron/agent/server.ts` — `POST /v1/workspace/component-types/apply`
- Create: `src/workspace/componentTypeApproval.ts`
- Create: `src/components/workflow/ComponentTypeApprovalCard.vue`
- Create: `tests/workspace/componentTypeApproval.test.ts`
- Modify: `src/composables/useWorkspaceApproval.ts` (+ Chat.vue / WorkflowRun.vue wiring like existing cards)

**Interfaces:**
- POST body: `{ scope, workflowId?: string, typeDef: CustomComponentType }`
- On success: `{ ok: true, path: string }` via `saveComponentType`
- `parsePendingComponentTypeApproval(output: string): Pending | null`
- Pending type: `{ scope, workflowId?: string | null, typeDef, overwrite: boolean, summary: string }`

- [ ] **Step 1: Write failing parse test**

```ts
import { describe, expect, it } from "vitest";
import { COMPONENT_TYPE_PENDING_PREFIX } from "../../shared/agentflowApprovalConstants";
import { parsePendingComponentTypeApproval } from "../../src/workspace/componentTypeApproval";

describe("parsePendingComponentTypeApproval", () => {
  it("parses pending payload", () => {
    const payload = {
      scope: "project",
      typeDef: {
        type: "my-checklist",
        label: "Checklist",
        description: "d",
        category: "custom",
        defaultProps: {},
        propsFields: [],
      },
      overwrite: false,
      summary: "Register my-checklist",
    };
    const parsed = parsePendingComponentTypeApproval(
      COMPONENT_TYPE_PENDING_PREFIX + JSON.stringify(payload),
    );
    expect(parsed?.typeDef.type).toBe("my-checklist");
    expect(parsed?.scope).toBe("project");
  });

  it("returns null for unrelated output", () => {
    expect(parsePendingComponentTypeApproval("hello")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement parse, card, apply route, wire `handleToolEndOutput`**

Card UI: show `summary`, `scope`, JSON preview of `typeDef`, Confirm / Cancel (mirror `WorkspaceApprovalCard`).

Apply: `writeWorkspaceFile` is wrong path — call new API:

`POST ${base}/v1/workspace/component-types/apply` with JSON body.

Server handler calls `saveComponentType` with `getWorkspaceRoot()` and configured `userDataRoot`.

- [ ] **Step 4: Run unit tests + a server route test if project has pattern for POST workspace routes**

Run: `npx vitest run tests/workspace/componentTypeApproval.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/agentflowApprovalConstants.ts src/workspace/componentTypeApproval.ts src/components/workflow/ComponentTypeApprovalCard.vue src/composables/useWorkspaceApproval.ts src/pages/Chat.vue src/pages/WorkflowRun.vue electron/agent/server.ts tests/workspace/componentTypeApproval.test.ts
git commit -m "feat(ui): ComponentTypeApprovalCard and apply API for custom types"
```

---

### Task 5: DeclarativePanelWidget + registry HTTP merge

**Files:**
- Create: `src/workspace/widgets/DeclarativePanelWidget.vue`
- Create: `tests/components/DeclarativePanelWidget.test.ts`
- Modify: `src/workspace/registryComponents.ts`
- Modify: `electron/agent/server.ts` GET `/v1/workspace/registry`
- Modify: workspace render path (wherever `WIDGET_COMPONENTS[comp.type]` is resolved) to fall back to `DeclarativePanelWidget` when type is custom / missing from built-in map but present in registry entry with category `custom` OR always: if `!WIDGET_COMPONENTS[type]` use declarative renderer with registry entry propsFields

**Resolution rule (exact):**
1. If `type` in `WIDGET_COMPONENTS` → existing widget
2. Else → `DeclarativePanelWidget` with `propsFields` from merged registry entry (fetch/cache); if no registry entry → missing-type placeholder

Phase-1 widget: reuse `WorkspacePropFields` for editing instance props in Design; in run panel show read-only or editable fields bound to `comp.props` (minimal: display label + field list values).

- [ ] **Step 1: Write failing widget test**

```ts
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import DeclarativePanelWidget from "../../src/workspace/widgets/DeclarativePanelWidget.vue";

describe("DeclarativePanelWidget", () => {
  it("renders propsFields labels", () => {
    const wrapper = mount(DeclarativePanelWidget, {
      props: {
        propsFields: [{ key: "title", label: "Title", type: "string" }],
        modelProps: { title: "Hello" },
      },
    });
    expect(wrapper.text()).toContain("Title");
    expect(wrapper.text()).toContain("Hello");
  });

  it("shows missing-type placeholder when flagged", () => {
    const wrapper = mount(DeclarativePanelWidget, {
      props: { missingType: "gone-type", propsFields: [], modelProps: {} },
    });
    expect(wrapper.text()).toMatch(/missing|gone-type/i);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement widget + registry GET merge + render fallback**

GET `/v1/workspace/registry?workflowId=` → `{ components: await mergeWorkspaceRegistry(...) }`

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/components/DeclarativePanelWidget.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/workspace/widgets/DeclarativePanelWidget.vue src/workspace/registryComponents.ts electron/agent/server.ts tests/components/DeclarativePanelWidget.test.ts
git commit -m "feat(ui): DeclarativePanelWidget and merged workspace registry API"
```

---

### Task 6: intent_router + create-type prompt path

**Files:**
- Create: `electron/agent/intentRouter.ts`
- Create: `tests/agent/intentRouter.test.ts`
- Modify: `electron/agent/reactGraph.ts` (or stream entry that builds the graph)
- Modify: `electron/agent/prompt.ts` / `agentflowPromptContext.ts`

**Interfaces:**
- Produces:
  - `export type ChatIntent = "create_custom_component_type" | "other"`
  - `export type IntentRouterResult = { intent: ChatIntent; confidence: "high" | "low"; reason: string }`
  - `classifyCreateComponentIntent(userText: string, llm?: ...): Promise<IntentRouterResult>`
  - For unit tests: export pure heuristic `heuristicCreateComponentIntent(text: string): IntentRouterResult` used when no LLM / as first pass; LLM optional refinement in production
- Graph: START → `intent_router` → conditional:
  - high create → set config/system flag `createTypeMode=true` → agent
  - low → agent still, but prompt forces first tool `ask_question` for intent confirm (or inject a system message). Spec: low confidence → ask_question. Implementation: intent_router node appends a SystemMessage instructing agent to call `ask_question` with the three options (create type / use existing / other) before other tools when confidence is low and component-related.
  - other → normal agent
- On router throw/fail: route to normal agent
- Create-type high path: system prompt snippet: call `ask_question` for scope (project|workflow|global) before `workspace_register_component_type`; then draft schema; never write without approval

**Heuristic (exact for tests):**
- high create if text matches `/\b(new|create|生成|新建|自定义).{0,40}(component|组件|panel|面板|widget)/i` OR `/\b(component|组件).{0,40}(type|类型)/i`
- low if mentions component/面板/workspace UI but not clearly create
- else other / high other

- [ ] **Step 1: Write failing intent tests**

```ts
import { describe, expect, it } from "vitest";
import { heuristicCreateComponentIntent } from "../../electron/agent/intentRouter";

describe("heuristicCreateComponentIntent", () => {
  it("detects create custom component type", () => {
    const r = heuristicCreateComponentIntent("帮我新建一个自定义 checklist 组件类型");
    expect(r.intent).toBe("create_custom_component_type");
    expect(r.confidence).toBe("high");
  });

  it("marks ambiguous component mentions as low confidence", () => {
    const r = heuristicCreateComponentIntent("这个组件能不能改一下");
    expect(r.confidence).toBe("low");
  });

  it("returns other for unrelated chat", () => {
    const r = heuristicCreateComponentIntent("总结一下今天的 commits");
    expect(r.intent).toBe("other");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement router + graph wiring + prompts**

Keep graph changes minimal: if wiring full LangGraph node is invasive, acceptable Phase-1 approach: call `heuristicCreateComponentIntent` at the start of `agentService` / stream before `graph.stream`, and prepend system guidance messages based on result (still satisfies “intent judgment before agent”). Prefer a real LangGraph node if `reactGraph` already supports extra nodes cleanly.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/agent/intentRouter.test.ts`

- [ ] **Step 5: Commit**

```bash
git add electron/agent/intentRouter.ts electron/agent/reactGraph.ts electron/agent/prompt.ts electron/agent/agentflowPromptContext.ts electron/agent/agentService.ts tests/agent/intentRouter.test.ts
git commit -m "feat(agent): intent_router for create custom workspace component types"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Declarative JSON types | 1 |
| Storage paths + merge precedence | 2 |
| `workspace_register_component_type` pending | 3 |
| list/add via merged registry | 3, 5 |
| validate custom in workspace | 3 |
| User approve in Chat | 4 |
| DeclarativePanel Phase-1 form | 5 |
| intent_router + low-confidence ask_question | 6 |
| Scope via ask_question | 6 (prompt) + AskQuestion dep |
| No Vue SFC / no auto-add | Global constraints |
| Phase 2/3 files/actions | Out of this plan |

## Execution notes

- Create worktree branch from **`feature/ask-question-clarification`** (AskQuestion already complete there).
- After all tasks: run `npx vitest run` focused suites above; fix regressions in `workspaceTools` call sites missing `userDataRoot`.
