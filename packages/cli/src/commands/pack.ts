import { computeIntegrity, resolvePackage } from "@open-device/core";
import {
  hasErrors,
  validatePackageManifest,
  type ArtifactRef,
  type PackageManifest,
} from "@open-device/spec";

import { printDiagnostics } from "./check.ts";

/**
 * Produce an immutable release: copy every referenced artifact into the
 * output directory, pin integrity and size on each reference, and fail when
 * the result does not satisfy the release validation profile.
 */
export async function pack(location: string, outDir?: string): Promise<number> {
  const pkg = await resolvePackage(location, { mode: "source" });
  const manifest = structuredClone(pkg.manifest) as PackageManifest;
  const releaseDir = outDir ?? `dist/${manifest.name}-${manifest.version}`;

  const refs: ArtifactRef[] = [manifest.model];
  for (const view of manifest.views ?? []) refs.push(view.entrypoint);
  for (const logic of manifest.logic ?? []) {
    refs.push(logic.mode === "standalone" ? logic.module : logic.program);
  }
  for (const scenario of manifest.scenarios ?? []) refs.push(scenario.source);

  for (const ref of refs) {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(ref.href)) continue;
    const bytes = await pkg.loadArtifact(ref);
    ref.integrity = await computeIntegrity(bytes);
    ref.size = bytes.length;
    await Bun.write(`${releaseDir}/${ref.href.replace(/^\.\//, "")}`, bytes as unknown as Blob);
  }

  const diagnostics = validatePackageManifest(manifest, "release");
  printDiagnostics(diagnostics);
  if (hasErrors(diagnostics)) {
    console.error("✖ release validation failed; nothing was published");
    return 1;
  }

  const manifestJson = `${JSON.stringify(manifest, undefined, 2)}\n`;
  await Bun.write(`${releaseDir}/open-device.json`, manifestJson);
  const releaseIntegrity = await computeIntegrity(new TextEncoder().encode(manifestJson));
  console.log(`✔ release written to ${releaseDir}`);
  console.log(`  manifest ${releaseIntegrity}`);
  return 0;
}
