# ADR-0003: Separate program data from runtime engines

- Status: accepted
- Date: 2026-07-18

## Contex

Some logical devices can ship as self-contained WebAssembly. Controller ecosystems
often use a stable engine with many programs encoded as data. In the first reference
case, a `.fbdbin` description is consumed by the same FBD runtime on the controller and
in a browser-compiled Wasm module.

Requiring every logical device to contain a unique Wasm module would duplicate engines,
hide target program identity, and make existing controller formats second-class.

## Decision

The package model supports two logic modes:

1. `standalone`: a Wasm module contains behavior;
2. `program`: program bytes reference a separately versioned runtime dependency.

Both modes implement the same host lifecycle: create, configure, write inputs, step,
read outputs, snapshot/restore, reset, and destroy.

Runtime, program, ABI, and profile versions are independent and independently
integrity-pinned. A target profile maps semantic port IDs to runtime-specific indexes
and types.

## Consequences

- Shared runtimes can be cached and security-reviewed independently.
- Evidence must identify both program and runtime digests.
- The host must isolate instances even when an engine uses global state internally.
- Emscripten-generated JavaScript glue may be an adapter, but the canonical executable
  artifact is raw `application/wasm`.
- Runtime compatibility becomes an explicit resolver concern.
- Controller-local HMI output remains profile-specific.

## Alternatives considered

### One Wasm module per device

Supported as `standalone`, but rejected as the only model because it poorly represents
PLC runtimes and duplicates shared engines.

### JavaScript runtime plugins

Rejected as the normative executable format because they are harder to isolate,
resource-limit, and run outside JavaScript hosts.

### Component Model required in v0.1

Deferred. WIT may describe authoring interfaces, but browser-native core Wasm execution
is required for the initial implementation.
