# Chat Attachment Init Missing File

**Date:** 2026-07-16  
**Status:** Approved  
**Product:** Agent Flow Desktop — WorkflowRun step chat / free chat attachments

## Goal

When the user attaches a workspace file to chat and that file does not exist yet (e.g. `docs/architecture.md`), **do not fail the send**. Instead, **create the file on disk with a path-specific stub**, then expand the attachment into the chat message as usual.

## Background

- `WorkflowRun` calls `expandChatMessage(text, attachments, readWorkspaceFile)` before streaming.
- `expandChatMessage` reads every attachment; a missing path throws and surfaces as `actionError` (e.g. `ENOENT` / not found).
- Architecture panel and Markdown panels already tolerate missing files in the UI; chat expansion does not.
- Agent `read_file` / workspace HTTP GET are unchanged for non-chat callers.

## Non-Goals

- Auto-create on generic `GET /v1/workspace/file` or agent `read_file` tool.
- Auto-refresh Architecture panel after init (file exists for next load; live refresh optional later).
- Overwriting existing files.
- Changing file-chat tool allowlists or prompts beyond what init enables.

## Decisions

| Topic | Choice |
|-------|--------|
| Where | `expandChatMessage` (read-or-init) |
| Surfaces | Step chat and free chat (both use `expandChatMessage`) |
| Which paths | Any valid workspace attachment path |
| Stub content | Path-specific templates |
| Write API | Existing `writeWorkspaceFile` (incl. `.agentflow/*` confirm) |
| Missing without `writeFile` | Preserve today’s throw behavior |

## Architecture

```text
Chat send (step / free)
  → expandChatMessage(text, attachments, readFile, writeFile?)
       for each attachment (serial):
         try readFile(path)
         on missing file error + writeFile provided:
           content = stubContentForPath(path)
           await writeFile(path, content)
         formatFileForChat(path, content)
  → stream chat with expanded message + original paths
```

- Workspace HTTP read semantics stay fail-on-missing for all other callers.
- Parent directories are created by existing `writeFileTool` / PUT handler.

## Components

| Unit | Responsibility |
|------|----------------|
| `stubContentForPath(path)` | Pure stub generator |
| `isMissingFileError(err)` | Detect ENOENT / no such file / not found |
| `expandChatMessage` | Read-or-init then format |
| `WorkflowRun.vue` | Pass `writeWorkspaceFile` into expand |

### Stub rules

- `AGENTS.md` / `CLAUDE.md` → reuse `defaultRuleContent(path)`
- Basename matches `architecture.md` or `*-architecture.md` → architecture skeleton (title + Modules / Data flow placeholders)
- Other `.md` → `# {basenameWithoutExt}\n\n`
- Non-markdown → `""`

### Signature

```ts
expandChatMessage(
  text: string,
  attachments: ChatAttachment[],
  readFile: (path: string) => Promise<{ content: string }>,
  writeFile?: (path: string, content: string) => Promise<void>,
): Promise<string>
```

## Error Handling

| Case | Behavior |
|------|----------|
| Missing + `writeFile` | Init, continue |
| Non-missing read error | Rethrow; no write |
| No `writeFile` | Rethrow (legacy) |
| Write fails / user_denied | Rethrow; do not send |
| File exists | Read only; never overwrite |

## Testing

- Unit tests for `stubContentForPath` and `expandChatMessage` init paths.
- Existing expand tests without `writeFile` remain valid.
- Confirm step + free chat both pass `writeWorkspaceFile`.

## Out of Scope Follow-ups

- Architecture panel soft empty state copy improvements.
- Agent-side read_file init.
