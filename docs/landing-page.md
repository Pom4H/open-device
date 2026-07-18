# Landing page brief and copy

This document is the content source for `apps/website`. The landing page should explain
the approach before presenting implementation details.

## Audience

Primary:

- hardware manufacturers publishing reusable device models;
- SCADA, HMI, and industrial software developers;
- integrators building cabinets and control systems;
- simulator and education tool authors.

Secondary:

- web developers entering industrial tooling;
- maintainers of controller runtimes and protocol SDKs;
- technical writers producing interactive documentation.

## Message hierarchy

### Hero

**Physical devices as code.**

An open, web-native package format for the appearance, ports, state, behavior, and
tests of physical and logical devices.

Primary action: **Explore the package**
Secondary action: **View on GitHub**

Supporting line:

Publish once. Use the same device in catalogs, wiring tools, browser simulations,
SCADA editors, tests, and real product adapters.

### Show the package

```tex
@vendor/device
├── open-device.json
├── model/
├── views/          HTML + CSS
├── logic/          WebAssembly or program data
├── scenarios/
└── evidence/
```

Caption:

The format describes what a device is. Your platform decides how instances connect,
who may control them, and how programs reach real hardware.

### One package, many consumers

Cards:

1. **Manufacturer catalog** — publish accurate, versioned product data.
2. **Browser documentation** — turn HTML and CSS into an interactive front panel.
3. **Engineering tools** — validate terminals, signal types, units, and constraints.
4. **Simulation** — run deterministic behavior through WebAssembly.
5. **SCADA and HMI** — bind a neutral model through a product adapter.
6. **Verification** — execute portable scenarios against the exact released artifact.

### Why the web

Heading: **Hardware deserves web-grade developer experience.**

Body:

The web already knows how to distribute immutable resources, render responsive
interfaces, validate structured data, isolate untrusted content, cache by digest, and
run portable code. Open Device applies those capabilities to equipment while keeping
electrical constraints, deterministic controller cycles, data quality, and safety
policy explicit.

Standards row:

```tex
HTTPS · JSON Schema · HTML · CSS · ES modules · WebAssembly · Web Crypto
```

### Executable without lock-in

Heading: **Bring a module, or bring a program.**

```tex
controller.wasm

or

program.fbdbin + fbd-runtime.wasm
```

Body:

Simple logical devices can ship as standalone Wasm. PLC ecosystems can publish program
data that runs on a shared, integrity-pinned engine. Both use the same host lifecycle,
state frames, resource limits, and test format.

### Evidence section

Heading: **Test the bytes you publish.**

Body:

A green badge is not enough. Open Device evidence records the exact package, runtime,
program, scenario suite, and runner. Change any one of them and the evidence becomes
stale.

Visual sequence:

```tex
scenario → released artifact → deterministic runtime → digest-bound evidence
```

### Trust boundary

Heading: **Open format. Explicit authority.**

Body:

Vendor views run in a browser sandbox and emit intent—not hardware commands. Consumer
platforms remain responsible for identity, authorization, confirmation, audit,
deployment, and rollback.

### First reference implementation

Heading: **Starting with a real controller workflow.**

Body:

The first end-to-end profile compiles a pump controller to `.fbdbin`, executes it with
the same FBD runtime compiled to WebAssembly, renders its state in the browser, and
runs safety scenarios against the released binary. The core remains vendor-neutral;
the target is a proving ground for the interfaces.

### Final call to action

Heading: **Help define a portable device package.**

Body:

We are building the first narrow vertical slice in public. Manufacturers, industrial
developers, runtime authors, and web tooling contributors are invited to challenge the
model with real equipment.

Actions: **Read the architecture** · **Follow the roadmap** · **Join the discussion**

## Visual direction

- technical and calm, not futuristic "digital twin" imagery;
- product packages and signal flow as the central motif;
- real browser typography and UI fragments instead of decorative 3D hardware;
- neutral industrial palette with color reserved for signal quality and alarms;
- light theme first, excellent dark mode;
- diagrams should be real HTML/SVG and accessible;
- lead with a working embedded example as soon as the playground exists.

## Claims to avoid

- "universal digital twin standard";
- "safe by definition" or certification claims;
- implying that a registry listing authorizes hardware control;
- implying full source reconstruction from an imported binary;
- claiming runtime equivalence unless the exact artifacts were tested;
- positioning LanMon or Saturn as owners of the neutral format.
