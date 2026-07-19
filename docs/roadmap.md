# Roadmap

The roadmap is outcome-based. Dates and package boundaries may change as the first
vertical slice teaches us where the real interfaces belong.

## Milestone 0 — foundation

Goal: make architectural intent explicit enough for parallel development.

- [x] repository structure and project boundaries;
- [x] draft package, view, runtime, scenario, evidence, and registry documents;
- [x] initial ADRs;
- [x] machine-readable package, model, scenario, and evidence schemas;
- [ ] normative example vocabulary;
- [x] automated documentation and schema checks (`bun run check:docs`, `bun test`).

Exit criterion: a contributor can explain the package lifecycle and identify which
changes require an ADR.

## Milestone 1 — local package

Goal: turn `open-device.json` into an interactive device in a browser.

- `@open-device/spec` schemas and TypeScript types;
- `@open-device/core` local resolver and validator;
- `@open-device/view-host` sandboxed iframe protocol;
- a minimal `device dev` workflow;
- one static sensor and one pump controller example;
- clear structural validation diagnostics.

Exit criterion: the playground loads a local package, renders its HTML/CSS view, and
updates typed state without framework coupling.

## Milestone 2 — connections

Goal: validate connections between two device packages.

- semantic and physical port descriptors;
- direction, type, unit, range, quality, and exclusivity checks;
- connection diagnostics suitable for UI and CLI;
- composed harness representation;
- connection examples and negative fixtures.

Exit criterion: a user can connect two compatible ports and receive useful reasons for
every rejected connection.

Current reference slice: the Playground resolves a static six-package equipment
catalog, creates multiple instances per definition, composes signal and water-process
connections through reusable headers, and saves the consumer-owned topology as an
experimental project file.

## Milestone 3 — executable logic

Goal: execute deterministic logical devices through WebAssembly.

- `@open-device/runtime` host lifecycle;
- standalone module and `program + runtime` modes;
- explicit time, quality, reset, and resource limits;
- snapshot/restore;
- FBD runtime adapter using a raw `application/wasm` artifact;
- separation of browser view and target HMI renderer.

Exit criterion: the pump controller executes the same target program in browser and
Bun tests with reproducible outputs.

## Milestone 4 — scenarios and evidence

Goal: make releases testable and claims reproducible.

- portable scenario schema and runner;
- comparators, time progression, snapshots, and composed plant harness;
- full pump scenarios executed against actual `.fbdbin + runtime.wasm`;
- optional comparison with a reference TypeScript simulation;
- digest-bound evidence generation and invalidation;
- human-readable verification report.

Exit criterion: changing any program, runtime, scenario, or runner artifact invalidates
evidence, and a new test run produces a traceable result.

## Milestone 5 — developer release workflow

Goal: create immutable packages without a hosted registry.

- `device check`, `test`, `pack`, and `inspect`;
- release manifest integrity and dependency lock;
- local content-addressed cache;
- import/export of source-owned views;
- changelog and compatibility report;
- CI examples for vendor repositories.

Exit criterion: a vendor can publish a complete release as static HTTPS files.

## Milestone 6 — public registry and website

Goal: make packages discoverable and understandable.

- explanatory landing page and interactive examples;
- direct HTTPS resolver;
- vendor catalog ingestion;
- public search and package pages;
- namespace verification;
- deprecation, yanking, and advisories;
- publishing authentication and audit.

Exit criterion: a verified vendor can publish a version and a third-party playground
can discover, verify, and run it without private integration.

## Later, only after evidence

- signature and transparency model;
- federated registry protocol;
- OCI transport adapter;
- WIT/component authoring tools while preserving browser core Wasm output;
- broader physical signal vocabulary and bus topologies;
- formal compatibility and migration rules;
- independent conformance runner implementations;
- governance for a stable public specification.

## Explicit non-goals for v0.1

- controller deployment and firmware flashing;
- live telemetry storage;
- a general SCADA platform;
- safety certification;
- arbitrary vendor JavaScript in the host page;
- full digital-twin physics framework;
- universal reconstruction of imported graphical projects;
- committing to npm or OCI as the canonical registry.
