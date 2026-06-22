import { z } from "zod";

export const LayoutSchema = z.enum(["tabs", "stack"]);

export const WorkspaceComponentSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().optional(),
  props: z.record(z.unknown()).default({}),
});

export const WorkspaceSchema = z.object({
  version: z.literal(1),
  stepId: z.string().min(1),
  layout: LayoutSchema,
  components: z.array(WorkspaceComponentSchema),
});

export const COMPONENT_PROPS = {
  "markdown-doc": z.object({
    docsDir: z.string().optional(),
    mode: z.enum(["directory", "file-list"]).optional(),
    files: z
      .array(
        z.object({
          path: z.string(),
          label: z.string(),
        }),
      )
      .optional(),
    editable: z.boolean().optional(),
  }),
  "architecture-docs": z.object({
    files: z
      .array(
        z.object({
          path: z.string(),
          label: z.string(),
        }),
      )
      .optional(),
  }),
  "code-explorer": z.object({
    root: z.string().min(1),
    writable: z.boolean().optional(),
  }),
  "agent-run": z.object({
    reportPath: z.string().optional(),
  }),
  "cicd-config": z.object({}),
  "fe-architecture-plan": z.object({
    output: z.string().min(1),
    layers: z.array(z.string().min(1)).min(1),
  }),
  "be-architecture-plan": z.object({
    output: z.string().min(1),
    layers: z.array(z.string().min(1)).min(1),
  }),
  "schema-migrations": z.object({
    migrationsDir: z.string().min(1),
    output: z.string().min(1),
  }),
  "topology-panel": z.object({
    mode: z.enum(["edit", "view"]).optional(),
    resourcesFile: z.string().optional(),
  }),
  "topology-context": z.object({
    focusNodes: z.array(z.string()).optional(),
    envKeys: z.array(z.string()).optional(),
  }),
  "cicd-readiness": z.object({
    gatesStepId: z.string().optional(),
  }),
  "component-splitter": z.object({
    output: z.string().min(1),
    skills: z.array(z.string()),
    editable: z.boolean(),
  }),
  "agent-rules-editor": z.object({
    files: z
      .array(
        z.object({
          path: z.string().min(1),
          label: z.string().min(1),
        }),
      )
      .optional(),
    editable: z.boolean().optional(),
  }),
  "style-tokens-editor": z.object({
    preset: z.enum(["unocss", "tailwind"]),
    target: z.string().min(1),
    themeFile: z.string().optional(),
  }),
  "langflow-panel": z.object({
    flowId: z.string().min(1),
    mode: z.literal("run"),
  }),
} as const;

export type ComponentType = keyof typeof COMPONENT_PROPS;
export type WorkspaceDefinition = z.infer<typeof WorkspaceSchema>;
export type WorkspaceComponent = z.infer<typeof WorkspaceComponentSchema>;

export function validateWorkspace(def: unknown): WorkspaceDefinition {
  const workspace = WorkspaceSchema.parse(def);
  const seen = new Set<string>();
  const issues: z.ZodIssue[] = [];

  for (let i = 0; i < workspace.components.length; i++) {
    const comp = workspace.components[i];
    if (seen.has(comp.id)) {
      issues.push({
        code: z.ZodIssueCode.custom,
        path: ["components", i, "id"],
        message: `Duplicate component id: ${comp.id}`,
      });
    }
    seen.add(comp.id);

    const propsSchema = COMPONENT_PROPS[comp.type as ComponentType];
    if (!propsSchema) {
      issues.push({
        code: z.ZodIssueCode.custom,
        path: ["components", i, "type"],
        message: `Unknown component type: ${comp.type}`,
      });
      continue;
    }

    const result = propsSchema.safeParse(comp.props ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        issues.push({
          ...issue,
          path: ["components", i, "props", ...issue.path],
        });
      }
    }
  }

  if (issues.length > 0) {
    throw new z.ZodError(issues);
  }

  return workspace;
}
