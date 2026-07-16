# JSON Widget Engine (Headless, Adapter-Swappable)

**Date:** 2026-07-16  
**Status:** Draft for review  
**Product:** Agent Flow Desktop — Workspace panels / Design / Workflow run

## Goal

Introduce a **framework-agnostic JSON description layer** and a **pluggable render adapter** so every workspace panel is driven by the same engine. V1 ships a **Vue adapter** and migrates **all existing workspace UI** to “JSON type definition + named view,” instead of `WorkflowPanelRenderer` looking up Vue SFCs by type.

Chat-generated custom types and a full layout `ui` tree are **follow-ons**; this spec focuses on the engine, adapter boundary, and migration of built-ins.

## Background

- Built-in panels today: registry metadata in `shared/workspaceRegistryData.ts` (`propsFields`, etc.) + Vue widgets in `src/workspace/widgets/*` mapped by `WIDGET_COMPONENTS` in `src/workspace/registryComponents.ts`.
- `WorkflowPanelRenderer` loads widgets by `comp.type` and binds `PanelApi` via `bindWidgetProps`.
- Related: `2026-07-16-chat-custom-workspace-component-types-design.md` defines Chat registration of declarative types and a `DeclarativePanelWidget`. That work **depends on** this engine: its renderer should become a consumer of `JsonWidgetEngine`, not a parallel form stack.
- Long-term: unify on JSON-driven panels; Vue (or React) only implements adapters and named views.

## Decisions

| Topic | Choice |
|-------|--------|
| Description vs render | **JSON description layer** is pure data; **render adapters** are swappable (Vue V1; React later) |
| Headless model | JSON declares structure/intent; complex UI is **named views** (and field widgets) registered per adapter |
| Engine entry | All workspace panels go through `JsonWidgetEngine` + Host; no direct `WIDGET_COMPONENTS` lookup in the renderer |
| Migration | Convert **all** existing workspace types to JSON defs whose root is `view: "<existing-name>"` wrapping current implementations |
| Forms | Forms are an engine mode over `propsFields` (not a side path). Complex forms later: `section` / `array` / `showWhen`; existing rich types (`file-list`, `skills`, …) become **field widgets** inside the engine |
| Actions (schema-ready) | Whitelist: `props.set`, `panel.*` → `PanelApi`, `chat.invoke` (template interpolation over declared props only). Full Chat wiring may land with the custom-types spec |
| V1 adapter | Vue only; React adapter is interface + non-goal |
| Chat custom types | Out of V1 delivery for this spec; reuse same JSON shape when enabled |

## Non-Goals (V1)

- Implementing a React (or other) adapter beyond the interface contract.
- Chat intent / `workspace_register_component_type` (covered by the custom-types spec).
- Full layout `ui` primitive trees (Stack/Tabs/…); reserve optional `ui` on the type document without implementing it.
- Generating or hot-loading Vue/React SFCs, `eval`, or iframes.
- Rewriting named-view internals (markdown editor, Langflow, agent-run) into pure JSON primitives.

## Architecture

```text
JSON description (framework-agnostic)
  type metadata, propsFields, actions?, root | ui?
        │
        ▼
JsonWidgetEngine
  validate → resolve nodes → bind props → ActionBus
        │
        ▼
JsonRenderAdapter (vue | react | …)
  FieldWidgets + NamedViews (registered per adapter)
        │
        ▼
Workspace Host (WorkflowPanelRenderer)
```

### Layers

1. **Description** — Type JSON and instance props. No framework imports.
2. **Engine** — Parse/validate, resolve form fields vs named views, prop binding, action whitelist. Framework-agnostic.
3. **Adapter** — Mount/update/destroy; owns view and field widget implementations for that UI toolkit.

### Why named views (not “JSON-only DOM”)

A pure headless / JSON-driven system still needs **pre-registered** interactive surfaces (editors, graphs, trees). JSON selects and configures them; it does not embed arbitrary code. That is the intended model for replacing today’s per-type Vue map while keeping complex panels.

## Components

| Unit | Responsibility |
|------|----------------|
| Type JSON schema (Zod, shared/electron) | Validate panel type documents: metadata, `propsFields`, optional `actions`, `root` (view or form) |
| `JsonWidgetEngine` | Resolve description → render plan; dispatch actions via `ActionBus` |
| `JsonRenderAdapter` | Interface: mount/update/unmount a resolved tree given host context |
| `VueJsonRenderAdapter` | V1 adapter; registers existing panel implementations as named views |
| `ViewRegistry` / `FieldWidgetRegistry` | Per-adapter maps: view name → implementation; field type → control |
| `JsonWidgetHost` | Workspace bridge: load type JSON for `comp.type`, inject `PanelApi` + optional Chat invoke, call engine + Vue adapter |
| `ActionBus` | Execute only whitelisted action kinds |
| Migrated type defs | One JSON (or TS const equivalent shipped as data) per existing registry type: `root: { type: "view", name: "<type>" }` |
| `WorkflowPanelRenderer` | Tabs/stack chrome only; content always via Host/engine |

