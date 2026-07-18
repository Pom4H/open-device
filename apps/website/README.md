# `@open-device/website`

Public landing page and documentation site.

## Product goal

Explain "physical devices as code" to a manufacturer or industrial developer in less
than two minutes, then let them inspect a real package without leaving the page.

The approved content structure is in [`docs/landing-page.md`](../../docs/landing-page.md).

## Implementation direction

- Bun dev server and bundler; no Vite.
- Semantic HTML and responsive CSS as the foundation.
- Minimal client JavaScript, standard browser APIs, and accessible diagrams.
- Reuse the real view host and pump example when they exist; do not build a fake demo
  that follows a different protocol.
- Static-deployable output.
- Excellent light and dark themes, with status color reserved for actual meaning.

## First slice

1. Hero, package anatomy, architecture, and roadmap sections.
2. Links to the repository documentation.
3. A package-card component driven by a checked-in example manifest.
4. Later, embed the playground's real sandboxed view.

## Current implementation

`public/` contains a static, dependency-free landing page:

- `index.html` — semantic markup plus one `<template>` holding the SVG front panel
  of a fictional reference device (FLOW NODE PC-2040); the template is cloned into
  every section where the device appears.
- `twin.js` — a single simulated pump-controller instance (state + naive process
  model + overpressure interlock) that drives all clones at once: hero, catalog
  card, docs embed, engineering view, simulation trend, SCADA mimic, and a
  scenario runner whose evidence digest is computed with `crypto.subtle`.
- `styles.css` — dark technical theme, `prefers-reduced-motion` respected.

Run locally:

```sh
bun run dev   # serves public/ at http://localhost:4173
```

The output is fully static; deploy `public/` as-is. The simulated twin is a
placeholder for the real view host and pump example — replace it once
`@open-device/view-host` and the pump-controller package exist.
