export type PanelRootView = {
  type: "view";
  name: string;
  props?: Record<string, unknown>;
};

export type PanelRootForm = { type: "form" };

export type PanelRoot = PanelRootView | PanelRootForm;

export type PanelAction = {
  id: string;
  label: string;
  kind: string;
  payload?: Record<string, unknown>;
};

export type PanelTypeDocument = {
  type: string;
  label: string;
  description: string;
  category: string;
  defaultProps: Record<string, unknown>;
  propsFields: import("../workspaceRegistryData").PropField[];
  root: PanelRoot;
  actions?: PanelAction[];
};

export type RenderPlan =
  | {
      kind: "view";
      viewName: string;
      viewProps: Record<string, unknown>;
      actions: PanelAction[];
      document: PanelTypeDocument;
    }
  | {
      kind: "form";
      fields: PanelTypeDocument["propsFields"];
      values: Record<string, unknown>;
      actions: PanelAction[];
      document: PanelTypeDocument;
    }
  | { kind: "error"; message: string; document?: PanelTypeDocument };

export type ActionContext = {
  props: Record<string, unknown>;
  setProps: (next: Record<string, unknown>) => void | Promise<void>;
  panelApi?: Record<string, (...args: unknown[]) => unknown>;
  chatInvoke?: (message: string) => void | Promise<void>;
};

export interface JsonRenderAdapter {
  /** Adapter id, e.g. "vue" */
  readonly id: string;
}
