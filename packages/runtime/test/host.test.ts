import { beforeAll, describe, expect, test } from "bun:test";

import type { LogicBindings } from "@open-device/spec";

import { CyclicControlInstance, RuntimeError } from "../src/index.ts";

const MODULE_URL = new URL(
  "../../../examples/pump-controller/logic/controller.wasm",
  import.meta.url,
);

const BINDINGS: LogicBindings = {
  inputs: ["pressure", "auto-mode", "emergency-stop", "pump-feedback"],
  outputs: ["pump-command", "alarm"],
  params: ["setpoint-low", "setpoint-high", "start-delay-ms", "feedback-timeout-ms"],
};

let moduleBytes: Uint8Array;

beforeAll(async () => {
  moduleBytes = await Bun.file(MODULE_URL).bytes();
});

async function makeInstance(): Promise<CyclicControlInstance> {
  return CyclicControlInstance.instantiate(moduleBytes, BINDINGS);
}

describe("CyclicControlInstance", () => {
  test("outputs are unknown before the first step", async () => {
    const instance = await makeInstance();
    expect(instance.readOutput("pump-command").quality).toBe("unknown");
  });

  test("hysteresis with start delay drives the pump command", async () => {
    const instance = await makeInstance();
    instance.writeInputs({
      "pressure": { value: 1.0 },
      "auto-mode": { value: true },
      "emergency-stop": { value: false },
      "pump-feedback": { value: false },
    });
    for (let i = 0; i < 19; i += 1) instance.step(100_000n);
    expect(instance.readOutput("pump-command").value).toBe(0);
    for (let i = 0; i < 2; i += 1) instance.step(100_000n);
    expect(instance.readOutput("pump-command").value).toBe(1);
    expect(instance.readOutput("pump-command").quality).toBe("good");
  });

  test("writeInputs routes retained parameters to od_configure", async () => {
    const instance = await makeInstance();
    instance.writeInputs({ "setpoint-low": { value: 1.9 } });
    expect(instance.readParam("setpoint-low")).toBeCloseTo(1.9);
  });

  test("time only advances through step", async () => {
    const instance = await makeInstance();
    instance.writeInputs({
      "pressure": { value: 1.0 },
      "auto-mode": { value: true },
      "emergency-stop": { value: false },
      "pump-feedback": { value: false },
    });
    // A single large step is one scan cycle: 2.5 s of elapsed time clears
    // the 2 s start delay without reaching the 3 s feedback timeout.
    instance.step(2_500_000n);
    expect(instance.readOutput("pump-command").value).toBe(1);
    expect(instance.readOutput("alarm").value).toBe(0);
  });

  test("unknown port IDs are rejected", async () => {
    const instance = await makeInstance();
    expect(() => instance.writeInput("nonexistent", 1)).toThrow(RuntimeError);
    expect(() => instance.readOutput("nonexistent")).toThrow(RuntimeError);
  });

  test("cold reset restores parameter defaults, warm reset keeps them", async () => {
    const instance = await makeInstance();
    instance.configure("setpoint-low", 1.8);
    instance.reset("warm");
    expect(instance.readParam("setpoint-low")).toBeCloseTo(1.8);
    instance.reset("cold");
    expect(instance.readParam("setpoint-low")).toBeCloseTo(1.5);
  });
});
