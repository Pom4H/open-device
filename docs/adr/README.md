# Architecture decision records

ADRs record decisions that affect compatibility, trust boundaries, package semantics,
runtime behavior, or the development platform.

Statuses:

- `proposed` — open for implementation feedback;
- `accepted` — current decision;
- `deprecated` — retained for history but discouraged;
- `superseded` — replaced by a later ADR.

Accepted ADRs are not rewritten when a decision changes. Add a new ADR that supersedes
the old one.

## Index

- [ADR-0001: Independent vendor-neutral core](0001-independent-vendor-neutral-core.md)
- [ADR-0002: Web-native static package envelope](0002-web-native-static-packages.md)
- [ADR-0003: Separate program data from runtime engines](0003-program-runtime-separation.md)
- [ADR-0004: Test released artifacts and bind evidence to digests](0004-artifact-scenarios-and-evidence.md)
- [ADR-0005: Use Bun for monorepo tooling](0005-bun-toolchain.md)
- [ADR-0006: Scalar core Wasm encoding for cyclic control v0.1](0006-scalar-core-wasm-abi.md)

## Template

```markdown
# ADR-NNNN: Title

- Status: proposed
- Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Alternatives considered
```
