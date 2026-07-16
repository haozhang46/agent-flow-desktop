# AskQuestion Clarification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cursor-style `ask_question` with LangGraph interrupt, SSE `clarification`, answer/resume API, and `ClarificationCard` across main Chat, WorkflowRun step chat, and file-chat.

**Architecture:** `ask_question` registers pending in `ClarificationService`, then calls LangGraph `interrupt()`. Stream/HTTP layers emit SSE and stop with `awaiting_clarification`. Answer API validates, resumes via `Command({ resume })` (interrupt return becomes tool result / `ToolMessage`), and continues the same-thread SSE. FE renders one card per pending clarification.

**Tech Stack:** Vue 3, Electron sidecar (`electron/agent`), LangGraph (`interrupt` / `Command` / SqliteSaver), Vitest, `@agent-flow/shared-ui` SSE parser.

**Spec:** `docs/superpowers/specs/2026-07-16-ask-question-clarification-design.md`

## Global Constraints

- Hard-block: after `ask_question`, no further tools / final answer until resume
- One pending clarification per turn; later `ask_question` in same turn → tool error
- New user message while pending → cancel old pending
- Ask mode tools: **only** `ask_question`
- Plan / Agent / step chat / file-chat: existing tools + `ask_question`
- No schema-slot Agent; no mandatory intent/sufficiency gate
- Clarification `thread_id` = LangGraph checkpoint thread id
- Answer API: `POST /v1/threads/{thread_id}/clarifications/{clarification_id}` returns **200 + resume SSE**
- Storage: SqliteSaver for graph resume; in-process `ClarificationService` map for pending records
- Card states: `pending` → `submitting` → `answered` | `cancelled`
- V1: at least one option required; `allow_multiple` + `allow_free_text` supported

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/agent/clarificationTypes.ts` | Zod schemas + TS types for question/answer/pending |
| `electron/agent/clarificationService.ts` | In-process pending CRUD / validate / cancel |
| `electron/agent/askQuestionTool.ts` | `buildAskQuestionTool()` using `interrupt()` |
| `electron/agent/agentflowPromptContext.ts` | Mount `ask_question` per mode (Ask = only that tool) |
| `electron/agent/tools.ts` / `fileChatTools.ts` | Append ask tool to Plan/Agent/file-chat catalogs |
| `electron/agent/reactGraph.ts` / `streamAgentGraph.ts` / `agentService.ts` / `fileChatService.ts` | Interrupt detection, resume stream, cancel-on-new-message |
| `electron/agent/server.ts` | SSE `clarification` + `done.awaiting_clarification`; answer route |
| `packages/shared-ui/src/parseSseStream.ts` | Parse `clarification` + `done` payload |
| `src/components/chat/ClarificationCard.vue` | Interactive card UI |
| `src/composables/useClarification.ts` / `useChatStream.ts` / `chatTransport.ts` | Pending state, submit, resume SSE |
| `src/pages/Chat.vue` / `WorkflowRun.vue` (+ file-chat entry) | Wire card into streams |

---

### Task 1: ClarificationService (TDD)

**Files:**
- Create: `electron/agent/clarificationTypes.ts`
- Create: `electron/agent/clarificationService.ts`
- Create: `tests/agent/clarificationService.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - Types: `ClarificationOption`, `PendingClarification`, `ClarificationAnswer`
  - `ClarificationOptionSchema`, `AskQuestionArgsSchema`, `ClarificationAnswerSchema` (zod)
  - `export class ClarificationService` with:
    - `createPending(threadId: string, clarificationId: string, args: AskQuestionArgs): PendingClarification`
    - `getPending(threadId: string, clarificationId: string): PendingClarification | undefined`
    - `getPendingForThread(threadId: string): PendingClarification | undefined`
    - `cancelThread(threadId: string): void`
    - `validateAnswer(pending: PendingClarification, answer: ClarificationAnswer): { ok: true } | { ok: false; status: 400; detail: string }`
    - `markAnswered(threadId: string, clarificationId: string): void`
    - `serializeAnswerForTool(pending: PendingClarification, answer: ClarificationAnswer): string` (JSON string with selected ids, labels, free_text)
  - `export const clarificationService = new ClarificationService()` (singleton)

