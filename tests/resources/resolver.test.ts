import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  formatResourceContextForPrompt,
  resolveResources,
  type ResolvedResource,
} from "../../electron/resources/resolver";

const sampleResourcesYaml = `resources:
  - { type: mysql, name: app-db, version: "8.0" }
  - { type: redis, name: cache }
`;

describe("resolveResources", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "af-resolver-"));
    await fs.mkdir(path.join(tmp, ".agentflow"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".agentflow/resources.yaml"), sampleResourcesYaml, "utf8");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("merges server config with local override (local wins)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          instances: {
            "app-db": {
              host: "db.team.example.com",
              port: 3306,
              database: "teamdb",
            },
            cache: {
              host: "redis.team.example.com",
              port: 6379,
            },
          },
        }),
      }),
    );

    const localYaml = `instances:
  app-db:
    host: localhost
    port: 3306
    database: myapp
    user: root
    dsn: mysql://root@localhost:3306/myapp
`;
    await fs.writeFile(
      path.join(tmp, ".agentflow/resource-instances.yaml"),
      localYaml,
      "utf8",
    );

    const resolved = await resolveResources(tmp, "http://resource-server:9000");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("http://resource-server:9000/v1/resources/config?project="),
    );
    expect(resolved).toEqual([
      {
        type: "mysql",
        name: "app-db",
        optional: undefined,
        instance: {
          host: "localhost",
          port: 3306,
          database: "myapp",
          user: "root",
          dsn: "mysql://root@localhost:3306/myapp",
        },
      },
      {
        type: "redis",
        name: "cache",
        optional: undefined,
        instance: {
          host: "redis.team.example.com",
          port: 6379,
        },
      },
    ]);
  });
});

describe("formatResourceContextForPrompt", () => {
  it("formats instance details", () => {
    const resources: ResolvedResource[] = [
      {
        type: "mysql",
        name: "app-db",
        instance: {
          host: "db.example.com",
          port: 3306,
          database: "myapp",
          user: "app",
        },
      },
      {
        type: "redis",
        name: "cache",
        instance: {
          host: "redis.example.com",
          port: 6379,
          dsn: "redis://redis.example.com:6379/0",
        },
      },
    ];

    const markdown = formatResourceContextForPrompt(resources);

    expect(markdown).toContain("## Available Server Resources");
    expect(markdown).toContain(
      "- mysql/app-db: host=db.example.com port=3306 database=myapp user=app",
    );
    expect(markdown).toContain(
      "- redis/cache: host=redis.example.com port=6379 dsn=redis://redis.example.com:6379/0",
    );
  });

  it("shows declaration-only when no instances", () => {
    const resources: ResolvedResource[] = [
      { type: "mysql", name: "app-db" },
      { type: "kafka", name: "events", optional: true },
    ];

    const markdown = formatResourceContextForPrompt(resources);

    expect(markdown).toContain("- mysql/app-db (declared, no connection details)");
    expect(markdown).toContain("- kafka/events (declared, no connection details)");
  });

  it("returns empty string for no resources", () => {
    expect(formatResourceContextForPrompt([])).toBe("");
  });
});
