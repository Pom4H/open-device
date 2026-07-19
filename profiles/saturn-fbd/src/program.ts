import { buildSchema, type CompiledSchema, type ElementSpec } from "./builder.js";
import { ELEM } from "./format.js";
import { HMI_COLOR } from "./hmi.js";
import { compileHmiScreens } from "./hmi-compile.js";
import type { HmiProjection, HmiScreenModel, ScadaWidget } from "./types.js";

export interface SaturnFbdElement extends ElementSpec {
  title: string;
  x: number;
  y: number;
}

export interface SaturnFbdProgram {
  programVersion: "0.2";
  name: string;
  version: string;
  elements: SaturnFbdElement[];
  hmiScreens: HmiScreenModel[];
  bindings: {
    inputs: Record<string, number>;
    outputs: Record<string, number>;
  };
}

export interface CompiledSaturnProgram extends CompiledSchema {
  source: SaturnFbdProgram;
}

/**
 * Front-panel keypad pins. The keys are an input device: the host writes them with
 * `bridge_set_input` exactly like a terminal input, and the schema reads them through
 * `FBDgetProc(FBD_PIN, …)`. They are not a host-side menu — the program decides what a
 * key press does.
 */
export const SATURN_KEYS = { UP: 13, DOWN: 14, LEFT: 15, RIGHT: 16 } as const;

export const SATURN_TERMINALS = {
  inputs: { DI1: 1, DI2: 2, DI3: 3, DI4: 4, DI5: 5, DI6: 6, DI7: 7, DI8: 8, DI9: 9, DI10: 10, AI1: 11, AI2: 12 },
  outputs: { DO1: 1, DO2: 2, DO3: 3, DO4: 4, DO5: 5, DO6: 6, DO7: 7, DO8: 8, DO9: 9, DO10: 10, DO11: 11, AO1: 12, AO2: 13 },
} as const;

