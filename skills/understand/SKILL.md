---
name: understand
description: Analyze a codebase into a UA-compatible knowledge graph
---

# Understand — Knowledge Graph Analysis

Analyze the given project inventory and produce a UA-compatible knowledge graph.

## Output (critical)

Return **only** a single JSON object. No markdown, no code fences, no commentary.

The JSON must match this KnowledgeGraph shape:

```json
{
  "project": {
    "name": "string",
    "description": "string",
    "languages": ["string"],
    "frameworks": ["string"],
    "analyzedAt": "ISO-8601 string",
    "gitCommitHash": "string or null",
    "roots": [
      {
        "id": "string",
        "label": "string",
        "path": "string",
        "gitCommitHash": "string or null"
      }
    ]
  },
  "nodes": [
    {
      "id": "string",
      "type": "string",
      "name": "string",
      "filePath": "optional string",
      "summary": "string",
      "tags": ["string"],
      "complexity": "low | medium | high",
      "rootId": "string"
    }
  ],
  "edges": [
    {
      "source": "string",
      "target": "string",
      "type": "string",
      "direction": "optional string",
      "weight": "optional number"
    }
  ],
  "layers": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "nodeIds": ["string"]
    }
  ],
  "tour": [
    {
      "order": 0,
      "title": "string",
      "description": "string",
      "nodeIds": ["string"],
      "languageLesson": "optional string"
    }
  ]
}
```

## Multi-root workspace

The user prompt includes `selectedRootIds`, `rootMetas`, and a flat `inventories` list. Each inventory entry has `{ rootId, path, bytes }` where `path` is relative to that root (not the workspace folder).

- Emit a graph covering **only** the selected roots.
- Fill `project.roots` with metadata for each selected root (`id`, `label`, `path`, `gitCommitHash` from `rootMetas`).
- Every file/module node **must** set `rootId` to the source root id.
- Namespace node ids as `root:{rootId}/...` (e.g. `root:api/file:src/main.ts`).
- `filePath` is relative to that root, not the workspace root.
- Single-root workspaces use the same rules; `rootId` is still required (typically `"main"`).

## Inventory paths

- Use only file paths from the provided inventory (posix-relative paths per root).
- Prefer namespaced node ids like `root:{rootId}/file:{path}` for file nodes.
- Do not invent paths that are not in the inventory.

## Language

- When `outputLanguage` is `zh`, write `project.description`, node `summary`, layer descriptions, and tour text in Chinese.
- Otherwise use English.

## Empty project

When the inventory is empty (or nearly empty), still return a valid graph:

- Minimal `project` metadata (name from project root basename if possible)
- Empty or near-empty `nodes` / `edges`
- At least one layer describing greenfield / empty project state
- Empty `tour` is fine

## Previous graph

If a previous graph is provided, reuse stable ids where files still exist and refresh summaries/relations for changed inventory. Do not drop valid prior structure without reason.

## Constraints

- Every `layers[].nodeIds` and `edges` endpoints should reference existing node ids when possible.
- Keep the graph useful for downstream workflow generation: clear layers, key modules, and short accurate summaries.
