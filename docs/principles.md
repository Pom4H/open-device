# Design principles

Status: working agreement for the pre-alpha implementation.

## 1. The web is the distribution platform

A package must be fetchable, inspectable, cacheable, and usable with standard web
technology. Canonical identifiers are HTTPS URLs. The core format does not depend on
npm, OCI, GitHub, a proprietary marketplace, or a specific JavaScript framework.

## 2. Vendors own their descriptions

A manufacturer should be able to publish immutable device packages from its own
origin. A public registry indexes and verifies packages; it does not need to become
the only place where package bytes exist.

## 3. Declarative first, executable when necessary

Identity, ports, schemas, capabilities, constraints, and bindings are declarative.
Executable code is reserved for behavior that cannot be expressed safely as data:
controller logic, protocol emulation, simulation, and specialized validation.

## 4. A device model is not a live device

The package describes a reusable model. An instance belongs to a consumer and adds
site-specific identity, connection details, credentials, live state, access control,
and deployment history. Packages must never contain production credentials.

## 5. Presentation, behavior, and deployment are separate

- A presentation visualizes state and emits user intent.
- A behavior model transforms explicit inputs into outputs.
- A deployment adapter communicates with real equipment.

No presentation can bypass the host's authorization or command confirmation.

## 6. Portable does not mean lowest common denominator

The neutral envelope is small, while profiles may describe rich vendor-specific
targets. A Saturn FBD binary, a standalone Wasm controller, and a documentation-only
sensor can all be valid packages without forcing their capabilities into one runtime.

## 7. Behavior is deterministic by defaul

Logical runtimes receive elapsed time, inputs, configuration, and deterministic seed
from the host. Ambient time, network, filesystem, process APIs, and randomness are
not available unless an explicit, reviewed capability profile grants them.

## 8. Evidence is stronger than a badge

"Tested" is meaningful only when a result identifies the exact package, program,
runtime, scenario suite, runner, and environment. Evidence becomes stale whenever
any of those inputs change.

## 9. The released artifact is the test subjec

Reference simulations may improve authoring, but release scenarios must execute the
artifact that consumers will run. A parallel implementation cannot be the sole gate
for publishing a target binary.

## 10. Quality is part of the value

Telemetry is not just a scalar. Runtime frames carry value, source timestamp, and
quality. Hosts and views must visibly preserve invalid, stale, uncertain, and absen
states instead of silently presenting them as good data.

## 11. Static packages before a large registry service

The first release must work from local directories and immutable HTTPS files. Search,
namespaces, signing, federation, and hosted publishing are added after the authoring
and consumption workflow is pleasant.

## 12. Safety policy belongs to the hos

Packages declare capabilities and actions. The consuming SCADA, simulator, or
deployment platform decides who may execute them, whether confirmation is required,
how commands are audited, and how failures are handled.