export function createPumpProgram(): SaturnFbdProgram {
  const elements: SaturnFbdElement[] = [
    { id: "pressure", title: "Header pressure · AI1", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.AI1], x: 30, y: 30 },
    { id: "sp_start", title: "Lead start pressure", type: ELEM.SP, params: [50, 950, 180, 2, 10], caption: "Lead start, bar", x: 30, y: 95 },
    { id: "p_low", title: "Pressure demand", type: ELEM.CMP, inputs: ["sp_start", "pressure"], x: 220, y: 55 },
    { id: "sp_stop", title: "Station stop pressure", type: ELEM.SP, params: [100, 990, 320, 2, 10], caption: "Stop pressure, bar", x: 30, y: 160 },
    { id: "p_high", title: "Pressure restored", type: ELEM.CMP, inputs: ["pressure", "sp_stop"], x: 220, y: 145 },
    { id: "demand", title: "Station demand latch", type: ELEM.RSTRG, inputs: ["p_high", "p_low"], x: 410, y: 85 },

    { id: "estop", title: "Emergency stop · DI1", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.DI1], x: 30, y: 245 },
    { id: "estop_ok", title: "E-stop healthy", type: ELEM.NOT, inputs: ["estop"], x: 220, y: 235 },
    { id: "auto", title: "Automatic mode · DI3", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.DI3], x: 30, y: 310 },
    { id: "tank_low", title: "Tank low level · DI5", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.DI5], x: 30, y: 375 },
    { id: "level_ok", title: "Suction level healthy", type: ELEM.NOT, inputs: ["tank_low"], x: 220, y: 375 },
    { id: "mode_permit", title: "Mode and safety permit", type: ELEM.AND, inputs: ["estop_ok", "auto"], x: 410, y: 260 },
    { id: "run_permit", title: "Station run permit", type: ELEM.AND, inputs: ["mode_permit", "level_ok"], x: 600, y: 300 },
    // Front-panel keypad read as ordinary schema inputs — the program, not the host, decides what a key does.
    { id: "key_up", title: "Panel key ▲", type: ELEM.INP_PIN, params: [SATURN_KEYS.UP], x: 30, y: 690 },
    { id: "key_down", title: "Panel key ▼", type: ELEM.INP_PIN, params: [SATURN_KEYS.DOWN], x: 30, y: 755 },
    { id: "manual_run", title: "Manual run latch", type: ELEM.RSTRG, inputs: ["key_down", "key_up"], x: 220, y: 700 },
    { id: "run_request", title: "Run request", type: ELEM.OR, inputs: ["demand", "manual_run"], x: 410, y: 700 },
    { id: "start_req", title: "Delayed start request", type: ELEM.AND, inputs: ["run_request", "run_permit"], x: 600, y: 105 },
    { id: "sp_delay", title: "Lead pump delay", type: ELEM.SP, params: [0, 60000, 2000, 3, 1000], caption: "Lead delay, s", x: 410, y: 170 },
    { id: "start_ton", title: "Lead start TON", type: ELEM.TON, inputs: ["start_req", "sp_delay"], x: 790, y: 105 },

    { id: "sp_cascade", title: "Cascade pressure", type: ELEM.SP, params: [30, 500, 100, 2, 10], caption: "Cascade at, bar", x: 600, y: 30 },
    { id: "p_critical", title: "Critical low pressure", type: ELEM.CMP, inputs: ["sp_cascade", "pressure"], x: 790, y: 30 },
    { id: "cascade_req", title: "Cascade demand", type: ELEM.AND, inputs: ["start_ton", "p_critical"], x: 980, y: 45 },
    { id: "sp_cascade_delay", title: "Lag pump delay", type: ELEM.SP, params: [0, 60000, 4000, 3, 1000], caption: "Lag delay, s", x: 790, y: 170 },
    { id: "cascade_ton", title: "Cascade delay TON", type: ELEM.TON, inputs: ["cascade_req", "sp_cascade_delay"], x: 1170, y: 70 },

    { id: "feedback1", title: "Pump P-101 feedback · DI2", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.DI2], x: 30, y: 475 },
    { id: "no_feedback1", title: "P-101 no feedback", type: ELEM.NOT, inputs: ["feedback1"], x: 220, y: 475 },
    { id: "p1_available", title: "P-101 available", type: ELEM.NOT, inputs: ["p1_fault"], x: 980, y: 225 },
    { id: "pump1_run", title: "Lead pump P-101", type: ELEM.AND, inputs: ["start_ton", "p1_available"], x: 1170, y: 225 },
    { id: "feedback1_watch", title: "P-101 feedback expected", type: ELEM.AND, inputs: ["pump1_run", "no_feedback1"], x: 410, y: 455 },
    { id: "sp_feedback1", title: "P-101 feedback timeout", type: ELEM.SP, params: [1000, 120000, 3000, 3, 1000], caption: "P101 feedback, s", x: 220, y: 540 },
    { id: "feedback1_ton", title: "P-101 failure TON", type: ELEM.TON, inputs: ["feedback1_watch", "sp_feedback1"], x: 600, y: 455 },
    { id: "auto_off", title: "Automatic mode off", type: ELEM.NOT, inputs: ["auto"], x: 600, y: 610 },
    { id: "fault_reset", title: "Fault reset", type: ELEM.OR, inputs: ["auto_off", "key_down"], x: 600, y: 675 },
    { id: "p1_fault", title: "P-101 fault latch", type: ELEM.RSTRG, inputs: ["fault_reset", "feedback1_ton"], x: 790, y: 455 },

    { id: "feedback2", title: "Pump P-102 feedback · DI4", type: ELEM.INP_PIN, params: [SATURN_TERMINALS.inputs.DI4], x: 30, y: 610 },
    { id: "no_feedback2", title: "P-102 no feedback", type: ELEM.NOT, inputs: ["feedback2"], x: 220, y: 610 },
    { id: "p2_request", title: "Lag or standby request", type: ELEM.OR, inputs: ["p1_fault", "cascade_ton"], x: 1170, y: 155 },
    { id: "p2_available", title: "P-102 available", type: ELEM.NOT, inputs: ["p2_fault"], x: 1170, y: 340 },
    { id: "p2_start", title: "P-102 start permit", type: ELEM.AND, inputs: ["start_ton", "p2_request"], x: 1360, y: 180 },
    { id: "pump2_run", title: "Lag pump P-102", type: ELEM.AND, inputs: ["p2_start", "p2_available"], x: 1360, y: 280 },
    { id: "feedback2_watch", title: "P-102 feedback expected", type: ELEM.AND, inputs: ["pump2_run", "no_feedback2"], x: 410, y: 590 },
    { id: "sp_feedback2", title: "P-102 feedback timeout", type: ELEM.SP, params: [1000, 120000, 3000, 3, 1000], caption: "P102 feedback, s", x: 410, y: 655 },
    { id: "feedback2_ton", title: "P-102 failure TON", type: ELEM.TON, inputs: ["feedback2_watch", "sp_feedback2"], x: 600, y: 545 },
    { id: "p2_fault", title: "P-102 fault latch", type: ELEM.RSTRG, inputs: ["fault_reset", "feedback2_ton"], x: 790, y: 545 },

    { id: "pump_fault", title: "Pump fault summary", type: ELEM.OR, inputs: ["p1_fault", "p2_fault"], x: 980, y: 500 },
    { id: "alarm", title: "Station alarm summary", type: ELEM.OR, inputs: ["pump_fault", "tank_low"], x: 1170, y: 500 },
    { id: "out_pump1", title: "P-101 starter · DO1", type: ELEM.OUT_PIN, inputs: ["pump1_run"], params: [SATURN_TERMINALS.outputs.DO1], x: 1530, y: 225 },
    { id: "out_alarm", title: "Common alarm · DO2", type: ELEM.OUT_PIN, inputs: ["alarm"], params: [SATURN_TERMINALS.outputs.DO2], x: 1360, y: 500 },
    { id: "out_pump2", title: "P-102 starter · DO3", type: ELEM.OUT_PIN, inputs: ["pump2_run"], params: [SATURN_TERMINALS.outputs.DO3], x: 1530, y: 320 },
    { id: "out_valve", title: "Suction valve · DO4", type: ELEM.OUT_PIN, inputs: ["run_permit"], params: [SATURN_TERMINALS.outputs.DO4], x: 980, y: 365 },

    { id: "wp_pressure", title: "Header pressure watchpoint", type: ELEM.WP, inputs: ["pressure"], params: [2], caption: "Pressure, bar", x: 220, y: 5 },
    { id: "wp_pump1", title: "P-101 watchpoint", type: ELEM.WP, inputs: ["pump1_run"], params: [0], caption: "P-101", x: 1530, y: 165 },
    { id: "wp_pump2", title: "P-102 watchpoint", type: ELEM.WP, inputs: ["pump2_run"], params: [0], caption: "P-102", x: 1530, y: 385 },
    { id: "wp_auto", title: "Auto mode watchpoint", type: ELEM.WP, inputs: ["auto"], params: [0], caption: "AUTO", x: 220, y: 300 },
    { id: "wp_level", title: "Low level watchpoint", type: ELEM.WP, inputs: ["tank_low"], params: [0], caption: "Tank low", x: 220, y: 410 },
    { id: "wp_manual", title: "Manual run watchpoint", type: ELEM.WP, inputs: ["manual_run"], params: [0], caption: "Manual", x: 410, y: 760 },
    { id: "wp_alarm", title: "Alarm watchpoint", type: ELEM.WP, inputs: ["alarm"], params: [0], caption: "Alarm", x: 1170, y: 565 },
  ];

  // The program owns its working screen only. The standard menu (Точки контроля /
  // Точки регулирования / Об устройстве) is the controller firmware's, not the program's.
  const hmiScreens: HmiScreenModel[] = [
    {
      id: "main",
      title: "BOOSTER STATION",
      screenType: "main",
      period: 250,
      elements: [
        { id: "header", primitive: "rect", position: { x: 0, y: 0 }, width: 320, height: 30 },
        { id: "title", primitive: "text", label: "BOOSTER STATION", position: { x: 10, y: 8 }, font: 1 },
        { id: "pressure", primitive: "value", label: "Header ", position: { x: 10, y: 44 }, binding: { source: "wp", ref: "wp_pressure", format: "fixed2", unit: "bar" } },
        { id: "pump1", primitive: "status", label: "P-101 ", position: { x: 10, y: 76 }, binding: { source: "wp", ref: "wp_pump1", format: "bool" } },
        { id: "pump2", primitive: "status", label: "P-102 ", position: { x: 160, y: 76 }, binding: { source: "wp", ref: "wp_pump2", format: "bool" } },
        { id: "auto", primitive: "status", label: "AUTO ", position: { x: 10, y: 108 }, binding: { source: "wp", ref: "wp_auto", format: "bool" } },
        { id: "manual", primitive: "status", label: "MANUAL ", position: { x: 160, y: 108 }, binding: { source: "wp", ref: "wp_manual", format: "bool" } },
        { id: "alarm", primitive: "status", label: "ALARM ", position: { x: 10, y: 140 }, binding: { source: "wp", ref: "wp_alarm", format: "bool" } },
        { id: "sp_start_ro", primitive: "text", label: "Lead ", position: { x: 10, y: 174 }, binding: { source: "sp", ref: "sp_start", format: "fixed2", unit: "bar" } },
        { id: "sp_stop_ro", primitive: "text", label: "Stop ", position: { x: 170, y: 174 }, binding: { source: "sp", ref: "sp_stop", format: "fixed2", unit: "bar" } },
        { id: "nav", primitive: "text", label: ">  меню", position: { x: 10, y: 210 }, color: HMI_COLOR.MUTED },
      ],
    },
  ];

  return {
    programVersion: "0.2",
    name: "Booster station PS-01",
    version: "v2",
    elements,
    hmiScreens,
    bindings: {
      inputs: {
        pressure: SATURN_TERMINALS.inputs.AI1,
        "emergency-stop": SATURN_TERMINALS.inputs.DI1,
        "pump-1-feedback": SATURN_TERMINALS.inputs.DI2,
        "auto-mode": SATURN_TERMINALS.inputs.DI3,
        "pump-2-feedback": SATURN_TERMINALS.inputs.DI4,
        "tank-low-level": SATURN_TERMINALS.inputs.DI5,
      },
      outputs: {
        "pump-1-command": SATURN_TERMINALS.outputs.DO1,
        alarm: SATURN_TERMINALS.outputs.DO2,
        "pump-2-command": SATURN_TERMINALS.outputs.DO3,
        "suction-valve": SATURN_TERMINALS.outputs.DO4,
      },
    },
  };
}

