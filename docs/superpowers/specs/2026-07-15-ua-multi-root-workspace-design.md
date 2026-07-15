# Multi-root workspace for UA graph → workflow

## Goal

Extend Agent Flow Desktop so a **workspace folder** can own multiple source folders / git repositories. Users selectively analyze and generate workflows across one or many roots, while `.ua/` and `.agentflow/` live on the workspace—not inside any single business repo.

This **revises** the single-`projectRoot` assumptions in `2026-07-15-ua-graph-workflow-generation-design.md`: implementation should treat multi-root as the base model; a single repo is the special case of one root (typically `"."`).

## Decisions

| Decision | Choice |
|----------|--------|
| Scenario | Multi-root workspace **and** cross-repo collaboration (both) |
| Analyze / generate scope | User selects which roots to include (single or multi) |
| Where `.ua/` / `.agentflow/` live | Independent **workspace directory** (not tied to one git repo) |
| Workspace representation | Folder-as-workspace: `workspace.json` + `.ua/` + `.agentflow/` |
| Rollout relative to current UA | Rewrite current UA design/implementation contract for multi-root in one go |
| Graph strategy | One workspace-level `knowledge-graph.json` (Approach 1); node ids namespaced by `rootId` |
| Partial re-analyze | **Replace-selected**: refresh only checked roots; keep other roots’ nodes/edges when still valid |

## Relation to existing UA spec

Still applies unchanged:

- Two manual steps: analyze → user confirms → generate (no auto-chain)
- Free workflow generation (templates are reference only)
- Optional goal; empty/thin projects supported
- Prompt uses summary + curated subgraph, not full raw JSON
- No UA CLI sidecar; skills embedded in-app
- Template “add workflow” path untouched

Replaced / extended:

| Old (single root) | New (workspace) |
|-------------------|-----------------|
| `projectRoot` is the open folder | Open folder is `workspaceRoot` |
| `.ua/` and `.agentflow/` under that folder | Same, but under workspace; source code may live elsewhere |
| Inventory walks one tree | Inventory per selected source root |
| Graph `project` = one repo | Graph `project` = workspace + `roots[]` metadata |
| Concurrency lock per `projectRoot` | Lock per `workspaceRoot` |

## Architecture

```text
Workspace folder
├── workspace.json          # roots list + defaults
├── .ua/                    # sole knowledge-graph.json + config + ignore
└── .agentflow/             # workflows, state

Source roots (may be outside workspace)
├── ../frontend             # root id: web
└── ../backend              # root id: api
```

### Layers

| Layer | Responsibility |
|-------|----------------|
| UI | Workspace roots editor; root multi-select on analyze/generate; existing UA panels |
| Electron `workspace/*` | Load/save `workspace.json`, resolve root paths, implicit single-root fallback |
| Electron `ua/*` | Graph store under workspace; analyze/generate take `workspaceRoot` + `rootIds[]` |
| Agent + skills | Understand + generate-workflow; inventories and graph nodes carry `rootId` |
| Executors | Step `cwd` resolves from draft `rootId` → absolute root path |

## Data model

### `workspace.json`

```json
{
  "version": 1,
  "name": "my-platform",
  "roots": [
    { "id": "web", "path": "../frontend", "label": "Frontend" },
    { "id": "api", "path": "../backend", "label": "API" }
  ],
  "defaults": {
    "analyzeRootIds": ["web", "api"]
  }
}
```

- `path`: relative to workspace root or absolute; must resolve to an existing directory when analyzing.
- `id`: stable short id; used in graph node prefixes and step `rootId`.
- **Single-repo case:** one root with `path: "."` (or equivalent). Behavior matches today’s single-folder project aside from the presence of `workspace.json`.

### Implicit migration

If the open folder has no `workspace.json`, treat it as one root `{ id: "main", path: ".", label: <dirname> }`. Do not force-write until the user saves roots or the first successful analyze completes (then write `workspace.json` for durability).

### Knowledge graph extensions

UA-compatible single file at `{workspace}/.ua/knowledge-graph.json`:

- `project`: workspace-level description; include `roots: [{ id, label, path, gitCommitHash }]`.
- Nodes: `rootId` required for file/module nodes; ids namespaced, e.g. `root:api/file:src/main.ts`.
- `filePath`: path relative to that root (not the workspace).
- Cross-root edges: allowed; inferred heuristically in v1 (imports, API contracts, docs). Missing cross-edges is acceptable.

