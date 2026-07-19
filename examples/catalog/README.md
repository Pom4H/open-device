# Reference equipment catalog

`open-device-catalog.json` is a non-normative static discovery document used by the
Playground. Every entry points to a complete source package under `examples/`.

The catalog demonstrates the intended resolution chain:

```text
registry alias -> package manifest -> canonical ID + version -> device model
```

Instance IDs, positions, connections, current values, controller assignments, and
credentials do not belong in this catalog. Those values are owned by an engineering
project or another consuming platform.

The catalog currently indexes 14 packages: the Saturn PLC and its RS-485 expansion
modules (Saturn-DIO, Saturn-AIO, Saturn-TC), a variable frequency drive, process
instrumentation (pressure, flow, level), a motor-operated valve, rotating and static
equipment (pump, tank, header), and safety devices (emergency stop, signal tower).

Entries with `"renderer": "package-view"` are rendered entirely from the package
itself: the manifest ships an SVG front-panel view (`views[]`) plus canvas geometry
in the `https://open-device.dev/extensions/topology-node` extension — the Playground
has no code specific to these devices. The same SVG artifact doubles as marketing
material; the device passport dialog offers it for download.

This document is deliberately small. It is not the future hosted registry API and
does not define namespace verification, publishing, advisories, or mutable aliases.
