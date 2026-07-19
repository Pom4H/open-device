import {
  ELEM,
  FbdRuntime,
  HMI_COLOR,
  INPUTS_COUNT,
  PARAMS_COUNT,
  PANEL_MENU_ITEMS,
  SATURN_KEYS,
  SATURN_PLC_VIEW_BOX,
  formatPanelValue,
  reducePanel,
  compileSaturnProgram,
  createPumpProgram,
  projectScadaToHmi,
  renderSaturnPlcSvg,
  saturnTerminalAnchor,
  type ElemCode,
  type HmiDrawCommand,
  type PanelButton,
  type PanelContext,
  type PanelScreen,
  type SaturnFbdProgram,
} from "@open-device/profile-saturn-fbd";
import type { Sample } from "@open-device/spec";

import {
  registerControllerProfile,
  type CompiledControllerProgram,
  type ControllerPortSpec,
  type ControllerProfileAdapter,
  type ControllerProgram,
  type ControllerRuntimeHandle,
  type PanelKey,
  type PanelKeyResult,
  type ProgramBlock,
  type ProgramBlockMeta,
  type RuntimeLoadResult,
  type ScadaProjectionReport,
  type ScadaWidget,
  type SignalKind,
} from "../controller-profile.ts";

/**
 * Saturn FBD target profile adapter. Everything Saturn-numeric — pin indices,
 * terminal IDs, the .fbdbin release format, CP1251 metadata, the §8 firmware
 * menu tree, and the 320×240 RGB565 display — stays behind this file.
 */

const asSaturn = (program: ControllerProgram): SaturnFbdProgram => program as unknown as SaturnFbdProgram;

/** Pin fallbacks for programs authored before bindings became mandatory. */
const DEFAULT_INPUT_PINS: Record<string, number> = {
  pressure: 11,
  "emergency-stop": 1,
  "pump-1-feedback": 2,
  "auto-mode": 3,
  "pump-2-feedback": 4,
  "tank-low-level": 5,
};
const DEFAULT_OUTPUT_PINS: Record<string, number> = {
  "pump-1-command": 1,
  alarm: 2,
  "pump-2-command": 3,
  "suction-valve": 4,
};

const KEY_PINS: Record<PanelKey, number> = {
  up: SATURN_KEYS.UP,
  down: SATURN_KEYS.DOWN,
  left: SATURN_KEYS.LEFT,
  right: SATURN_KEYS.RIGHT,
};
const KEY_EFFECTS: Record<PanelKey, string> = {
  up: "manual run latch set — the schema starts the lead pump",
  down: "manual run latch reset and fault acknowledge",
  left: "leaves the firmware menu",
  right: "enters the firmware menu",
};

function sampleOn(sample: Sample): boolean {
  return sample.value === true || sample.value === 1;
}

function rgb565ToCss(color: number): string {
  const red = Math.round(((color >> 11) & 0x1f) * 255 / 31);
  const green = Math.round(((color >> 5) & 0x3f) * 255 / 63);
  const blue = Math.round((color & 0x1f) * 255 / 31);
  return `rgb(${red} ${green} ${blue})`;
}

function terminalPort(id: string, terminalId: string, label: string, signal?: SignalKind): ControllerPortSpec {
  const anchor = saturnTerminalAnchor(terminalId);
  if (!anchor) throw new Error(`Missing Saturn terminal anchor ${terminalId}`);
  return {
    id,
    terminalId,
    label,
    direction: anchor.direction,
    signal: signal ?? (anchor.signal === "analog" ? "analog" : "digital"),
    x: anchor.x,
    y: anchor.y,
    side: anchor.side,
  };
}

class SaturnRuntimeHandle implements ControllerRuntimeHandle {
  private commands: HmiDrawCommand[] = [];
  private panelScreen: PanelScreen = { kind: "main" };
  /** Queued presses: each is held for exactly one scan so the schema sees a clean edge. */
  private keyQueue: number[] = [];
  private heldKeyPins: number[] = [];

  constructor(private readonly runtime: FbdRuntime, private readonly program: SaturnFbdProgram) {}

  private inputPin(portId: string): number | undefined {
    return this.program.bindings.inputs[portId] ?? DEFAULT_INPUT_PINS[portId];
  }

  private outputPin(portId: string): number | undefined {
    return this.program.bindings.outputs[portId] ?? DEFAULT_OUTPUT_PINS[portId];
  }

