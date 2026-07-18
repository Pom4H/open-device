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
or Saturn deployment behavior.
