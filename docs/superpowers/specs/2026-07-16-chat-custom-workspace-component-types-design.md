# Chat: Custom Workspace Component Types (Declarative)

**Date:** 2026-07-16  
**Status:** Draft for review  
**Product:** Agent Flow Desktop — Chat / Workflow step chat / Design workspace

## Goal

Extend the `workspace_*` tool surface so Chat can **create new workspace component types** (not only assemble built-in registry entries). New types are **declarative JSON**; the frontend merges them into the registry and renders them with a **generic DeclarativePanel** (no generated Vue SFCs).

Users decide storage scope in Chat. An **intent router** node detects “create workspace component type” and enters a dedicated flow (with low-confidence confirmation via `ask_question`).

## Background

- Built-in types live in `shared/workspaceRegistryData.ts` + Vue widgets in `src/workspace/registryComponents.ts`.
- Chat already has `workspace_get`, `workspace_list_registry`, `workspace_add_component`, `workspace_update_component`, `workspace_remove_component`, `workspace_reorder`, `workspace_set_layout` (`electron/agent/workspaceTools.ts`). Mutations return pending approval payloads; FE confirms before writing under `.agentflow/`.
- Related but separate: UA generate fills per-step workspaces from **existing** registry types (`2026-07-16-ua-generate-workspace-components-design.md`). That work does **not** add custom types.
- AskQuestion (`2026-07-16-ask-question-clarification-design.md`) provides ClarificationCard + graph interrupt. This feature **depends** on AskQuestion for scope / low-confidence intent prompts.
- Today’s ReAct graph (`reactGraph`) is `agent → tools` only — **no** intent node. Workflow `intent` (FEATURE/QUERY/…) is unrelated.

## Decisions

| Topic | Choice |
|-------|--------|
| What “new component” means | New **registry type** (metadata + declarative UI schema), reusable after save |
| Runtime | Declarative JSON + FE generic renderer (not Vue SFC, not iframe) |
| User choice in Chat | When **creating a new type**: confirm flow; pick storage scope |
| Storage scopes | **All three**: project, workflow, global — user picks in Chat |
| Chat flow approach | `ask_question` (scope / low-confidence intent) + `workspace_register_component_type` pending approval card |
| Intent | Dedicated `intent_router` node; low confidence → `ask_question` then branch |
| Schema capability (target) | Form + file/doc bindings + actions |
| Delivery phases | **Phase 1 form → Phase 2 files → Phase 3 actions** |
| After register | Do **not** auto-add to step; agent may call existing `workspace_add_component` |
| Name clashes | Built-in type ids are **reserved**; custom cannot override them |
| Custom precedence | workflow > project > global |

## Non-Goals (V1 / Phase 1)

- Generating or hot-loading Vue SFCs / arbitrary JS.
- Sandboxed iframe widgets.
- Auto-adding a new type instance into the current step workspace on register.
- Dedicated delete/update tools (overwrite same `type` via register + approval is enough).
- Expanding declarative schema beyond **form fields** in Phase 1.
- Changing UA generate / template workflow creation to emit custom types.
- Replacing built-in widgets with declarative equivalents.

## Architecture

```text
User message
  → intent_router (classify + confidence)
       ├─ high: create_custom_component_type
       │     → same agent, create-type prompt + tools
       │       (ask_question, register, list_registry, add_component)
       │     → ask_question (scope: project | workflow | global)
       │     → LLM drafts declarative schema from user request
       │     → workspace_register_component_type → pending approval
       │     → on confirm: write type JSON → refresh merged registry
       │     → optional: workspace_add_component
       ├─ low confidence (component-related)
       │     → ask_question (create type / use existing / other)
       │     → branch
       └─ other → normal ReAct agent (existing tools)

Merged registry = built-in ∪ project ∪ workflow ∪ global
FE: DeclarativePanelWidget renders custom instances from schema + props
```

### Storage paths

| Scope | Path |
|-------|------|
| project | `{workspaceRoot}/.agentflow/component-types/{type}.json` |
| workflow | `{workspaceRoot}/.agentflow/workflows/{workflowId}/component-types/{type}.json` |
| global | `{userData}/component-types/{type}.json` |

Exact `userData` root follows existing Electron settings/app data conventions.

## Components

