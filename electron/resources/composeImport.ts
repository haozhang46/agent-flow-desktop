import yaml from "yaml";
import type { TopologyEdge, TopologyNode } from "./topology";
import type { NodeAccess, TopologyWithAccess } from "./opsTypes";

const MYSQL_IMAGES = ["mysql", "mariadb", "postgres", "postgresql", "mongo", "mongodb"];
const REDIS_IMAGES = ["redis", "memcached"];

function inferKind(
  serviceName: string,
  image: string | null | undefined,
): { kind: TopologyNode["kind"]; engine?: string } {
  const imageLower = (image ?? "").toLowerCase();
  if (MYSQL_IMAGES.some((t) => imageLower.includes(t))) {
    let engine = "mysql";
    if (imageLower.includes("postgres")) engine = "postgres";
    if (imageLower.includes("mongo")) engine = "mongodb";
    return { kind: "database", engine };
  }
  if (REDIS_IMAGES.some((t) => imageLower.includes(t))) {
    return { kind: "cache", engine: "redis" };
  }
  if (imageLower.includes("nginx") || serviceName.toLowerCase() === "nginx") {
    return { kind: "gateway" };
  }
  return { kind: "service" };
}

function defaultAccessForKind(
  kind: TopologyNode["kind"],
  serviceId: string,
): NodeAccess {
  if (kind === "database" || kind === "cache") {
    return { mode: "managed-instance", instanceRef: serviceId };
  }
  return {
    mode: "host-ssh",
    hostRef: "vps-dev",
    deployRef: "compose-dev",
    service: serviceId,
  };
}

export function importComposeToTopology(
  content: string,
  projectId: string,
): TopologyWithAccess {
  const doc = yaml.parse(content) as {
    services?: Record<
      string,
      {
        image?: string;
        depends_on?: string[] | Record<string, unknown>;
        environment?: Record<string, string> | string[];
      }
    >;
  };

  const services = doc.services ?? {};
  const nodes: TopologyWithAccess["nodes"] = [];

  for (const [serviceId, service] of Object.entries(services)) {
    const { kind, engine } = inferKind(serviceId, service.image);
    nodes.push({
      id: serviceId,
      kind,
      engine,
      image: service.image ?? null,
      ports: [],
      access: defaultAccessForKind(kind, serviceId),
    });
  }

  const edges: TopologyEdge[] = [];
  for (const [serviceId, service] of Object.entries(services)) {
    let dependsOn = service.depends_on ?? [];
    if (!Array.isArray(dependsOn)) {
      dependsOn = Object.keys(dependsOn);
    }
    for (const dep of dependsOn) {
      edges.push({ from: serviceId, to: dep, env: {} });
    }
  }

  return {
    version: 1,
    project: projectId,
    nodes,
    edges,
    targets: [{ id: "dev", type: "docker-compose", env: "dev" }],
  };
}