- [ ] **Step 1: Write the failing test**

Create `tests/agent/clarificationService.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { ClarificationService } from "../../electron/agent/clarificationService";

describe("ClarificationService", () => {
  let svc: ClarificationService;
  beforeEach(() => {
    svc = new ClarificationService();
  });

  const args = {
    question: "Need web search?",
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    allow_multiple: false,
    allow_free_text: true,
  };

  it("creates pending and retrieves by id", () => {
    const p = svc.createPending("t1", "call_1", args);
    expect(p.status).toBe("pending");
    expect(svc.getPending("t1", "call_1")?.question).toBe("Need web search?");
  });

  it("rejects second pending on same thread while first is pending", () => {
    svc.createPending("t1", "call_1", args);
    expect(() => svc.createPending("t1", "call_2", args)).toThrow(/already pending/i);
  });

  it("validateAnswer rejects unknown option ids with 400", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: ["maybe"], free_text: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("validateAnswer rejects multi-select overflow when allow_multiple is false", () => {
    const p = svc.createPending("t1", "call_1", args);
    const r = svc.validateAnswer(p, { selected_option_ids: ["yes", "no"] });
    expect(r.ok).toBe(false);
  });

  it("markAnswered then getPending is answered; duplicate mark is idempotent for lookup", () => {
    svc.createPending("t1", "call_1", args);
    svc.markAnswered("t1", "call_1");
    expect(svc.getPending("t1", "call_1")?.status).toBe("answered");
  });

  it("cancelThread removes pending", () => {
    svc.createPending("t1", "call_1", args);
    svc.cancelThread("t1");
    expect(svc.getPendingForThread("t1")).toBeUndefined();
  });

  it("serializeAnswerForTool includes labels", () => {
    const p = svc.createPending("t1", "call_1", args);
    const s = svc.serializeAnswerForTool(p, {
      selected_option_ids: ["yes"],
      free_text: "today only",
    });
    const parsed = JSON.parse(s) as {
      selected_option_ids: string[];
      labels: string[];
      free_text?: string;
    };
    expect(parsed.selected_option_ids).toEqual(["yes"]);
    expect(parsed.labels).toEqual(["Yes"]);
    expect(parsed.free_text).toBe("today only");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/agent/clarificationService.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Minimal implementation**

`electron/agent/clarificationTypes.ts` — zod schemas matching the spec tool input and answer body.

`electron/agent/clarificationService.ts` — implement class as specified. `createPending` throws if `getPendingForThread` already has `status === "pending"`. Require `options.length >= 1` (zod). Status values: `"pending" | "answered" | "cancelled"`.

- [ ] **Step 4: Run tests — pass**

Run: `pnpm exec vitest run tests/agent/clarificationService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add electron/agent/clarificationTypes.ts electron/agent/clarificationService.ts tests/agent/clarificationService.test.ts
git commit -m "feat(agent): add ClarificationService for AskQuestion pending state"
```

---

### Task 2: ask_question tool + mode mounting

**Files:**
- Create: `electron/agent/askQuestionTool.ts`
- Modify: `electron/agent/agentflowPromptContext.ts` (`getToolsForMode`)
- Modify: `electron/agent/tools.ts` (ensure builders can include ask tool — prefer injecting via `getToolsForMode` and file-chat only)
- Modify: `electron/agent/fileChatTools.ts`
- Modify: `electron/agent/agentService.ts` (Ask agent must use tools from `getToolsForMode`, not `[]`)
- Modify: `electron/agent/prompt.ts` (Ask preamble: may call ask_question when ambiguous)
- Test: `tests/agent/askQuestionTool.test.ts`, `tests/agent/getToolsForMode.test.ts` (create if missing)

**Interfaces:**
- Consumes: `ClarificationService`, `interrupt` from `@langchain/langgraph`
- Produces:
  - `export function buildAskQuestionTool(params: { threadId: string; service: ClarificationService }): StructuredToolInterface`
  - Tool name **exactly** `ask_question`
  - Schema: `AskQuestionArgsSchema` fields `question`, `options`, `allow_multiple` (default false), `allow_free_text` (default true)
  - Behavior: `createPending(threadId, toolCallId, args)` then `const answer = interrupt({ clarification_id: toolCallId, ...args })` then return `service.serializeAnswerForTool(...)` **or** if resume value is already a string from HTTP layer, return that string
  - Note: LangChain tools receive `config` with `toolCall.id` — use `config.toolCall?.id` / RunnableConfig; if id missing, generate `call_${random}` and use consistently

**Important:** `buildAskQuestionTool` needs `threadId` at invoke time. Prefer a factory closed over threadId, rebuilt per request in `agentService.streamEvents` / file-chat (do **not** bake tools only at `configure()` if threadId is required). Refactor agent build so tools are assembled per stream with the request's `thread_id`.

- [ ] **Step 1: Failing tests**

```ts
// tests/agent/getToolsForMode.test.ts
import { describe, expect, it } from "vitest";
import { getToolsForMode } from "../../electron/agent/agentflowPromptContext";

