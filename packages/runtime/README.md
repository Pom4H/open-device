# `@open-device/runtime`

Browser- and Bun-compatible WebAssembly host for logical devices.

## Responsibilities

- instantiate integrity-verified core Wasm modules;
- support standalone and program-plus-runtime modes;
- provide explicit inputs, elapsed time, reset, and deterministic seed;
- validate all ABI pointers, lengths, frames, outputs, and diagnostics;
- enforce memory, execution, event, log, and display limits;
- isolate logical instances;
- snapshot and restore deterministic state;
- surface typed traps and profile diagnostics.

No filesystem, network, environment, wall clock, or arbitrary WASI imports are granted
by default.

See [`docs/runtime-abi.md`](../../docs/runtime-abi.md).
