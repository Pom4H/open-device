import type { LogicBindings, Quality, Sample, ValueFrame } from "@open-device/spec";

import {
  QUALITY_CODES,
  QUALITY_NAMES,
  REQUIRED_EXPORTS,
  RESET_MODES,
  SCALAR_ABI_VERSION,
  type ScalarAbiExports,
} from "./abi.ts";

export class RuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeError";
  }
}

function toScalar(value: number | boolean): number {
  return typeof value === "boolean" ? (value ? 1 : 0) : value;
}

export interface InstanceOptions {
  seed?: bigint;
  /** Maximum linear memory the module may declare, in 64 KiB pages. */
  maxMemoryPages?: number;
}

/**
 * Host for one standalone logical device implementing the scalar
 * cyclic-control ABI. The host owns time: the device only advances when
 * `step` is called with explicit elapsed time.
 */
export class CyclicControlInstance {
  readonly bindings: LogicBindings;
  #exports: ScalarAbiExports;
  #sequence = 0;

  private constructor(exports: ScalarAbiExports, bindings: LogicBindings) {
    this.#exports = exports;
    this.bindings = bindings;
  }

  static async instantiate(
    moduleBytes: Uint8Array,
    bindings: LogicBindings,
    options: InstanceOptions = {},
  ): Promise<CyclicControlInstance> {
    const module = await WebAssembly.compile(moduleBytes as BufferSource);
    if (WebAssembly.Module.imports(module).length > 0) {
      throw new RuntimeError(
        "a standalone cyclic-control module must not declare imports; " +
          "capabilities are granted by host policy only",
      );
    }
    const instance = await WebAssembly.instantiate(module);
    const exports = instance.exports as unknown as ScalarAbiExports;
    for (const name of REQUIRED_EXPORTS) {
      if (typeof exports[name] !== "function") {
        throw new RuntimeError(`module does not export required ABI function "${name}"`);
      }
    }
    const abiVersion = exports.od_abi_version();
    if (abiVersion !== SCALAR_ABI_VERSION) {
      throw new RuntimeError(
        `module implements scalar ABI v${abiVersion}, host supports v${SCALAR_ABI_VERSION}`,
      );
    }
    if (exports.memory !== undefined && options.maxMemoryPages !== undefined) {
      const pages = exports.memory.buffer.byteLength / 65536;
      if (pages > options.maxMemoryPages) {
        throw new RuntimeError(
          `module memory (${pages} pages) exceeds the host limit of ${options.maxMemoryPages}`,
        );
      }
    }
    const created = exports.od_create(options.seed ?? 0n);
    if (created !== 0) {
      throw new RuntimeError(`od_create failed with code ${created}`);
    }
    return new CyclicControlInstance(exports, bindings);
  }

  #inputIndex(id: string): number {
    const index = this.bindings.inputs.indexOf(id);
    if (index === -1) throw new RuntimeError(`"${id}" is not a bound input`);
    return index;
  }

  #paramIndex(id: string): number {
    const index = (this.bindings.params ?? []).indexOf(id);
    if (index === -1) throw new RuntimeError(`"${id}" is not a bound parameter`);
    return index;
  }

  /** True when the ID is a bound retained parameter rather than an input. */
  isParameter(id: string): boolean {
    return (this.bindings.params ?? []).includes(id);
  }

  writeInput(id: string, value: number | boolean, quality: Quality = "good"): void {
    const code = this.#exports.od_write_input(
      this.#inputIndex(id),
      toScalar(value),
      QUALITY_CODES[quality],
    );
    if (code !== 0) throw new RuntimeError(`od_write_input(${id}) failed with code ${code}`);
  }

  writeInputs(values: Record<string, { value: number | boolean; quality?: Quality }>): void {
    for (const [id, sample] of Object.entries(values)) {
      if (this.isParameter(id)) {
        this.configure(id, toScalar(sample.value));
      } else {
        this.writeInput(id, sample.value, sample.quality ?? "good");
      }
    }
  }

  configure(id: string, value: number | boolean): void {
    const code = this.#exports.od_configure(this.#paramIndex(id), toScalar(value));
    if (code !== 0) throw new RuntimeError(`od_configure(${id}) failed with code ${code}`);
  }

  readParam(id: string): number {
    return this.#exports.od_read_param(this.#paramIndex(id));
  }

  /** Advance by explicit elapsed time. The module never sees a wall clock. */
  step(elapsedUs: bigint): void {
    const code = this.#exports.od_step(elapsedUs);
    if (code !== 0) throw new RuntimeError(`od_step failed with code ${code}`);
    this.#sequence += 1;
  }

  readOutput(id: string): Sample {
    const index = this.bindings.outputs.indexOf(id);
    if (index === -1) throw new RuntimeError(`"${id}" is not a bound output`);
    const qualityCode = this.#exports.od_read_output_quality(index);
    return {
      value: this.#exports.od_read_output(index),
      quality: QUALITY_NAMES[qualityCode] ?? "unknown",
    };
  }

  readOutputs(): ValueFrame {
    const values: Record<string, Sample> = {};
    for (const id of this.bindings.outputs) {
      values[id] = this.readOutput(id);
    }
    return { sequence: this.#sequence, values };
  }

  reset(mode: "cold" | "warm"): void {
    const code = this.#exports.od_reset(RESET_MODES[mode]);
    if (code !== 0) throw new RuntimeError(`od_reset(${mode}) failed with code ${code}`);
  }
}
