import type { ActionContext, PanelAction } from "./types";

const ALLOWED_KIND =
  /^(props\.set|chat\.invoke|panel\.[A-Za-z][A-Za-z0-9]*)$/;

function interpolateTemplate(
  template: string,
  props: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in props) {
      return String(props[key]);
    }
    return match;
  });
}

export async function executeAction(
  action: PanelAction,
  ctx: ActionContext,
): Promise<void> {
  if (!ALLOWED_KIND.test(action.kind)) {
    throw new Error("action kind not allowed");
  }

  if (action.kind === "props.set") {
    await ctx.setProps({ ...ctx.props, ...(action.payload ?? {}) });
    return;
  }

  if (action.kind === "chat.invoke") {
    if (!ctx.chatInvoke) {
      throw new Error("chat.invoke unavailable");
    }
    const template = String(action.payload?.template ?? "");
    const message = interpolateTemplate(template, ctx.props);
    await ctx.chatInvoke(message);
    return;
  }

  if (action.kind.startsWith("panel.")) {
    const method = action.kind.slice("panel.".length);
    const fn = ctx.panelApi?.[method];
    if (!fn) {
      throw new Error(`${action.kind} unavailable`);
    }
    const args = (action.payload?.args as unknown[] | undefined) ?? [];
    await fn(...args);
    return;
  }
}
