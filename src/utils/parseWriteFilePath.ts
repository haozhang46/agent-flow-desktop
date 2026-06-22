const WRITE_FILE_OUTPUT_RE = /^Wrote (.+?) \(\d+ bytes\)$/;

export function parseWriteFilePath(output: string | undefined): string | null {
  if (!output) return null;
  const m = output.match(WRITE_FILE_OUTPUT_RE);
  return m?.[1]?.trim() ?? null;
}
