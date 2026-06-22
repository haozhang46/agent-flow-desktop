import type http from "node:http";

/** Max chars per SSE message before splitting (avoids one TCP packet for huge chunks). */
const MESSAGE_SLICE = 20;

export function prepareSseResponse(res: http.ServerResponse): void {
  res.socket?.setNoDelay(true);
}

export function writeSse(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  const flushable = res as http.ServerResponse & { flush?: () => void };
  flushable.flush?.();
}

export function drainSseTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Write assistant text; split large chunks and yield the event loop between writes. */
export async function writeSseMessageContent(
  res: http.ServerResponse,
  content: string,
): Promise<void> {
  if (!content) return;
  if (content.length <= MESSAGE_SLICE) {
    writeSse(res, "message", { content });
    await drainSseTick();
    return;
  }
  for (let i = 0; i < content.length; i += MESSAGE_SLICE) {
    writeSse(res, "message", { content: content.slice(i, i + MESSAGE_SLICE) });
    await drainSseTick();
  }
}
