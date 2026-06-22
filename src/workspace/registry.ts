import {
  WORKSPACE_REGISTRY,
  type PropField,
  type PropFieldType,
  type WorkspaceRegistryEntry,
} from "../../shared/workspaceRegistryData";

export type { PropField, PropFieldType, WorkspaceRegistryEntry };
export { WORKSPACE_REGISTRY };

export type WorkspaceComponent = {
  id: string;
  type: string;
  label?: string;
  props: Record<string, unknown>;
};

export type WorkspaceDefinition = {
  version: 1;
  stepId: string;
  layout: "tabs" | "stack";
  components: WorkspaceComponent[];
};

export function registryEntry(type: string): WorkspaceRegistryEntry | undefined {
  return WORKSPACE_REGISTRY.find((entry) => entry.type === type);
}
