# Glossary

**Adapter**
Consumer- or target-specific code connecting Open Device concepts to a protocol,
controller, SCADA, cloud, or deployment system.

**Artifact**
A typed, integrity-addressed file referenced by a package manifest.

**Behavior**
Deterministic logic that transforms explicit inputs, configuration, state, and time
into outputs, events, diagnostics, or presentation commands.

**Evidence**
A result document binding scenario outcomes to exact package, runtime, program, suite,
runner, and execution profile digests.

**Instance**
A consumer-owned realization of a device model with connection details, live state,
permissions, and deployment history.

**Intent**
A user interaction emitted by a view. It becomes a hardware command only after hos
policy authorizes and routes it.

**Logical device**
An executable or simulated device whose primary interface is signals, properties,
actions, and events rather than a physical enclosure.

**Package**
A manifest and its referenced models, views, logic, scenarios, evidence, assets, and
dependencies.

**Plant model**
An executable approximation of a physical or environmental process used in composed
simulation and tests.

**Port**
A typed connection point with direction, semantic signal constraints, and optional
physical constraints.

**Profile**
A target-specific extension defining artifacts, mappings, validation, runtime rules,
and tooling for an ecosystem.

**Program**
Data loaded by a shared runtime engine, such as an FBD binary. It is distinct from the
engine itself.

**Quality**
Metadata describing whether a value is valid, stale, bad, or unknown. Quality is par
of the value contract, not an optional display decoration.

**Registry**
A searchable index of package identity, versions, digests, origin, verification, and
advisory metadata. Package bytes may remain vendor-hosted.

**Release package**
An immutable, integrity-complete package version suitable for publishing and locking.

**Runtime**
A hosted executable engine implementing an Open Device ABI. It may be standalone or
load separate program data.

**Scenario**
Portable data describing reset, inputs, time progression, composition, and expected
results for a behavior or plant model.

**Source package**
The editable vendor project before immutable release packing.

**View**
A presentation of device state. Browser views use HTML/CSS in a sandbox; target HMI
and cloud mnemonic are separate view roles.
