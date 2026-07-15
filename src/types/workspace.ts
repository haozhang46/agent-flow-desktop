/** Frontend mirrors of workspace.json shapes (no electron imports). */

export type WorkspaceRoot = {
  id: string;
  path: string;
  label: string;
};

export type WorkspaceFile = {
  version: 1;
  name: string;
  roots: WorkspaceRoot[];
  defaults?: {
    analyzeRootIds?: string[];
  };
};

export type ResolvedRoot = {
  id: string;
  path: string;
  label: string;
  absolutePath: string;
};

export type WorkspaceResponse = {
  workspace: WorkspaceFile;
  roots: ResolvedRoot[];
};
