import {
  formatResourceContextForPrompt,
  resolveResources,
  stepNeedsResourceContext,
} from "../resources/resolver";
import {
  combineResourceAndTopologyContext,
  formatTopologyContextForPrompt,
  projectIdFromRoot,
  resolveTopology,
} from "../resources/topology";
import { getExecutor } from "../executors/registry";
import type { StepEvent } from "../executors/types";
import { dispatch, getNextActiveStepId } from "./dispatcher";
import { allGatesPassed, runGates } from "./gates";
import {
  readPhaseOutput,
  writeGateResults,
  writePhaseOutput,
} from "./phases";
import { buildSystemPrompt, renderPromptTemplate } from "./prompt";
import { cloneRunState, type WorkflowRunState } from "./state";
import {
  getOrCreateState,
  recordGateResults,
  saveStateFile,
} from "./stateFile";
import type { WorkflowDefinition } from "./types";
import { normalizeStep } from "./types";

export class StepRunner {
  private state: WorkflowRunState;

  constructor(
    private projectRoot: string,
    private workflow: WorkflowDefinition,
    private getApiKey: () => string | null,
    private getResourceServerUrl?: () => string | null,
    initialState?: WorkflowRunState,
  ) {
    this.state = initialState ? cloneRunState(initialState) : cloneRunState({
      workflowId: workflow.id,
      intent: "FEATURE",
      risk: "HIGH",
      currentStepId: workflow.steps[0].id,
      activeStepIds: workflow.steps.map((s) => s.id),
      stepStatuses: Object.fromEntries(workflow.steps.map((s) => [s.id, "pending"])),
      lastGateResults: {},
      threadId: "pending",
    });
  }

  static async create(
    projectRoot: string,
    workflow: WorkflowDefinition,
    getApiKey: () => string | null,
    getResourceServerUrl?: () => string | null,
  ): Promise<StepRunner> {
    const state = await getOrCreateState(projectRoot, workflow);
    return new StepRunner(projectRoot, workflow, getApiKey, getResourceServerUrl, state);
  }

  getState(): WorkflowRunState {
    return cloneRunState(this.state);
  }

  async persistState(): Promise<void> {
    await saveStateFile(this.projectRoot, this.state);
  }

  setCurrentStepId(stepId: string): void {
    const exists = this.workflow.steps.some((s) => s.id === stepId);
    if (!exists) {
      throw new Error(`Unknown step: ${stepId}`);
    }
    this.state.currentStepId = stepId;
  }

  getDispatchDecision() {
    return dispatch(this.workflow, this.state);
  }

  async runGatesForStep(stepId?: string): Promise<WorkflowRunState> {
    const id = stepId ?? this.state.currentStepId;
    const step = this.workflow.steps.find((s) => s.id === id);
    if (!step) {
      throw new Error(`Unknown step: ${id}`);
    }
    const normalized = normalizeStep(step);
    const results = await runGates(this.projectRoot, normalized.gates);
    await writeGateResults(this.projectRoot, id, results, this.workflow.id);
    this.state = recordGateResults(this.state, id, results);
    if (!allGatesPassed(results)) {
      this.state.stepStatuses[id] = "gate_failed";
    } else if (this.state.stepStatuses[id] === "gate_failed") {
      this.state.stepStatuses[id] = "done";
    }
    await this.persistState();
    return this.getState();
  }

