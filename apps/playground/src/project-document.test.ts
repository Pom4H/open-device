import { describe, expect, test } from "bun:test";

import { parseEngineeringProject } from "./project-document.ts";

function projectFixture(): Record<string, unknown> {
  return {
    projectVersion: "0.1",
    id: "booster-station-ps01",
    title: "Booster station PS-01",
    instances: [
      {
        id: "tank",
        adapter: "reservoir",
        definition: { id: "https://devices.example/tank", version: "1.0.0", alias: "@example/tank", renderer: "suction-tank" },
        title: "Tank",
        subtitle: "TK-101",
        position: { x: 20, y: 40 },
      },
    ],
    connections: [],
    programs: [],
  };
}

describe("engineering project document", () => {
  test("accepts a consumer-owned instance scene", () => {
    expect(parseEngineeringProject(projectFixture()).instances[0]?.definition.alias).toBe("@example/tank");
  });

  test("rejects duplicate instance IDs", () => {
    const project = projectFixture();
    project["instances"] = [...project["instances"] as unknown[], ...(project["instances"] as unknown[])];
    expect(() => parseEngineeringProject(project)).toThrow("duplicate instance IDs");
  });

  test("rejects connections to missing instances", () => {
    const project = projectFixture();
    project["connections"] = [{ id: "pipe", from: { instanceId: "tank", portId: "outlet" }, to: { instanceId: "missing", portId: "inlet" } }];
    expect(() => parseEngineeringProject(project)).toThrow("unknown instance");
  });

  test("accepts the import fixture used by the Playground", async () => {
    const fixture = await Bun.file(new URL("../test/fixtures/minimal-engineering-project.json", import.meta.url)).json();
    const project = parseEngineeringProject(fixture);
    expect(project.instances).toHaveLength(2);
    expect(project.connections).toHaveLength(1);
  });
});
