# `@open-device/view-host`

Sandboxed host for vendor-authored HTML/CSS presentations.

## Responsibilities

- construct a restricted iframe document and CSP;
- provide resolved, integrity-checked package assets;
- negotiate the `open-device:view-messages@0.1` protocol;
- deliver state with value, quality, and source timestamp;
- receive schema-validated user intents;
- apply size, rate, sequence, channel, and lifecycle limits;
- expose theme, locale, accessibility, and resize integration.

The host never sends a hardware command. It reports an intent to the consumer, which
owns authorization and adapter behavior.

See [`docs/views.md`](../../docs/views.md).