  load(artifact: Uint8Array): RuntimeLoadResult {
    return this.runtime.load(artifact);
  }

  writeInputs(inputs: Record<string, Sample>): void {
    for (const [portId, sample] of Object.entries(inputs)) {
      const pin = this.inputPin(portId);
      if (pin === undefined) continue;
      if (typeof sample.value === "number") {
        // Saturn analog convention: centiunits, failsafe sentinel on bad quality.
        this.runtime.setInput(pin, sample.quality === "good" ? Math.round(sample.value * 100) : 10_000);
      } else {
        this.runtime.setInput(pin, sampleOn(sample));
      }
    }
  }

  writeInput(portId: string, value: number | boolean): void {
    const pin = this.inputPin(portId);
    if (pin === undefined) return;
    this.runtime.setInput(pin, typeof value === "number" ? Math.round(value * 100) : value);
  }

  step(stepMs: number): void {
    // One queued press per scan: a keypress is a single edge, never a stuck contact, and
    // presses made faster than the scan cycle still each reach the schema.
    for (const pin of this.heldKeyPins) this.runtime.setInput(pin, false);
    this.heldKeyPins = [];
    const nextKey = this.keyQueue.shift();
    if (nextKey !== undefined) {
      this.runtime.setInput(nextKey, true);
      this.heldKeyPins.push(nextKey);
    }
    this.commands = this.runtime.stepAndRenderScreen(stepMs, 0);
  }

  readOutput(portId: string): number | boolean {
    const pin = this.outputPin(portId);
    return pin === undefined ? 0 : this.runtime.getOutput(pin);
  }

  outputs(): Record<string, Sample> {
    const result: Record<string, Sample> = {};
    const bound = Object.keys(this.program.bindings.outputs).length > 0
      ? Object.keys(this.program.bindings.outputs)
      : Object.keys(DEFAULT_OUTPUT_PINS);
    for (const portId of bound) result[portId] = { value: this.readOutput(portId), quality: "good" };
    return result;
  }

  displayStatus(): { commandCount: number; complete: boolean } {
    return { commandCount: this.commands.length, complete: this.runtime.drawEndSeen };
  }

  /** Firmware menu state (Saturn PLC_re4.pdf §8) — owned by the controller, not by the program. */
  private panelContext(): PanelContext {
    const setpoints = Array.from({ length: this.runtime.setpointCount }, (_, index) => {
      const sp = this.runtime.getSetpoint(index);
      return { index, caption: sp.caption, value: sp.value, lowLimit: sp.lowLimit, upperLimit: sp.upperLimit, divider: sp.divider, step: sp.step };
    });
    const watchpoints = Array.from({ length: this.runtime.watchpointCount }, (_, index) => {
      const wp = this.runtime.getWatchpoint(index);
      return { caption: wp.caption, value: wp.value, divider: wp.divider };
    });
    return { setpoints, watchpoints, projectName: this.program.name, version: this.program.version };
  }

  /**
   * A key press goes two places, exactly as on the device: the controller firmware menu
   * consumes it for navigation, and on the working screen it is also an ordinary schema
   * input pin, so the program itself can react (▲/▼ drive the manual-run latch).
   */
  pressKey(key: PanelKey): PanelKeyResult {
    const button = key as PanelButton;
    const onWorkingScreen = this.panelScreen.kind === "main";
    const result = reducePanel(this.panelScreen, button, this.panelContext());
    let detail = "";
    if (result.commit !== undefined) {
      const sp = this.runtime.getSetpoint(result.commit.index);
      this.runtime.setSetpoint(result.commit.index, result.commit.value);
      detail = `${sp.caption}: ${formatPanelValue(sp.value, sp.divider)} → ${formatPanelValue(result.commit.value, sp.divider)}`;
    }
    const moved = result.screen !== this.panelScreen;
    this.panelScreen = result.screen;

    // ▲/▼ on the working screen are free in the menu tree — they reach the schema as pins.
    if (onWorkingScreen && (key === "up" || key === "down")) {
      this.keyQueue.push(KEY_PINS[key]);
      return { reachedProgram: true, detail: `Input pin ${KEY_PINS[key]} → ${KEY_EFFECTS[key]}` };
    }
    if (detail !== "") return { reachedProgram: false, detail };
    return { reachedProgram: false, detail: moved ? `Firmware menu → ${this.panelScreen.kind}` : "" };
  }

