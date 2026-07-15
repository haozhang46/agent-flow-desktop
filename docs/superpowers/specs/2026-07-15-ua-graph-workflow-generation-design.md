# Generate workflow from embedded Understand-Anything graph

## Goal

Embed an Understand-Anything–style multi-agent analysis pipeline in Agent Flow Desktop so the app can:

1. Analyze the current project and write a UA-compatible knowledge graph to `.ua/knowledge-graph.json`.
2. Let the user review the graph (summary + interactive explorer).
3. On explicit user action, freely generate a full workflow (structure + per-step config) from that graph and persist it under `.agentflow/workflows/`.

Today: workflows are created by copying static templates (e.g. `default-dev-cicd`). There is no project-aware step generation. A stub `.ua/` directory may exist, but no in-app graph pipeline.

## Decisions

| Decision | Choice |
|----------|--------|
| What to generate | Both workflow structure (steps, edges) and full step config (prompts, skills, outputs, gates, workspace) |
| Project understanding | Built-in Understand-Anything analysis → `.ua/knowledge-graph.json` first |
| How UA is embedded | Skills/agent pipeline runs inside this app’s existing agent/executors (not an external CLI sidecar) |
| User flow | Two manual steps: confirm graph, then click “generate workflow” (no auto-chain) |
| Graph UI | Lightweight summary **and** interactive explorer |
| Relation to templates | Free generation; templates are reference samples only, not a hard skeleton |
| Project states (v1) | Both existing codebases and empty/near-empty projects |
| Goal description | Optional; without it use a generic greenfield default |
| Approach | UA skills embedded + two-phase agent tasks (analyze, then generate) |

## Architecture

```text
[Analyze project] → write .ua/ → summary + interactive graph preview
                                      ↓ user clicks “Generate workflow”
[Generate workflow] → read graph + optional goal → draft review → confirm → disk
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| UI | Entry next to “add workflow from template”: analyze / preview / generate / draft review |
| Electron `ua/*` | Paths, graph store, analyze service, generate+apply services, HTTP/IPC + progress events |
| Agent + skills | Bundled `understand` (and UA sub-skills) and `generate-workflow-from-graph`; reuse existing executors and skill loader |
| Persistence | Graph → `.ua/`; workflow → `.agentflow/workflows/{id}/` via existing save/activate paths |

### UA compatibility

- **Output:** v1 must write a graph compatible with Understand-Anything’s `.ua/knowledge-graph.json` shape (nodes, edges, layers, project metadata) so an external UA viewer can open it if needed.
- **Pipeline depth:** Port/adapt enough of the core `/understand` multi-agent flow to produce that graph; do not require every UA command or agent in v1.
- **Skills packaging:** Ship adapted skill markdown under this repo’s `skills/` registry (same loader as workflow skills), not as a live git submodule checkout of the UA repo (pin/vendor content as needed for reproducibility).

### Explicit non-goals (this iteration)

- Do not auto-generate workflow immediately after analysis completes.
- Do not force-fit `default-dev-cicd` step ids as the required skeleton.
- Do not ship an external UA CLI/sidecar as the primary runner.
- Subdirectory analyze scope may be deferred; v1 uses project root + `.ua/.understandignore`.

## Components and data flow

### Frontend

1. **`ProjectUnderstandPanel`** — status (none / running / ready), actions (analyze, refresh, open preview, generate).
2. **`GraphSummaryView`** — project blurb, layers, key domains/flows, node counts.
3. **`GraphExplorerView`** — interactive graph over UA-compatible JSON (prefer embedding/reusing UA viewer; WebView/iframe or bundled dashboard assets acceptable in v1).
4. **`WorkflowDraftReview`** — step list, edges, per-step config summary; confirm / cancel / regenerate.
5. **`GoalField`** — optional free-text goal before generate.

### Electron modules

| Module | Responsibility |
|--------|----------------|
| `electron/ua/paths.ts` | Resolve `.ua/` vs legacy `.understand-anything/` |
| `electron/ua/graphStore.ts` | Read/write/validate `knowledge-graph.json` and `config.json` |
| `electron/ua/analyzeService.ts` | Start analysis, progress, cancel, incremental fingerprint |
| `electron/ua/generateWorkflowService.ts` | Load graph + goal → agent → draft → apply to disk |
| Routes | `POST /ua/analyze`, `GET /ua/graph`, `GET /ua/summary`, `POST /ua/generate-workflow`, `POST /ua/apply-workflow` |

### Data flow

1. UI “Analyze” → `analyzeService` → agent + understand skills → write `.ua/knowledge-graph.json` (+ config) → progress events → UI refreshes summary / explorer.
2. UI “Generate” → `generateWorkflowService` → read graph (+ optional goal) → agent + `generate-workflow-from-graph` → `WorkflowDraft` (memory or temp) → draft review UI.
3. UI “Confirm” → apply → `.agentflow/workflows/{id}/` (`workflow.yaml`, `prompts/`, `workspaces/`) and optionally set active.

### Draft contract

- Structure equivalent to `workflow.yaml` (steps, edges; profiles optional).
- Per step: prompt body, outputs, gates, skills, suggested executor, optional workspace widget config.
- `meta.source`: `ua-graph` plus graph `analyzedAt` and git commit hash when available.

### Empty vs existing projects

- **Existing codebase:** Full UA-style scan respecting `.ua/.understandignore`; incremental refresh default when a prior graph + fingerprint exists.
- **Empty / thin repo:** Still run analysis (tiny graph). Optional goal improves generation; without goal use a greenfield default prompt.

### Prompt budgeting for generation

Feed **summary + curated subgraph** (layers, flows, key modules), not the entire raw graph JSON, into the generate agent.

## Error handling and concurrency

| Scenario | Behavior |
|----------|----------|
| Missing API key | Block analyze and generate; point user to Settings |
| Cancel mid-analyze | Keep last valid graph; do not replace it with a partial write |
| Analyze failure | Preserve old graph for generation; show error + retry |
| Generate with no/invalid graph | Disable generate or show clear precondition error |
| Invalid draft (schema) | Do not apply; return fix/retry path |
| Workflow id collision | Same suffix strategy as `createWorkflowFromTemplate` (`-1`, `-2`, …) |
| Concurrency | At most one analyze per `projectRoot`; analyze and generate mutually exclusive |

**Cost UX:** Before first full analyze, confirm that the run may consume significant tokens. Prefer incremental updates thereafter.

## Testing

1. **Unit:** paths, graph validation, draft schema, id suffixing, empty-graph summary.
2. **Service:** successful analyze writes files; failure does not corrupt prior graph; generate passes schema; apply creates complete directory tree.
3. **Integration (mock agent):** UI state machine none → analyzing → previewable → draft → applied.
4. **Fixtures:** minimal valid `knowledge-graph.json` (with layers); empty project dir; shape checks against template workflows without requiring identical step ids.

## Success criteria

- On a real codebase: after analyze, summary + explorer work, and generate produces a runnable custom workflow.
- On an empty project: generation works without a goal; with a goal, steps/prompts clearly reflect it.
- Existing “add workflow from template” path remains unchanged and usable.

## Out of scope / follow-ups

- Full feature parity with every UA slash command (`/understand-domain`, `/understand-diff`, etc.) beyond what analyze + graph viewer need.
- Optional analyze path scoping for huge monorepos.
- Auto-update post-commit hooks (UA’s `--auto-update`) — later if needed.
