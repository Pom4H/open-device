# ADR-0005: Use Bun for monorepo tooling

- Status: accepted
- Date: 2026-07-18

## Contex

The project needs a package manager, workspace runner, TypeScript development runtime,
test runner, and browser build path. Using multiple overlapping tools at the beginning
would increase setup and maintenance before the package architecture is validated.

The project owner explicitly selected Bun, and the existing LanMon Cloud work already
uses Bun successfully.

## Decision

Use Bun for package installation, workspaces, TypeScript execution, tests, scripts,
and bundling where a bundle is required.

- Workspaces are declared in the root `package.json`.
- The lock file is `bun.lockb` for the currently selected Bun line; migration to a
  newer Bun lock format requires a deliberate toolchain update.
- Root commands use `bun install`, `bun run`, and `bun test`.
- Do not add pnpm, npm, Yarn, Corepack, Vite, or a Node-specific task runner unless a
  later ADR demonstrates a requirement Bun cannot satisfy.
- Browser-facing runtime code remains based on standard browser APIs and must no
  depend on Bun APIs after build.

## Consequences

- New contributors need only Bun for the initial toolchain.
- Package scripts and CI examples must be tested under the pinned Bun version.
- Packages may still produce standard ESM, HTML, CSS, JSON, and Wasm artifacts usable
  without Bun.
- Compatibility with Node.js may be useful for selected libraries but is not the
  primary development contract.

## Alternatives considered

### pnpm plus Node.js

Rejected by project direction. It would add a second runtime and package-managemen
surface without helping the web package format itself.

### Bun plus Vite

Deferred. The landing page and playground should first use Bun's HTML imports and
bundler. A later tool may be introduced only for a concrete missing capability.
