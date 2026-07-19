import type {
  Comparator,
  Quality,
  Sample,
  Scenario,
  ScenarioResult,
  ScenarioStep,
} from "@open-device/spec";
import { CyclicControlInstance } from "@open-device/runtime";

function describeComparator(comparator: Comparator): string {
  return JSON.stringify(comparator);
}

function asBooleanLike(value: number | boolean): number {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

export function compare(sample: Sample, comparator: Comparator): string | undefined {
  if ("equals" in comparator) {
    const expected = asBooleanLike(comparator.equals);
    const actual = asBooleanLike(sample.value);
    if (typeof comparator.equals === "boolean") {
      if ((actual !== 0) !== comparator.equals) {
        return `expected ${comparator.equals}, observed ${actual !== 0}`;
      }
      return undefined;
    }
    if (actual !== expected) {
      return `expected ${expected}, observed ${actual}`;
    }
    return undefined;
  }
  if ("approx" in comparator) {
    const actual = asBooleanLike(sample.value);
    const delta = Math.abs(actual - comparator.approx.value);
    if (delta > comparator.approx.tolerance) {
      return `expected ${comparator.approx.value} ± ${comparator.approx.tolerance}, observed ${actual}`;
    }
    return undefined;
  }
  if ("quality" in comparator) {
    if (sample.quality !== comparator.quality) {
      return `expected quality "${comparator.quality}", observed "${sample.quality}"`;
    }
    return undefined;
  }
  const actual = asBooleanLike(sample.value);
  if (comparator.min !== undefined && actual < comparator.min) {
    return `expected ≥ ${comparator.min}, observed ${actual}`;
  }
  if (comparator.max !== undefined && actual > comparator.max) {
    return `expected ≤ ${comparator.max}, observed ${actual}`;
  }
  return undefined;
}

function readSubject(instance: CyclicControlInstance, id: string): Sample {
  if (instance.bindings.outputs.includes(id)) {
    return instance.readOutput(id);
  }
  if (instance.isParameter(id)) {
    return { value: instance.readParam(id), quality: "good" satisfies Quality };
  }
  throw new Error(`"${id}" is neither a bound output nor a bound parameter`);
}

function runStep(
  instance: CyclicControlInstance,
  step: ScenarioStep,
  stepIndex: number,
  failures: string[],
): void {
  if ("write" in step) {
    instance.writeInputs(step.write);
    return;
  }
  if ("tick" in step) {
    const cycles = Math.max(1, Math.round(step.tick.durationMs / step.tick.periodMs));
    const periodUs = BigInt(Math.round(step.tick.periodMs * 1000));
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      instance.step(periodUs);
    }
    return;
  }
  if ("expect" in step) {
    for (const [id, comparator] of Object.entries(step.expect)) {
      const failure = compare(readSubject(instance, id), comparator);
      if (failure !== undefined) {
        failures.push(`step ${stepIndex} "${id}": ${failure} (${describeComparator(comparator)})`);
      }
    }
    return;
  }
  instance.reset(step.reset);
}

/**
 * Execute one portable scenario against a live instance. The caller decides
 * instance lifetime; the runner applies the scenario's declared reset before
 * the first step.
 */
export function runScenario(instance: CyclicControlInstance, scenario: Scenario): ScenarioResult {
  instance.reset(scenario.reset ?? "cold");
  const failures: string[] = [];
  for (const [index, step] of scenario.steps.entries()) {
    runStep(instance, step, index, failures);
  }
  if (failures.length > 0) {
    return { id: scenario.id, result: "failed", failures };
  }
  return { id: scenario.id, result: "passed" };
}