describe("getToolsForMode ask_question mount", () => {
  const base = { mode: "ask" as const, workspaceRoot: process.cwd() };

  it("ask mode includes only ask_question when clarificationThreadId provided", () => {
    const tools = getToolsForMode({ ...base, clarificationThreadId: "t1" });
    expect(tools.map((t) => t.name)).toEqual(["ask_question"]);
  });

  it("plan mode includes ask_question among tools", () => {
    const tools = getToolsForMode({
      mode: "plan",
      workspaceRoot: process.cwd(),
      clarificationThreadId: "t1",
    });
    expect(tools.some((t) => t.name === "ask_question")).toBe(true);
  });
});
```

Also test ask tool: when service already has pending, second create throws / tool returns error string `"clarification already pending"` without calling interrupt (guard at start of tool).

- [ ] **Step 2: Run — expect FAIL**

`pnpm exec vitest run tests/agent/getToolsForMode.test.ts`

- [ ] **Step 3: Implement**

1. `askQuestionTool.ts` as above.
2. Extend `AgentflowPromptOptions` with optional `clarificationThreadId?: string`.
3. `getToolsForMode`:
   - if `mode === "ask"`: return clarificationThreadId ? `[buildAskQuestionTool(...)]` : `[]`
   - if plan/agent: append ask tool when `clarificationThreadId` set
4. `buildFileChatLangChainTools`: accept optional threadId / append ask tool.
5. Refactor `AgentService` so each `streamEvents` builds/compiles agent **or** rebinds tools per call with correct threadId (minimal change: rebuild agent graph per stream is OK if already cheap; otherwise ToolNode with dynamic tools — follow existing patterns, prefer rebuild-per-request for correctness).
6. Update Ask mode system preamble: tools are available; use `ask_question` for ambiguous high-stakes choices.

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): mount ask_question tool across chat modes and file-chat"
```

---

### Task 3: Stream interrupt detection + resume API surface (service layer)

**Files:**
- Modify: `electron/agent/streamAgentGraph.ts`
- Modify: `electron/agent/agentService.ts`
- Modify: `electron/agent/fileChatService.ts`
- Create: `tests/agent/clarificationStream.test.ts` (mock graph interrupt / resume if needed; prefer unit-testing helpers)

