import {
  assertValidScenario,
  type EvidenceDocument,
  type LogicBindings,
  type Scenario,
  type ScenarioResult,
  type StandaloneLogic,
} from "@open-device/spec";
import { computeIntegrity, PackageError, type ResolvedPackage } from "@open-device/core";
import { CyclicControlInstance } from "@open-device/runtime";

import { runScenario } from "./run.ts";

export const RUNNER_NAME = "@open-device/scenario";
export const RUNNER_VERSION = "0.1.0";

export interface SuiteRun {
  evidence: EvidenceDocument;
  results: ScenarioResult[];
}

function selectLogic(pkg: ResolvedPackage, logicId?: string): StandaloneLogic {
  const entries = pkg.manifest.logic ?? [];
  const logic =
    logicId === undefined ? entries[0] : entries.find((entry) => entry.id === logicId);
  if (logic === undefined) {
    throw new PackageError(`package declares no logic entry${logicId ? ` "${logicId}"` : ""}`);
  }
  if (logic.mode !== "standalone") {
    throw new PackageError(
      "program-mode logic requires a shared runtime adapter; only standalone modules run in v0.1",
    );
  }
  if (logic.bindings === undefined) {
    throw new PackageError(`logic "${logic.id}" declares no scalar ABI bindings`);
  }
  return logic;
}

/**
 * Run every declared scenario against the actual packaged logic module and
 * produce a digest-bound evidence document.
 *
 * Until a signature envelope exists, evidence is a local regression record:
 * it identifies exactly what was executed, but does not prove the run to a
 * third party.
 */
export async function runSuite(
  pkg: ResolvedPackage,
  options: { logicId?: string; seed?: bigint } = {},
): Promise<SuiteRun> {
  const startedAt = performance.now();
  const logic = selectLogic(pkg, options.logicId);
  const bindings = logic.bindings as LogicBindings;
  const moduleBytes = await pkg.loadArtifact(logic.module);

  const scenarioRefs = (pkg.manifest.scenarios ?? []).filter(
    (ref) => ref.target === logic.id,
  );
  const scenarios: { scenario: Scenario; integrity: string }[] = [];
  for (const ref of scenarioRefs) {
    const bytes = await pkg.loadArtifact(ref.source);
    const scenario = assertValidScenario(JSON.parse(new TextDecoder().decode(bytes)));
    scenarios.push({ scenario, integrity: await computeIntegrity(bytes) });
  }

  const results: ScenarioResult[] = [];
  for (const { scenario } of scenarios) {
    const instance = await CyclicControlInstance.instantiate(moduleBytes, bindings, {
      seed: options.seed ?? 0n,
    });
    results.push(runScenario(instance, scenario));
  }

  const suiteDigestInput = new TextEncoder().encode(
    scenarios.map((entry) => entry.integrity).join("\n"),
  );
  const passed = results.filter((result) => result.result === "passed").length;
  const failed = results.length - passed;

  const evidence: EvidenceDocument = {
    evidenceVersion: "0.1",
    result: failed === 0 ? "passed" : "failed",
    subject: {
      packageId: pkg.manifest.id,
      packageVersion: pkg.manifest.version,
      manifestIntegrity: await computeIntegrity(pkg.manifestBytes),
      logicIntegrity: await computeIntegrity(moduleBytes),
    },
    suite: {
      integrity: await computeIntegrity(suiteDigestInput),
      scenarioCount: scenarios.length,
    },
    runner: {
      name: RUNNER_NAME,
      version: RUNNER_VERSION,
      engine: "core-wasm",
    },
    summary: {
      passed,
      failed,
      durationMs: Math.round(performance.now() - startedAt),
    },
    scenarios: results,
    createdAt: new Date().toISOString(),
  };
  return { evidence, results };
}
