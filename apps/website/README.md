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
