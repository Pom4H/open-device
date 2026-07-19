# `@open-device/playground`

Browser application for inspecting, rendering, connecting, and testing packages.

## Responsibilities

- open a local or HTTPS `open-device.json`;
- show identity, model, ports, views, logic, dependencies, and integrity;
- render vendor HTML through `@open-device/view-host`;
- instantiate behavior through `@open-device/runtime`;
- connect compatible ports and explain rejected connections;
- run portable scenarios and display evidence;
- keep simulation and real-device operation visibly distinct.

The playground is a consumer of public packages. It must not contain private LanMon
or Saturn deployment behavior, and it must not assume any particular controller
family: target profiles (such as `saturn-fbd`) plug in behind the neutral runtime
interfaces and are never required to open, render, or simulate a package.

## Current implementation — model lab

`public/` is a static, dependency-free app: a device-model editor with a live
compiled preview and a pluggable plant simulation.

- **Editor.** The model document (JSON) recompiles on every keystroke through the
  `@open-device/core` front-panel compiler. Compile errors from the schema-shaped
  validation surface inline; the anchors table lists every terminal and mounting
  point in millimeters.
- **Presets.** Three fictional devices across object categories:
  water/hydraulics (the real `examples/pump-controller` model), electrical power
  distribution (`presets/electrical-feeder.json`), and low-voltage fire/security
  (`presets/fire-loop.json`).
- **Plant engines.** Each category has its own simulation — pressure loop with
  overpressure interlock, feeder with thermal overcurrent trip, supervised
  detection loops with EOL resistance, line-break and short faults. Engines
  attach to the model by port semantics (direction, domain, dataType, unit),
  not by port names or a controller profile — rename a port in the editor and
  the plant re-attaches. Engines are a stand-in for future `plant-model`
  packages executed by the real runtime.

Run locally:

```sh
bun run dev   # builds, then serves public/ at http://localhost:4174
```
