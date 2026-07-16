import type { PanelTypeDocument, RenderPlan } from "./types";

export function buildRenderPlan(
  doc: PanelTypeDocument,
  instanceProps: Record<string, unknown>,
): RenderPlan {
  const mergedProps = { ...doc.defaultProps, ...instanceProps };
  const actions = doc.actions ?? [];

  if (doc.root.type === "form") {
    return {
      kind: "form",
      fields: doc.propsFields,
      values: mergedProps,
      actions,
      document: doc,
    };
  }

  const { name, props: rootProps } = doc.root;
  let viewProps: Record<string, unknown>;

  if (rootProps?.$bind === "instance") {
    const { $bind: _, ...restRootProps } = rootProps;
    viewProps = { ...mergedProps, ...restRootProps };
  } else {
    viewProps = { ...mergedProps, ...rootProps };
  }

  return {
    kind: "view",
    viewName: name,
    viewProps,
    actions,
    document: doc,
  };
}
