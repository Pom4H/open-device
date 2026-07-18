# `@open-device/scenario`

Portable scenario runner and evidence generator.

## Responsibilities

- validate declarative scenario documents;
- reset and drive logic and optional plant models;
- write inputs with quality and source time;
- advance deterministic time;
- evaluate bounded portable comparators;
- capture traces, snapshots, diagnostics, and failures;
- generate evidence bound to exact subject and runner digests;
- compare target execution with an optional reference oracle without confusing them.

Scenario documents cannot execute arbitrary JavaScript.

See [`docs/scenarios-and-evidence.md`](../../docs/scenarios-and-evidence.md).
