# `@open-device/example-pump-controller`

Pump controller — the first end-to-end device package. The fictional vendor is
Example Devices (`https://devices.example.com`); the product branding on the
faceplate is **FLOW NODE PC-2040**.

## Package layout

- [`open-device.json`](open-device.json) — the package manifest;
- [`model/device-model.json`](model/device-model.json) — the model document: six
  ports across power, network, and signal domains, each with semantic and
  physical layers and typed terminals (`L+ M A B AI1 AI2 DO1 DO2` on the bottom
  strip), plus the `faceplate` block (enclosure, panel-cutout and DIN-rail
  mounting, LCD lines, LED and rotor indicators, IDENTIFY control) from which
  `@open-device/core` compiles the front-panel SVG used by the website.

## Behavior to demonstrate

- pressure hysteresis;
- delayed pump start;
- automatic/manual permission input;
- emergency-stop interlock;
- feedback timeout and alarm latch;
- retained setpoints;
- watchpoints and diagnostics;
- data-quality handling;
- browser front panel;
- controller-local HMI preview through the target profile.

## Required scenarios

- normal pressure keeps the pump stopped;
- low pressure starts it only after the configured delay;
- high pressure resets demand;
- emergency stop removes the command immediately;
- missing feedback produces an alarm after timeout;
- bad pressure quality follows declared fail-safe behavior;
- retained setpoints survive the declared reset mode;
- browser view represents stale and bad quality visibly.

The release gate must execute these scenarios against the real target program and
shared Wasm runtime. A TypeScript reference model may be used only as an additional
oracle.
