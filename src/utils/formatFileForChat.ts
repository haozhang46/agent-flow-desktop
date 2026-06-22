export function formatFileForChat(path: string, content: string): string {
  return `--- ${path} ---\n${content}\n--- end ${path} ---`;
}
