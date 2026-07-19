import { resolvePackage } from "@open-device/core";
import { hasErrors, type Diagnostic } from "@open-device/spec";

export function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const diagnostic of diagnostics) {
    const icon = diagnostic.severity === "error" ? "✖" : "▲";
    console.log(`${icon} ${diagnostic.severity} ${diagnostic.path} — ${diagnostic.message}`);
  }
}

export async function check(location: string): Promise<number> {
  const pkg = await resolvePackage(location, { mode: "source" });
  const model = await pkg.loadModel();
  printDiagnostics(pkg.diagnostics);

  console.log(
    `✔ ${pkg.manifest.name}@${pkg.manifest.version} (${pkg.manifest.kind}) — ` +
      `${model.ports.length} ports, ${model.parameters?.length ?? 0} parameters, ` +
      `${pkg.manifest.logic?.length ?? 0} logic, ${pkg.manifest.scenarios?.length ?? 0} scenarios`,
  );
  return hasErrors(pkg.diagnostics) ? 1 : 0;
}
