export type HmiPrimitive =
  | "text"
  | "value"
  | "status"
  | "indicator"
  | "line"
  | "rect"
  | "icon"
  | "bar"
  | "alarmBanner"
  | "setpoint"
  | "pageLink";

export interface HmiBinding {
  source: "wp" | "sp" | "input" | "output" | "system";
  ref: string;
  format?: "bool" | "int" | "fixed1" | "fixed2";
  unit?: string;
}

/**
 * Show this element only while a schema element holds a given value. This is how the
 * program — not the host — decides what is on the display: the firmware evaluates the
 * condition per element on every redraw (`ScrElemBase_t.visibleCond/visibleElem`).
 */
export interface HmiVisibilityModel {
  cond: "eq" | "ne" | "gt" | "lt";
  /** Schema element id whose value is compared. */
  ref: string;
  value: number;
}

export interface HmiElementModel {
  id: string;
  primitive: HmiPrimitive;
  label?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  color?: number;
  font?: number;
  binding?: HmiBinding;
  visible?: HmiVisibilityModel;
}

export interface HmiScreenModel {
  id: string;
  title: string;
  screenType: "main" | "setpoints" | "alarms" | "diagnostics" | "manual" | "version";
  backgroundColor?: number;
  period?: number;
  elements: HmiElementModel[];
}

export interface ScadaWidget {
  id: string;
  kind: "text" | "value" | "status" | "rect" | "trend" | "alarm-list" | "command";
  label: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  binding?: HmiBinding;
}

export interface HmiCompatibilityItem {
  widgetId: string;
  status: "transferred" | "simplified" | "software-only";
  reason: string;
}

export interface HmiProjection {
  screen: HmiScreenModel;
  report: HmiCompatibilityItem[];
}
