# `@open-device/profile-saturn-fbd`

First target profile for program data executed by a shared FBD runtime. The profile
now contains a narrow working vertical slice: an editable pump-station FBD source,
a `.fbdbin` compiler, the Saturn-compatible runtime bridge, controller HMI command
generation, SCADA-to-HMI projection, and artifact-level tests.

## Implemented vertical slice

- `.fbdbin` building with required runtime version and binary CRC;
- semantic port IDs mapped to controller pin indexes;
- setpoint and watchpoint discovery;
- controller-local 320×240 HMI display command adapter;
- a browser-native Saturn-PLC front-panel view with the reference X1–X9 geometry;
- machine-readable anchors for DO, DI, AI, AO, and temperature terminals;
- FBD source-to-artifact compiler integration;
- actual-runtime scenario execution;
- a compatibility report when projecting software SCADA widgets to the HMI.

The playground edits `SaturnFbdProgram`, compiles it with
`compileSaturnProgram()`, and loads the resulting bytes into `FbdRuntime`. The same
artifact drives the simulated physical terminals and emits `FBDdraw*` commands for
the rendered controller display. Building in the UI downloads the current
`booster-station-ps01-v2.fbdbin` artifact.

`renderSaturnPlcSvg()` is the profile-owned browser view used by the playground.
`SATURN_TERMINAL_ANCHORS` is generated from the same geometry, so cable endpoints
cannot drift away from the rendered terminal blocks. The controller-local HMI remains
a separate 320×240 projection rendered inside that front panel.

Importer integration and deployment to a physical controller remain future work.

## Boundary

Numeric pin conventions, CP1251 metadata, FBD element tables, controller screens, and
deployment remain profile-specific. The neutral runtime host sees stable semantic
ports and an explicit program-plus-runtime relationship.

Before moving any implementation from an existing prototype, verify ownership and
license compatibility file by file. The known FBD runtime dependency is MIT-licensed;
its copyright and license notice must be preserved in redistributed copies.
