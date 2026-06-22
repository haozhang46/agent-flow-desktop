export function streamChunkText(content: unknown): string {
  if (content == null || content === false) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (typeof block === "string") {
        parts.push(block);
      } else if (block && typeof block === "object") {
        const rec = block as { type?: string; text?: string };
        if (rec.type === "text" && typeof rec.text === "string") {
          parts.push(rec.text);
        }
      }
    }
    return parts.join("");
  }
  return String(content);
}
