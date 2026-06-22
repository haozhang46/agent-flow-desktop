import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  compileLangflowJson,
  compileLangflowToYaml,
  type LangflowJson,
} from "../../electron/workflow/compiler";
import { WorkflowSchema } from "../../electron/workflow/types";

const FIXTURE: LangflowJson = {
  id: "test-pipeline",
  title: "Test Pipeline",
  nodes: [
    {
      id: "langflow-node-1",
      data: {
        metadata: {
          id: "prd",
          title: "PRD",
          executor: "deepseek",
          skills: ["brainstorming", "writing-plans"],
          prompt_template: "prompts/prd.md",
          outputs: ["docs/PRD.md"],
          gate: "manual",
        },
      },
    },
    {
      id: "langflow-node-2",
      data: {
        metadata: {
          id: "build",
          title: "Build",
          executor: "claude-code",
          skills: [],
          gate: "auto",
        },
      },
    },
  ],
  edges: [{ source: "langflow-node-1", target: "langflow-node-2" }],
  resources: [{ type: "mysql", name: "app-db" }],
};

describe("compileLangflowToYaml", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-compiler-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("maps nodes with data.metadata to valid workflow.yaml", async () => {
    const yamlText = await compileLangflowToYaml(FIXTURE);
    const parsed = yaml.parse(yamlText);
    const workflow = WorkflowSchema.parse(parsed);

    expect(workflow.version).toBe(1);
    expect(workflow.id).toBe("test-pipeline");
    expect(workflow.title).toBe("Test Pipeline");
    expect(workflow.steps).toHaveLength(2);

    const prd = workflow.steps[0];
    expect(prd.id).toBe("prd");
    expect(prd.title).toBe("PRD");
    expect(prd.executor).toBe("deepseek");
    expect(prd.skills).toEqual(["brainstorming", "writing-plans"]);
    expect(prd.prompt_template).toBe("prompts/prd.md");
    expect(prd.outputs).toEqual(["docs/PRD.md"]);
    expect(prd.gate).toBe("manual");

    const build = workflow.steps[1];
    expect(build.id).toBe("build");
    expect(build.title).toBe("Build");
    expect(build.executor).toBe("claude-code");
    expect(build.skills).toEqual([]);
    expect(build.gate).toBe("auto");

    expect(workflow.resources).toEqual([{ type: "mysql", name: "app-db" }]);
  });

  it("maps edges from langflow edges array using step ids", () => {
    const workflow = compileLangflowJson(FIXTURE);

    expect(workflow.edges).toEqual([{ from: "prd", to: "build" }]);
  });

  it("writes yaml to projectRoot when provided", async () => {
    await compileLangflowToYaml(FIXTURE, tmp);

    const dest = path.join(tmp, ".agentflow/workflow.yaml");
    const content = await fs.readFile(dest, "utf8");
    const workflow = WorkflowSchema.parse(yaml.parse(content));

    expect(workflow.id).toBe("test-pipeline");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.edges).toEqual([{ from: "prd", to: "build" }]);
  });
});
