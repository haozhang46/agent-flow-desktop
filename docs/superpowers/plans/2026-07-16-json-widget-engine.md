# JSON Widget Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a framework-agnostic JSON description layer + `JsonWidgetEngine` with a Vue render adapter, then route all workspace panels through the engine (named views wrapping existing SFCs).

**Architecture:** Type JSON (Zod) describes each panel. Engine validates, builds a render plan (`form` | `view`), and runs a whitelist `ActionBus`. `VueJsonRenderAdapter` mounts named views / form fields. `WorkflowPanelRenderer` only hosts chrome; content goes through `JsonWidgetHost`. Built-ins migrate to JSON defs with `root: { type: "view", name: "<type>" }`.

**Tech Stack:** TypeScript, Zod, Vue 3, Vitest. Spec: `docs/superpowers/specs/2026-07-16-json-widget-engine-design.md`.

## Global Constraints

- Description layer is **JSON/data only** — no Vue/React imports in `shared/jsonWidget/*` engine/schema modules
- Render adapters are swappable; V1 implements **Vue only**; export `JsonRenderAdapter` interface for future React
- All workspace panels go through engine + Host — **no** direct `WIDGET_COMPONENTS` lookup in `WorkflowPanelRenderer`
- Complex UI uses **named views** registered on the Vue adapter (existing widget SFCs)
- Forms are engine mode over `propsFields` (`root: { type: "form" }`)
- Action kinds whitelist only: `props.set`, `panel.< PaneldApi method >`, `chat.invoke` (template interpolates declared prop keys only)
- No Vue/React SFC generation, `eval`, or iframes
- Chat custom-type registration / intent router is **out of this plan**
- Full `ui` layout tree is **out of this plan** (schema may allow optional unknown `ui` to be stripped or ignored)
- Type missing JSON description → error UI; **no** silent fallback to old type→SFC map
- Every `WORKSPACE_REGISTRY` type must have a JSON def after migration
- Keep `bindWidgetProps` behavior for agent-run / architecture / rules (Host applies it before passing props to the view)

## File Structure

| File | Responsibility |
|------|----------------|
| `shared/jsonWidget/types.ts` | Render-plan + adapter-facing types (no Zod) |
| `shared/jsonWidget/schema.ts` | Zod schemas + `parsePanelTypeDocument` |
| `shared/jsonWidget/actionBus.ts` | Whitelist action execution |
| `shared/jsonWidget/engine.ts` | Validate + build `RenderPlan` from type doc + instance props |
| `shared/jsonWidget/builtinTypeDefs.ts` | JSON defs for all built-in registry types |
| `shared/jsonWidget/index.ts` | Public exports |
| `src/workspace/jsonWidget/viewRegistry.ts` | Map view name → async Vue component (from current widgets) |
| `src/workspace/jsonWidget/VueJsonRenderAdapter.ts` | Vue adapter implementing `JsonRenderAdapter` |
| `src/workspace/jsonWidget/JsonWidgetHost.vue` | Load type def, run engine, mount via adapter / `<component>` |
| `src/workspace/jsonWidget/JsonFormFields.vue` | Phase-1 form renderer from `propsFields` |
| `src/workspace/WorkflowPanelRenderer.vue` | Use Host instead of `WIDGET_COMPONENTS` |
| `tests/jsonWidget/schema.test.ts` | Schema tests |
| `tests/jsonWidget/engine.test.ts` | Engine + ActionBus tests |
| `tests/jsonWidget/builtinTypeDefs.test.ts` | Every registry type has a def |
| `tests/workspace/WorkflowPanelRenderer.test.ts` | Update for Host path |
| `tests/workspace/JsonWidgetHost.test.ts` | Host mounts named view / form / errors |

---

### Task 1: Panel type JSON schema

**Files:**
- Create: `shared/jsonWidget/types.ts`
- Create: `shared/jsonWidget/schema.ts`
- Create: `shared/jsonWidget/index.ts`
- Create: `tests/jsonWidget/schema.test.ts`

