# AskQuestion Clarification (Desktop Chat)

**Date:** 2026-07-16  
**Status:** Draft for review  
**Product:** Agent Flow Desktop — Chat / Workflow step chat / file-chat

## Goal

Add a Cursor-style **AskQuestion** capability:

- The agent calls an `ask_question` tool with a structured multiple-choice question.
- Execution **hard-blocks** until the user answers (no dependent tools / final answer while pending).
- Frontend renders an interactive **ClarificationCard** in the chat stream.
- After submit, the graph resumes with the answer as a `ToolMessage`, then continues ReAct.

## Background

- Chat modes today: Ask (no tools), Plan (read-only tools), Agent (full tools). Streaming ReAct via LangGraph + SqliteSaver (`reactGraph`, `agentService`, `fileChatService`).
- Existing human gates (`PlanApprovalCard`, workspace / agentflow file approval) end the tool turn and apply side effects in the FE; they are not LangGraph interrupts.
- There is no graph interrupt, SSE clarification event, or ClarificationCard yet.

## Non-Goals (V1)

- Schema-slot / multi-round requirement-collection Agent (original PRD deferred).
- Mandatory pre-message clarification or intent/sufficiency gate nodes.
- Non-blocking clarification (continue work while waiting).
- Multiple concurrent pending clarifications in one turn.
- New DB tables beyond checkpointer / thread-scoped in-process store.
- Evaluating whether the LLM asks “at the right time” (prompt/eval later).

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | General `ask_question` tool; LLM decides when to ask |
| Control flow | Hard block via LangGraph interrupt |
| Surfaces | Main Chat + WorkflowRun step chat + file-chat |
| Ask mode | Mini toolset: **only** `ask_question` |
| Plan / Agent / file-chat | Existing tools + `ask_question` |
| UX | Structured single/multi-select card + optional free text |
| Resume | Answer API resumes graph; prefer **SSE continuation on the answer response** |
| Pending + new user message | Cancel old pending; start new turn |
| One pending / turn | First `ask_question` wins; later ones in the same turn return a tool error |

## Architecture

```text
User message → Streaming ReAct (SqliteSaver)
                │
                ├─ normal tools → execute → continue loop
                │
                └─ ask_question
                        │
                        ▼
              ClarificationService creates pending
              SSE: clarification
              graph interrupt — STOP further tools / final answer
                        │
                        │  FE ClarificationCard
                        ▼
              POST /v1/threads/{thread_id}/clarifications/{id}
                        │
                        ▼
              resume → ToolMessage(answer, tool_call_id=id)
              same-thread follow-up SSE for continued tokens
```

**Execution guarantee:** After `ask_question`, the current turn must not schedule other tools or emit a final user-facing answer until resume.

### Units

1. **`ask_question` tool** (`electron/agent/`)  
   - Input schema (Zod); at least one option required.  
   - Registers pending with `clarification_id = tool_call_id`.  
   - Triggers LangGraph interrupt (does not return a normal tool result that would let the model continue).

2. **`ClarificationService`**  
   - CRUD pending / answered / cancelled keyed by LangGraph `thread_id` + `clarification_id`.  
   - Validates answer payloads (option ids, multi-select rules).

3. **Graph + stream** (`reactGraph`, `streamAgentGraph`, `agentService`, `fileChatService`)  
   - Detect interrupt after `ask_question`.  
   - Resume path injects `ToolMessage` and continues streaming.

4. **Sidecar HTTP** (`electron/agent/server.ts`)  
   - Emit SSE `clarification`; `done` may include `awaiting_clarification: true`.  
   - Answer route validates and resumes; response body is (or immediately opens) resume SSE.

5. **Frontend**  
   - `ClarificationCard.vue`, `useChatStream` / `chatTransport`, wire into Chat, WorkflowRun step chat, and file-chat.

## Tool input schema

```json
{
  "question": "需要联网查询最新股价吗？",
  "options": [
    { "id": "yes", "label": "需要联网" },
    { "id": "no", "label": "不用，按已有知识答" }
  ],
  "allow_multiple": false,
  "allow_free_text": true
}
```

V1 requires at least one option.

## Tool mounting

| Mode / surface | Tools |
|----------------|--------|
| Ask | `[ask_question]` only |
| Plan | Existing read-only desktop tools + `ask_question` |
| Agent / Workflow step agent chat | Full desktop tools + `ask_question` |
| file-chat | Existing file read/write tools + `ask_question` |

