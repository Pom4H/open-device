# Package forma

Status: **draft v0.1**. This document is descriptive until an ADR marks a version
normative.

## Goals

The format must support static hosting, relative artifact references, immutable
releases, browser consumption, target-specific extensions, and offline development.
The manifest is named `open-device.json`.

## Minimal manifes

```json
{
  "$schema": "https://raw.githubusercontent.com/Pom4H/open-device/main/packages/spec/schemas/open-device-package.schema.json",
  "manifestVersion": "0.1",
  "id": "https://devices.example.com/pump-controller",
  "version": "1.0.0",
  "kind": "physical-device",
  "name": "pump-controller",
  "title": "Pump controller",
  "description": "Pressure-controlled pump with safety interlocks",
  "vendor": {
    "name": "Example Devices",
    "url": "https://devices.example.com"
  },
  "license": "Apache-2.0",
  "model": {
    "href": "./model/device-model.json",
    "mediaType": "application/json",
    "integrity": "sha256-BASE64_DIGEST"
  }
}
```

The URL is illustrative. `id` identifies the package lineage; `version` identifies a
release. The immutable release manifest is expected at a versioned URL even though
the stable `id` itself is not versioned.

## Top-level fields

| Field | Required | Meaning |
| --- | --- | --- |
| `$schema` | recommended | Schema used by authoring tools |
| `manifestVersion` | yes | Open Device envelope version |
| `id` | yes | Stable canonical HTTPS identifier |
| `version` | yes | Semantic release version |
| `kind` | yes | Package kind from the core vocabulary |
| `name` | yes | URL- and CLI-friendly package slug |
| `title` | yes | Human-readable product name |
| `description` | yes | Short package purpose |
| `vendor` | yes | Publisher identity and origin |
| `license` | yes | SPDX license expression |
| `homepage` | no | Product or documentation page |
| `model` | yes | Declarative device or runtime model |
| `views` | no | Browser or target-specific presentations |
| `logic` | no | Standalone or engine-backed behavior |
| `scenarios` | no | Portable conformance scenarios |
| `dependencies` | no | Other immutable Open Device packages |
| `extensions` | no | Namespaced profile data |
| `provenance` | no | Fidelity of imported target programs |

## Artifact reference

Every referenced file uses the same shape:

```json
{
  "href": "./logic/program.fbdbin",
  "mediaType": "application/vnd.example.fbdbin",
  "integrity": "sha256-BASE64_DIGEST",
  "size": 18432
}
```

Rules:

- `href` may be package-relative or an absolute HTTPS URL;
- packed releases must not contain `file:`, `data:`, credentialed, or mutable branch
  URLs;
- `integrity` uses Subresource Integrity syntax and is mandatory for executable code,
  program data, scenarios, and cross-origin artifacts in a release;
- consumers verify bytes before parsing or executing them;
- relative paths may not escape the package root after URL normalization;
- redirects are subject to consumer origin policy and do not bypass integrity.

During local development the CLI may tolerate missing integrity values. `device pack`
must compute them and fail when release requirements are not met.

## Model documen

The model carries reusable semantics instead of live instance state:

```json
{
  "modelVersion": "0.1",
  "capabilities": ["sense", "control"],
  "ports": [
    {
      "id": "pressure",
      "title": "Pressure input",
      "direction": "input",
      "domain": "signal",
      "signal": {
        "dataType": "number",
        "unit": "bar",
        "minimum": 0,
        "maximum": 10
      },
      "physical": {
        "medium": "electrical",
        "kind": "analog-current",
        "range": "4-20 mA"
      }
    },
    {
      "id": "pump-command",
      "title": "Pump command",
      "direction": "output",
      "domain": "signal",
      "signal": {
        "dataType": "boolean"
      },
      "physical": {
        "medium": "electrical",
        "kind": "digital-output"
      }
    }
  ]
}
```

The draft intentionally separates semantic signal constraints from physical terminal
constraints. Compatibility requires both layers to agree. Cross-port ownership,
capacity, and interlock rules need engineering validation in addition to JSON Schema.

