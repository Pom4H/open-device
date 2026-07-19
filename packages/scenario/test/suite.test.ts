import { describe, expect, test } from "bun:test";

import { resolvePackage } from "@open-device/core";
import { CyclicControlInstance } from "@open-device/runtime";
import { validateEvidence, type LogicBindings, type Scenario } from "@open-device/spec";

import { runScenario, runSuite } from "../src/index.ts";

const EXAMPLE_DIR = new URL("../../../examples/pump-controller/", import.meta.url).pathname;

describe("runSuite", () => {
  test("all packaged pump scenarios pass against the packaged artifact", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const { evidence, results } = await runSuite(pkg);

    expect(results).toHaveLength(7);
    expect(evidence.result).toBe("passed");
    expect(evidence.summary.failed).toBe(0);
    expect(evidence.suite.scenarioCount).toBe(7);
    expect(evidence.subject.manifestIntegrity).toStartWith("sha256-");
    expect(evidence.subject.logicIntegrity).toStartWith("sha256-");
    expect(validateEvidence(evidence)).toHaveLength(0);
  });

  test("evidence binds to exact artifact bytes", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const first = await runSuite(pkg);
    const second = await runSuite(pkg);
    // Same bytes, same digests — createdAt and duration may differ.
    expect(second.evidence.subject).toEqual(first.evidence.subject);
    expect(second.evidence.suite.integrity).toBe(first.evidence.suite.integrity);
  });
});

describe("runScenario", () => {
  test("a failing expectation produces a diagnosable failure", async () => {
    const pkg = await resolvePackage(EXAMPLE_DIR);
    const logic = pkg.manifest.logic?.[0];
    if (logic?.mode !== "standalone") throw new Error("unexpected logic mode");
    const moduleBytes = await pkg.loadArtifact(logic.module);
    const instance = await CyclicControlInstance.instantiate(
      moduleBytes,
      logic.bindings as LogicBindings,
    );

    const scenario: Scenario = {
      scenarioVersion: "0.1",
      id: "wrong-expectation",
      title: "Pump must not run at normal pressure",
      target: "controller",
      reset: "cold",
      steps: [
        {
          write: {
            "pressure": { value: 2.0, quality: "good" },
            "auto-mode": { value: true, quality: "good" },
            "emergency-stop": { value: false, quality: "good" },
            "pump-feedback": { value: false, quality: "good" },
          },
        },
        { tick: { durationMs: 500, periodMs: 100 } },
        { expect: { "pump-command": { equals: true } } },
      ],
    };

    const result = runScenario(instance, scenario);
    expect(result.result).toBe("failed");
    expect(result.failures?.[0]).toContain("pump-command");
    expect(result.failures?.[0]).toContain("expected true, observed false");
  });
});