  async *runCurrentStep(): AsyncIterable<StepEvent> {
    const decision = dispatch(this.workflow, this.state);
    if (decision.action === "run" && decision.stepId && decision.stepId !== this.state.currentStepId) {
      this.state.currentStepId = decision.stepId;
    }

    const stepId = this.state.currentStepId;
    const step = this.workflow.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Unknown step: ${stepId}`);
    }

    if (!this.state.activeStepIds.includes(stepId)) {
      yield { type: "message", content: `Step ${stepId} is not active for ${this.state.intent}/${this.state.risk}` };
      yield { type: "done" };
      return;
    }

    this.state.stepStatuses[stepId] = "running";
    await this.persistState();

    const apiKey = this.getApiKey();
    if (!apiKey) {
      this.state.stepStatuses[stepId] = "failed";
      await this.persistState();
      yield { type: "message", content: "Error: API key not configured" };
      yield { type: "done" };
      return;
    }

    try {
      let resourceContext: string | undefined;
      if (stepNeedsResourceContext(stepId, step.requires_resources)) {
        const serverUrl = this.getResourceServerUrl?.() ?? undefined;
        const resolved = await resolveResources(this.projectRoot, serverUrl ?? undefined);
        const resourceMarkdown = formatResourceContextForPrompt(resolved);
        const topology = await resolveTopology(
          this.projectRoot,
          serverUrl ?? undefined,
          projectIdFromRoot(this.projectRoot),
        );
        const topologyMarkdown = topology ? formatTopologyContextForPrompt(topology) : "";
        resourceContext = combineResourceAndTopologyContext(resourceMarkdown, topologyMarkdown);
      }

      const priorPhase =
        decision.priorStepId != null
          ? (await readPhaseOutput(
              this.projectRoot,
              decision.priorStepId,
              this.workflow.steps.find((s) => s.id === decision.priorStepId)?.phase_output,
              this.workflow.id,
            )) ?? ""
          : "";

      const systemPrompt = await buildSystemPrompt(
        step.agents_md,
        step.skills,
        this.projectRoot,
        resourceContext,
      );

      const normalized = normalizeStep(step);
      const userPrompt = step.prompt_template
        ? await renderPromptTemplate(step.prompt_template, this.projectRoot, {
            prior_phase: priorPhase,
          }, this.workflow.id)
        : step.title;

      const executor = getExecutor(step.executor);
      const ctx = {
        workspaceRoot: this.projectRoot,
        stepId,
        systemPrompt,
        userPrompt,
        threadId: this.state.threadId,
        apiKey,
      };

      let lastContent = "";
      for await (const event of executor.run(ctx)) {
        yield event;
        if (event.type === "message") {
          lastContent = event.content;
        }
        if (event.type === "done") {
          const phaseBody = [
            `# Phase: ${step.title} (${stepId})`,
            "",
            `Completed at: ${new Date().toISOString()}`,
            "",
            "## Summary",
            lastContent || "(no output captured)",
          ].join("\n");
          await writePhaseOutput(this.projectRoot, stepId, phaseBody, normalized.phase_output, this.workflow.id);

          const gateResults = await runGates(this.projectRoot, normalized.gates);
          await writeGateResults(this.projectRoot, stepId, gateResults, this.workflow.id);
          this.state = recordGateResults(this.state, stepId, gateResults);

          if (allGatesPassed(gateResults)) {
            this.state.stepStatuses[stepId] = "done";
            if (normalized.advance === "auto") {
              const next = getNextActiveStepId(this.workflow, this.state, stepId);
              if (next) {
                this.state.currentStepId = next;
              }
            }
          } else {
            this.state.stepStatuses[stepId] = "gate_failed";
            const failed = gateResults.filter((g) => g.status === "FAIL");
            yield {
              type: "message",
              content: `Gate failed: ${failed.map((g) => `${g.id}: ${g.message ?? g.status}`).join("; ")}`,
            };
          }
          await this.persistState();
        }
      }
    } catch (err) {
      this.state.stepStatuses[stepId] = "failed";
      await this.persistState();
      const message = err instanceof Error ? err.message : String(err);
      yield { type: "message", content: `Error: ${message}` };
      yield { type: "done" };
    }
  }

  async advance(action: "continue" | "skip" | "retry"): Promise<WorkflowRunState> {
    const stepId = this.state.currentStepId;

    if (action === "retry") {
      this.state.stepStatuses[stepId] = "pending";
      await this.persistState();
      return this.getState();
    }

    if (action === "skip") {
      this.state.stepStatuses[stepId] = "skipped";
      const next = getNextActiveStepId(this.workflow, this.state, stepId);
      if (next) {
        this.state.currentStepId = next;
      }
      await this.persistState();
      return this.getState();
    }

    const step = this.workflow.steps.find((s) => s.id === stepId);
    const normalized = step ? normalizeStep(step) : null;
    if (normalized && normalized.gates.length > 0) {
      const results = await runGates(this.projectRoot, normalized.gates);
      await writeGateResults(this.projectRoot, stepId, results, this.workflow.id);
      this.state = recordGateResults(this.state, stepId, results);
      if (!allGatesPassed(results)) {
        this.state.stepStatuses[stepId] = "gate_failed";
        await this.persistState();
        throw new Error(
          `Gates failed: ${results.filter((g) => g.status === "FAIL").map((g) => g.id).join(", ")}`,
        );
      }
    }

    this.state.stepStatuses[stepId] = "done";
    const next = getNextActiveStepId(this.workflow, this.state, stepId);
    if (next) {
      this.state.currentStepId = next;
    }
    await this.persistState();
    return this.getState();
  }
}
