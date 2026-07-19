/**
 * Saturn-PLC front-panel menu (Saturn PLC_re4.pdf, §8).
 *
 * This menu belongs to the *controller firmware*, not to the user program: `fbdrt.c`
 * only draws the screens declared in the .fbdbin. The standard menu enumerates and edits
 * the schema's HMI points through `fbdHMIgetSP` / `fbdHMIsetSP` / `fbdHMIgetWP`, which is
 * exactly why those functions exist in the runtime ABI. A browser host therefore has to
 * reproduce it, the same way the real controller's firmware does around fbdrt.
 */

export type PanelButton = "up" | "down" | "left" | "right";

export type PanelScreen =
  | { kind: "main" }
  | { kind: "menu"; index: number }
  | { kind: "watchpoints"; index: number }
  | { kind: "setpoints"; index: number }
  | { kind: "setpoint-edit"; spIndex: number; draft: number }
  | { kind: "about" };

export const PANEL_MENU_ITEMS = [
  { id: "watchpoints", label: "Точки контроля" },
  { id: "setpoints", label: "Точки регулирования" },
  { id: "about", label: "Об устройстве" },
] as const;

/** One HMI point as the firmware menu sees it, read straight from the running program. */
export interface PanelSetpoint {
  index: number;
  caption: string;
  value: number;
  lowLimit: number;
  upperLimit: number;
  divider: number;
  step: number;
}

export interface PanelWatchpoint {
  caption: string;
  value: number;
  divider: number;
}

export interface PanelContext {
  setpoints: readonly PanelSetpoint[];
  watchpoints: readonly PanelWatchpoint[];
  projectName: string;
  version: string;
}

/** Value shown to the operator: raw runtime integer scaled by the point's divider. */
export function formatPanelValue(value: number, divider: number): string {
  return divider > 0 ? (value / 10 ** divider).toFixed(divider) : String(Math.round(value));
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}

function clampSetpoint(setpoint: PanelSetpoint, value: number): number {
  const step = setpoint.step > 0 ? setpoint.step : 1;
  const snapped = Math.round(value / step) * step;
  return Math.min(setpoint.upperLimit, Math.max(setpoint.lowLimit, snapped));
}

export interface PanelResult {
  screen: PanelScreen;
  /** Set when the operator confirmed a new setpoint: write it with `setSetpoint`. */
  commit?: { index: number; value: number };
}

/** Front-panel key handling, mirroring the menu tree in §8 of the device manual. */
export function reducePanel(screen: PanelScreen, button: PanelButton, ctx: PanelContext): PanelResult {
  switch (screen.kind) {
    case "main":
      if (button === "right") return { screen: { kind: "menu", index: 0 } };
      return { screen };

    case "menu": {
      if (button === "left") return { screen: { kind: "main" } };
      if (button === "up") return { screen: { ...screen, index: clampIndex(screen.index - 1, PANEL_MENU_ITEMS.length) } };
      if (button === "down") return { screen: { ...screen, index: clampIndex(screen.index + 1, PANEL_MENU_ITEMS.length) } };
      const item = PANEL_MENU_ITEMS[screen.index];
      if (button === "right" && item !== undefined) {
        if (item.id === "watchpoints") return { screen: { kind: "watchpoints", index: 0 } };
        if (item.id === "setpoints") return { screen: { kind: "setpoints", index: 0 } };
        if (item.id === "about") return { screen: { kind: "about" } };
      }
      return { screen };
    }

    case "watchpoints": {
      if (button === "left") return { screen: { kind: "menu", index: 0 } };
      if (button === "up") return { screen: { ...screen, index: clampIndex(screen.index - 1, ctx.watchpoints.length) } };
      if (button === "down") return { screen: { ...screen, index: clampIndex(screen.index + 1, ctx.watchpoints.length) } };
      return { screen };
    }

    case "setpoints": {
      if (button === "left") return { screen: { kind: "menu", index: 1 } };
      if (button === "up") return { screen: { ...screen, index: clampIndex(screen.index - 1, ctx.setpoints.length) } };
      if (button === "down") return { screen: { ...screen, index: clampIndex(screen.index + 1, ctx.setpoints.length) } };
      if (button === "right") {
        const setpoint = ctx.setpoints[screen.index];
        if (setpoint === undefined) return { screen };
        return { screen: { kind: "setpoint-edit", spIndex: screen.index, draft: setpoint.value } };
      }
      return { screen };
    }

    case "setpoint-edit": {
      const setpoint = ctx.setpoints[screen.spIndex];
      if (setpoint === undefined) return { screen: { kind: "setpoints", index: 0 } };
      if (button === "left") return { screen: { kind: "setpoints", index: screen.spIndex } };
      if (button === "up") return { screen: { ...screen, draft: clampSetpoint(setpoint, screen.draft + (setpoint.step > 0 ? setpoint.step : 1)) } };
      if (button === "down") return { screen: { ...screen, draft: clampSetpoint(setpoint, screen.draft - (setpoint.step > 0 ? setpoint.step : 1)) } };
      if (button === "right") {
        return { screen: { kind: "setpoints", index: screen.spIndex }, commit: { index: setpoint.index, value: screen.draft } };
      }
      return { screen };
    }

    case "about":
      if (button === "left") return { screen: { kind: "menu", index: 2 } };
      return { screen };
  }
}
