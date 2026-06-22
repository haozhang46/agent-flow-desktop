# Agent Flow Desktop

Local Electron app: **DeepSeek API** + **LangGraph ReAct sidecar** + **git/shell tools** on your machine, extended with a project-scoped **Dev→CI/CD workflow** engine.

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.11+ with backend venv installed (`cd ../backend && pip install -e ".[dev]"`)
- DeepSeek API key (Settings → save key before running workflow steps)

## How to Run

From the **repo root**:

```bash
pnpm install
pnpm dev:desktop
```

Equivalent from the `desktop/` package:

```bash
cd desktop && pnpm dev
```

On first run: **Settings** → enter DeepSeek API key → **Home** → **New Project** or **Open Project**.

## Dev→CI/CD Workflow

Agent Flow Desktop turns a project folder into a guided pipeline from PRD through CI/CD. Each project carries its own workflow config under `.agentflow/`; a global template is used when no local override exists.

**Default 8-step pipeline:** `prd → architecture → fe-dev → be-dev → test → review → test-2 → cicd`

| Step | Executor | Skills | Outputs |
|------|----------|--------|---------|
| PRD | deepseek | brainstorming | `docs/PRD.md` |
| Architecture | deepseek | writing-plans | `docs/architecture.md`, `AGENTS.md` |
| Frontend Development | claude-code | — | `fe/` |
| Backend Development | deepseek | test-driven-development | `backend/` |
| Test | deepseek | — | `test-report.md` |
| Code Review | deepseek | receiving-code-review | `review-notes.md` |
| Regression Test | deepseek | — | `regression-report.md` |
| CI/CD | deepseek | — | `.github/workflows/`, `Dockerfile` |

**Workflow load priority:** `{project}/.agentflow/workflow.yaml` → bundled `templates/default-dev-cicd/workflow.yaml`

**Executors (v1):**

- `deepseek` — LangGraph.js ReAct agent with git/shell/read tools
- `claude-code` — spawns `claude` CLI subprocess, streams stdout/stderr

**Hybrid UI:** step panel (status + navigation) + step-scoped chat + free chat within a step. Use **Continue**, **Skip**, or **Retry** to advance gates.

## Project Home → Workflow Run

1. **Home** — create a new project (**New Project** copies the default template into `.agentflow/`) or open an existing folder. Recent projects are listed for quick access.
2. After open, the app navigates to **Workflow** automatically.
3. **Workflow** — left rail shows all steps and statuses; center panel runs step chat or free chat; right rail lists expected outputs for the current step.
4. Select skills (optional), send a message to run the current step's executor, then **Continue** when the gate is satisfied.
5. **Chat** — standalone multi-thread ReAct chat (outside the workflow).
6. **Langflow** — design-time editor shell; paste Langflow JSON export to compile into `workflow.yaml`.
7. **Settings** — DeepSeek API key and optional Resource Server URL.

## `.agentflow/` Folder Structure

When you create a new project, Desktop copies the default template:

```text
my-project/
├── .agentflow/
│   ├── workflow.yaml          # runtime workflow definition (local override)
│   ├── resources.yaml         # mysql/redis resource declarations
│   └── prompts/               # per-step prompt templates
│       └── prd.md
├── docs/
├── fe/
├── backend/
└── docker-compose.yml         # generated when no Resource Server is configured
```

Optional artifacts:

- `workflow.langflow.json` — Langflow design export (future; v1 compiles directly from pasted JSON)

User-level data lives under `~/.agentflow/` (recent projects list, encrypted API key, Resource Server URL).

## Langflow Compile Path

v1 ships a compiler + editor shell (full Langflow visual bundle is planned for v1.1).

1. Open **Langflow** in the nav bar.
2. Paste a Langflow JSON export (nodes with `data.metadata` for step id, title, executor, skills; plus edges).
3. Click **Compile & Save** — Desktop POSTs to `POST /v1/workflow/compile`, which writes `.agentflow/workflow.yaml`.
4. **Runtime** reads `workflow.yaml` only via LangGraph.js — Langflow native LLM nodes are not executed in v1.

Compiler source: `electron/workflow/compiler.ts` (`compileLangflowJson`, `compileLangflowToYaml`).

## Resource Config (Optional)

Resource Server provides **read-only connection config** for the LLM — not dynamic provisioning.

Declare resources in `.agentflow/resources.yaml`:

```yaml
resources:
  - { type: mysql, name: app-db }
  - { type: redis, name: cache }
```

Optional local overrides in `.agentflow/resource-instances.yaml`:

```yaml
instances:
  app-db:
    host: localhost
    port: 3306
    database: myapp
    user: root
    dsn: mysql://root@localhost:3306/myapp
  cache:
    host: localhost
    port: 6379
    dsn: redis://localhost:6379/0
```

**Settings → Resource Server URL** (optional):

- **Empty** — use project `.agentflow/resource-instances.yaml` only (declaration-only context if missing).
- **Set** — fetch `GET /v1/resources/config` from the team server; local overrides win per instance name.

Resolved context is injected into workflow steps (`be-dev`, `cicd`, `test`) and exposed at `GET /v1/resources/context`.

## Architecture

- `electron/main.ts` — spawns Python sidecar (`python -m app.desktop`), executor HTTP `:17351`, workflow agent HTTP server
- `electron/workflow/` — loader, compiler, stepRunner, checkpoint
- `electron/executors/` — deepseek + claude-code registry
- `electron/resources/` — resourceResolver (declarations + server/local merge → LLM context)
- `backend/app/desktop/` — LOCAL_MODE FastAPI, `general-react` ReAct flow
- `packages/shared-ui` — shared chat UI with `fe/`

## Sidecar env (set by Electron)

| Variable | Purpose |
|----------|---------|
| `DEEPSEEK_API_KEY` | User key from encrypted store |
| `WORKSPACE_ROOT` | Selected project folder |
| `DESKTOP_EXECUTOR_URL` | `http://127.0.0.1:17351` |
| `SIDECAR_PORT` | Default `8765` |

## Tests & Build

```bash
cd ../backend && pytest -v
cd ../desktop && pnpm test
cd ../fe && pnpm test
cd ../desktop && pnpm build
```
