import { describe, expect, test } from "bun:test";

import {
  checkHref,
  hasErrors,
  validateDeviceModel,
  validatePackageManifest,
  validateScenario,
} from "../src/index.ts";

const EXAMPLE_DIR = new URL("../../../examples/pump-controller/", import.meta.url);
const EQUIPMENT_EXAMPLES = ["saturn-plc", "pressure-transmitter", "centrifugal-pump", "suction-tank", "process-header", "emergency-stop"];

async function exampleManifest(): Promise<Record<string, unknown>> {
  return (await Bun.file(new URL("open-device.json", EXAMPLE_DIR)).json()) as Record<
    string,
    unknown
  >;
}

describe("validatePackageManifest", () => {
  test("accepts the pump-controller source manifest", async () => {
    const diagnostics = validatePackageManifest(await exampleManifest(), "source");
    expect(hasErrors(diagnostics)).toBe(false);
  });

  test("source mode warns about unpinned executable artifacts", async () => {
    const diagnostics = validatePackageManifest(await exampleManifest(), "source");
    expect(diagnostics.some((d) => d.code === "integrity-missing" && d.severity === "warning")).toBe(
      true,
    );
  });

  test("release mode rejects unpinned artifacts", async () => {
    const diagnostics = validatePackageManifest(await exampleManifest(), "release");
    expect(diagnostics.some((d) => d.code === "integrity-missing" && d.severity === "error")).toBe(
      true,
    );
  });

  test("rejects a manifest missing required fields", () => {
    const diagnostics = validatePackageManifest({ manifestVersion: "0.1" });
    expect(hasErrors(diagnostics)).toBe(true);
  });

  test("semver ranges validate in source mode but fail the release profile", async () => {
    const manifest = await exampleManifest();
    manifest["dependencies"] = {
      "fbd-runtime": { id: "https://runtimes.example.com/fbd-runtime", version: "^11.0.0" },
    };
    expect(hasErrors(validatePackageManifest(manifest, "source"))).toBe(false);
    const release = validatePackageManifest(manifest, "release");
    expect(release.some((d) => d.code === "dependency-range")).toBe(true);
    expect(release.some((d) => d.code === "dependency-integrity")).toBe(true);
  });

  test("program logic must reference a declared dependency", async () => {
    const manifest = await exampleManifest();
    manifest["logic"] = [
      {
        id: "controller",
        mode: "program",
        abi: "open-device:cyclic-control@0.1",
        program: { href: "./logic/program.fbdbin", mediaType: "application/octet-stream" },
        runtime: "fbd-runtime#engine",
      },
    ];
    const diagnostics = validatePackageManifest(manifest, "source");
    expect(diagnostics.some((d) => d.code === "runtime-unresolved")).toBe(true);
  });
});

describe("checkHref", () => {
  test("rejects package-root escapes", () => {
    expect(checkHref("../secrets.json", "/model/href", "source")).not.toHaveLength(0);
    expect(checkHref("./a/../../b.json", "/model/href", "source")).not.toHaveLength(0);
    expect(checkHref("./model/../logic/x.wasm", "/model/href", "source")).toHaveLength(0);
  });

  test("rejects file: and data: URLs in a release", () => {
    expect(checkHref("file:///etc/passwd", "/model/href", "release")[0]?.severity).toBe("error");
    expect(checkHref("data:text/html,hi", "/model/href", "release")[0]?.severity).toBe("error");
    expect(checkHref("https://vendor.example.com/a.wasm", "/model/href", "release")).toHaveLength(0);
  });

  test("rejects credentialed URLs", () => {
    expect(
      checkHref("https://user:pass@vendor.example.com/a.wasm", "/model/href", "source"),
    ).not.toHaveLength(0);
  });
});

describe("validateDeviceModel", () => {
  test("accepts the pump-controller model", async () => {
    const model = await Bun.file(new URL("model/device-model.json", EXAMPLE_DIR)).json();
    expect(validateDeviceModel(model)).toHaveLength(0);
  });

  test("rejects duplicate port IDs", () => {
    const model = {
      modelVersion: "0.1",
      ports: [
        { id: "a", title: "A", direction: "input", domain: "signal" },
        { id: "a", title: "A again", direction: "output", domain: "signal" },
      ],
    };
    expect(validateDeviceModel(model).some((d) => d.code === "duplicate-id")).toBe(true);
  });

  test("accepts every equipment package in the reference catalog", async () => {
    for (const name of EQUIPMENT_EXAMPLES) {
      const root = new URL(`../../../examples/${name}/`, import.meta.url);
      const manifest = await Bun.file(new URL("open-device.json", root)).json();
      const model = await Bun.file(new URL("model/device-model.json", root)).json();
      expect(hasErrors(validatePackageManifest(manifest, "source"))).toBe(false);
      expect(validateDeviceModel(model)).toHaveLength(0);
    }
  });
});

describe("validateScenario", () => {
  test("accepts every packaged pump scenario", async () => {
    const glob = new Bun.Glob("scenarios/*.json");
    let count = 0;
    for await (const path of glob.scan({ cwd: EXAMPLE_DIR.pathname })) {
      const scenario = await Bun.file(new URL(path, EXAMPLE_DIR)).json();
      expect(validateScenario(scenario)).toHaveLength(0);
      count += 1;
    }
    expect(count).toBe(7);
  });

  test("rejects unknown step shapes", () => {
    const scenario = {
      scenarioVersion: "0.1",
      id: "x",
      title: "X",
      target: "controller",
      steps: [{ sleep: 100 }],
    };
    expect(validateScenario(scenario)).not.toHaveLength(0);
  });
});
