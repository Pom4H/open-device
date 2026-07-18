# Pump controller example

The first end-to-end logical device package.

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
