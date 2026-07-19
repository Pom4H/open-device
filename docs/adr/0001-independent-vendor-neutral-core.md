# ADR-0001: Independent vendor-neutral core

- Status: accepted
- Date: 2026-07-18

## Context

The initial ideas were validated while building LanMon and Saturn controller tooling.
Those products provide a strong real-world use case but include proprietary cloud,
deployment, protocol, and hardware integration concerns.

If the package format is shaped as an internal LanMon feature, other manufacturers and
SCADA developers must accept product-specific assumptions and ownership. The project
would not become credible shared infrastructure.

## Decision

Open Device is an independent open-source project and vendor-neutral format.

The core owns package vocabulary, schemas, resolution, browser view protocol, runtime
ABI, connection validation, scenarios, and evidence.

LanMon Cloud, Saturn controller deployment, native protocol bridges, hardware SDKs,
telemetry infrastructure, and commercial editors remain adapters or separate products.
Target-specific support lives in profiles and cannot be imported by the neutral core.

## Consequences

- The first profile may use Saturn FBD but cannot define the universal vocabulary.
- Core APIs must be usable without a LanMon account, Saturn hardware, or proprietary
  service.
- Product teams can adopt the format without exposing their deployment internals.
- Ownership and licensing of reused code and specifications must be verified before
  moving them into this repository.
- Some conveniences will live in adapters rather than the core CLI.

## Alternatives considered

### Publish an open subset of LanMon Cloud

Rejected because product boundaries would dominate the model and discourage neutral
adoption.

### Define only a Saturn package format

Rejected as the project goal is broader, while Saturn can be represented accurately by
a profile.
