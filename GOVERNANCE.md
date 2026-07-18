# Governance

Open Device is currently a founder-led, pre-alpha project maintained through the
`Pom4H/open-device` repository.

## Decision process

- Small implementation and documentation changes use normal pull-request review.
- Compatibility, trust-boundary, runtime, package, or registry decisions require an
  ADR and an opportunity for public feedback.
- The maintainer makes the final pre-alpha decision and records the rationale.
- Accepted decisions may be superseded by new ADRs as real device integrations produce
  better evidence.

## Neutrality

No vendor, controller family, SCADA product, or cloud receives privileged semantics in
the core specification. Target-specific requirements belong in named profiles.

## Future governance

Before declaring a stable specification, the project should define:

- multiple maintainers and review ownership;
- a compatibility and release policy;
- trademark and namespace rules;
- a conformance process with independent implementations;
- a conflict-of-interest policy for vendor participants;
- a documented private conduct-reporting channel.
