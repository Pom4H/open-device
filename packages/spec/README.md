# `@open-device/spec`

Normative schemas, vocabularies, media-type conventions, and examples.

This package must remain free of filesystem, network, UI framework, registry, and
target-runtime dependencies. Generated TypeScript types may be published alongside
schemas, but JSON documents remain the cross-language contract.

## Planned contents

```tex
schemas/
├── open-device-package.schema.json
├── device-model.schema.json
├── scenario.schema.json
└── evidence.schema.json
examples/
vocabulary/
```

The initial pre-alpha package envelope schema is available a
[`schemas/open-device-package.schema.json`](schemas/open-device-package.schema.json).
The model document schema — ports with semantic and physical layers, terminals,
and the compilable `faceplate` block (enclosure, mounting, strips, display,
indicators, controls) — is available a
[`schemas/device-model.schema.json`](schemas/device-model.schema.json).
Both exist to make the first implementation concrete and are not a compatibility
promise.

## First task

Turn the examples in [`docs/package-format.md`](../../docs/package-format.md) and
[`docs/scenarios-and-evidence.md`](../../docs/scenarios-and-evidence.md) into draf
2020-12 JSON Schemas with positive and negative fixtures.
