import { describe, expect, test } from "bun:test";

import type { DeviceModel } from "@open-device/spec";

import { compileFrontPanelSvg, computeAnchors, resolvePackage } from "../src/index.ts";

const EXAMPLE_DIR = new URL("../../../examples/pump-controller/", import.meta.url).pathname;

describe("compileFrontPanelSvg", () => {
  test("compiles the pump-controller faceplate deterministically", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const model = await pkg.loadModel();
    const first = compileFrontPanelSvg(model, { title: pkg.manifest.title, version: pkg.manifest.version });
    const second = compileFrontPanelSvg(model, { title: pkg.manifest.title, version: pkg.manifest.version });
    expect(first.svg).toBe(second.svg);
    expect(first.svg).toStartWith("<svg");
    expect(first.viewBox.width).toBeGreaterThan(0);
  });

  test("emits the compiled-view contract hooks", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const model = await pkg.loadModel();
    const { svg } = compileFrontPanelSvg(model);
    expect(svg).toContain('data-layer="model"');
    expect(svg).toContain('data-port="pressure"');
    expect(svg).toContain('data-terminal="AI1"');
    expect(svg).toContain('data-bind="port:pressure"');
    expect(svg).toContain('data-bind="state:status"');
    expect(svg).toContain('data-indicator="rotor"');
    expect(svg).toContain('data-control="identify"');
    expect(svg).toContain('data-mount="panel"');
  });

  test("anchors every terminal in both SVG units and millimeters", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const model = await pkg.loadModel();
    const anchors = computeAnchors(model);
    const terminals = anchors.filter((anchor) => anchor.kind === "terminal");
    expect(terminals.map((anchor) => anchor.id)).toEqual([
      "L+",
      "M",
      "A",
      "B",
      "AI1",
      "DI1",
      "DI2",
      "DI3",
      "DO1",
      "DO2",
    ]);
    expect(terminals.find((anchor) => anchor.id === "AI1")?.port).toBe("pressure");
    for (const anchor of terminals) {
      expect(anchor.mmX).toBeGreaterThan(0);
      expect(anchor.mmX).toBeLessThan(200);
      expect(anchor.mmY).toBeGreaterThan(0);
      expect(anchor.mmY).toBeLessThan(150);
    }
  });

  test("rejects a model without a faceplate", () => {
    const model: DeviceModel = { modelVersion: "0.1", ports: [] };
    expect(() => compileFrontPanelSvg(model)).toThrow(/no faceplate/);
  });

  test("rejects an enclosure that cannot fit the layout", () => {
    const model: DeviceModel = {
      modelVersion: "0.1",
      ports: [],
      faceplate: { units: "mm", enclosure: { width: 60, height: 40 } },
    };
    expect(() => compileFrontPanelSvg(model)).toThrow(/80 × 60/);
  });

  test("rejects a terminal strip that overflows the panel", () => {
    const model: DeviceModel = {
      modelVersion: "0.1",
      ports: [
        {
          id: "bus",
          title: "Bus",
          direction: "bidirectional",
          domain: "network",
          terminals: Array.from({ length: 12 }, (_, index) => ({
            label: `T${index}`,
            strip: "main",
            index,
          })),
        },
      ],
      faceplate: {
        units: "mm",
        enclosure: { width: 100, height: 80 },
        strips: [{ id: "main", edge: "bottom", pitch: 20 }],
      },
    };
    expect(() => compileFrontPanelSvg(model)).toThrow(/does not fit/);
  });
});
