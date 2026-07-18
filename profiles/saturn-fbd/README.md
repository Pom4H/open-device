# `@open-device/profile-saturn-fbd`

First target profile for program data executed by a shared FBD runtime.

## Intended scope

- `.fbdbin` artifact metadata and validation;
- required runtime version and binary CRC checks;
- semantic port IDs mapped to controller pin indexes;
- setpoint and watchpoint discovery;
- controller-local HMI display command adapter;
- compiler and importer integration;
- actual-runtime scenario execution;
- provenance for imported binaries.

## Boundary

Numeric pin conventions, CP1251 metadata, FBD element tables, controller screens, and
deployment remain profile-specific. The neutral runtime host sees stable semantic
ports and an explicit program-plus-runtime relationship.

Before moving any implementation from an existing prototype, verify ownership and
license compatibility file by file. The known FBD runtime dependency is MIT-licensed;
its copyright and license notice must be preserved in redistributed copies.
