# Security model

Status: minimum security requirements for the first implementation.

Open Device processes untrusted remote manifests, HTML, JavaScript, WebAssembly,
images, archives, scenarios, and target program binaries. Schema validation alone is
not a security boundary.

## Protected assets

- consumer credentials and network access;
- browser origin, storage, DOM, and user session;
- host filesystem and environment;
- availability of the editor or simulator;
- correctness of simulated and live outputs;
- operator intent and command audit trail;
- vendor identity and release integrity.

## Threats and controls

### Malicious browser view

Controls:

- sandboxed iframe without same-origin or navigation privileges;
- restrictive CSP and referrer policy;
- no ambient network or storage by default;
- integrity-checked local assets;
- schema, byte-size, rate, source-window, channel, and sequence validation for every
  `postMessage`;
- view emits intent only; the host authorizes and confirms commands.

### Malicious or broken Wasm

Controls:

- no WASI or undeclared imports by default;
- bounded linear memory, program bytes, frame sizes, logs, and display commands;
- per-step execution budget or fuel where available;
- isolated instances and explicit reset semantics;
- validation of every pointer, length, enum, index, and UTF-8 string crossing the ABI;
- quarantine on trap or limit violation;
- outputs are never sent to hardware merely because a simulation module produced them.

### Package and dependency attacks

Controls:

- SHA-256 integrity before parsing or execution;
- immutable version policy and content-addressed cache;
- normalized URL and path containment checks;
- dependency graph depth, count, origin, redirect, and byte limits;
- reject credentialed URLs, unsafe schemes, traversal, archive bombs, and cycles;
- do not execute install scripts from vendor packages;
- expose digest and provenance in resolution errors.

### SSRF and local file access

Remote resolution must reject loopback, link-local, private-network, metadata-service,
and `file:` targets unless an explicit development policy enables a known local root.
Redirects are revalidated at every hop.

### Confused identity and mutable releases

Controls:

- verified vendor namespace and canonical HTTPS ID;
- registry record contains expected manifest digest;
- release versions cannot be overwritten;
- mirror bytes must match the canonical digest;
- deprecation and advisories are separate mutable metadata.

### Unsafe hardware commands

Controls belong to the consumer adapter:

- role and capability authorization;
- explicit command confirmation when policy requires it;
- durable audit record;
- no optimistic telemetry update;
- acknowledgement only after observed device state or protocol-specific confirmation;
- timeout and failure state;
- deployment activation and rollback require human policy outside the package runtime.

## Trust levels

Suggested consumer policy:

| Trust level | Package source | Allowed behavior |
| --- | --- | --- |
| inspect | unknown remote | parse bounded metadata only |
| preview | integrity-pinned | sandboxed view, no intents |
| simulate | reviewed runtime profile | bounded Wasm execution |
| integrate | approved vendor/package | intents routed to test adapter |
| operate | site-approved release | adapter policy may reach real equipment |

Promotion is a consumer decision. A public registry listing does not imply `operate`.

## Signatures

Digest pinning is required first. Package signing, transparency records, and vendor key
rotation need a separate ADR. A signature will attest to exact bytes and identity; i
will not attest to safety or correctness.

## Vulnerability reporting

Use GitHub's private vulnerability reporting or a private draft security advisory for
security-sensitive reports. Do not publish exploit details in a public issue before a
maintainer has had a reasonable opportunity to respond.
