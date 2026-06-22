const SOURCE_BY_ID: Record<string, string> = {
  api: "backend",
  backend: "backend",
  "fe-web": "fe",
  web: "fe",
  fe: "fe",
  desktop: "desktop",
  electron: "desktop",
  nginx: "deploy/nginx",
};

export function defaultSourceForNodeId(id: string): string {
  return SOURCE_BY_ID[id.trim().toLowerCase()] ?? "";
}
