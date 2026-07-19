# WebAssembly runtime ABI

Status: behavioral draft for `open-device:cyclic-control@0.1`. Exact binary encodings
remain subject to implementation experiments and an acceptance ADR.

## Purpose

The runtime ABI lets a browser or Bun-based tool execute logical devices without
knowing their source language. It supports two distribution modes:

- **standalone** — the Wasm module contains device behavior;
- **program** — a shared Wasm engine loads target program bytes.

The host-facing lifecycle is the same in both modes.

## Lifecycle

```text
instantiate runtime
      ↓
create instance with configuration
      ↓
load program (program mode only)
      ↓
write input frame
      ↓
step by explicit elapsed time
      ↓
read output and diagnostic frame
      ↓
snapshot / restore or destroy
```

The current Saturn FBD reference maps this to:

```text
fbdInit → fbdSetMemory → fbdDoStep / fbdDoStepEx
```

That mapping belongs to the Saturn profile. The neutral ABI does not expose FBD
element types, numeric Saturn pin IDs, or controller-specific HMI calls.

## Behavioral operations

| Operation | Required | Purpose |
| --- | --- | --- |
| `abiVersion` | yes | Negotiate host/runtime compatibility |
| `create` | yes | Create an isolated logical instance |
| `loadProgram` | program mode | Load immutable program bytes |
| `configure` | optional | Apply validated configuration and parameters |
| `writeInputs` | yes | Supply a complete or delta input frame |
| `step` | yes | Advance by host-provided elapsed time |
| `readOutputs` | yes | Read outputs, watchpoints, events, and diagnostics |
| `snapshot` | recommended | Export deterministic mutable state |
| `restore` | recommended | Resume from a compatible snapshot |
| `reset` | yes | Return to a declared reset mode |
| `destroy` | yes | Release instance-owned resources |

The first implementation may expose these operations through a small C-compatible
core Wasm ABI and UTF-8 JSON frames. WIT can describe the interface for authoring and
code generation, but browsers must be able to run the resulting core module without
native Component Model support.

## Scalar core encoding v1 (implemented)

The first implementation experiment (ADR-0006) encodes the behavioral operations as
plain scalar exports. JSON value frames remain the host-level TypeScript contract in
`@open-device/runtime`; nothing string-shaped crosses the Wasm boundary:

```text
od_abi_version() -> i32                                 // must return 1
od_create(seed: i64) -> i32                             // 0 = ok
od_configure(param: i32, value: f64) -> i32
od_read_param(param: i32) -> f64
od_write_input(input: i32, value: f64, quality: i32) -> i32
od_step(elapsed_us: i64) -> i32
od_read_output(output: i32) -> f64
od_read_output_quality(output: i32) -> i32
od_reset(mode: i32) -> i32                              // 0 cold, 1 warm
```

- Port and parameter indexes come from the manifest `logic.bindings` arrays.
- Quality codes: 0 good, 1 stale, 2 bad, 3 unknown. Booleans are 0/1 in `f64`.
- A standalone module must declare no imports; the host rejects modules that do.
- One logical device per Wasm instance (isolation strategy 2).
- Snapshot/restore is not part of encoding v1; it returns when the FBD reference
  profile proves the memory contract.

A richer buffer-based frame encoding (events, diagnostics, strings) is expected to
supersede this after the FBD shared-runtime profile lands; the behavioral contract
above stays.

## Logical instance isolation

A runtime must support one of these explicit strategies:

1. multiple handles in one Wasm instance; or
2. one logical device per Wasm instance.

Singleton globals are acceptable only under strategy 2 and must be declared in the
runtime metadata. The host must never accidentally share NVRAM, timers, alarms, or
draw buffers between device instances.

## Value frame

Every value crossing the host boundary has a descriptor in the package model and a
sample in a runtime frame:

```json
{
  "sequence": 42,
  "sourceTime": "2026-07-18T08:30:00.000Z",
  "values": {
    "pressure": {
      "value": 1.7,
      "quality": "good",
      "sourceTime": "2026-07-18T08:29:59.950Z"
    },
    "emergency-stop": {
      "value": false,
      "quality": "good"
    }
  }
}
```

Draft quality vocabulary:

- `good` — valid for control and display;
- `stale` — last known value is too old;
- `bad` — known invalid or failed acquisition;
- `unknown` — no usable value has been observed.

Profiles may preserve more detailed source quality codes in namespaced metadata, but
must map them to the core vocabulary.

## Time and determinism

- `step` receives elapsed monotonic time from the host, preferably integer
  microseconds.
- The runtime cannot read wall-clock time directly.
- Event timestamps are provided as data, not obtained from an ambient clock.
- Random behavior uses an explicit deterministic seed.
- The same program, initial snapshot, configuration, input frames, seed, and step
  sequence must produce the same outputs.
- Floating-point behavior that cannot meet cross-engine reproducibility must be
  declared by the profile and covered by tolerances in scenarios.

## Configuration, setpoints, and watchpoints

The neutral model distinguishes:

- immutable program metadata;
- configuration validated before instantiation;
- mutable retained parameters such as setpoints;
- read-only diagnostics and watchpoints;
- normal inputs and outputs.

Profiles map these concepts to their runtime. For example, an FBD runtime may expose
SP and WP indexes while the package model gives them stable semantic IDs.

## Snapshot contract

A snapshot includes only deterministic runtime state: retained parameters, timers,
latches, internal memory, and optional plant state. It excludes credentials, host
handles, current network connections, and deployment state.

Snapshot metadata identifies:

```json
{
  "abi": "open-device:cyclic-control@0.1",
  "programIntegrity": "sha256-...",
  "runtimeIntegrity": "sha256-...",
  "schemaVersion": "1",
  "sequence": 42
}
```

Restore must fail closed when program, runtime, or snapshot schema is incompatible.

## Capabilities and imports

The default runtime receives only bounded memory and explicitly named host imports.
It has no WASI filesystem, sockets, environment variables, wall clock, process APIs,
or dynamic code loading.

Candidate explicit capabilities include:

- structured diagnostic logging;
- deterministic random bytes;
- display command output;
- bounded persistent key/value state;
- declared protocol simulation supplied by a test harness.

Capabilities are granted by host policy, not merely because a package requests them.

## Resource limits

Before execution, the host sets limits for:

- initial and maximum Wasm memory;
- program and snapshot bytes;
- input/output frame bytes;
- step duration or instruction fuel;
- events and diagnostics per step;
- display commands and string-pool bytes;
- number of instances.

A limit violation terminates or quarantines the logical instance and produces a typed
host diagnostic. It must not partially authorize hardware output.

## Display output

A target runtime may emit display primitives for emulating a controller-local HMI.
Those commands are target-profile data, not the browser view ABI. A profile adapter
may translate them to Canvas or SVG for inspection.

The vendor's normal browser presentation remains HTML/CSS and follows the iframe
message protocol in [Browser views](views.md).

## Initial implementation sequence

1. Specify TypeScript host interfaces and JSON frames.
2. Adapt the existing FBD bridge behind those interfaces.
3. Execute one instance per Wasm module instance.
4. Add snapshot/restore around FBD memory and retained parameters.
5. Run portable scenarios against the actual `.fbdbin` artifact.
6. Stabilize a compact binary ABI only after profiling the working vertical slice.
