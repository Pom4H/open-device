import { describe, expect, test } from "bun:test";

import { computeIntegrity, PackageError, resolvePackage, verifyIntegrity } from "../src/index.ts";

const EXAMPLE_DIR = new URL("../../../examples/pump-controller/", import.meta.url).pathname;

describe("integrity", () => {
  test("computes SRI-style sha256 digests", async () => {
    const bytes = new TextEncoder().encode("open device");
    const integrity = await computeIntegrity(bytes);
    expect(integrity).toMatch(/^sha256-[A-Za-z0-9+/]+={0,2}$/);
    expect(await verifyIntegrity(bytes, integrity)).toBe(true);
    expect(await verifyIntegrity(new TextEncoder().encode("tampered"), integrity)).toBe(false);
  });
});

describe("resolvePackage", () => {
  test("resolves a package directory and loads its model", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    expect(pkg.manifest.name).toBe("pump-controller");
    const model = await pkg.loadModel();
    expect(model.ports.map((port) => port.id)).toContain("pump-command");
    expect(model.parameters?.length).toBe(4);
  });

  test("verifies artifact integrity before returning bytes", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const tampered = {
      ...pkg.manifest.model,
      integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    };
    expect(pkg.loadArtifact(tampered)).rejects.toThrow(/integrity mismatch/);
  });

  test("verifies declared artifact size", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const wrongSize = { ...pkg.manifest.model, size: 1 };
    expect(pkg.loadArtifact(wrongSize)).rejects.toThrow(/expected 1 bytes/);
  });

  test("blocks hrefs that escape the package root", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    expect(() => pkg.resolveHref("../../package.json")).toThrow(PackageError);
  });

  test("rejects a structurally invalid manifest", async () => {
    const dir = `${process.env["TMPDIR"] ?? "/tmp"}open-device-test-${Date.now()}`;
    await Bun.write(`${dir}/open-device.json`, JSON.stringify({ manifestVersion: "0.1" }));
    expect(resolvePackage(dir)).rejects.toThrow(/invalid package manifest/);
  });
});
