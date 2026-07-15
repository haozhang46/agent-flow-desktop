# UA generate: Design workspace Components per step

## Goal

When generating a workflow from the UA knowledge graph, also emit a complete **Design workspace** for every step (`layout` + `components` + props), so panels are usable right after apply. Users may later refine via **Design workspace** UI or existing **Chat `workspace_*` tools**.

Today: `WorkflowDraft.workspaces` is optional `Record<string, unknown>`; the generate skill often omits or empties it; apply may write invalid/empty JSON. Design composition is mostly manual.

## Decisions

| Decision | Choice |
|----------|--------|
| Depth | Full composition per step (layout + components + props), not type suggestions only |
| Path vs outputs | Soft align via skill guidance; path mismatch does **not** block apply |
| Schema invalid | **Hard block** generate/apply with readable errors |
| Coverage | **Every** step must have a `WorkspaceDefinition` (1:1 with `workflow.steps[].id`) |
| Approach | LLM emits workspaces + **deterministic normalize** (fill missing; reject illegal) |
| Draft review UI | Light hint only (“generated for N steps”); no inline Design editor |
| Post-apply edit | Existing Design UI + existing Chat `workspace_*` tools (no new Chat tools) |

## Architecture

```text
Generate → LLM WorkflowDraft (incl. workspaces)
        → normalizeDraftWorkspaces (fill missing; validate)
        → Draft review (light workspace hint)
        → Apply → workspaces/{stepId}.workspace.json
        → User refines in Design or Chat
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| Skill `generate-workflow-from-graph` | Instruct full per-step workspace; include registry type + defaultProps digest |
| `electron/ua/normalizeWorkspaces.ts` (new) | Fill missing steps; never invent over illegal values; call `validateWorkspace` |
| `electron/ua/draft.ts` | Require `workspaces` 1:1 with steps; each value is a validated workspace |
| `generateWorkflowService` / apply | Run normalize before assert/apply; refuse illegal drafts |
| `WorkflowDraftReview` | One-line hint that workspaces were generated for N steps |
| Design / Chat | Unchanged consumers of on-disk workspace JSON |

## Draft contract

`workspaces` is **required**:

```ts
workspaces: Record<stepId, WorkspaceDefinition>
```

Each entry must match existing Design shape (`WorkspaceSchema` + `COMPONENT_PROPS` via `validateWorkspace`):

```json
{
  "version": 1,
  "stepId": "prd",
  "layout": "stack",
  "components": [
    { "id": "doc", "type": "markdown-doc", "props": { "docsDir": "docs" } }
  ]
}
```

Rules:

- Keys must be exactly the set of `workflow.steps[].id` (extra or missing before normalize = handled by normalize; after normalize = hard fail).
- Each `WorkspaceDefinition.stepId` must equal its map key.
- Unknown component `type`, duplicate component `id`, or invalid props → illegal → block.
- Soft: props paths need not match `outputs` / prompt paths.

## Deterministic normalize

`normalizeDraftWorkspaces(draft) → draft`:

1. **Missing entry for a step** (or missing `workspaces`): build a minimal legal workspace via heuristics, then `validateWorkspace`.
2. **Present but invalid**: do **not** auto-repair; fail with step/component/prop details.
3. **Extra keys** (not in steps): fail.
4. **Valid LLM output**: leave unchanged.

### Fill heuristics (conservative)

| Signal | Default components |
|--------|-------------------|
| Doc/plan-like (`outputs` contain `.md` / `docs`) | `markdown-doc` (prefer `docsDir` from outputs parent dir) + `agent-run` |
| Code-heavy (`executor === "claude-code"` or source-tree-like outputs) | `code-explorer` (`writable: true`) + `agent-run` |
| Else | `agent-run` + `markdown-doc` (registry `defaultProps`) |

- Default `layout`: `stack`.
- Do **not** auto-select `langflow-panel` (required `flowId` would often fail validation).
- Component ids: stable short ids (`doc`, `run`, `code`, …); uniquify if needed.

## Skill updates

Update `skills/generate-workflow-from-graph/SKILL.md`:

- Require a full workspace object for every step.
- List allowed registry `type` values and short defaultProps notes.
- Soft-guide aligning props paths with step `outputs`.
- Remove “workspaces optional / omit when unused”.

## UI

`WorkflowDraftReview`: show a short line such as “已为 N 步生成 workspace（可在 Design / Chat 调整）”. Do not list components or embed Design.

## Error handling

| Scenario | Behavior |
|----------|----------|
| Invalid schema after LLM | Block; return structured validation error; no disk write |
| Missing steps in workspaces | Fill via heuristics; then re-validate |
| Apply | Only after successful normalize + assertValidDraft |
| Regenerate | Same pipeline |

## Testing

1. **Unit:** normalize fills missing; preserves valid LLM workspace; rejects unknown type / bad props / extra keys.
2. **Draft schema:** assertValidDraft requires 1:1 workspaces.
3. **Apply:** writes N valid `*.workspace.json` files; empty `{}` rejected.
4. **UI:** draft review shows workspace count hint.
5. **Fixture:** sample draft with mixed LLM + missing workspaces.

## Success criteria

- Generate → apply produces a runnable workflow where every step opens a valid Design workspace panel.
- Illegal workspace drafts never apply.
- Users can still edit via Design and Chat after apply.
- Template-based workflow creation remains unchanged.

## Out of scope

- Inline Design editor inside draft review.
- Hard enforcement that props paths match outputs.
- Second-pass “compose workspaces” agent.
- New Chat tools (reuse existing `workspace_*`).
- Auto-picking `langflow-panel` without a known flow id.

## Relation to prior specs

Extends `2026-07-15-ua-graph-workflow-generation-design.md` (optional workspace widget config → required full composition). Multi-root behavior unchanged: step `rootId` still applies; workspace files remain under the generated workflow directory.
