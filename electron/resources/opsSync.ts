import { createTopologyClient } from "./topologyClient";
import type { Topology } from "./topology";
import type { TopologyWithAccess } from "./opsTypes";

export function stripAccessForServer(topology: TopologyWithAccess): Topology {
  return {
    version: 1,
    project: topology.project,
    nodes: topology.nodes.map(({ id, kind, runtime, engine, image, ports }) => ({
      id,
      kind,
      runtime,
      engine,
      image,
      ports,
    })),
    edges: topology.edges,
    targets: topology.targets ?? [],
  };
}

export async function syncTopologyToServer(
  workspaceRoot: string,
  resourceServerUrl: string,
  topology: TopologyWithAccess,
): Promise<Topology> {
  const client = createTopologyClient(resourceServerUrl, workspaceRoot);
  if (!client) {
    throw new Error("Resource Server URL is not configured");
  }
  return client.saveTopology(stripAccessForServer(topology));
}
