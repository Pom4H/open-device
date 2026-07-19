# Scenarios and evidence

Status: draft data model for executable conformance.

## Why scenarios are data

A scenario should run against a standalone Wasm device, a program loaded into a shared
runtime, or a simulated plant without rewriting the test in each runtime language.
The scenario describes inputs, time, actions, and expectations. A runner owns the
execution mechanics.

## Layer separation

```text
logic    controller behavior
plant    optional physical/environment behavior
harness  wiring, time progression, scenario steps and assertions
```

A pump controller does not need to own a complete hydraulic model. A plant package can
be composed with it for system tests while controller-only tests remain fast and exact.

## Scenario example

```json
{
  "scenarioVersion": "0.1",
  "id": "emergency-stop",
  "title": "Emergency stop removes the pump command",
  "target": "controller",
  "reset": "cold",
  "steps": [
    {
      "write": {
        "pressure": { "value": 1.6, "quality": "good" },
        "auto-mode": { "value": true, "quality": "good" },
        "emergency-stop": { "value": false, "quality": "good" },
        "pump-feedback": { "value": true, "quality": "good" }
      }
    },
    { "tick": { "durationMs": 4000, "periodMs": 100 } },
    { "expect": { "pump-command": { "equals": true } } },
    {
      "write": {
        "emergency-stop": { "value": true, "quality": "good" }
      }
    },
    { "tick": { "durationMs": 100, "periodMs": 100 } },
    {
      "expect": {
        "pump-command": { "equals": false },
        "alarm": { "equals": true }
      }
    }
  ]
}
```

## Initial step vocabulary

| Step | Meaning |
| --- | --- |
| `write` | Apply input, configuration, or parameter values |
| `tick` | Advance explicit time by one or more cycles |
| `expect` | Assert outputs, events, diagnostics, or retained values |
| `snapshot` | Save deterministic runtime or plant state |
| `restore` | Restore a previously named snapshot |
| `connect` | Connect compatible ports in a composed harness |
| `disconnect` | Remove a harness connection or mark it failed |

The first implementation should keep comparators small: equality, numeric tolerance,
range, presence, absence, quality, and event count. Arbitrary JavaScript expressions
are not part of portable scenarios.

## Release rule

The conformance runner must execute the exact resolved artifacts intended for release.
For `program` mode this means both the program bytes and the shared runtime module.

A TypeScript reference simulation may run as a separate oracle. If both are present,
the runner should report cross-model divergence instead of treating the reference
model as proof that the target binary behaves correctly.

## Evidence document

```json
{
  "evidenceVersion": "0.1",
  "result": "passed",
  "subject": {
    "packageId": "https://devices.example.com/pump-controller",
    "packageVersion": "1.0.0",
    "manifestIntegrity": "sha256-...",
    "logicIntegrity": "sha256-...",
    "runtimeIntegrity": "sha256-..."
  },
  "suite": {
    "integrity": "sha256-...",
    "scenarioCount": 7
  },
  "runner": {
    "name": "@open-device/scenario",
    "version": "0.1.0",
    "integrity": "sha256-...",
    "engine": "WebAssembly core"
  },
  "summary": {
    "passed": 7,
    "failed": 0,
    "durationMs": 46
  },
  "scenarios": [
    {
      "id": "emergency-stop",
      "result": "passed"
    }
  ],
  "createdAt": "2026-07-18T08:30:00.000Z"
}
```

`createdAt` describes the run but is not an input to deterministic execution.

## Invalidation

Evidence is invalid when any of these change:

- manifest or resolved dependency graph;
- target program or Wasm module;
- runtime configuration affecting semantics;
- scenario suite or composed plant model;
- runner implementation or ABI adapter;
- declared execution profile.

Authoring tools should display evidence as stale immediately after a relevant edit.

## Safety evidence

Passing scenarios is not a safety certification. Evidence records what was executed,
under which constraints, and with which results. Vendors and consumers remain
responsible for regulatory validation, hazard analysis, hardware testing, and safe
deployment policy.