**Interfaces:**
- Consumes: `PropField` / `PropFieldType` from `shared/workspaceRegistryData.ts` (re-export or duplicate field shape in Zod matching existing fields)
- Produces:
  - `PanelTypeDocument` (parsed)
  - `parsePanelTypeDocument(input: unknown): PanelTypeDocument` (throws on invalid)
  - Root: `{ type: "view"; name: string; props?: Record<string, unknown> } | { type: "form" }`
  - Optional `actions: Array<{ id: string; label: string; kind: string; payload?: Record<string, unknown> }>`
  - Action `kind` must match `/^(props\.set|chat\.invoke|panel\.[A-Za-z][A-Za-z0-9]*)$/` at parse time

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from "vitest";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";

describe("parsePanelTypeDocument", () => {
  it("accepts a built-in view document", () => {
    const doc = parsePanelTypeDocument({
      type: "markdown-doc",
      label: "Markdown Doc",
      description: "d",
      category: "docs",
      defaultProps: { docsDir: "docs" },
      propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
      root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
    });
    expect(doc.root).toEqual({
      type: "view",
      name: "markdown-doc",
      props: { $bind: "instance" },
    });
  });

  it("accepts a form root with chat.invoke action", () => {
    const doc = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "" },
      propsFields: [{ key: "title", label: "Title", type: "string", required: true }],
      root: { type: "form" },
      actions: [
        {
          id: "ask",
          label: "Ask Chat",
          kind: "chat.invoke",
          payload: { template: "Review: {{title}}" },
        },
      ],
    });
    expect(doc.root.type).toBe("form");
    expect(doc.actions?.[0].kind).toBe("chat.invoke");
  });

  it("rejects missing type", () => {
    expect(() =>
      parsePanelTypeDocument({
        label: "X",
        description: "d",
        category: "c",
        defaultProps: {},
        propsFields: [],
        root: { type: "form" },
      }),
    ).toThrow();
  });

  it("rejects invalid action kind", () => {
    expect(() =>
      parsePanelTypeDocument({
        type: "x",
        label: "X",
        description: "d",
        category: "c",
        defaultProps: {},
        propsFields: [],
        root: { type: "form" },
        actions: [{ id: "a", label: "A", kind: "eval.run" }],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jsonWidget/schema.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement types + schema + barrel**

`shared/jsonWidget/types.ts` — export:

```ts
export type PanelRootView = {
  type: "view";
  name: string;
  props?: Record<string, unknown>;
};

export type PanelRootForm = { type: "form" };

export type PanelRoot = PanelRootView | PanelRootForm;

export type PanelAction = {
  id: string;
  label: string;
  kind: string;
  payload?: Record<string, unknown>;
};

export type PanelTypeDocument = {
  type: string;
  label: string;
  description: string;
  category: string;
  defaultProps: Record<string, unknown>;
  propsFields: import("../workspaceRegistryData").PropField[];
  root: PanelRoot;
  actions?: PanelAction[];
};

export type RenderPlan =
  | {
      kind: "view";
      viewName: string;
      viewProps: Record<string, unknown>;
      actions: PanelAction[];
      document: PanelTypeDocument;
    }
  | {
      kind: "form";
      fields: PanelTypeDocument["propsFields"];
      values: Record<string, unknown>;
      actions: PanelAction[];
      document: PanelTypeDocument;
    }
  | { kind: "error"; message: string; document?: PanelTypeDocument };

export type ActionContext = {
  props: Record<string, unknown>;
  setProps: (next: Record<string, unknown>) => void | Promise<void>;
  panelApi?: Record<string, (...args: unknown[]) => unknown>;
  chatInvoke?: (message: string) => void | Promise<void>;
};

export interface JsonRenderAdapter {
  /** Adapter id, e.g. "vue" */
  readonly id: string;
}
```

Implement Zod in `schema.ts` mirroring `PropField` types from registry (`string` | `boolean` | `select` | `string[]` | `file-list` | `skills` | `langflow-flow`). Export `parsePanelTypeDocument`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/jsonWidget/schema.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/jsonWidget tests/jsonWidget/schema.test.ts
git commit -m "feat(json-widget): add panel type JSON schema"
```

---

### Task 2: Engine + ActionBus

**Files:**
- Create: `shared/jsonWidget/actionBus.ts`
- Create: `shared/jsonWidget/engine.ts`
- Modify: `shared/jsonWidget/index.ts`
- Create: `tests/jsonWidget/engine.test.ts`

**Interfaces:**
- Consumes: `parsePanelTypeDocument`, `PanelTypeDocument`, `RenderPlan`, `ActionContext`, `PanelAction`
- Produces:
  - `buildRenderPlan(doc: PanelTypeDocument, instanceProps: Record<string, unknown>): RenderPlan`
  - `executeAction(action: PanelAction, ctx: ActionContext): Promise<void>`
  - For view root: merge `defaultProps`, instance props; if `root.props.$bind === "instance"`, viewProps = merged instance props (plus any other root.props keys except `$bind`)
  - For form root: values = `{ ...defaultProps, ...instanceProps }`, fields = `propsFields`
  - `executeAction`:
    - `props.set` → `ctx.setProps({ ...ctx.props, ...(action.payload ?? {}) })` (payload keys become prop updates)
    - `chat.invoke` → render `payload.template` replacing `{{key}}` only for keys in `ctx.props`; call `ctx.chatInvoke`; if missing chatInvoke, throw `Error("chat.invoke unavailable")`
    - `panel.X` → call `ctx.panelApi[X](...args)` where `payload.args` is `unknown[]` (default `[]`); if missing method, throw
    - other kinds → throw `Error("action kind not allowed")`

- [ ] **Step 1: Write failing engine/action tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";
import { buildRenderPlan } from "../../shared/jsonWidget/engine";
import { executeAction } from "../../shared/jsonWidget/actionBus";

const viewDoc = () =>
  parsePanelTypeDocument({
    type: "markdown-doc",
    label: "Markdown Doc",
    description: "d",
    category: "docs",
    defaultProps: { docsDir: "docs" },
    propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
    root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
  });

describe("buildRenderPlan", () => {
  it("builds a view plan with merged props", () => {
    const plan = buildRenderPlan(viewDoc(), { docsDir: "notes" });
    expect(plan.kind).toBe("view");
    if (plan.kind !== "view") return;
    expect(plan.viewName).toBe("markdown-doc");
    expect(plan.viewProps.docsDir).toBe("notes");
  });

  it("builds a form plan", () => {
    const doc = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "T" },
      propsFields: [{ key: "title", label: "Title", type: "string" }],
      root: { type: "form" },
    });
    const plan = buildRenderPlan(doc, {});
    expect(plan.kind).toBe("form");
    if (plan.kind !== "form") return;
    expect(plan.values.title).toBe("T");
  });
});

describe("executeAction", () => {
  it("runs chat.invoke with interpolated template", async () => {
    const chatInvoke = vi.fn();
    await executeAction(
      {
        id: "ask",
        label: "Ask",
        kind: "chat.invoke",
        payload: { template: "Review: {{title}}" },
      },
      {
        props: { title: "Hello" },
        setProps: () => {},
        chatInvoke,
      },
    );
    expect(chatInvoke).toHaveBeenCalledWith("Review: Hello");
  });

  it("rejects unknown kinds", async () => {
    await expect(
      executeAction(
        { id: "x", label: "X", kind: "eval.run" },
        { props: {}, setProps: () => {} },
      ),
    ).rejects.toThrow(/not allowed/i);
  });

  it("calls panelApi methods", async () => {
    const listWorkspace = vi.fn().mockResolvedValue([]);
    await executeAction(
      {
        id: "list",
        label: "List",
        kind: "panel.listWorkspace",
        payload: { args: ["."] },
      },
      {
        props: {},
        setProps: () => {},
        panelApi: { listWorkspace },
      },
    );
    expect(listWorkspace).toHaveBeenCalledWith(".");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/jsonWidget/engine.test.ts`

- [ ] **Step 3: Implement `actionBus.ts` + `engine.ts`; export from index**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/jsonWidget tests/jsonWidget/engine.test.ts
git commit -m "feat(json-widget): add engine and action bus"
```

---

### Task 3: Vue adapter, form fields, JsonWidgetHost

**Files:**
- Create: `src/workspace/jsonWidget/viewRegistry.ts`
- Create: `src/workspace/jsonWidget/JsonFormFields.vue`
- Create: `src/workspace/jsonWidget/JsonWidgetHost.vue`
- Create: `src/workspace/jsonWidget/VueJsonRenderAdapter.ts`
- Create: `tests/workspace/JsonWidgetHost.test.ts`

**Interfaces:**
- Consumes: `buildRenderPlan`, `parsePanelTypeDocument`, `executeAction`, `PanelTypeDocument`, `bindWidgetProps`, `PanelApi`
- Produces:
  - `getBuiltinTypeDocument(type: string): PanelTypeDocument | undefined` (Task 4 fills builtins; for this task Host accepts `typeDocument` prop OR looks up a injectable map)
  - `VIEW_LOADERS: Record<string, () => Promise<{ default: Component }>>` — copy current `WIDGET_COMPONENTS` entries into `viewRegistry.ts` (same loaders)
  - `JsonWidgetHost` props: `{ type: string; componentId: string; label?: string; props: Record<string, unknown>; api: PanelApi; runtime?: PanelRuntimeContext; workspaceStepId?: string; typeDocument?: PanelTypeDocument; chatInvoke?: (message: string) => void | Promise<void>; onPropsUpdate?: (props: Record<string, unknown>) => void }`
  - Host behavior:
    1. Resolve document from `typeDocument` prop, else `getBuiltinTypeDocument(type)` (stub returning undefined until Task 4 — for tests pass `typeDocument`)
    2. If missing doc → error UI `data-testid="json-widget-missing-type"`
    3. `plan = buildRenderPlan(doc, props)`
    4. If `plan.kind === "view"` → load `VIEW_LOADERS[plan.viewName]`, bind with `bindWidgetProps({ id: componentId, type, label, props: plan.viewProps }, api, runtime, workspaceStepId)` note: construct a minimal `WorkspaceComponent`
    5. If `plan.kind === "form"` → render `JsonFormFields` with fields/values; on change call `onPropsUpdate`
    6. Render action buttons when `plan.actions?.length`; click → `executeAction`
  - `JsonFormFields`: for each field render label + input by `type` (`string` → text input, `boolean` → checkbox, `select` → select with options; other types → JSON text fallback `<textarea>` showing `JSON.stringify(value)` for V1)
  - `VueJsonRenderAdapter`: `{ id: "vue" }` satisfying `JsonRenderAdapter` (marker for V1; Host does Vue mounting directly via `<component :is>`)

- [ ] **Step 1: Write failing Host test**

```ts
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import JsonWidgetHost from "../../src/workspace/jsonWidget/JsonWidgetHost.vue";
import { parsePanelTypeDocument } from "../../shared/jsonWidget/schema";

vi.mock("../../src/workspace/jsonWidget/viewRegistry", () => ({
  VIEW_LOADERS: {
    "markdown-doc": async () => ({
      default: defineComponent({
        props: ["docsDir", "api"],
        setup: (p) => () => h("div", { "data-testid": "mock-md" }, String(p.docsDir)),
      }),
    }),
  },
}));

describe("JsonWidgetHost", () => {
  const api = {} as never;

  it("renders named view from type document", async () => {
    const typeDocument = parsePanelTypeDocument({
      type: "markdown-doc",
      label: "Markdown Doc",
      description: "d",
      category: "docs",
      defaultProps: { docsDir: "docs" },
      propsFields: [{ key: "docsDir", label: "Docs directory", type: "string" }],
      root: { type: "view", name: "markdown-doc", props: { $bind: "instance" } },
    });
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "markdown-doc",
        componentId: "c1",
        props: { docsDir: "notes" },
        api,
        typeDocument,
      },
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="mock-md"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="mock-md"]').text()).toContain("notes");
  });

  it("shows missing-type error when no document", () => {
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "nope",
        componentId: "c1",
        props: {},
        api,
      },
    });
    expect(wrapper.find('[data-testid="json-widget-missing-type"]').exists()).toBe(true);
  });

  it("renders form root fields", async () => {
    const typeDocument = parsePanelTypeDocument({
      type: "my-checklist",
      label: "Checklist",
      description: "d",
      category: "custom",
      defaultProps: { title: "Hi" },
      propsFields: [{ key: "title", label: "Title", type: "string" }],
      root: { type: "form" },
    });
    const wrapper = mount(JsonWidgetHost, {
      props: {
        type: "my-checklist",
        componentId: "c1",
        props: {},
        api,
        typeDocument,
      },
    });
    const input = wrapper.find('[data-testid="json-form-field-title"]');
    expect(input.exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/workspace/JsonWidgetHost.test.ts`

- [ ] **Step 3: Implement viewRegistry (copy loaders from `registryComponents.ts`), JsonFormFields, Host, Vue adapter marker**

Do **not** change `WorkflowPanelRenderer` yet.

- [ ] **Step 4: Run Host tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/workspace/jsonWidget tests/workspace/JsonWidgetHost.test.ts
git commit -m "feat(json-widget): add Vue host, form fields, and view registry"
```

---

### Task 4: Builtin type JSON defs for every registry entry

**Files:**
- Create: `shared/jsonWidget/builtinTypeDefs.ts`
- Modify: `shared/jsonWidget/index.ts` — export `getBuiltinTypeDocument`, `BUILTIN_TYPE_DOCUMENTS`
- Create: `tests/jsonWidget/builtinTypeDefs.test.ts`
- Modify: `src/workspace/jsonWidget/JsonWidgetHost.vue` — resolve via `getBuiltinTypeDocument` when `typeDocument` prop omitted

**Interfaces:**
- Produces:
  - `BUILTIN_TYPE_DOCUMENTS: Record<string, PanelTypeDocument>`
  - `getBuiltinTypeDocument(type: string): PanelTypeDocument | undefined`
  - For each entry in `WORKSPACE_REGISTRY`, document:
    - copy `type`, `label`, `description`, `category`, `defaultProps`, `propsFields`
    - `root: { type: "view", name: <same type string>, props: { $bind: "instance" } }`
  - Build by mapping `WORKSPACE_REGISTRY` through `parsePanelTypeDocument` so invalid defs fail at module init in tests

- [ ] **Step 1: Write failing coverage test**

```ts
import { describe, expect, it } from "vitest";
import { WORKSPACE_REGISTRY } from "../../shared/workspaceRegistryData";
import { getBuiltinTypeDocument } from "../../shared/jsonWidget/builtinTypeDefs";

describe("builtinTypeDefs", () => {
  it("covers every WORKSPACE_REGISTRY type", () => {
    for (const entry of WORKSPACE_REGISTRY) {
      const doc = getBuiltinTypeDocument(entry.type);
      expect(doc, entry.type).toBeDefined();
      expect(doc!.root).toEqual({
        type: "view",
        name: entry.type,
        props: { $bind: "instance" },
      });
      expect(doc!.propsFields).toEqual(entry.propsFields);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/jsonWidget/builtinTypeDefs.test.ts`

- [ ] **Step 3: Implement `builtinTypeDefs.ts`; wire Host lookup**

- [ ] **Step 4: Run builtin + Host tests — expect PASS**

Run: `npx vitest run tests/jsonWidget tests/workspace/JsonWidgetHost.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/jsonWidget src/workspace/jsonWidget/JsonWidgetHost.vue tests/jsonWidget/builtinTypeDefs.test.ts
git commit -m "feat(json-widget): add builtin type documents for all registry types"
```

---

### Task 5: Wire WorkflowPanelRenderer + migration contract

**Files:**
- Modify: `src/workspace/WorkflowPanelRenderer.vue` — replace `<component :is="resolvedByType...">` with `JsonWidgetHost`; remove `WIDGET_COMPONENTS` / `resolvedByType` loading
- Modify: `tests/workspace/WorkflowPanelRenderer.test.ts` — update mocks to work with Host/viewRegistry (mock `viewRegistry` VIEW_LOADERS instead of registryComponents if needed)
- Modify: `src/workspace/registryComponents.ts` — keep `PanelApi` types and `isRegisteredWidgetType`; make `isRegisteredWidgetType` true when type is in `BUILTIN_TYPE_DOCUMENTS` **or** `VIEW_LOADERS` (prefer: `getBuiltinTypeDocument(type) != null`); deprecate direct renderer use of `WIDGET_COMPONENTS` but keep export re-exporting `VIEW_LOADERS` for Design preview if needed
- Check: `src/components/workflow/WorkspaceDesigner.vue` — if it uses `WIDGET_COMPONENTS` for preview, point it at Host or VIEW_LOADERS equivalently so Design still mounts previews

**Interfaces:**
- `WorkflowPanelRenderer` unknown type: still show error when `!getBuiltinTypeDocument(comp.type)` (and no future custom doc). Use `data-testid="unknown-widget-error"` OR keep and also allow Host's missing-type — prefer single path: always render Host; Host shows missing-type. Update tests accordingly: unknown type → `json-widget-missing-type` **or** keep wrapper error. **Decision for this plan:** Renderer always mounts Host; unknown → Host `json-widget-missing-type`. Update renderer tests to assert that testid.
- Pass `chatInvoke` only if provided on renderer props (optional new prop); omit in V1 callers is fine

- [ ] **Step 1: Update WorkflowPanelRenderer tests for Host path (fail first if needed)**

Ensure tests mock `VIEW_LOADERS` for alpha/beta style fixtures **or** pass documents. Simplest approach for existing tests: change test widgets to register in a vi.mock of `viewRegistry` and provide builtin-like docs via mocking `getBuiltinTypeDocument`.

Recommended test strategy:

```ts
vi.mock("../../src/workspace/jsonWidget/viewRegistry", () => ({
  VIEW_LOADERS: {
    alpha: async () => ({ default: AlphaStub }),
    beta: async () => ({ default: BetaStub }),
  },
}));

vi.mock("../../shared/jsonWidget/builtinTypeDefs", () => ({
  getBuiltinTypeDocument: (type: string) => {
    if (type !== "alpha" && type !== "beta") return undefined;
    return {
      type,
      label: type,
      description: "",
      category: "test",
      defaultProps: {},
      propsFields: [],
      root: { type: "view", name: type, props: { $bind: "instance" } },
    };
  },
}));
```

Unknown type test expects `[data-testid="json-widget-missing-type"]`.

- [ ] **Step 2: Run renderer tests — expect FAIL**

Run: `npx vitest run tests/workspace/WorkflowPanelRenderer.test.ts`

- [ ] **Step 3: Implement renderer Host wiring; fix Design preview path if broken; align `isRegisteredWidgetType`**

- [ ] **Step 4: Run full related suite**

Run: `npx vitest run tests/jsonWidget tests/workspace/WorkflowPanelRenderer.test.ts tests/workspace/JsonWidgetHost.test.ts tests/components/WorkspaceDesigner.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/workspace/WorkflowPanelRenderer.vue src/workspace/registryComponents.ts src/components/workflow/WorkspaceDesigner.vue tests/workspace/WorkflowPanelRenderer.test.ts
git commit -m "feat(workspace): render all panels through JSON widget engine"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Framework-agnostic JSON description + Zod | 1 |
| Engine + ActionBus whitelist | 2 |
| Vue adapter + Host + form mode | 3 |
| Named views for all built-ins | 3–4 |
| Migrate all WORKSPACE_REGISTRY types | 4 |
| Renderer no direct WIDGET_COMPONENTS lookup | 5 |
| Missing type error, no silent fallback | 3, 5 |
| Chat registration / React adapter / ui tree | Out of plan (non-goals) |