**Interfaces:**
- Consumes: `isGraphInterrupt`, `Command` from `@langchain/langgraph`; `clarificationService`
- Produces:
  - New stream event shapes yielded to server:
    - `{ event: "clarification"; data: { clarification_id, thread_id, question, options, allow_multiple, allow_free_text, status: "pending" } }`
    - `{ event: "awaiting_clarification" }` (or fold into done at HTTP layer)
  - `AgentService.streamEvents`: at start call `clarificationService.cancelThread(threadId)` then run graph
  - On `GraphInterrupt`: read interrupt value / pending; yield `clarification` event; stop generator (do not continue tools)
  - `AgentService.resumeClarification(threadId, clarificationId, answer, options): AsyncGenerator<...>`:
    1. load pending; 404 if missing; 409 if answered
    2. validateAnswer → 400
    3. markAnswered
    4. `serializeAnswerForTool`
    5. `streamCompiledAgent` / graph.stream with `new Command({ resume: serialized })` and same configurable thread_id
  - Same resume method for file-chat path (shared helper OK)

- [ ] **Step 1: Write failing test for cancel-on-new-message + interrupt event helper**

Test that starting a new stream cancels prior pending (service-level already covered — add integration-style test that `streamEvents` calls `cancelThread`).

If full graph mock is heavy, extract:

```ts
export function clarificationEventFromPending(
  threadId: string,
  pending: PendingClarification,
): { event: "clarification"; data: Record<string, unknown> }
```

and unit-test it; separately test resume validation returns status codes via a thin `prepareResume` function.

- [ ] **Step 2–4: Implement catch of GraphInterrupt in stream loop**

Where `agent.stream` / `streamCompiledAgent` currently loops: wrap so GraphInterrupt surfaces. Inspect `@langchain/langgraph` — interrupts may appear as stream `__interrupt__` updates rather than thrown errors depending on streamMode; support both:

1. If thrown `isGraphInterrupt(err)` → emit clarification from `err.interrupts` / pending service
2. If stream update contains interrupts → emit and break

After interrupt emission, end the async generator normally (caller writes `done` with awaiting flag).