### Workflow draft extensions

- Steps may include optional `rootId` (and/or resolved `cwd` for executors).
- Missing `rootId` → run against workspace root (orchestration / docs steps).
- `meta`: `source: "ua-graph"`, `analyzedAt`, per-root `gitCommitHash` map, selected `rootIds`, `goal`.

## User flow

1. Open / create a **workspace folder**; add or edit roots in Settings (persisted to `workspace.json`).
2. **Analyze:** multi-select roots (default from `defaults.analyzeRootIds` or all) → confirm cost → run.
3. Preview summary + explorer (filterable by root).
4. **Generate:** multi-select roots (must already have graph nodes for those ids) + optional goal → draft review.
5. Confirm → apply under `{workspace}/.agentflow/workflows/{id}/`.

## Analyze details

1. For each selected `rootId`: combine ignore rules from workspace `.ua/.understandignore` and any root-local ignore if present; inventory; capture git commit when available.
2. Runner receives multi-root inventory + previous graph → produces new graph.
3. **Replace-selected merge:**  
   `newGraph = (old nodes/edges for roots not in selection) ∪ (fresh subgraph for selected roots) ∪ (cross-root edges that still connect existing endpoints)`.  
   Drop dangling edges.
4. Cancel or failure: do not replace the last valid graph.
5. Progress events include `rootId` + phase. At most one analyze per `workspaceRoot`; analyze and generate mutually exclusive.

## Generate details

1. Curated subgraph = nodes/edges for selected `rootIds`, including cross-edges whose both ends are in selection (and optionally edges to kept external stubs—v1: only both-ends-in-selection).
2. Draft steps should set `rootId` when work is repo-specific so executors use the correct cwd.
3. Apply writes only under the workspace `.agentflow/` tree; reuse id-suffix collision behavior from existing apply path.

## Error handling

| Scenario | Behavior |
|----------|----------|
| Missing `workspace.json` | Implicit single root `"."`; optional prompt to save as multi-root workspace |
| Root path missing / unreadable | Report that root; skip it; if all selected roots fail, fail the job and do not write |
| Empty root selection | Disable Analyze / Generate |
| Missing API key | Block; point to Settings |
| Cancel / analyze failure | Keep prior valid graph |
| Generate for rootIds with no nodes | Precondition error: analyze those roots first |
| Invalid step `rootId` on apply | Schema/validation error; do not write |
| Path traversal / cwd outside registered roots | Reject (same hardening spirit as current applyDraft) |

## Explicit non-goals

- Per-source-root `.ua/` dual-write (Approach 2 storage)
- Virtual union filesystem fake single tree (Approach 3)
- Manual cross-repo edge editor
- Full UA slash-command parity / sidecar CLI
- Automatic multi-repo post-commit graph hooks

## Testing

1. **Unit:** `workspace.json` parse (relative/absolute); implicit single-root; path resolution; Replace-selected merge; node id namespacing.
2. **Service:** dual-root analyze writes one graph with two `rootId`s; partial re-analyze keeps the other root; generate curated subset; apply sets cwd from `rootId`.
3. **Compatibility:** folder without `workspace.json` still analyzes/generates.
4. **UI:** root picker → analyze → preview → generate → apply state machine.
5. **Fixtures:** single-root `"."`; two-root workspace with paths outside workspace dir.

## Success criteria

- Single-repo folder without `workspace.json`: analyze + generate still work.
- Two-repo workspace: selective analyze produces namespaced graph with per-root git metadata; generated workflow steps resolve to the correct root cwd.
- Existing template-based workflow creation remains unchanged.

## Implementation impact (rewrite checklist)

- Introduce `electron/workspace/*` (paths, load/save, resolve roots).
- Change UA APIs from bare `projectRoot` to `workspaceRoot` + `rootIds[]` (HTTP + services + UI).
- Extend graph/draft Zod schemas (`rootId`, `project.roots`).
- Settings: manage workspace roots.
- Update `skills/understand` and `generate-workflow-from-graph` for multi-root inventories and step `rootId`.
- Rework or supersede tasks in `2026-07-15-ua-graph-workflow-generation.md` that assume a single tree walk only.
