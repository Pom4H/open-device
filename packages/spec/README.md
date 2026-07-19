# `@open-device/spec`

Normative schemas, vocabularies, media-type conventions, and examples.

This package must remain free of filesystem, network, UI framework, registry, and
target-runtime dependencies. Generated TypeScript types may be published alongside
schemas, but JSON documents remain the cross-language contract.

## Contents

```text
schemas/
├── open-device-package.schema.json   # manifest envelope
├── device-model.schema.json          # declarative device model
├── scenario.schema.json              # portable scenario steps
└── evidence.schema.json              # digest-bound run results
src/
├── types.ts                          # TypeScript mirror of the schemas
└── validate.ts                       # Ajv validation + source/release profiles
```

All four draft 2020-12 schemas exist and are exercised by `bun test` against the
pump-controller example. They make the first implementation concrete and are not a
compatibility promise.

`validatePackageManifest(data, mode)` adds the rules JSON Schema cannot express:
release-mode integrity pinning, exact dependency versions, href scheme and
path-containment policy, and program-runtime reference resolution.

## Next task

Add positive and negative fixtures under `fixtures/` and a normative example
vocabulary for units and physical signal kinds.
