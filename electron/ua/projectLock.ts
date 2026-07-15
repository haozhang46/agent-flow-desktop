export type LockKind = "analyze" | "generate";

const locks = new Map<string, LockKind>();

export function acquireProjectLock(root: string, kind: LockKind): void {
  const held = locks.get(root);
  if (held) {
    throw new Error(`${held} in progress`);
  }
  locks.set(root, kind);
}

export function releaseProjectLock(root: string, kind: LockKind): void {
  const held = locks.get(root);
  if (held === kind) {
    locks.delete(root);
  }
}

export function getProjectLock(root: string): LockKind | null {
  return locks.get(root) ?? null;
}
