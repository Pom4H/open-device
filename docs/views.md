# Browser views

Status: draft protocol for vendor-authored browser presentations.

## Goals

A vendor should be able to describe the appearance of a device with ordinary HTML
and CSS. A consumer should be able to embed it without adopting the vendor's framework
or trusting its code with the host DOM and hardware APIs.

## Distribution modes

### Dependency mode

The view remains part of an immutable package. The host renders its complete HTML
document inside a restricted iframe. This is the default for registry content.

### Source-owned mode

A future `device eject --part view` command copies the view into the consumer's source
tree. The consumer owns review, modification, build, and security from that point.
Ejected code no longer receives automatic vendor view updates.

## View files

```text
views/front-panel/
├── index.html
├── styles.css
├── view.mjs       # optional interaction adapter
└── assets/
```

The HTML must remain useful without a JavaScript framework. An optional ES module may
map host messages to DOM state and emit user intents. Logical device behavior does not
belong in `view.mjs`; it belongs in the declared runtime.

## Sandbox baseline

An untrusted dependency view runs with a baseline equivalent to:

```html
<iframe sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe>
```

The host must not grant `allow-same-origin`, top navigation, popups, forms, downloads,
pointer lock, storage access, or arbitrary permissions by default. Assets should be
resolved, integrity-checked, and loaded through a package-controlled virtual origin or
`srcdoc` policy.

The generated document uses a restrictive Content Security Policy. Network access is
denied unless a reviewed capability explicitly permits an origin.

## Message protocol

Messages are structured-clone-compatible objects sent with `postMessage`. Every
session uses a random channel ID supplied by the host. The host delivers the channel
to the view through the iframe `name` attribute so the readiness message can already
carry it. Both sides validate protocol, channel, source window, message shape, size,
and sequence.

### Host initialization

```json
{
  "type": "open-device:init",
  "protocol": "0.1",
  "channel": "opaque-random-channel",
  "instance": {
    "id": "demo-pump-1",
    "title": "Pump 1"
  },
  "theme": {
    "colorScheme": "dark",
    "locale": "en"
  },
  "capabilities": ["emit-intent"]
}
```

### State update

```json
{
  "type": "open-device:state",
  "protocol": "0.1",
  "channel": "opaque-random-channel",
  "sequence": 42,
  "values": {
    "ready": { "value": true, "quality": "good" },
    "fault": { "value": false, "quality": "good" },
    "pressure": { "value": 1.7, "quality": "stale", "unit": "bar" }
  }
}
```

### View readiness

```json
{
  "type": "open-device:ready",
  "protocol": "0.1",
  "channel": "opaque-random-channel"
}
```

### User intent

```json
{
  "type": "open-device:intent",
  "protocol": "0.1",
  "channel": "opaque-random-channel",
  "intentId": "local-uuid",
  "action": "start",
  "input": {}
}
```

An intent is not a successful command. The host may reject it, ask for confirmation,
authorize it, send a real command through an adapter, and wait for observed telemetry.
The view receives explicit status messages; it must not optimistically rewrite source
state as though equipment already changed.

## Theme contract

The host may supply a small set of CSS custom properties through generated wrapper
CSS or the initialization message:

```css
:root {
  color-scheme: light dark;
  --od-background: Canvas;
  --od-foreground: CanvasText;
  --od-status-good: #238636;
  --od-status-warning: #9a6700;
  --od-status-alarm: #cf222e;
  --od-status-unknown: #6e7781;
}
```

Vendors may define their own internal tokens. Core status meaning must not rely on
color alone.

## Accessibility and responsiveness

- semantic elements before generic SVG hit targets;
- keyboard access for every interactive intent;
- visible focus and textual status alternatives;
- no fixed assumption about host dimensions;
- quality and alarm information available to assistive technology;
- reduced-motion support;
- locale and direction supplied by the host.

## Target-specific presentations

Controller HMI, Cloud mnemonic, print diagram, thumbnail, and browser front panel use
different `role` values. A runtime-generated HMI command stream may be displayed by a
profile adapter, but it is not silently promoted to the package's browser view.
