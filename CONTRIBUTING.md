# Contributing

Open Device is pre-alpha and documentation-first. The most useful early contributions
are real device examples, challenges to the package boundaries, security reviews, and
small vertical implementation slices.

## Before opening a change

1. Read `README.md`, `AGENTS.md`, and `docs/principles.md`.
2. Read the ADRs related to your change.
3. Search existing issues and discussions.
4. Open a spec proposal before implementing a compatibility-affecting change.

Target-specific ideas are welcome, but they should become profiles or adapters rather
than assumptions in the neutral core.

## Development setup

Install Bun, then run:

```sh
bun install
bun run typecheck
bun run tes
bun run lin
```

The root Bun runner skips tasks that a workspace has not implemented yet and propagates
real failures once a task exists. The pinned Bun version is declared in the roo
`package.json`.

## Pull requests

- Keep the change narrow and explain the user or implementer outcome.
- Use conventional commits in lowercase: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
- Add or update tests at affected trust boundaries.
- Update normative examples and migration notes for public schema changes.
- Add an ADR for changes to compatibility, trust, runtime, registry, or package
  semantics.
- Do not mix copied vendor code with neutral specification changes.
- Preserve third-party license and copyright notices.

## Spec proposals

A proposal should include:

- concrete device or consumer use case;
- package examples before and after the change;
- effect on browser, Bun, and non-TypeScript consumers;
- security and resource-limit implications;
- compatibility and migration plan;
- alternatives considered;
- whether the idea belongs in core, a profile, or an adapter.

## Device examples

Do not contribute customer topology, credentials, proprietary controller programs, or
hardware documentation without permission. Synthetic and vendor-approved examples are
preferred. State the source and license of every imported binary or dataset.

## Language

Public documentation, code, identifiers, schema descriptions, and UI copy are English.
Issue discussions may use any language that participants can review effectively.

## License

Unless explicitly marked otherwise, contributions are accepted under Apache-2.0 as
described in the repository license.
