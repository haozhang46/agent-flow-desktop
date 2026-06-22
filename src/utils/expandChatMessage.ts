import { formatFileForChat } from "./formatFileForChat";
import type { ChatAttachment } from "@agent-flow/shared-ui";

export async function expandChatMessage(
  text: string,
  attachments: ChatAttachment[],
  readFile: (path: string) => Promise<{ content: string }>,
): Promise<string> {
  const blocks: string[] = [];
  for (const a of attachments) {
    const file = await readFile(a.path);
    blocks.push(formatFileForChat(a.path, file.content));
  }
  const trimmed = text.trim();
  if (blocks.length && trimmed) return `${blocks.join("\n\n")}\n\n${trimmed}`;
  if (blocks.length) return blocks.join("\n\n");
  return trimmed;
}