| Unit | Responsibility |
|------|----------------|
| `CustomComponentTypeSchema` (Zod) | Validate type JSON: `type`, `label`, `description`, `category`, `defaultProps`, `propsFields`, optional phase-gated `ui` / `actions` |
| `componentTypeStore` | List/load/save per scope; merge with `WORKSPACE_REGISTRY` |
| `intent_router` (LangGraph node) | Classify create-type intent + confidence; route or degrade to normal agent on failure |
| `workspace_register_component_type` | Validate schema; return pending approval (no disk write). New pending prefix (e.g. `COMPONENT_TYPE_PENDING_APPROVAL`) parallel to `WORKSPACE_PENDING_APPROVAL` |
| Extend `workspace_list_registry` / `workspace_add_component` | Include custom types from merge for current context |
| `ComponentTypeApprovalCard` | Preview schema + scope; Confirm/Reject (same family as workspace file approval) |
| ClarificationCard (`ask_question`) | Scope choice; low-confidence intent confirmation |
| `DeclarativePanelWidget` | Phase 1: render form from `propsFields` + instance props |
| Design palette | Load merged registry (existing designer registry fetch path) |

### Phase 1 type JSON (minimum)

```json
{
  "type": "my-checklist",
  "label": "Checklist",
  "description": "Simple checklist panel",
  "category": "custom",
  "defaultProps": {},
  "propsFields": [
    { "key": "title", "label": "Title", "type": "string", "required": true }
  ]
}
```

Later phases extend the same document with file bindings and declared actions bound to existing `PanelApi` capabilities — never arbitrary code.

## Data flow

1. User asks Chat for a new panel/component type.
2. `intent_router` runs.
3. If low confidence → `ask_question` to confirm intent; then continue or exit path.
4. If create-type path → agent uses create-type prompt/tools; `ask_question` for scope (project | workflow | global).
5. Agent drafts Phase-appropriate declarative schema from the user request, then calls `workspace_register_component_type` with schema + scope (+ `workflow_id` when needed).
6. FE shows `ComponentTypeApprovalCard`. Confirm writes JSON; Reject writes nothing.
7. Registry merge refreshes; Design and Chat `workspace_list_registry` see the type.
8. Agent may `workspace_add_component` with the new `type` (existing approval flow).

## Error handling

| Scenario | Behavior |
|----------|----------|
| Invalid schema | Tool error; no approval card |
| Type id collides with built-in | Reject; suggest rename |
| Same type exists in chosen scope | Approval card marks overwrite; confirm overwrites |
| User rejects approval / cancels clarification | No disk write; leave create-type flow |
| Workflow scope without `workflow_id` | Tool error |
| Global write failure | Readable error; no partial project/workflow write |
| Workspace references missing custom type | Placeholder “type missing” UI; no crash |
| `intent_router` failure | Degrade to normal agent |

## Testing

1. Zod schema accept/reject cases; reserved built-in names.
2. `componentTypeStore` CRUD per scope; merge precedence; built-in reserved.
3. Register tool returns pending and does not write; apply on confirm; reject no-op.
4. `intent_router`: high-confidence route; low-confidence clarification; unrelated → normal; failure → degrade.
5. FE DeclarativePanel form render; missing-type placeholder.
6. Regression: list/add custom type after register.

## Success criteria

- Chat recognizes create-custom-type intent (with low-confidence confirm).
- User chooses project / workflow / global in Chat.
- After approval, type persists and appears in Design + `workspace_*` registry tools.
- Phase 1 panels render from JSON form schema without new Vue widgets per type.

## Dependencies

- AskQuestion clarification (interrupt + ClarificationCard) must be available for scope and low-confidence intent prompts.
- Existing workspace / agentflow pending-approval apply path for disk writes.

## Relation to other specs

- Does **not** replace UA generate workspace composition; that still uses built-in types only unless later extended.
- AskQuestion V1 marked “mandatory intent gate” as a non-goal for **all** messages. This spec adds a **scoped** intent router for create-custom-type detection only — not a global sufficiency gate on every turn.

## Out of scope (later)

- Phase 2 file/doc bindings; Phase 3 actions.
- Type delete UI; marketplace sharing of types.
- Authoring custom types outside Chat (Design editor for schemas).
