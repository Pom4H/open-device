import { describe, expect, test } from "bun:test";

import { parseEquipmentCatalog, parseTopologyExtension, TOPOLOGY_EXTENSION } from "./equipment-catalog.ts";

const CATALOG_URL = new URL("../../../examples/catalog/open-device-catalog.json", import.meta.url);

describe("equipment catalog", () => {
  test("indexes the reference equipment packages", async () => {
    const catalog = parseEquipmentCatalog(await Bun.file(CATALOG_URL).json());
    expect(catalog.entries).toHaveLength(14);
    expect(new Set(catalog.entries.map((entry) => entry.alias)).size).toBe(14);
    expect(catalog.entries.filter((entry) => entry.renderer === "centrifugal-pump")).toHaveLength(1);
    expect(catalog.entries.filter((entry) => entry.renderer === "package-view").length).toBeGreaterThanOrEqual(8);
  });

  test("rejects malformed entries", () => {
    expect(() => parseEquipmentCatalog({ catalogVersion: "0.1", id: "x", title: "x", entries: [{ alias: 42 }] })).toThrow("Invalid equipment catalog document");
  });

  test("parses the topology-node extension of every package-view entry", async () => {
    const catalog = parseEquipmentCatalog(await Bun.file(CATALOG_URL).json());
    for (const entry of catalog.entries.filter((candidate) => candidate.renderer === "package-view")) {
      const manifestUrl = new URL(`../../../examples${entry.manifest.replace("/packages", "")}`, import.meta.url);
      const manifest = await Bun.file(manifestUrl).json() as { extensions?: Record<string, unknown>; views?: unknown[] };
      const topology = parseTopologyExtension(manifest.extensions);
      expect(topology).not.toBeNull();
      expect(Object.keys(topology!.ports).length).toBeGreaterThan(0);
      expect(manifest.views?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("rejects malformed topology extensions", () => {
    expect(parseTopologyExtension(undefined)).toBeNull();
    expect(parseTopologyExtension({ [TOPOLOGY_EXTENSION]: { width: 100 } })).toBeNull();
    expect(parseTopologyExtension({ [TOPOLOGY_EXTENSION]: { width: 100, height: 100, ports: { p: { x: 1, y: 2, side: "middle" } } } })).toBeNull();
    expect(parseTopologyExtension({ [TOPOLOGY_EXTENSION]: { width: 100, height: 100, ports: { p: { x: 1, y: 2, side: "left", signal: "digital" } } } })).toEqual({
      width: 100,
      height: 100,
      ports: { p: { x: 1, y: 2, side: "left", signal: "digital" } },
    });
    expect(parseTopologyExtension({ [TOPOLOGY_EXTENSION]: { view: "front-panel", width: 10, height: 10, ports: { p: { x: 1, y: 2, side: "top" } } } })?.view).toBe("front-panel");
  });
});
