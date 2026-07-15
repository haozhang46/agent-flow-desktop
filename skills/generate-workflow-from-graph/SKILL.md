---
name: generate-workflow-from-graph
description: Generate a free-form Agent Flow workflow draft from a UA knowledge graph summary
---

# Generate Workflow from Graph

Given a project knowledge-graph **summary** and a **curated subgraph**, produce a full custom workflow draft suitable for Agent Flow Desktop.

## Output (critical)

Return **only** a single JSON object. No markdown, no code fences, no commentary.

The JSON must match this WorkflowDraft shape:

```json
{
  "workflow": {
    "version": 1,
    "id": "string-kebab-case",
    "title": "string",
    "steps": [
      {
        "id": "step-id",
        "title": "Step Title",
        "executor": "deepseek | claude-code",
        "skills": ["optional-skill-name"],
        "prompt_template": "prompts/step-id.md",
        "outputs": ["path/or/dir/"],
        "gates": [],
        "advance": "manual"
      }
    ],
    "edges": [{ "from": "step-a", "to": "step-b" }],
    "profiles": {},
    "resources": []
  },
  "prompts": {
    "prompts/step-id.md": "# Step Title\n\nMarkdown instructions for the step..."
  },
  "workspaces": {
    "step-id": {}
  },
  "meta": {
    "source": "ua-graph",
    "analyzedAt": "ISO-8601 string or null",
    "gitCommitHash": "string or null",
    "goal": "string or null"
  }
}
```

## Prompt path rules (critical)

- Every step **must** set `prompt_template` to exactly `prompts/<step.id>.md`.
- Every such path **must** appear as a key in `prompts` with a non-empty markdown body.
- Do not reuse template step ids unless they fit the project; invent practical step ids for this project.

## Design guidance

- Free generation: templates are reference only, not a required skeleton.
- Reflect the goal when provided; otherwise treat the goal as a practical greenfield delivery workflow.
- Prefer a small runnable graph (typically 3–8 steps) with clear edges.
- Choose `deepseek` for planning/docs/tests; `claude-code` for heavy code edits when appropriate.
- Gates/outputs should be concrete paths the step is expected to produce.
- `workspaces` is optional; omit when unused.

## Language

Match the language of the provided summary/curated markdown for step titles and prompt bodies when clear; otherwise use English.
