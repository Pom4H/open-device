# Pump controller example

The first end-to-end logical device package — implemented. The logic is written in
AssemblyScript ([`logic/controller.as.ts`](logic/controller.as.ts)) and compiled to
a ~1.8 KB dependency-free Wasm module implementing the scalar cyclic-control ABI
(ADR-0006).

```sh
bun run build                                    # AssemblyScript → logic/controller.wasm
bun ../../packages/cli/bin/device.ts test .      # 7 scenarios against the packaged artifact
bun ../../apps/playground/server.ts              # interactive demo on :8787
```

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

- [x] normal pressure keeps the pump stopped;
- [x] low pressure starts it only after the configured delay;
- [x] high pressure resets demand;
- [x] emergency stop removes the command immediately;
- [x] missing feedback produces an alarm after timeout;
- [x] bad pressure quality follows declared fail-safe behavior;
- [x] retained setpoints survive the declared reset mode;
- [x] browser view represents stale and bad quality visibly (manual check in the
      playground: switch pressure quality to `stale` or `bad`).

The first seven are executable scenarios in the `scenarios/` directory; watchpoints,
diagnostics beyond the alarm latch, and the controller-local HMI preview remain open
until the Saturn FBD profile lands.

The release gate must execute these scenarios against the real target program and
shared Wasm runtime. A TypeScript reference model may be used only as an additional
oracle.
