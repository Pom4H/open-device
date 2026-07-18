# Registry and publishing

Status: direction for a later milestone. The first implementation resolves local
directories and direct immutable HTTPS manifests.

## Registry responsibilities

A public Open Device registry provides:

- search and human-readable catalog pages;
- verified vendor namespaces;
- package metadata and immutable version discovery;
- manifest and artifact digest records;
- compatibility and security metadata;
- optional mirroring for availability;
- deprecation, yanking, and advisory status without rewriting releases.

It does not provide:

- controller credentials;
- live telemetry;
- hardware activation or rollback;
- authorization for device commands;
- an exclusive storage location for package bytes.

## Vendor-owned packages

The canonical package may live on the vendor's HTTPS origin:

```tex
https://devices.vendor.example/products/kio-2ms/1.4.0/open-device.json
```

The registry stores a searchable index and the expected manifest digest. Consumers
may fetch from the canonical origin, an approved mirror, or an offline cache and verify
the same bytes.

This lets a manufacturer publish from a static host, object storage, documentation
site, or GitHub Pages without running custom registry software.

## Names and identifiers

- Canonical identity is the manifest's HTTPS `id` plus a version.
- CLI aliases such as `@vendor/kio-2ms` are registry conveniences.
- An alias always resolves to a canonical ID and immutable manifest digest.
- Moving storage must not silently change package identity.
- A mutable alias such as `latest` is never written into a release lock.

## Namespace verification

The preferred verification flow proves control of both the account and vendor domain.
Candidate mechanisms include an HTTPS challenge and DNS record. The exact protocol
requires a security review and ADR before implementation.

GitHub ownership alone is not sufficient to claim a manufacturer's namespace.

## Publishing flow

```tex
device login                 optional registry authentication
device check                 structural and engineering validation
device test                  scenarios against exact artifacts
device pack                  immutable manifest, digests and evidence
device publish               upload or register canonical URLs
```

`publish` should be resumable and idempotent. It must show the package ID, version,
visibility, origin, digest, and evidence summary before creating external state.

Once a version is public, its bytes cannot be replaced. A publisher may:

- deprecate it with a reason and replacement;
- yank it from default resolution for a serious issue;
- attach a security advisory;
- publish a new version.

Existing digest-pinned consumers can still identify what they used.

## Resolution and locking

The source package may declare a compatible dependency range. Resolution produces a
lock graph containing:

- exact package ID and version;
- canonical manifest URL;
- manifest digest;
- selected artifact IDs and digests;
- profile and ABI versions;
- registry or origin used for discovery.

Offline operation consumes the same lock graph from a content-addressed cache.

## Initial delivery strategy

Do not start with a large registry backend. Implement in this order:

1. local directory resolver;
2. direct immutable HTTPS resolver;
3. content-addressed cache and lock file;
4. static vendor catalog document;
5. public searchable index and namespace verification;
6. signatures, mirrors, advisories, and federation.

OCI export may be added as a transport adapter later. It is not the canonical package
model because browser consumers should not need an OCI client.
