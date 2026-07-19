# `@open-device/playground`

Browser application for inspecting, rendering, connecting, and testing packages.

Its product role is an engineering-system lab: a registry supplies reusable device
definitions, while the project scene owns instances, positions, connections, live
state, and the selected controller program. This is intentionally analogous to a
GNS3-style workflow, but the connection domains include signals and process media in
addition to future power and network links.

## Responsibilities

- open a local or HTTPS `open-device.json`;
- show identity, model, ports, views, logic, dependencies, and integrity;
- render vendor HTML through `@open-device/view-host`;
- instantiate behavior through `@open-device/runtime`;
- connect compatible ports and explain rejected connections;
- create any number of instances from the same registry definition;
- save and reopen a consumer-owned engineering project;
- run portable scenarios and display evidence;
- keep simulation and real-device operation visibly distinct.

The current pump-station vertical slice composes two target-specific adapters without
placing them in the neutral core: the Saturn profile owns the exact physical front
panel and its terminal anchors; the playground owns a small scene-graph plant harness
with declared equipment ports, orthogonal pipe routing, live bindings, and quality.
The controller logic, physical plant model, and software SCADA view therefore remain
separate artifacts even though the Studio presents them in one workflow.

Controller targets plug in behind `src/controller-profile.ts`, a vendor-neutral seam:
program lifecycle, compilation, runtime IO by semantic port IDs, the front-panel view
with terminal anchors, and the optional firmware display. `src/profiles/saturn-fbd.ts`
is the only file that imports the Saturn package. The program editor is contextual,
not the Studio's front door — the tab exists only while a device with a registered
controller profile is on the scene, and its label comes from the profile.

Scene connections render by domain. Process connections are pipes: routed
orthogonally from port anchors on every render (geometry is never stored), with a
marching-dash water overlay driven by a directional topology walk from running pumps —
branches no running pump reaches stay still. Signal, safety, power, and network
connections remain cables. The shared router lives in `src/routing.ts` and also
drives the P&ID panel in `src/plant-diagram.ts`.

The current catalog is the non-normative static document at
`examples/catalog/open-device-catalog.json`. Each row resolves a real
`open-device.json` and device model. Multiple pump instances deliberately resolve to
the same centrifugal-pump definition; instance identity and station-specific state
remain in the Playground scene. The reference station also uses two instances of one
process-header definition to model suction and discharge manifolds. The Saturn PLC
definition and the pump-controller program are resolved separately.

## Engineering project file

The topology editor exports `*.open-device-project.json`. This is an experimental
Playground-owned document, not part of the neutral package specification. It stores:

- project identity and title;
- scene instances with canonical package ID, version, registry alias, and renderer;
- consumer-owned positions and typed port connections;
- controller program sources associated with instance IDs.

Import validates document structure, unique IDs, referenced instances, registry
definitions, renderer adapters, port existence, direction, and signal/process
compatibility before replacing the current scene. Package files remain reusable and
immutable; the project document owns the composition.

The deterministic booster-station plant harness currently drives the canonical
instances named `controller`, `pump1`, `pump2`, `sensor`, `reservoir`, and `estop`.
Additional instances are fully editable and connectable but do not yet receive a
generic behavior runtime automatically.

The playground is a consumer of public packages. It must not contain private LanMon
or Saturn deployment behavior.
