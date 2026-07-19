# AGENTS.md — repository guide

This file is the starting context for AI agents and contributors working in this
repository.

## What this project is

Open Device is a vendor-neutral, web-native package format and toolchain for
describing physical and logical devices as code. It covers identity, ports, signals,
configuration, telemetry, browser views, executable behavior, scenarios, evidence,
and registry resolution.

The project is independent from LanMon Cloud and Saturn. They may provide early
adapters and reference profiles, but product-specific protocols, deployment, cloud
infrastructure, and authorization must not enter the neutral core.

## Status

The repository is pre-alpha. The first vertical slice is implemented (manifest
validation, sandboxed view host, scalar Wasm runtime, scenario runner, evidence,
CLI check/test/pack, pump-controller example, playground). Do not treat draft
documents as a stable public standard. Prefer a narrow end-to-end implementation
over speculative completeness.

## Read before changing architecture

Read these files in order:

1. `README.md`
2. `docs/principles.md`
3. `docs/architecture.md`
4. `docs/package-format.md`
5. `docs/runtime-abi.md`
6. `docs/scenarios-and-evidence.md`
7. relevant files under `docs/adr/`

Any decision that changes package compatibility, trust boundaries, runtime behavior,
or registry semantics requires an ADR.

## Intended monorepo

```text
apps/website          explanatory landing page and public documentation
apps/playground       browser package inspector and simulator
packages/spec         schemas and normative examples
packages/core         resolver, validation, integrity, dependency graph
packages/view-host    sandboxed browser presentation host
packages/runtime      WebAssembly host and ABI bindings
packages/scenario     scenario runner and evidence generation
packages/cli          developer workflow
profiles/saturn-fbd   target-specific .fbdbin profile
examples              complete, testable vendor packages
```

## Tooling

- Package manager, development runtime, test runner, and bundler: Bun.
- Use Bun workspaces from the root `package.json`; do not add pnpm, npm, Yarn,
  Corepack, Vite, or a Node-specific task runner.
- Browser-facing packages must use standard browser APIs and must not depend on Bun
  APIs at runtime.
- TypeScript should be strict.
- Do not add a task orchestrator until package count or CI duration justifies it.

Expected root commands once packages exist:

```sh
bun install
bun run dev
bun run build
bun run typecheck
bun run test
bun run lint
```

## Architectural invariants

1. **A definition is not an instance.** Packages describe models and artifacts;
   consumer systems own addresses, credentials, current state, and deployment state.
2. **Core stays vendor-neutral.** Saturn, LanMon, Modbus, and other integrations live
   in profiles or adapters.
3. **Views do not command hardware directly.** A view emits an intent. The host
   applies authorization, confirmation, audit, and protocol behavior.
4. **Untrusted views are sandboxed.** Dependency-mode HTML runs in a restricted iframe
   and communicates through the documented message protocol.
5. **Logic is deterministic by default.** A runtime receives time, inputs, and seed
   from the host. It has no ambient network, filesystem, wall clock, or randomness.
6. **Program and engine are separate concepts.** A package may contain standalone
   Wasm or program data executed by a shared Wasm runtime.
7. **Scenarios run against the released artifact.** A parallel TypeScript model may
   help authoring but cannot be the only release gate.
8. **Evidence is immutable and digest-bound.** Any source, program, runtime, scenario,
   or runner change invalidates prior evidence.
9. **Quality is part of every live value.** Values crossing a host boundary carry
   quality and source timestamp; invalid data must not silently become valid state.
10. **Deployment is out of scope for the registry.** Activation, rollback, and
    controller credentials belong to an audited platform adapter.
11. **Imported fidelity has multiple axes.** Runtime compatibility, source
    recoverability, and semantic confidence must not be collapsed into one flag.
12. **Immutable release URLs and integrity are mandatory.** Mutable aliases may exist
    only as discovery conveniences.

## Web standards policy

Prefer HTTPS, JSON Schema, HTML, CSS, ES modules, Web Components, iframe sandboxing,
`postMessage`, WebAssembly core modules, Web Crypto, and standard HTTP caching.

Do not expose React components, npm resolution rules, Emscripten glue, an OCI
registry, or a specific cloud SDK as normative parts of the specification. They may
be implementation adapters.

WIT may be used as an authoring description, but v0.1 must still compile to a browser-
executable core Wasm ABI without requiring native Component Model support.

## Documentation conventions

- Public documentation, schemas, code identifiers, and UI copy are English.
- Use RFC 2119 terms only in documents explicitly marked normative.
- Examples must clearly distinguish placeholders from live URLs.
- Keep one canonical definition; link to it instead of duplicating requirements.
- Update the glossary when introducing a new domain term.
- ADRs are immutable after acceptance except for typo fixes; supersede them with a
  new ADR when a decision changes.

## Implementation conventions

- Preserve runtime-neutral domain types in `packages/spec` and `packages/core`.
- Validate all data received from packages, iframe messages, Wasm memory, and remote
  registries.
- Put browser-only and Node-only entry points in explicit exports.
- Avoid framework dependencies in public protocols and schemas.
- Include digest and provenance in errors involving resolved artifacts.
- Prefer fixture packages under `examples/` over mocks for cross-package tests.
- Add tests at the trust boundary: manifest validation, path handling, integrity,
  iframe messages, Wasm resource limits, scenario evidence, and dependency cycles.

## Commit and review conventions

- Conventional commits, lowercase: `feat: ...`, `docs: ...`, `chore: ...`.
- Keep format changes and implementation changes separable when possible.
- A PR changing a public schema must include migration notes and updated normative
  examples.
- Never commit credentials, private device programs, customer topology, or vendor
  material without a compatible license.
