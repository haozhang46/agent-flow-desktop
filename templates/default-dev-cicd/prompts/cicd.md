# CI/CD Step

Read `.agentflow/topology.yaml` (source mapping per service).

Generate Dockerfile per service `source`, `docker-compose.yml`, and `.github/workflows/`.
Update `docs/cicd-pipeline.md` if the deploy flow changes.

Output:
- `.github/workflows/` — GitHub Actions (or equivalent CI)
- `Dockerfile` — container build (context from topology `source`)
- `docker-compose.yml` — use per-service `build.context` from topology
- `docs/cicd-pipeline.md` — Mermaid pipeline overview

Prior phase:
{{prior_phase}}
