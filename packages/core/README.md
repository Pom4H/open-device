# `@open-device/core`

Package resolution, validation, integrity, dependency graphs, and port compatibility.

## Responsibilities

- load local packages in Bun development tools;
- load direct HTTPS packages through an injected fetch policy;
- validate schemas and cross-document invariants;
- normalize and contain artifact paths;
- verify SHA-256 integrity with Web Crypto-compatible APIs;
- resolve exact dependency graphs and detect cycles;
- expose structured diagnostics with package ID, URL, digest, and document path;
- validate semantic and physical port connections.

## Non-responsibilities

- rendering vendor HTML;
- executing Wasm;
- hardware protocols or deployment;
- registry accounts and authentication;
- product-specific authorization.

The core must expose browser-safe entry points. Bun-only filesystem helpers belong in
an explicit subpath rather than the default export.