### V1 type JSON (built-in migration shape)

```json
{
  "type": "markdown-doc",
  "label": "Markdown Doc",
  "description": "Single document editor and preview",
  "category": "docs",
  "defaultProps": { "docsDir": "docs" },
  "propsFields": [
    { "key": "docsDir", "label": "Docs directory", "type": "string" }
  ],
  "root": {
    "type": "view",
    "name": "markdown-doc",
    "props": { "$bind": "instance" }
  }
}
```

Design-time prop editing continues to use `propsFields` (engine form mode or existing `WorkspacePropFields` fed by the same schema). Run-time panel body uses `root` (named view).

### Form-only / Chat-oriented shape (same engine)

```json
{
  "type": "my-checklist",
  "label": "Checklist",
  "category": "custom",
  "defaultProps": { "title": "" },
  "propsFields": [
    { "key": "title", "label": "Title", "type": "string", "required": true }
  ],
  "root": { "type": "form" },
  "actions": [
    {
      "id": "ask-agent",
      "label": "Ask Chat",
      "kind": "chat.invoke",
      "payload": { "template": "Review: {{title}}" }
    }
  ]
}
```

### Action kinds

| Kind | Behavior |
|------|----------|
| `props.set` | Update instance props |
| `panel.<method>` | Call whitelisted `PanelApi` method with declared args |
| `chat.invoke` | Inject a user message (or equivalent) into Chat; template may only interpolate declared prop keys |

No arbitrary JS. Unknown kinds are rejected.

### Complex forms (post-V1 engine increments, schema reserved)

- `section`, `array` + `itemFields`, `showWhen` on fields.
- Rich existing `PropFieldType`s (`file-list`, `skills`, `langflow-flow`, …) implemented as **field widgets** in the adapter, not as separate panel entry points.

## Data flow

1. Workspace loads components for a step.
2. For each component, Host loads the type’s JSON description from the merged registry (built-in JSON defs first; custom scopes later).
3. Engine validates and builds a render plan from `root` (view or form).
4. Vue adapter mounts named view or form fields; binds instance props + `PanelApi`.
5. User edits / actions → ActionBus → props update, PanelApi, or chat.invoke.
6. Migration complete when `WIDGET_COMPONENTS` is no longer consulted by the renderer—only by the Vue `ViewRegistry` (or inlined into it).

### Migration sequence

1. Land engine + adapter interface + Vue adapter + Host.
2. For each built-in type: add JSON def + register current SFC as named view.
3. Point `WorkflowPanelRenderer` exclusively at Host.
4. Remove dead thin widget wrappers if they only re-export a panel; keep real view implementations under a clear views/ folder.

## Error handling

| Scenario | Behavior |
|----------|----------|
| Schema validation failure | Inline error in panel (type + paths); do not mount view |
| Unknown view name | Placeholder “Unknown view: X”; no crash |
| Unknown field type | Skip field with error mark; render remaining fields |
| Action kind not whitelisted | No side effect; toast or dev log |
| `chat.invoke` without Chat context | Disable control or show unavailable |
| `panel.*` failure | Inline error bar; other panels unaffected |
| Missing adapter | Host shows “No render adapter” |
| Type missing JSON description | Treat as error (no silent fallback to old type→SFC map) |

## Testing

1. Zod accept/reject for type JSON; action payload rules; reserved template keys.
2. Engine unit tests: form root, view root, prop bind, reject bad actions (no Vue).
3. Vue adapter: mock named view mount/update/unmount.
4. Migration contract: every `WORKSPACE_REGISTRY` type has a JSON def and renders via Host (shallow mount OK for heavy views).
5. Regression: tabs/stack layouts, Design preview, unknown type UI.

## Success criteria

- Description layer is JSON-only and adapter-agnostic.
- `JsonRenderAdapter` is defined; Vue adapter is the sole V1 implementation.
- `WorkflowPanelRenderer` does not map `type → Vue SFC` directly; all panels go through the engine.
- Every existing workspace registry type is migrated to JSON + named view and still works in Design and run.
- Form mode works from `propsFields` for types that use `root: { type: "form" }`.

## Relation to other specs

- **Chat custom workspace component types** — uses this engine instead of a one-off `DeclarativePanelWidget` implementation; storage/intent/approval unchanged.
- **UA generate workspace components** — continues to emit built-in type ids; those ids now resolve through JSON defs + named views.

## Out of scope (later)

- React (or other) adapter implementation.
- Full `ui` layout tree and richer form operators.
- Chat registration UX and intent router (existing custom-types spec).
- Marketplace / sharing of type JSON.
- Replacing named-view internals with pure primitive trees.
