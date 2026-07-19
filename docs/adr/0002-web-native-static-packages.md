# ADR-0002: Web-native static package envelope

- Status: accepted
- Date: 2026-07-18

## Context

Device packages should work in browser documentation, simulators, SCADA editors,
vendor catalogs, and offline engineering tools. Starting with npm or OCI would provide
existing publication infrastructure but would make ordinary browser consumption and
vendor-controlled hosting indirect.

The desired authoring materials are already web-native: JSON models, HTML/CSS views,
ES modules, images, and WebAssembly.

## Decision

The canonical package is a static set of files rooted at `open-device.json`.

- HTTPS URLs provide canonical identity and artifact resolution.
- JSON and JSON Schema describe the package and models.
- HTML/CSS provide browser presentations.
- Core WebAssembly modules provide executable behavior.
- SHA-256 integrity and immutable version URLs identify release bytes.
- A public registry indexes packages but packages may remain vendor-hosted.
- npm, OCI, Git, and archives may be supported as transports or developer adapters,
  not as the normative data model.

## Consequences

- A package can be hosted on static object storage or a documentation origin.
- Browser consumers do not need an npm or OCI client.
- The resolver must implement strong URL, redirect, path, origin, byte, and integrity
  policies.
- Source packages and packed releases need distinct validation modes.
- Namespace verification and signing remain separate registry protocols.

## Alternatives considered

### npm packages as the canonical form

Rejected because npm naming, install behavior, JavaScript conventions, and lifecycle
scripts are unnecessary for non-JavaScript consumers and untrusted device content.

### OCI artifacts as the canonical form

Deferred as a transport adapter. OCI is strong for distribution but not directly
consumable by browsers and would impose registry infrastructure on small vendors.

### A centralized database-only registry

Rejected because vendor-owned static origins and offline mirrors are important for
longevity and adoption.