Implement `resumeClarification` as above.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): interrupt stream for ask_question and resume clarification"
```

---

### Task 4: HTTP SSE + answer route

**Files:**
- Modify: `electron/agent/server.ts`
- Create: `tests/agent/clarificationRoutes.test.ts` (hit handlers with mock service / inject if app already has route tests — follow `tests/**` patterns; if HTTP server hard to boot, unit-test a extracted `handleClarificationAnswer` function)

**Interfaces:**
- Consumes: `AgentService.resumeClarification`, `writeSse`, `clarificationService`
- Produces:
  - On `/v1/chat` and file-chat streams: when event `clarification`, `writeSse(res, "clarification", data)`; final `writeSse(res, "done", { awaiting_clarification: true })` instead of `{}`
  - Emit `tool_start`/`tool_end` for ask_question in plan/ask too if useful — **at minimum**, always emit `clarification` regardless of mode
  - `POST /v1/threads/:threadId/clarifications/:clarificationId`
    - Body: `{ selected_option_ids: string[]; free_text?: string }`
    - 400/404/409 via `jsonResponse` when not resuming
    - On success: SSE headers + pipe `resumeClarification` stream (message/tool events) + `writeSse(res, "done", {})`

- [ ] **Step 1: Failing route test for 400/404/409**

- [ ] **Step 2–4: Implement routes + wire chat/file-chat SSE**

Also cancel pending when chat POST starts (service layer already cancels — ensure HTTP always uses that path).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(agent): SSE clarification events and answer resume route"
```

---

### Task 5: shared-ui SSE types

**Files:**
- Modify: `packages/shared-ui/src/parseSseStream.ts`
- Modify: `packages/shared-ui/tests/parseSseStream.test.ts`
- Export types from `packages/shared-ui/src/index.ts` if needed

**Interfaces:**
- Consumes: none
- Produces:
  - `ClarificationSsePayload` type matching SSE JSON
  - `SseEvent` adds:
    - `{ type: "clarification"; clarification: ClarificationSsePayload }`
    - `{ type: "done"; awaiting_clarification?: boolean }`

- [ ] **Step 1: Extend parseSseStream tests**

```ts
it("parses clarification events", async () => {
  // event: clarification\ndata: {...}\n\n
});
it("parses done with awaiting_clarification", async () => {
  // event: done\ndata: {"awaiting_clarification":true}\n\n
  // expect events toEqual([{ type: "done", awaiting_clarification: true }])
});
```

- [ ] **Step 2: FAIL then implement parser**

For `done`, parse JSON and pass `awaiting_clarification` if present (boolean).

- [ ] **Step 3: PASS + commit**

```bash
git commit -m "feat(shared-ui): parse clarification and awaiting_clarification SSE"
```

---

### Task 6: ClarificationCard + FE wiring

**Files:**
- Create: `src/components/chat/ClarificationCard.vue`
- Create: `src/composables/useClarification.ts`
- Create: `tests/components/ClarificationCard.test.ts`
- Create: `tests/composables/useClarification.test.ts` (or stream consumer test)
- Modify: `src/composables/chatTransport.ts` — `submitClarification(threadId, clarificationId, body)` → returns `parseSseStream`
- Modify: `src/composables/useChatStream.ts` — handle clarification / awaiting; expose hooks
- Modify: `src/pages/Chat.vue`, `src/pages/WorkflowRun.vue`, and file-chat UI that uses `useChatStream` / ChatPanel

**Interfaces:**
- Consumes: SSE clarification payload; answer API
- Produces:
  - `useClarification()`:
    - `pending: Ref<ClarificationSsePayload | null>`
    - `cardStatus: Ref<"pending"|"submitting"|"answered"|"cancelled">`
    - `applyClarificationEvent(payload)`
    - `cancelPending()`
    - `submit(answer): Promise<AsyncGenerator<SseEvent>>` — sets submitting, POSTs, on 409/400 sets error
  - On new `send()`: if pending, `cancelPending()` then proceed
  - `ClarificationCard` props: question, options, allowMultiple, allowFreeText, status; emit `submit` with `{ selected_option_ids, free_text? }`
  - Visual: border card like `PlanApprovalCard` (blue info style is fine)

- [ ] **Step 1: Component test — select option + submit payload**

```ts
// @vitest-environment happy-dom
// mount ClarificationCard, click option, click Submit, expect emitted payload
```

- [ ] **Step 2: implement card**

- [ ] **Step 3: useClarification + chatTransport submitClarification**

```ts
export async function submitClarification(
  threadId: string,
  clarificationId: string,
  body: { selected_option_ids: string[]; free_text?: string },
): Promise<AsyncGenerator<SseEvent>> {
  const res = await fetch(
    `${await getAgentApiBase()}/v1/threads/${encodeURIComponent(threadId)}/clarifications/${encodeURIComponent(clarificationId)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!res.ok || !res.body) throw new Error(`Clarification failed: ${res.status}`);
  return parseSseStream(res.body);
}
```

- [ ] **Step 4: Wire Chat / WorkflowRun / file-chat**

After main stream ends with `awaiting_clarification`, keep `sending` false but show card. On submit, set sending true, consume resume SSE with same memory callbacks, then mark card answered (read-only summary).

Ensure Ask mode can show the card (not only agent tool UI).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): ClarificationCard and resume flow for AskQuestion"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `ask_question` tool + interrupt | 2–3 |
| ClarificationService pending map | 1 |
| SSE clarification + done.awaiting | 4–5 |
| Answer API + resume SSE | 3–4 |
| Ask-only tool mount | 2 |
| Plan/Agent/file-chat mount | 2 |
| One pending / cancel on new message | 1, 3 |
| ClarificationCard states | 6 |
| Surfaces: Chat, WorkflowRun, file-chat | 6 |
| Tests (service, SSE, card) | 1, 5, 6 |
| No schema-slot / no intent gate | (non-goal — no task) |

## Placeholder / consistency self-review

- Tool name fixed: `ask_question`
- Status codes: 400 / 404 / 409 / 500 aligned with service + HTTP tasks
- `clarification_id` === tool_call_id
- Resume prefers answer-response SSE (Task 4)
