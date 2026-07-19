// Pump controller — `open-device:cyclic-control@0.1`, scalar core Wasm ABI v1.
//
// Index bindings must match `logic[0].bindings` in ../open-device.json:
//   inputs:  0 pressure, 1 auto-mode, 2 emergency-stop, 3 pump-feedback
//   outputs: 0 pump-command, 1 alarm
//   params:  0 setpoint-low, 1 setpoint-high, 2 start-delay-ms, 3 feedback-timeout-ms
//
// The module is deterministic: no imports, no ambient time, no randomness.
// Time only advances through od_step(elapsed_us).

const Q_GOOD: i32 = 0;

const IN_PRESSURE: i32 = 0;
const IN_AUTO: i32 = 1;
const IN_ESTOP: i32 = 2;
const IN_FEEDBACK: i32 = 3;
const INPUT_COUNT: i32 = 4;

const OUT_PUMP: i32 = 0;
const OUT_ALARM: i32 = 1;
const OUTPUT_COUNT: i32 = 2;

const P_SP_LOW: i32 = 0;
const P_SP_HIGH: i32 = 1;
const P_START_DELAY_MS: i32 = 2;
const P_FEEDBACK_TIMEOUT_MS: i32 = 3;
const PARAM_COUNT: i32 = 4;

const inputValue = new StaticArray<f64>(INPUT_COUNT);
const inputQuality = new StaticArray<i32>(INPUT_COUNT);
const params = new StaticArray<f64>(PARAM_COUNT);

let demand = false;
let pumpCommand = false;
let alarmLatched = false;
let failsafe = false;
let estopActive = false;
let startAccumUs: i64 = 0;
let feedbackAccumUs: i64 = 0;
let stepped = false;

function applyParamDefaults(): void {
  params[P_SP_LOW] = 1.5;
  params[P_SP_HIGH] = 3.0;
  params[P_START_DELAY_MS] = 2000.0;
  params[P_FEEDBACK_TIMEOUT_MS] = 3000.0;
}

function clearRuntimeState(): void {
  for (let i = 0; i < INPUT_COUNT; i += 1) {
    inputValue[i] = 0;
    inputQuality[i] = 3; // unknown until the host writes a sample
  }
  demand = false;
  pumpCommand = false;
  alarmLatched = false;
  failsafe = false;
  estopActive = false;
  startAccumUs = 0;
  feedbackAccumUs = 0;
  stepped = false;
}

export function od_abi_version(): i32 {
  return 1;
}

export function od_create(seed: i64): i32 {
  applyParamDefaults();
  clearRuntimeState();
  return 0;
}

export function od_configure(index: i32, value: f64): i32 {
  if (index < 0 || index >= PARAM_COUNT) return 1;
  if (value < 0) return 2;
  params[index] = value;
  return 0;
}

export function od_read_param(index: i32): f64 {
  if (index < 0 || index >= PARAM_COUNT) return NaN;
  return params[index];
}

export function od_write_input(index: i32, value: f64, quality: i32): i32 {
  if (index < 0 || index >= INPUT_COUNT) return 1;
  inputValue[index] = value;
  inputQuality[index] = quality;
  return 0;
}

export function od_step(elapsedUs: i64): i32 {
  if (elapsedUs < 0) return 1;

  const pressureGood = inputQuality[IN_PRESSURE] == Q_GOOD;
  const autoMode = inputValue[IN_AUTO] != 0 && inputQuality[IN_AUTO] == Q_GOOD;
  // Emergency stop is honored regardless of sample quality: fail toward safety.
  estopActive = inputValue[IN_ESTOP] != 0;
  const feedback = inputValue[IN_FEEDBACK] != 0 && inputQuality[IN_FEEDBACK] == Q_GOOD;

  if (pressureGood) {
    if (inputValue[IN_PRESSURE] < params[P_SP_LOW]) demand = true;
    else if (inputValue[IN_PRESSURE] > params[P_SP_HIGH]) demand = false;
  }
  failsafe = !pressureGood;

  const permission = autoMode && !estopActive && !alarmLatched && !failsafe;

  if (demand && permission) {
    if (!pumpCommand) {
      startAccumUs += elapsedUs;
      if (startAccumUs >= <i64>(params[P_START_DELAY_MS] * 1000.0)) {
        pumpCommand = true;
      }
    }
  } else {
    pumpCommand = false;
    startAccumUs = 0;
  }

  if (pumpCommand && !feedback) {
    feedbackAccumUs += elapsedUs;
    if (feedbackAccumUs >= <i64>(params[P_FEEDBACK_TIMEOUT_MS] * 1000.0)) {
      alarmLatched = true;
      pumpCommand = false;
      startAccumUs = 0;
    }
  } else {
    feedbackAccumUs = 0;
  }

  stepped = true;
  return 0;
}

export function od_read_output(index: i32): f64 {
  if (index == OUT_PUMP) return pumpCommand ? 1 : 0;
  if (index == OUT_ALARM) return alarmLatched || estopActive || failsafe ? 1 : 0;
  return NaN;
}

export function od_read_output_quality(index: i32): i32 {
  if (index < 0 || index >= OUTPUT_COUNT) return 2; // bad
  return stepped ? 0 : 3; // good after the first step, unknown before
}

export function od_reset(mode: i32): i32 {
  if (mode == 0) {
    applyParamDefaults();
    clearRuntimeState();
    return 0;
  }
  if (mode == 1) {
    clearRuntimeState(); // retained parameters survive a warm reset
    return 0;
  }
  return 1;
}