export function compileSaturnProgram(source: SaturnFbdProgram): CompiledSaturnProgram {
  const elementIndex = new Map(source.elements.map((element, index) => [element.id, index]));
  const screens = compileHmiScreens(source.hmiScreens, { elementIndex });
  const compiled = buildSchema(source.elements, {
    projectName: source.name,
    projectVersion: source.version,
    buildTime: new Date().toISOString().slice(0, 16).replace("T", " "),
    screens,
    hints: [
      { type: 0, index: source.bindings.inputs.pressure ?? 11, text: "Pressure sensor (AI1)" },
      { type: 0, index: source.bindings.inputs["emergency-stop"] ?? 1, text: "Emergency stop (DI1)" },
      { type: 0, index: source.bindings.inputs["pump-1-feedback"] ?? 2, text: "Pump P-101 feedback (DI2)" },
      { type: 0, index: source.bindings.inputs["auto-mode"] ?? 3, text: "Automatic mode (DI3)" },
      { type: 0, index: source.bindings.inputs["pump-2-feedback"] ?? 4, text: "Pump P-102 feedback (DI4)" },
      { type: 0, index: source.bindings.inputs["tank-low-level"] ?? 5, text: "Tank low level (DI5)" },
      { type: 1, index: source.bindings.outputs["pump-1-command"] ?? 1, text: "Pump P-101 starter (DO1)" },
      { type: 1, index: source.bindings.outputs.alarm ?? 2, text: "Alarm lamp (DO2)" },
      { type: 1, index: source.bindings.outputs["pump-2-command"] ?? 3, text: "Pump P-102 starter (DO3)" },
      { type: 1, index: source.bindings.outputs["suction-valve"] ?? 4, text: "Suction valve (DO4)" },
    ],
  });
  return { ...compiled, source };
}