The model document is the core artifact and is described by
[`device-model.schema.json`](../packages/spec/schemas/device-model.schema.json).
Beyond ports, it may carry typed physical packaging: per-port `terminals` placed
on named strips, and a `faceplate` block (enclosure dimensions, `din-rail-35` or
`panel-cutout` mounting, terminal strips, display lines, indicators, controls).
Because the placement is typed rather than drawn, a conforming compiler — the
reference lives in `@open-device/core` — derives the front-panel SVG and its
connection anchors deterministically, so catalogs, documentation, simulators,
and SCADA editors reuse one geometry without vendor artwork. A working example is
[`examples/pump-controller/model/device-model.json`](../examples/pump-controller/model/device-model.json).

## Views

```json
{
  "views": [
    {
      "id": "front-panel",
      "role": "browser-front-panel",
      "entrypoint": {
        "href": "./views/front-panel/index.html",
        "mediaType": "text/html",
        "integrity": "sha256-BASE64_DIGEST"
      },
      "protocol": "open-device:view-messages@0.1"
    }
  ]
}
```

Browser views are complete HTML documents rendered in a sandboxed iframe. Controller
HMI, cloud mnemonic, printable diagram, and product thumbnail are distinct roles and
must not be presented as interchangeable files. See [Browser views](views.md).

## Logic: standalone Wasm

```json
{
  "logic": [
    {
      "id": "controller",
      "mode": "standalone",
      "abi": "open-device:cyclic-control@0.1",
      "module": {
        "href": "./logic/controller.wasm",
        "mediaType": "application/wasm",
        "integrity": "sha256-BASE64_DIGEST"
      }
    }
  ]
}
```

## Logic: program plus shared runtime

```json
{
  "dependencies": {
    "fbd-runtime": {
      "id": "https://runtimes.example.com/fbd-runtime",
      "version": "11.0.0",
      "integrity": "sha256-BASE64_MANIFEST_DIGEST"
    }
  },
  "logic": [
    {
      "id": "controller",
      "mode": "program",
      "abi": "open-device:cyclic-control@0.1",
      "profile": "https://profiles.example.com/saturn-fbd/11",
      "program": {
        "href": "./logic/program.fbdbin",
        "mediaType": "application/vnd.saturn.fbdbin",
        "integrity": "sha256-BASE64_DIGEST"
      },
      "runtime": "fbd-runtime#engine"
    }
  ]
}
```

The media type and profile URI above are provisional. The profile owns target-specific
pin numbering, runtime versions, binary parsing, and controller HMI behavior.

## Scenarios

```json
{
  "scenarios": [
    {
      "id": "emergency-stop",
      "target": "controller",
      "source": {
        "href": "./scenarios/emergency-stop.json",
        "mediaType": "application/json",
        "integrity": "sha256-BASE64_DIGEST"
      }
    }
  ]
}
```

Scenarios are data executed by a compatible runner. They do not embed privileged hos
code. See [Scenarios and evidence](scenarios-and-evidence.md).

## Dependencies

Source packages may use semantic version ranges for authoring convenience. A packed
release or its lock document records exact versions, canonical manifest URLs, and
digests. Dependency resolution must detect cycles and apply explicit limits to graph
depth, package count, bytes, and origins.

## Extensions

Profile data is keyed by an absolute HTTPS URI to avoid name collisions:

```json
{
  "extensions": {
    "https://profiles.example.com/saturn-fbd/11": {
      "requiredRuntime": 11,
      "controllerFamily": "saturn-plc"
    }
  }
}
```

Consumers must preserve unknown extension data when transforming a manifest. They may
ignore an extension only when it is not required by a selected view, logic artifact,
or scenario.

## Source and imported provenance

Imported target programs report independent fidelity dimensions:

```json
{
  "provenance": {
    "runtimeFidelity": "exact",
    "sourceRecoverability": "partial",
    "semanticConfidence": "inferred"
  }
}
```

"Executes exactly" does not imply that the original graphical project or engineering
intent can be reconstructed.

## Open questions for v0.1

- final model vocabulary and relationship to W3C Web of Things Thing Models;
- canonical package lock format;
- unit vocabulary and electrical signal taxonomy;
- whether media types should be registered or remain profile parameters;
- signature envelope and verified vendor namespace flow;
- compatibility rules for multi-terminal and bus devices.