Prompt/tool description should instruct the model to call `ask_question` when a high-stakes or ambiguous choice needs an explicit user answer (hard block until answered).

## SSE `clarification`

```json
{
  "clarification_id": "call_xxx",
  "thread_id": "...",
  "question": "...",
  "options": [{ "id": "yes", "label": "..." }],
  "allow_multiple": false,
  "allow_free_text": true,
  "status": "pending"
}
```

`done` while waiting:

```json
{ "awaiting_clarification": true }
```

FE keeps the card interactive and does not treat the turn as a finished assistant reply.

## Answer API

`POST /v1/threads/{thread_id}/clarifications/{clarification_id}`

```json
{
  "selected_option_ids": ["yes"],
  "free_text": "只要今天的收盘价"
}
```

| Response | When |
|----------|------|
| 200 (+ resume SSE) | Accepted; graph resumed |
| 400 | Invalid option ids / multi-select violation |
| 404 | Unknown id or wrong thread |
| 409 | Already answered |

`thread_id` is the LangGraph checkpoint thread id (main Chat `checkpointThreadId`; file-chat already has the same concept).

Resume `ToolMessage` content serializes `selected_option_ids`, resolved labels, and optional `free_text`.

## Storage (V1)

- **Interrupt / resume continuity:** LangGraph SqliteSaver checkpoints (already used for chat threads).
- **Pending clarification records** (question payload, status): in-process `ClarificationService` map keyed by `thread_id` + `clarification_id`. Survives for the desktop app process lifetime; lost on full restart of a pending card is acceptable for V1 (user rephrases).

No new business table unless later we need cross-restart pending UX.

## Frontend

| Piece | Responsibility |
|-------|----------------|
| `ChatStreamEvent` / SSE parser | Add `clarification`; extend `done` with optional `awaiting_clarification` |
| `useChatStream` / transport | Apply SSE; hold pending card; submit → answer API → consume resume SSE |
| `ClarificationCard.vue` | Question, radio/checkbox options, optional free text, Submit |
| Surfaces | Main Chat, WorkflowRun step chat, file-chat |

**Card states:** `pending` → `submitting` → `answered` (read-only summary) | `cancelled`.

**Visual:** One interactive card embedded in the message stream (not a dashboard). Match existing bubble rhythm and approval/tool-activity patterns (`PlanApprovalCard`-adjacent).

**New user message while pending:** Cancel and dismiss unanswered card (matches backend cancel rule).

## Data flow

1. Client opens chat SSE (`/v1/chat` or file-chat / step chat).
2. Model calls `ask_question` → pending + SSE `clarification` → interrupt → `done` with `awaiting_clarification: true`.
3. User submits ClarificationCard → answer API → resume injects `ToolMessage` → same-thread resume SSE.
4. Model continues (tools or reply) → normal `done` (no awaiting flag).
5. If the model emits multiple `ask_question` calls in one turn: accept the first; others return a tool error (“clarification already pending”).

## Error handling

| Case | Behavior |
|------|----------|
| Invalid options / single-select overflow | 400; no resume |
| Missing clarification / wrong thread | 404 |
| Duplicate submit | 409 |
| New chat message while pending | Cancel old pending; new turn proceeds |
| Resume / checkpoint failure | 500 with clear error; FE shows retry / rephrase |
| LLM never asks | No hard gate; rely on tool description |

## Testing

### Backend

- Service: create pending, validate answer, 409 on duplicate, cancel on new message.
- Graph: after `ask_question`, no further tools until resume; resume yields `ToolMessage` and can continue.
- SSE: `clarification` emitted; after answer, same thread streams further `message`.

### Frontend

- ClarificationCard state transitions and submit payload.
- SSE handler attaches pending card; cancel on new send.
- Light component test for selection + optional free text.

Do not unit-test live LLM timing of when to ask (mock `tool_calls`).

## Relationship to earlier brainstorming

Earlier discussion explored an intent-routing node and LLM sufficiency gate before clarify. **V1 deliberately does not implement those.** Clarification is opt-in via `ask_question`. A schema-driven requirement Agent may later consume this UI/interrupt mechanism.

## Out of scope follow-ups

- Non-blocking Q&A with background work while waiting.
- Parallel multi-question batches in one turn.
- Schema-slot requirement collection Agent.
- Mandatory intent / sufficiency pre-gate nodes.
- Product analytics / eval for clarification rate.
