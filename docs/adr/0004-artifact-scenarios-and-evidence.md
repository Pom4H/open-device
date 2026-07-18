# ADR-0004: Test released artifacts and bind evidence to digests

- Status: accepted
- Date: 2026-07-18

## Contex

An engineering editor may implement a convenient reference simulation in TypeScrip
while compiling a different graph or binary for the controller runtime. Scenario
results from the reference simulation do not prove that the target artifact behaves
the same way. Imported binaries also may execute exactly while their original source
and semantics are only partially recoverable.

## Decision

Portable scenarios are declarative data and must be executable against the resolved
release artifact.

For program mode, the test subject includes both program and shared runtime. Evidence
records exact digests for the manifest, dependency graph, logic, runtime, scenarios,
runner, and execution profile.

Editing any relevant input invalidates previous evidence. Reference simulations may
run as additional oracles, but a parallel implementation cannot be the only release
gate.

Runtime fidelity, source recoverability, and semantic confidence are reported as
independent provenance dimensions.

## Consequences

- Scenario files can be reused across browser, Bun, and independent runners.
- Release checks catch compiler/runtime drift rather than only authoring-model defects.
- Evidence is reproducible and auditable but is not a safety certification.
- Runners need deterministic time, reset, snapshots, resource limits, and stable
  diagnostics.
- Physical plant simulations remain composable packages rather than being hidden in
  controller logic.

## Alternatives considered

### Test only the source or reference model

Rejected because compiler, serialization, pin mapping, and target runtime defects remain
untested.

### Store only a boolean `verified`

Rejected because it loses the subject, method, versions, detailed results, and
invalidation relationship.

### Treat exact binary execution as full source recovery

Rejected because runtime compatibility and engineering intent are different claims.