export function projectScadaToHmi(widgets: readonly ScadaWidget[], title = "PROCESS"): HmiProjection {
  const elements: HmiScreenModel["elements"] = [
    { id: "header", primitive: "rect", position: { x: 0, y: 0 }, width: 320, height: 28 },
    { id: "title", primitive: "text", label: title, position: { x: 8, y: 7 }, font: 1 },
  ];
  const report: HmiProjection["report"] = [];
  for (const widget of widgets) {
    if (widget.kind === "text" || widget.kind === "value" || widget.kind === "status" || widget.kind === "rect") {
      const projected: HmiScreenModel["elements"][number] = {
        id: widget.id,
        primitive: widget.kind,
        label: widget.label,
        position: { x: clamp(widget.position.x, 0, 310), y: clamp(widget.position.y, 30, 225) },
      };
      if (widget.width !== undefined) projected.width = widget.width;
      if (widget.height !== undefined) projected.height = widget.height;
      if (widget.binding !== undefined) projected.binding = widget.binding;
      elements.push(projected);
      report.push({ widgetId: widget.id, status: "transferred", reason: "Supported by Saturn FBD screen primitives." });
    } else if (widget.kind === "trend") {
      report.push({ widgetId: widget.id, status: "simplified", reason: "Trend becomes a current numeric value on the controller HMI." });
      if (widget.binding) elements.push({ id: `${widget.id}-value`, primitive: "value", label: widget.label, position: widget.position, binding: widget.binding });
    } else {
      report.push({ widgetId: widget.id, status: "software-only", reason: "Interactive history and commands remain in the host SCADA." });
    }
  }
  return { screen: { id: "scada-projection", title, screenType: "main", period: 500, elements }, report };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
