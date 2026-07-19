/**
 * Concrete core Wasm encoding for `open-device:cyclic-control@0.1`,
 * scalar profile v1 (see docs/runtime-abi.md and ADR-0006).
 *
 * One logical device per Wasm instance (isolation strategy 2). Ports and
 * parameters cross the boundary as scalar f64 values addressed by the
 * numeric index of their ID in the manifest `logic.bindings` arrays.
 * Booleans are encoded as 0/1. No imports are provided: the module has no
 * ambient time, randomness, or I/O.
 */

export const ABI_CYCLIC_CONTROL_0_1 = "open-device:cyclic-control@0.1";
export const SCALAR_ABI_VERSION = 1;

export const QUALITY_CODES = {
  good: 0,
  stale: 1,
  bad: 2,
  unknown: 3,
} as const;

export const QUALITY_NAMES = ["good", "stale", "bad", "unknown"] as const;

export const RESET_MODES = {
  cold: 0,
  warm: 1,
} as const;

export interface ScalarAbiExports {
  od_abi_version(): number;
  od_create(seed: bigint): number;
  od_configure(paramIndex: number, value: number): number;
  od_read_param(paramIndex: number): number;
  od_write_input(inputIndex: number, value: number, quality: number): number;
  od_step(elapsedUs: bigint): number;
  od_read_output(outputIndex: number): number;
  od_read_output_quality(outputIndex: number): number;
  od_reset(mode: number): number;
  memory: WebAssembly.Memory;
}

export const REQUIRED_EXPORTS: readonly (keyof ScalarAbiExports)[] = [
  "od_abi_version",
  "od_create",
  "od_configure",
  "od_read_param",
  "od_write_input",
  "od_step",
  "od_read_output",
  "od_read_output_quality",
  "od_reset",
];
