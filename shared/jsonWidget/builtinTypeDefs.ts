import { WORKSPACE_REGISTRY, type WorkspaceRegistryEntry } from "../workspaceRegistryData";
import { parsePanelTypeDocument } from "./schema";
import type { PanelTypeDocument } from "./types";

function buildBuiltinTypeDocument(entry: WorkspaceRegistryEntry): PanelTypeDocument {
  return parsePanelTypeDocument({
    type: entry.type,
    label: entry.label,
    description: entry.description,
    category: entry.category,
    defaultProps: entry.defaultProps,
    propsFields: entry.propsFields,
    root: { type: "view", name: entry.type, props: { $bind: "instance" } },
  });
}

export const BUILTIN_TYPE_DOCUMENTS: Record<string, PanelTypeDocument> = Object.fromEntries(
  WORKSPACE_REGISTRY.map((entry) => [entry.type, buildBuiltinTypeDocument(entry)]),
);

export function getBuiltinTypeDocument(type: string): PanelTypeDocument | undefined {
  return BUILTIN_TYPE_DOCUMENTS[type];
}