  private panelText(display: SVGSVGElement, x: number, y: number, text: string, color: number, bold = false): void {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "text");
    node.setAttribute("x", String(x));
    node.setAttribute("y", String(y + 14));
    node.setAttribute("fill", rgb565ToCss(color));
    node.setAttribute("font-size", bold ? "15" : "13");
    if (bold) node.setAttribute("font-weight", "700");
    node.textContent = text;
    display.append(node);
  }

  private panelList(display: SVGSVGElement, rows: readonly string[], selectedIndex: number): void {
    const first = Math.max(0, Math.min(selectedIndex - 2, rows.length - 4));
    rows.slice(first, first + 4).forEach((row, offset) => {
      const index = first + offset;
      const y = 52 + offset * 34;
      if (index === selectedIndex) {
        const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", "6");
        bar.setAttribute("y", String(y - 4));
        bar.setAttribute("width", "308");
        bar.setAttribute("height", "28");
        bar.setAttribute("fill", rgb565ToCss(HMI_COLOR.HEADER));
        display.append(bar);
      }
      this.panelText(display, 14, y, row, index === selectedIndex ? HMI_COLOR.ACCENT : HMI_COLOR.TEXT);
    });
  }

  /** Draw the controller firmware menu; the program screen is what shows on `main`. */
  private renderPanelMenu(display: SVGSVGElement): void {
    const ctx = this.panelContext();
    const header = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    header.setAttribute("width", "320");
    header.setAttribute("height", "30");
    header.setAttribute("fill", rgb565ToCss(HMI_COLOR.HEADER));
    display.append(header);

    if (this.panelScreen.kind === "menu") {
      this.panelText(display, 10, 6, "МЕНЮ", HMI_COLOR.TEXT, true);
      this.panelList(display, PANEL_MENU_ITEMS.map((item) => item.label), this.panelScreen.index);
      this.panelText(display, 10, 208, "^ v выбор   > вход   < назад", HMI_COLOR.MUTED);
      return;
    }
    if (this.panelScreen.kind === "watchpoints") {
      this.panelText(display, 10, 6, "ТОЧКИ КОНТРОЛЯ", HMI_COLOR.TEXT, true);
      this.panelList(display, ctx.watchpoints.map((wp) => `${wp.caption}  ${formatPanelValue(wp.value, wp.divider)}`), this.panelScreen.index);
      this.panelText(display, 10, 208, "^ v прокрутка   < назад", HMI_COLOR.MUTED);
      return;
    }
    if (this.panelScreen.kind === "setpoints") {
      this.panelText(display, 10, 6, "ТОЧКИ РЕГУЛИРОВАНИЯ", HMI_COLOR.TEXT, true);
      this.panelList(display, ctx.setpoints.map((sp) => `${sp.caption}  ${formatPanelValue(sp.value, sp.divider)}`), this.panelScreen.index);
      this.panelText(display, 10, 208, "> изменить   < назад", HMI_COLOR.MUTED);
      return;
    }
    if (this.panelScreen.kind === "setpoint-edit") {
      const sp = ctx.setpoints[this.panelScreen.spIndex];
      this.panelText(display, 10, 6, "ИЗМЕНЕНИЕ", HMI_COLOR.TEXT, true);
      this.panelText(display, 14, 52, sp?.caption ?? "", HMI_COLOR.TEXT);
      this.panelText(display, 14, 92, formatPanelValue(this.panelScreen.draft, sp?.divider ?? 0), HMI_COLOR.ACCENT, true);
      if (sp) this.panelText(display, 14, 130, `${formatPanelValue(sp.lowLimit, sp.divider)} … ${formatPanelValue(sp.upperLimit, sp.divider)}`, HMI_COLOR.MUTED);
      this.panelText(display, 10, 208, "^ v значение   > записать   < отмена", HMI_COLOR.MUTED);
      return;
    }
    this.panelText(display, 10, 6, "ОБ УСТРОЙСТВЕ", HMI_COLOR.TEXT, true);
    this.panelText(display, 14, 52, ctx.projectName, HMI_COLOR.TEXT);
    this.panelText(display, 14, 86, `Версия ${ctx.version}`, HMI_COLOR.TEXT);
    this.panelText(display, 14, 120, "МНПП Сатурн · RTL v8", HMI_COLOR.MUTED);
    this.panelText(display, 10, 208, "< назад", HMI_COLOR.MUTED);
  }

  renderDisplay(display: SVGSVGElement): void {
    display.replaceChildren();
    display.style.background = rgb565ToCss(HMI_COLOR.BG);
    // Off the working screen the firmware menu owns the display, exactly as on the device.
    if (this.panelScreen.kind !== "main") {
      this.renderPanelMenu(display);
      return;
    }
    for (const command of this.commands) {
      if (command.type === "rect") {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(Math.min(command.x1, command.x2)));
        rect.setAttribute("y", String(Math.min(command.y1, command.y2)));
        rect.setAttribute("width", String(Math.abs(command.x2 - command.x1) + 1));
        rect.setAttribute("height", String(Math.abs(command.y2 - command.y1) + 1));
        rect.setAttribute("fill", rgb565ToCss(command.color));
        display.append(rect);
      } else if (command.type === "line") {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(command.x1));
        line.setAttribute("y1", String(command.y1));
        line.setAttribute("x2", String(command.x2));
        line.setAttribute("y2", String(command.y2));
        line.setAttribute("stroke", rgb565ToCss(command.color));
        display.append(line);
      } else if (command.type === "ellipse") {
        const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        ellipse.setAttribute("cx", String((command.x1 + command.x2) / 2));
        ellipse.setAttribute("cy", String((command.y1 + command.y2) / 2));
        ellipse.setAttribute("rx", String(Math.abs(command.x2 - command.x1) / 2));
        ellipse.setAttribute("ry", String(Math.abs(command.y2 - command.y1) / 2));
        ellipse.setAttribute("fill", rgb565ToCss(command.color));
        display.append(ellipse);
      } else if (command.type === "text") {
        const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
        const fontSize = command.font === 1 ? 14 : 12;
        textNode.setAttribute("x", String(command.x));
        textNode.setAttribute("y", String(command.y + fontSize));
        textNode.setAttribute("fill", rgb565ToCss(command.color));
        textNode.setAttribute("font-size", String(fontSize));
        textNode.setAttribute("font-weight", command.font === 1 ? "700" : "500");
        if (!command.transparent) {
          textNode.setAttribute("stroke", rgb565ToCss(command.bkcolor));
          textNode.setAttribute("stroke-width", "3");
          textNode.setAttribute("paint-order", "stroke");
        }
        textNode.textContent = command.text;
        display.append(textNode);
      } else {
        const placeholder = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        placeholder.setAttribute("x", String(command.x));
        placeholder.setAttribute("y", String(command.y));
        placeholder.setAttribute("width", "20");
        placeholder.setAttribute("height", "20");
        placeholder.setAttribute("fill", rgb565ToCss(HMI_COLOR.MUTED));
        display.append(placeholder);
      }
    }
  }
}

