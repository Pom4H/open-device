import type { Sample } from "@open-device/spec";

/**
 * Vendor-neutral seam between the Studio and a controller target profile.
 *
 * The playground talks to the selected controller exclusively through this
 * interface: program lifecycle, compilation, runtime IO by semantic port IDs,
 * front-panel view with terminal anchors, and the optional firmware display.
 * Everything vendor-numeric — pin indices, terminal IDs, binary formats,
 * character encodings, menu trees — stays inside the profile adapter.
 */

export type PortSide = "top" | "right" | "bottom" | "left";
export type SignalKind = "analog" | "digital" | "safety" | "process" | "power" | "network";

export interface ControllerPortSpec {
  id: string;
  terminalId?: string;
  label: string;
  direction: "input" | "output";
  signal: SignalKind;
  x: number;
  y: number;
  side: PortSide;
}

/** One block of the profile's program source, as the graph editor sees it. */
export interface ProgramBlock {
  id: string;
  type: number;
  title: string;
  x: number;
  y: number;
  inputs?: string[];
  params?: number[];
  caption?: string;
}

export interface ProgramBlockMeta {
  badge: string;
  group: string;
  name: string;
}

/** Program source: the editor needs name/version/blocks; profile fields ride along. */
export interface ControllerProgram {
  name: string;
  version: string;
  elements: ProgramBlock[];
}

export interface CompiledControllerProgram {
  /** Deployable artifact bytes in the profile's release format. */
  artifact: Uint8Array;
  elementCount: number;
  screenCount: number;
  /** Human target label, e.g. "Saturn RTL v8". */
  targetLabel: string;
}

export interface ScadaWidget {
  id: string;
  kind: "value" | "status" | "trend" | "alarm-list" | "command";
  label: string;
  position: { x: number; y: number };
  binding?: { source: string; ref: string; format?: string; unit?: string };
}

export interface ScadaProjectionReport {
  transferred: number;
  simplified: number;
  softwareOnly: number;
}

export type PanelKey = "up" | "down" | "left" | "right";

export interface PanelKeyResult {
  /** True when the press reached the running program as an input edge. */
  reachedProgram: boolean;
  /** Human audit detail (menu navigation or pin effect). */
  detail: string;
}

export interface RuntimeLoadResult {
  ok: boolean;
  message?: string;
  memorySize?: number;
}

/**
 * A live controller runtime. All IO is keyed by semantic port IDs from the
 * program bindings; the adapter owns scaling, quality sentinels, and pins.
 */
export interface ControllerRuntimeHandle {
  load(artifact: Uint8Array): RuntimeLoadResult;
  /** Write wired input samples for one scan. Bad quality maps to the profile's failsafe sentinel. */
  writeInputs(inputs: Record<string, Sample>): void;
  /** Write a raw semantic value (engineering units) — used by conformance checks. */
  writeInput(portId: string, value: number | boolean): void;
  /** Advance one scan and refresh the display command list. */
  step(stepMs: number): void;
  readOutput(portId: string): number | boolean;
  /** Sampled outputs for every bound output port. */
  outputs(): Record<string, Sample>;
  /** Front-panel key press: firmware menu first, program pin on the working screen. */
  pressKey(key: PanelKey): PanelKeyResult;
  /** Draw the controller display (firmware menu or the program screen) into the SVG slot. */
  renderDisplay(display: SVGSVGElement): void;
  /** Display health for conformance checks. */
  displayStatus(): { commandCount: number; complete: boolean };
}

export interface ControllerProfileAdapter {
  /** Stable profile ID recorded in project documents, e.g. "saturn-fbd". */
  profileId: string;
  /** Renderer key this adapter provides the front panel for, e.g. "saturn-plc". */
  rendererId: string;
  displayName: string;
  artifactMediaType: string;
  artifactExtension: string;
  viewBox: { width: number; height: number };

  /** Front-panel markup; terminal pins carry data-terminal-id hooks. */
  renderView(options: { connectedTerminals?: string[]; defsPrefix: string }): string;
  /** Scene ports derived from the profile's terminal anchors. */
  ports(): ControllerPortSpec[];

  createDefaultProgram(): ControllerProgram;
  /** Validate a stored/imported program source; null when the shape is foreign. */
  parseProgram(raw: unknown): ControllerProgram | null;
  compile(program: ControllerProgram): CompiledControllerProgram;
  /** Number of semantic IO bindings the program declares. */
  ioCount(program: ControllerProgram): number;

  blockMeta(type: number): ProgramBlockMeta;
  /** Instantiate a palette block by profile block name; null when unknown. */
  createBlock(name: string, program: ControllerProgram): ProgramBlock | null;
  paramLabels(type: number): string[];
  /** Whether the block exposes an operator caption (HMI/menu metadata). */
  supportsCaption(type: number): boolean;

  /** Project software-SCADA widgets onto the controller display, mutating the program. */
  projectScada?(program: ControllerProgram, widgets: ScadaWidget[], title: string): ScadaProjectionReport;

  /** Instantiate a runtime for the program; semantic IO maps through its bindings. */
  createRuntime(program: ControllerProgram): Promise<ControllerRuntimeHandle>;
}

const registry = new Map<string, ControllerProfileAdapter>();

export function registerControllerProfile(adapter: ControllerProfileAdapter): void {
  registry.set(adapter.profileId, adapter);
}

export function controllerProfile(profileId: string): ControllerProfileAdapter | undefined {
  return registry.get(profileId);
}

export function controllerProfileForRenderer(rendererId: string): ControllerProfileAdapter | undefined {
  for (const adapter of registry.values()) {
    if (adapter.rendererId === rendererId) return adapter;
  }
  return undefined;
}
