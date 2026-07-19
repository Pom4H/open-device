# ADR-0006: Scalar core Wasm encoding for cyclic control v0.1

- Status: accepted
- Date: 2026-07-18

## Context

The runtime ABI document deliberately left exact binary encodings "subject to
implementation experiments". The first vertical slice (pump controller executed in
browser and Bun, scenario suite, digest-bound evidence) needed a concrete encoding
now, without waiting for a buffer or Component Model design.

Candidates considered during implementation:

1. UTF-8 JSON frames across the Wasm boundary — requires a JSON parser inside every
   module, which is heavy for PLC-style logic and awkward in AssemblyScript and C;
2. packed binary frames in shared memory — efficient but demands an allocation and
   layout contract before any experience exists;
3. scalar exports addressed by port index — no memory contract at all.

## Decision

`open-device:cyclic-control@0.1` v1 uses scalar exports (`od_create`,
`od_configure`, `od_read_param`, `od_write_input`, `od_step`, `od_read_output`,
`od_read_output_quality`, `od_reset`, `od_abi_version`), documented in
[runtime-abi.md](../runtime-abi.md).

- The manifest `logic.bindings` object maps semantic port and parameter IDs to
  numeric indexes; array position is the index.
- Values are `f64` (booleans 0/1), quality is an `i32` code, time is `i64`
  microseconds supplied by the host.
- A standalone module must declare no imports. The host verifies this before
  instantiation and rejects modules that ask for capabilities.
- One logical device per Wasm instance; JSON value frames remain the host-level
  TypeScript contract in `@open-device/runtime`.
- Snapshot/restore is excluded from v1 until the Saturn FBD profile demonstrates a
  workable memory contract.

## Consequences

- Modules stay tiny (the pump controller compiles to under 2 KB) and are trivial to
  author in AssemblyScript, C, Rust, or hand-written WAT.
- Structured outputs (events, diagnostics, display commands) do not fit scalar
  exports; a buffer-based frame encoding will be added as v2 when a real consumer
  needs it, with `od_abi_version` gating compatibility.
- String and enum signal types cannot cross the boundary yet; profiles must map
  them to numeric codes for now.
- The `bindings` arrays are release-critical data: reordering them changes the
  device without changing the module bytes, which is why they live in the
  integrity-covered manifest.

## Alternatives considered

### JSON frames inside the module

Rejected for v1: forces a parser and allocator into every logical device and makes
determinism audits harder.

### Shared-memory binary frames

Deferred to v2. Worth designing only after the FBD shared-runtime profile shows
which structures actually cross the boundary in practice.