function fbdMeta(type: ElemCode): ProgramBlockMeta {
  if (type === ELEM.INP_PIN) return { badge: "IN", group: "io", name: "Hardware input" };
  if (type === ELEM.OUT_PIN) return { badge: "OUT", group: "io", name: "Hardware output" };
  if (type === ELEM.SP) return { badge: "SP", group: "setpoint", name: "Setpoint" };
  if (type === ELEM.WP) return { badge: "WP", group: "setpoint", name: "Watchpoint" };
  if (type === ELEM.CONST) return { badge: "123", group: "compare", name: "Constant" };
  if (type === ELEM.CMP) return { badge: "CMP", group: "compare", name: "Compare" };
  if (type === ELEM.RSTRG) return { badge: "RS", group: "memory", name: "RS trigger" };
  if (type === ELEM.TON) return { badge: "TON", group: "timer", name: "On-delay timer" };
  if (type === ELEM.NOT) return { badge: "NOT", group: "logic", name: "NOT" };
  if (type === ELEM.AND) return { badge: "AND", group: "logic", name: "AND" };
  if (type === ELEM.OR) return { badge: "OR", group: "logic", name: "OR" };
  return { badge: String(type), group: "logic", name: "FBD block" };
}

export const saturnFbdProfile: ControllerProfileAdapter = {
  profileId: "saturn-fbd",
  rendererId: "saturn-plc",
  displayName: "Saturn FBD",
  artifactMediaType: "application/vnd.saturn.fbdbin",
  artifactExtension: "fbdbin",
  viewBox: { width: SATURN_PLC_VIEW_BOX.width, height: SATURN_PLC_VIEW_BOX.height },

  renderView(options) {
    return renderSaturnPlcSvg({ connectedTerminals: options.connectedTerminals ?? [], defsPrefix: options.defsPrefix });
  },

  ports(): ControllerPortSpec[] {
    return [
      terminalPort("pump-1-command", "DO1", "DO1 · P-101 command"),
      terminalPort("alarm", "DO2", "DO2 · Common alarm"),
      terminalPort("pump-2-command", "DO3", "DO3 · P-102 command"),
      terminalPort("suction-valve", "DO4", "DO4 · Suction valve"),
      terminalPort("emergency-stop", "DI1", "DI1 · Emergency stop", "safety"),
      terminalPort("pump-1-feedback", "DI2", "DI2 · P-101 feedback"),
      terminalPort("pump-2-feedback", "DI4", "DI4 · P-102 feedback"),
      terminalPort("tank-low-level", "DI5", "DI5 · Tank low level"),
      terminalPort("pressure", "AI1", "AI1 · Header pressure"),
      { id: "rs485", label: "X6 · RS-485 fieldbus", direction: "input", signal: "network", x: 121.5, y: 330, side: "bottom" },
    ];
  },

  createDefaultProgram(): ControllerProgram {
    return createPumpProgram() as unknown as ControllerProgram;
  },

  parseProgram(raw: unknown): ControllerProgram | null {
    const candidate = raw as SaturnFbdProgram | null;
    if (!candidate || candidate.programVersion !== "0.2" || !Array.isArray(candidate.elements) || !Array.isArray(candidate.hmiScreens)) return null;
    return candidate as unknown as ControllerProgram;
  },

  compile(program: ControllerProgram): CompiledControllerProgram {
    const compiled = compileSaturnProgram(asSaturn(program));
    return {
      artifact: compiled.fbdbin,
      elementCount: compiled.elementCount,
      screenCount: compiled.screenCount,
      targetLabel: `Saturn RTL v${compiled.requiredRtlVersion}`,
    };
  },

  ioCount(program: ControllerProgram): number {
    const bindings = asSaturn(program).bindings;
    return Object.keys(bindings.inputs).length + Object.keys(bindings.outputs).length;
  },

  blockMeta(type: number): ProgramBlockMeta {
    return fbdMeta(type as ElemCode);
  },

  createBlock(name: string, program: ControllerProgram): ProgramBlock | null {
    const type = ELEM[name as keyof typeof ELEM];
    if (type === undefined) return null;
    const inputCount = INPUTS_COUNT[type] ?? 0;
    const paramCount = PARAMS_COUNT[type] ?? 0;
    const fallbackSource = program.elements.find((element) => element.type === ELEM.CONST)?.id ?? "pressure";
    const meta = fbdMeta(type);
    const block: ProgramBlock = {
      id: `${name.toLowerCase()}_${Date.now().toString(36)}`,
      type,
      title: `New ${meta.name}`,
      x: 320 + (program.elements.length % 6) * 180,
      y: 600,
    };
    if (inputCount > 0) block.inputs = Array.from({ length: inputCount }, () => fallbackSource);
    if (paramCount > 0) block.params = Array.from({ length: paramCount }, (_, index) => type === ELEM.SP ? [0, 10000, 100, 0, 1][index] ?? 0 : 0);
    if (type === ELEM.SP || type === ELEM.WP) block.caption = meta.name;
    return block;
  },

  paramLabels(type: number): string[] {
    if (type === ELEM.SP) return ["Lower limit", "Upper limit", "Default value", "Divider", "Step"];
    if (type === ELEM.INP_PIN || type === ELEM.OUT_PIN) return ["Hardware pin"];
    if (type === ELEM.WP) return ["Divider"];
    return [];
  },

  supportsCaption(type: number): boolean {
    return type === ELEM.SP || type === ELEM.WP;
  },

  projectScada(program: ControllerProgram, widgets: ScadaWidget[], title: string): ScadaProjectionReport {
    const projection = projectScadaToHmi(widgets as Parameters<typeof projectScadaToHmi>[0], title);
    asSaturn(program).hmiScreens[0] = projection.screen;
    const counts: ScadaProjectionReport = { transferred: 0, simplified: 0, softwareOnly: 0 };
    for (const item of projection.report) {
      if (item.status === "transferred") counts.transferred += 1;
      else if (item.status === "simplified") counts.simplified += 1;
      else counts.softwareOnly += 1;
    }
    return counts;
  },

  async createRuntime(program: ControllerProgram): Promise<ControllerRuntimeHandle> {
    const runtime = await FbdRuntime.create();
    return new SaturnRuntimeHandle(runtime, asSaturn(program));
  },
};

registerControllerProfile(saturnFbdProfile);
