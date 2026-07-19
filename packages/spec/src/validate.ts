import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import packageSchema from "../schemas/open-device-package.schema.json";
import modelSchema from "../schemas/device-model.schema.json";
import scenarioSchema from "../schemas/scenario.schema.json";
import evidenceSchema from "../schemas/evidence.schema.json";

import type {
  ArtifactRef,
  DeviceModel,
  Diagnostic,
  EvidenceDocument,
  PackageManifest,
  Scenario,
  ValidationMode,
} from "./types.ts";

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validators: Record<"package" | "model" | "scenario" | "evidence", ValidateFunction> = {
  package: ajv.compile(packageSchema),
  model: ajv.compile(modelSchema),
  scenario: ajv.compile(scenarioSchema),
  evidence: ajv.compile(evidenceSchema),
};

const EXACT_SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function schemaDiagnostics(validate: ValidateFunction, subject: string): Diagnostic[] {
  return (validate.errors ?? []).map((error) => ({
    code: "schema",
    severity: "error" as const,
    path: `${subject}${error.instancePath}`,
    message: `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
  }));
}

/**
 * Package-relative hrefs must stay inside the package root after
 * normalization. Absolute HTTPS URLs are allowed; other schemes are not
 * allowed in a release.
 */
export function checkHref(href: string, path: string, mode: ValidationMode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)) {
    let parsed: URL | undefined;
    try {
      parsed = new URL(href);
    } catch {
      diagnostics.push({
        code: "href-invalid",
        severity: "error",
        path,
        message: `"${href}" is not a valid URL`,
      });
      return diagnostics;
    }
    if (parsed.protocol !== "https:") {
      diagnostics.push({
        code: "href-scheme",
        severity: mode === "release" ? "error" : "warning",
        path,
        message: `"${parsed.protocol}" URLs are not allowed in a release; use https: or a package-relative path`,
      });
    }
    if (parsed.username !== "" || parsed.password !== "") {
      diagnostics.push({
        code: "href-credentials",
        severity: "error",
        path,
        message: "credentialed URLs are not allowed",
      });
    }
    return diagnostics;
  }

  let depth = 0;
  for (const segment of href.split("/")) {
    if (segment === "" || segment === ".") continue;
    depth += segment === ".." ? -1 : 1;
    if (depth < 0) {
      diagnostics.push({
        code: "href-escape",
        severity: "error",
        path,
        message: `"${href}" escapes the package root`,
      });
      break;
    }
  }
  return diagnostics;
}

interface NamedArtifact {
  path: string;
  artifact: ArtifactRef;
  /** Executable code, program data, and scenarios always need integrity in a release. */
  executable: boolean;
}

function collectArtifacts(manifest: PackageManifest): NamedArtifact[] {
  const artifacts: NamedArtifact[] = [
    { path: "/model", artifact: manifest.model, executable: false },
  ];
  for (const [index, view] of (manifest.views ?? []).entries()) {
    artifacts.push({ path: `/views/${index}/entrypoint`, artifact: view.entrypoint, executable: true });
  }
  for (const [index, logic] of (manifest.logic ?? []).entries()) {
    if (logic.mode === "standalone") {
      artifacts.push({ path: `/logic/${index}/module`, artifact: logic.module, executable: true });
    } else {
      artifacts.push({ path: `/logic/${index}/program`, artifact: logic.program, executable: true });
    }
  }
  for (const [index, scenario] of (manifest.scenarios ?? []).entries()) {
    artifacts.push({ path: `/scenarios/${index}/source`, artifact: scenario.source, executable: true });
  }
  return artifacts;
}

/**
 * Validate a package manifest.
 *
 * `source` mode checks the structural shape and href policy and reports
 * missing integrity as warnings. `release` mode is what `device pack`
 * enforces: every artifact carries integrity, dependencies pin an exact
 * version with a manifest digest, and non-HTTPS URL schemes are errors.
 */
export function validatePackageManifest(
  data: unknown,
  mode: ValidationMode = "source",
): Diagnostic[] {
  if (!validators.package(data)) {
    return schemaDiagnostics(validators.package, "");
  }
  const manifest = data as PackageManifest;
  const diagnostics: Diagnostic[] = [];

  for (const { path, artifact, executable } of collectArtifacts(manifest)) {
    diagnostics.push(...checkHref(artifact.href, `${path}/href`, mode));
    if (artifact.integrity === undefined) {
      if (mode === "release") {
        diagnostics.push({
          code: "integrity-missing",
          severity: "error",
          path: `${path}/integrity`,
          message: "a release manifest must pin every artifact with sha256 integrity",
        });
      } else if (executable) {
        diagnostics.push({
          code: "integrity-missing",
          severity: "warning",
          path: `${path}/integrity`,
          message: "executable artifacts should be integrity-pinned; `device pack` will compute this",
        });
      }
    }
  }

  for (const [name, dependency] of Object.entries(manifest.dependencies ?? {})) {
    if (mode === "release") {
      if (!EXACT_SEMVER.test(dependency.version)) {
        diagnostics.push({
          code: "dependency-range",
          severity: "error",
          path: `/dependencies/${name}/version`,
          message: `"${dependency.version}" is a range; a release must pin an exact version`,
        });
      }
      if (dependency.integrity === undefined) {
        diagnostics.push({
          code: "dependency-integrity",
          severity: "error",
          path: `/dependencies/${name}/integrity`,
          message: "a release must pin the dependency manifest digest",
        });
      }
    }
  }

  for (const [index, logic] of (manifest.logic ?? []).entries()) {
    if (logic.mode === "program") {
      const dependencyName = logic.runtime.split("#")[0] ?? "";
      if (manifest.dependencies?.[dependencyName] === undefined) {
        diagnostics.push({
          code: "runtime-unresolved",
          severity: "error",
          path: `/logic/${index}/runtime`,
          message: `runtime reference "${logic.runtime}" does not match any declared dependency`,
        });
      }
    }
  }

  return diagnostics;
}

export function validateDeviceModel(data: unknown): Diagnostic[] {
  if (!validators.model(data)) {
    return schemaDiagnostics(validators.model, "");
  }
  const model = data as DeviceModel;
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const item of [...model.ports, ...(model.parameters ?? [])]) {
    if (seen.has(item.id)) {
      diagnostics.push({
        code: "duplicate-id",
        severity: "error",
        path: `/ports/${item.id}`,
        message: `port or parameter ID "${item.id}" is declared more than once`,
      });
    }
    seen.add(item.id);
  }
  return diagnostics;
}

export function validateScenario(data: unknown): Diagnostic[] {
  return validators.scenario(data) ? [] : schemaDiagnostics(validators.scenario, "");
}

export function validateEvidence(data: unknown): Diagnostic[] {
  return validators.evidence(data) ? [] : schemaDiagnostics(validators.evidence, "");
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function assertValidScenario(data: unknown): Scenario {
  const diagnostics = validateScenario(data);
  if (diagnostics.length > 0) {
    throw new Error(`invalid scenario: ${diagnostics.map((d) => d.message).join("; ")}`);
  }
  return data as Scenario;
}

export function assertValidEvidence(data: unknown): EvidenceDocument {
  const diagnostics = validateEvidence(data);
  if (diagnostics.length > 0) {
    throw new Error(`invalid evidence: ${diagnostics.map((d) => d.message).join("; ")}`);
  }
  return data as EvidenceDocument;
}
