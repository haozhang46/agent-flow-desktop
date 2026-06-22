export function formatToolOutput(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object" && "content" in raw) {
    const content = (raw as { content?: unknown }).content;
    return typeof content === "string" ? content : JSON.stringify(content);
  }
  if (raw !== undefined) return JSON.stringify(raw);
  return undefined;
}
