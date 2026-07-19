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
- validate semantic and physical port connections;
- compile the model's `faceplate` block into a deterministic front-panel SVG with
  terminal and mounting anchors (`src/svg.ts`).

## Compiled front panel

The device model is the core artifact: consumers derive presentation from it
instead of shipping vendor artwork. `compileFrontPanelSvg(model, { title, version })`
returns the SVG string, its view box, and `anchors` — terminal and mounting
coordinates (in SVG units and millimeters) that wiring tools, cabinet layouts,
and SCADA editors can snap to without rendering anything.

The compiled markup exposes a stable hook contract (v0.1):

- `data-layer="model|view|logic"` — spotlight groups per package layer;
- `.port[data-port][data-terminal]` — one group per physical terminal;
- `[data-bind="port:<id>|state:<name>"]` — text slots owned by running logic
  (for example a Wasm firmware module driving the display);
- `[data-indicator]`, `[data-control]`, `[data-mount]` — LEDs and rotors,
  operator controls, mounting features.

Hosts write live values into `data-bind` slots; the compiler never encodes
instance state.

## Non-responsibilities

- rendering vendor HTML;
- executing Wasm;
- hardware protocols or deployment;
- registry accounts and authentication;
- product-specific authorization.

The core must expose browser-safe entry points. Bun-only filesystem helpers belong in
an explicit subpath rather than the default export.
