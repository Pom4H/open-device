import { resolvePackage } from "@open-device/core";
import type { Quality, Sample } from "@open-device/spec";
import {
  controllerProfile,
  controllerProfileForRenderer,
  type CompiledControllerProgram,
  type ControllerProfileAdapter,
  type ControllerProgram,
  type ControllerRuntimeHandle,
  type PanelKey,
  type PortSide,
  type ProgramBlock,
  type SignalKind,
} from "./controller-profile.ts";
// Target profiles register themselves; the Studio only ever talks to the neutral seam.
import "./profiles/saturn-fbd.ts";
import { BUILTIN_RENDERERS, resolveEquipmentCatalog, signalForModelPort, type ResolvedEquipmentDefinition } from "./equipment-catalog.ts";
import { initializeBoosterStationDiagram, updateBoosterStationDiagram } from "./plant-diagram.ts";
import { pointsToPath, routeOrthogonal } from "./routing.ts";
import { parseEngineeringProject, type EngineeringProjectDocument, type ProjectAdapter } from "./project-document.ts";

const PACKAGE_URL = new URL("/packages/pump-controller/open-device.json", location.href).href;
const CATALOG_URL = new URL("/packages/catalog/open-device-catalog.json", location.href).href;
const STEP_MS = 100;
const WORLD = { width: 1760, height: 920 };
const LAYOUT_KEY = "open-device-studio:scene:v3";
const LEGACY_LAYOUT_KEY = "open-device-studio:scene:v2";
const LEGACY_PROGRAM_KEY = "open-device-studio:saturn-fbd:v7";
const PROJECT_ID = "booster-station-ps01";
const PROJECT_TITLE = "Booster station PS-01";

/**
 * The program editor is not the Studio's front door: it exists only while a
 * device with a registered controller profile is on the scene. The default
 * profile is the first registered one; project imports can switch it.
 */
const DEFAULT_PROFILE_ID = "saturn-fbd";
let activeProfile: ControllerProfileAdapter = (() => {
  const profile = controllerProfile(DEFAULT_PROFILE_ID);
  if (!profile) throw new Error(`Controller profile ${DEFAULT_PROFILE_ID} is not registered`);
  return profile;
})();

function programStorageKey(): string {
  return `open-device-studio:program:${activeProfile.profileId}:v7`;
}

type Mode = "edit" | "simulate" | "scada";
type DeviceKind = ProjectAdapter;
type LegacyDeviceKind = Exclude<DeviceKind, "registry">;

interface PortSpec {
  id: string;
  terminalId?: string;
  label: string;
  direction: "input" | "output";
  signal: SignalKind;
  x: number;
  y: number;
  side: PortSide;
}

interface DeviceSpec {
  id: string;
  kind: DeviceKind;
  definitionId: string;
  definitionVersion: string;
  catalogAlias: string;
  renderer: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ports: PortSpec[];
  /** Inline package front-panel SVG for registry-rendered devices. */
  svgText?: string | null;
}

interface Connection {
  id: string;
  from: { nodeId: string; portId: string };
  to: { nodeId: string; portId: string };
}

interface OperatorEvent {
  id: number;
  kind: "info" | "alarm";
  title: string;
  detail: string;
  time: Date;
  acknowledged: boolean;
}

interface StoredSceneDevice {
  id: string;
  kind: DeviceKind;
  definitionId: string;
  definitionVersion: string;
  catalogAlias: string;
  renderer: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  ports?: PortSpec[];
}

interface StoredScene {
  version: 3 | 4;
  devices: StoredSceneDevice[];
  connections: Connection[];
}

interface LegacyStoredScene {
  positions: Record<string, { x: number; y: number }>;
  connections: Connection[];
  visible: DeviceKind[];
}

const PORTS: Record<LegacyDeviceKind, PortSpec[]> = {
  controller: activeProfile.ports(),
  sensor: [
    { id: "process", label: "Process pressure tap", direction: "input", signal: "process", x: 0, y: 96, side: "left" },
    { id: "pressure", label: "4–20 mA output", direction: "output", signal: "analog", x: 180, y: 72, side: "right" },
  ],
  pump1: [
    { id: "suction", label: "Suction pipe", direction: "input", signal: "process", x: 0, y: 32, side: "left" },
    { id: "discharge", label: "Discharge pipe", direction: "output", signal: "process", x: 205, y: 32, side: "right" },
    { id: "command", label: "Motor command", direction: "input", signal: "digital", x: 0, y: 69, side: "left" },
    { id: "feedback", label: "Run feedback", direction: "output", signal: "digital", x: 0, y: 111, side: "left" },
    { id: "motor-supply", label: "Motor supply 3~", direction: "input", signal: "power", x: 0, y: 140, side: "left" },
  ],
  pump2: [
    { id: "suction", label: "Suction pipe", direction: "input", signal: "process", x: 0, y: 32, side: "left" },
    { id: "discharge", label: "Discharge pipe", direction: "output", signal: "process", x: 205, y: 32, side: "right" },
    { id: "command", label: "Motor command", direction: "input", signal: "digital", x: 0, y: 69, side: "left" },
    { id: "feedback", label: "Run feedback", direction: "output", signal: "digital", x: 0, y: 111, side: "left" },
    { id: "motor-supply", label: "Motor supply 3~", direction: "input", signal: "power", x: 0, y: 140, side: "left" },
  ],
  reservoir: [
    { id: "outlet", label: "Water outlet", direction: "output", signal: "process", x: 180, y: 104, side: "right" },
    { id: "low-level", label: "Low-level switch", direction: "output", signal: "digital", x: 180, y: 72, side: "right" },
  ],
  suctionHeader: [
    { id: "inlet-a", label: "Inlet A", direction: "input", signal: "process", x: 0, y: 25, side: "left" },
    { id: "inlet-b", label: "Inlet B", direction: "input", signal: "process", x: 0, y: 65, side: "left" },
    { id: "outlet-a", label: "Outlet A", direction: "output", signal: "process", x: 250, y: 25, side: "right" },
    { id: "outlet-b", label: "Outlet B", direction: "output", signal: "process", x: 250, y: 65, side: "right" },
  ],
  dischargeHeader: [
    { id: "inlet-a", label: "Inlet A", direction: "input", signal: "process", x: 0, y: 25, side: "left" },
    { id: "inlet-b", label: "Inlet B", direction: "input", signal: "process", x: 0, y: 65, side: "left" },
    { id: "outlet-a", label: "Outlet A", direction: "output", signal: "process", x: 250, y: 25, side: "right" },
    { id: "outlet-b", label: "Outlet B", direction: "output", signal: "process", x: 250, y: 65, side: "right" },
  ],
  estop: [
    { id: "active", label: "Safety contact", direction: "output", signal: "safety", x: 180, y: 64, side: "right" },
  ],
};

const DEVICE_DEFAULTS: Record<LegacyDeviceKind, Omit<DeviceSpec, "ports">> = {
  controller: { id: "controller", kind: "controller", definitionId: "https://devices.open-device.dev/saturn/saturn-plc", definitionVersion: "0.1.0", catalogAlias: "@saturn/saturn-plc", renderer: activeProfile.rendererId, title: "Saturn PLC", subtitle: "Booster station controller", x: 300, y: 180, width: activeProfile.viewBox.width, height: activeProfile.viewBox.height },
  sensor: { id: "sensor", kind: "sensor", definitionId: "https://devices.open-device.dev/reference/pressure-transmitter", definitionVersion: "0.1.0", catalogAlias: "@reference/pressure-transmitter", renderer: "pressure-transmitter", title: "Pressure transmitter", subtitle: "PT-101 · 4–20 mA", x: 1180, y: 560, width: 180, height: 134 },
  pump1: { id: "pump1", kind: "pump1", definitionId: "https://devices.open-device.dev/reference/centrifugal-pump", definitionVersion: "0.1.0", catalogAlias: "@reference/centrifugal-pump", renderer: "centrifugal-pump", title: "Lead pump", subtitle: "P-101 · motor M1", x: 930, y: 220, width: 205, height: 156 },
  pump2: { id: "pump2", kind: "pump2", definitionId: "https://devices.open-device.dev/reference/centrifugal-pump", definitionVersion: "0.1.0", catalogAlias: "@reference/centrifugal-pump", renderer: "centrifugal-pump", title: "Lag / standby pump", subtitle: "P-102 · motor M2", x: 930, y: 480, width: 205, height: 156 },
  reservoir: { id: "reservoir", kind: "reservoir", definitionId: "https://devices.open-device.dev/reference/suction-tank", definitionVersion: "0.1.0", catalogAlias: "@reference/suction-tank", renderer: "suction-tank", title: "Suction reservoir", subtitle: "TK-101 · low-level switch", x: 70, y: 640, width: 180, height: 134 },
  suctionHeader: { id: "suction-header", kind: "suctionHeader", definitionId: "https://devices.open-device.dev/reference/process-header", definitionVersion: "0.1.0", catalogAlias: "@reference/process-header", renderer: "process-header", title: "Suction header", subtitle: "MH-101 · water manifold", x: 590, y: 700, width: 250, height: 90 },
  dischargeHeader: { id: "discharge-header", kind: "dischargeHeader", definitionId: "https://devices.open-device.dev/reference/process-header", definitionVersion: "0.1.0", catalogAlias: "@reference/process-header", renderer: "process-header", title: "Discharge header", subtitle: "MH-102 · water manifold", x: 1220, y: 360, width: 250, height: 90 },
  estop: { id: "estop", kind: "estop", definitionId: "https://devices.open-device.dev/reference/emergency-stop", definitionVersion: "0.1.0", catalogAlias: "@reference/emergency-stop", renderer: "emergency-stop", title: "Emergency stop", subtitle: "S0 · normally closed", x: 70, y: 235, width: 180, height: 118 },
};

const DEFAULT_CONNECTIONS: Connection[] = [
  { id: "wire-pressure", from: { nodeId: "sensor", portId: "pressure" }, to: { nodeId: "controller", portId: "pressure" } },
  { id: "wire-estop", from: { nodeId: "estop", portId: "active" }, to: { nodeId: "controller", portId: "emergency-stop" } },
  { id: "wire-command-1", from: { nodeId: "controller", portId: "pump-1-command" }, to: { nodeId: "pump1", portId: "command" } },
  { id: "wire-feedback-1", from: { nodeId: "pump1", portId: "feedback" }, to: { nodeId: "controller", portId: "pump-1-feedback" } },
  { id: "wire-command-2", from: { nodeId: "controller", portId: "pump-2-command" }, to: { nodeId: "pump2", portId: "command" } },
  { id: "wire-feedback-2", from: { nodeId: "pump2", portId: "feedback" }, to: { nodeId: "controller", portId: "pump-2-feedback" } },
  { id: "wire-tank-low", from: { nodeId: "reservoir", portId: "low-level" }, to: { nodeId: "controller", portId: "tank-low-level" } },
  { id: "pipe-tank-header", from: { nodeId: "reservoir", portId: "outlet" }, to: { nodeId: "suction-header", portId: "inlet-a" } },
  { id: "pipe-suction-1", from: { nodeId: "suction-header", portId: "outlet-a" }, to: { nodeId: "pump1", portId: "suction" } },
  { id: "pipe-suction-2", from: { nodeId: "suction-header", portId: "outlet-b" }, to: { nodeId: "pump2", portId: "suction" } },
  { id: "pipe-discharge-1", from: { nodeId: "pump1", portId: "discharge" }, to: { nodeId: "discharge-header", portId: "inlet-a" } },
  { id: "pipe-discharge-2", from: { nodeId: "pump2", portId: "discharge" }, to: { nodeId: "discharge-header", portId: "inlet-b" } },
  { id: "pipe-pressure-tap", from: { nodeId: "discharge-header", portId: "outlet-a" }, to: { nodeId: "sensor", portId: "process" } },
];

function el<T extends Element = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing #${id}`);
  return node as unknown as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sampleOn(sample: Sample | undefined): boolean {
  return sample?.value === true || sample?.value === 1;
}

const body = document.body;
const canvasViewport = el<HTMLDivElement>("canvas-viewport");
const canvasWorld = el<HTMLDivElement>("canvas-world");
const nodesLayer = el<HTMLDivElement>("nodes-layer");
const cablesGroup = el<SVGGElement>("cables");
const draftCable = el<SVGPathElement>("draft-cable");
const connectHint = el<HTMLSpanElement>("connect-hint");
const fbdNodesLayer = el<HTMLDivElement>("fbd-nodes");
const fbdEdgesLayer = el<SVGGElement>("fbd-edges");
const fbdDraftEdge = el<SVGPathElement>("fbd-draft-edge");

let mode: Mode = "simulate";
let zoom = 0.78;
let hadStoredScene = false;
let devices: DeviceSpec[] = (Object.keys(DEVICE_DEFAULTS) as LegacyDeviceKind[]).map((kind) => ({ ...DEVICE_DEFAULTS[kind], ports: PORTS[kind].map((port) => ({ ...port })) }));
let connections = DEFAULT_CONNECTIONS.map((connection) => structuredClone(connection));
let equipmentDefinitions: ResolvedEquipmentDefinition[] = [];
let selected: { kind: "node" | "connection"; id: string } | null = { kind: "node", id: "controller" };
let pendingPort: { nodeId: string; portId: string } | null = null;
let dragState: { nodeId: string; pointerId: number; offsetX: number; offsetY: number } | null = null;
let fbdProgram: ControllerProgram = activeProfile.createDefaultProgram();
let compiledFbd: CompiledControllerProgram = activeProfile.compile(fbdProgram);
let fbdRuntime: ControllerRuntimeHandle | null = null;
let selectedFbdId: string | null = "start_ton";
let pendingFbdOutput: string | null = null;
let fbdDrag: { id: string; pointerId: number; offsetX: number; offsetY: number } | null = null;
let simulationRunning = true;
let pressure = 1.25;
let tankLevel = 72;
let pump1Running = false;
let pump2Running = false;
let controllerOutputs: Record<string, Sample> = {
  "pump-1-command": { value: false, quality: "unknown" },
  "pump-2-command": { value: false, quality: "unknown" },
  "suction-valve": { value: false, quality: "unknown" },
  alarm: { value: false, quality: "unknown" },
};
let cycleCount = 0;
let flowTotal = 0;
let previousAlarm = false;
let previousPump1 = false;
let previousPump2 = false;
let eventSequence = 0;
let trend: number[] = Array.from({ length: 60 }, () => pressure);
const events: OperatorEvent[] = [];

function isLegacyKind(kind: DeviceKind): kind is LegacyDeviceKind {
  return kind in DEVICE_DEFAULTS;
}

function restoreScene(): void {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY) ?? localStorage.getItem(LEGACY_LAYOUT_KEY);
    if (raw === null) return;
    const parsed = JSON.parse(raw) as StoredScene | LegacyStoredScene;
    if (!Array.isArray(parsed.connections)) return;
    if ("version" in parsed && (parsed.version === 3 || parsed.version === 4) && Array.isArray(parsed.devices)) {
      devices = parsed.devices
        .filter((device) => isLegacyKind(device.kind) || (device.kind === "registry" && Array.isArray(device.ports) && typeof device.width === "number" && typeof device.height === "number"))
        .map((device) => {
          if (!isLegacyKind(device.kind)) {
            return { ...device, width: device.width as number, height: device.height as number, ports: (device.ports as PortSpec[]).map((port) => ({ ...port })), svgText: null };
          }
          const base = DEVICE_DEFAULTS[device.kind];
          return { ...base, ...device, width: base.width, height: base.height, ports: PORTS[device.kind].map((port) => ({ ...port })) };
        });
      hadStoredScene = true;
    } else if ("visible" in parsed && Array.isArray(parsed.visible)) {
      devices = parsed.visible
        .filter((kind): kind is LegacyDeviceKind => kind in DEVICE_DEFAULTS)
        .map((kind) => {
          const base = DEVICE_DEFAULTS[kind];
          const position = parsed.positions[base.id] ?? base;
          return { ...base, x: position.x, y: position.y, ports: PORTS[kind].map((port) => ({ ...port })) };
        });
      hadStoredScene = true;
    }
    connections = parsed.connections.filter((connection) =>
      devices.some((device) => device.id === connection.from.nodeId) &&
      devices.some((device) => device.id === connection.to.nodeId),
    );
    localStorage.removeItem(LEGACY_LAYOUT_KEY);
  } catch {
    localStorage.removeItem(LAYOUT_KEY);
  }
}

function saveScene(): void {
  const stored: StoredScene = {
    version: 4,
    devices: devices.map(({ id, kind, definitionId, definitionVersion, catalogAlias, renderer, title, subtitle, x, y, width, height, ports }) => (
      kind === "registry"
        ? { id, kind, definitionId, definitionVersion, catalogAlias, renderer, title, subtitle, x, y, width, height, ports }
        : { id, kind, definitionId, definitionVersion, catalogAlias, renderer, title, subtitle, x, y }
    )),
    connections,
  };
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(stored));
}

function createProjectDocument(): EngineeringProjectDocument {
  return {
    projectVersion: "0.1",
    id: PROJECT_ID,
    title: PROJECT_TITLE,
    instances: devices.map((device) => ({
      id: device.id,
      adapter: device.kind,
      definition: {
        id: device.definitionId,
        version: device.definitionVersion,
        alias: device.catalogAlias,
        renderer: device.renderer,
      },
      title: device.title,
      subtitle: device.subtitle,
      position: { x: device.x, y: device.y },
    })),
    connections: connections.map((connection) => ({
      id: connection.id,
      from: { instanceId: connection.from.nodeId, portId: connection.from.portId },
      to: { instanceId: connection.to.nodeId, portId: connection.to.portId },
    })),
    programs: devices.some((device) => device.id === "controller") ? [{ instanceId: "controller", profile: activeProfile.profileId, source: structuredClone(fbdProgram) }] : [],
  };
}

function downloadProject(): void {
  const project = createProjectDocument();
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${project.id}.open-device-project.json`;
  link.click();
  URL.revokeObjectURL(href);
  audit("Engineering project exported", `${project.instances.length} instances · ${project.connections.length} connections · ${project.programs.length} controller program`);
  toast("Project file saved");
}

function applyProject(project: EngineeringProjectDocument): void {
  const nextDevices: DeviceSpec[] = project.instances.map((instance) => {
    const definition = equipmentDefinitions.find((candidate) => candidate.catalog.alias === instance.definition.alias
      && candidate.pkg.manifest.id === instance.definition.id
      && candidate.pkg.manifest.version === instance.definition.version);
    if (equipmentDefinitions.length > 0 && !definition) throw new Error(`Definition ${instance.definition.alias}@${instance.definition.version} is not available in the resolved registry`);
    if (instance.adapter === "registry") {
      if (!definition) throw new Error(`Registry instance ${instance.id} requires a resolved equipment catalog`);
      if (instance.definition.renderer !== definition.catalog.renderer) throw new Error(`Instance ${instance.id} uses renderer ${instance.definition.renderer}, expected ${definition.catalog.renderer}`);
      const spec = registryDeviceSpec(definition);
      if (!spec) throw new Error(`Definition ${instance.definition.alias} does not declare topology-node geometry`);
      return {
        ...spec,
        id: instance.id,
        title: instance.title,
        subtitle: instance.subtitle,
        x: clamp(instance.position.x, 20, WORLD.width - spec.width - 20),
        y: clamp(instance.position.y, 20, WORLD.height - spec.height - 20),
      };
    }
    const base = DEVICE_DEFAULTS[instance.adapter];
    if (instance.definition.renderer !== base.renderer) throw new Error(`Instance ${instance.id} uses renderer ${instance.definition.renderer}, expected ${base.renderer}`);
    return {
      ...base,
      id: instance.id,
      definitionId: instance.definition.id,
      definitionVersion: instance.definition.version,
      catalogAlias: instance.definition.alias,
      renderer: base.renderer,
      title: instance.title,
      subtitle: instance.subtitle,
      x: clamp(instance.position.x, 20, WORLD.width - base.width - 20),
      y: clamp(instance.position.y, 20, WORLD.height - base.height - 20),
      ports: PORTS[instance.adapter].map((port) => ({ ...port })),
    };
  });
  const byId = new Map(nextDevices.map((device) => [device.id, device]));
  const nextConnections: Connection[] = project.connections.map((connection) => {
    const fromDevice = byId.get(connection.from.instanceId);
    const toDevice = byId.get(connection.to.instanceId);
    const from = fromDevice?.ports.find((port) => port.id === connection.from.portId);
    const to = toDevice?.ports.find((port) => port.id === connection.to.portId);
    const compatibleSignals = from && to && (from.signal === to.signal || (from.signal === "safety" && to.signal === "digital") || (from.signal === "digital" && to.signal === "safety"));
    if (!fromDevice || !toDevice || !from || !to || from.direction !== "output" || to.direction !== "input" || !compatibleSignals) {
      throw new Error(`Connection ${connection.id} does not match the imported instance ports`);
    }
    return {
      id: connection.id,
      from: { nodeId: connection.from.instanceId, portId: connection.from.portId },
      to: { nodeId: connection.to.instanceId, portId: connection.to.portId },
    };
  });

  const programRecord = project.programs.find((program) => program.instanceId === "controller" && controllerProfile(program.profile) !== undefined);
  const nextProfile = programRecord ? controllerProfile(programRecord.profile) : undefined;
  if (programRecord && !nextProfile) throw new Error(`Controller profile ${programRecord.profile} is not registered`);
  if (nextProfile) activeProfile = nextProfile;
  const nextProgram = programRecord ? activeProfile.parseProgram(programRecord.source) : activeProfile.createDefaultProgram();
  if (!nextProgram) throw new Error(`Program for instance controller is not a valid ${activeProfile.displayName} source`);
  const nextCompiled = activeProfile.compile(nextProgram);
  const loaded = fbdRuntime?.load(nextCompiled.artifact);
  if (loaded && !loaded.ok) throw new Error(loaded.message ?? "runtime rejected the compiled artifact");

  devices = nextDevices;
  connections = nextConnections;
  fbdProgram = nextProgram;
  compiledFbd = nextCompiled;
  selected = devices[0] ? { kind: "node", id: devices[0].id } : null;
  pendingPort = null;
  selectedFbdId = fbdProgram.elements[0]?.id ?? null;
  saveScene();
  saveFbdProgram();
  renderFbd();
  renderSelection();
  fitView();
  audit("Engineering project imported", `${project.title} · ${devices.length} instances · ${connections.length} connections`);
  toast(`${project.title} opened`);
}

async function importProject(file: File): Promise<void> {
  try {
    const project = parseEngineeringProject(JSON.parse(await file.text()));
    applyProject(project);
  } catch (error) {
    toast(error instanceof Error ? error.message : String(error), "alarm");
    audit("Project import rejected", error instanceof Error ? error.message : String(error), "alarm");
  }
}

function restoreFbdProgram(): void {
  try {
    const raw = localStorage.getItem(programStorageKey()) ?? localStorage.getItem(LEGACY_PROGRAM_KEY);
    if (raw === null) return;
    const parsed = activeProfile.parseProgram(JSON.parse(raw));
    if (!parsed) return;
    fbdProgram = parsed;
    compiledFbd = activeProfile.compile(fbdProgram);
    localStorage.removeItem(LEGACY_PROGRAM_KEY);
  } catch {
    localStorage.removeItem(programStorageKey());
    fbdProgram = activeProfile.createDefaultProgram();
    compiledFbd = activeProfile.compile(fbdProgram);
  }
}

function saveFbdProgram(): void {
  localStorage.setItem(programStorageKey(), JSON.stringify(fbdProgram));
}

const FBD_BLOCK_WIDTH = 164;
const FBD_BLOCK_HEIGHT = 58;

function fbdElement(id: string): ProgramBlock | undefined {
  return fbdProgram.elements.find((element) => element.id === id);
}

function fbdInputY(element: ProgramBlock, index: number): number {
  const count = element.inputs?.length ?? 0;
  return element.y + (FBD_BLOCK_HEIGHT * (index + 1)) / (count + 1);
}

function fbdEdgePath(source: ProgramBlock, target: ProgramBlock, inputIndex: number): string {
  const x1 = source.x + FBD_BLOCK_WIDTH;
  const y1 = source.y + FBD_BLOCK_HEIGHT / 2;
  const x2 = target.x;
  const y2 = fbdInputY(target, inputIndex);
  const dx = clamp(Math.abs(x2 - x1) * 0.48, 45, 180);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function renderFbd(): void {
  fbdNodesLayer.replaceChildren();
  for (const element of fbdProgram.elements) {
    const meta = activeProfile.blockMeta(element.type);
    const block = document.createElement("article");
    block.className = `fbd-block ${meta.group}`;
    block.dataset["fbdId"] = element.id;
    block.style.left = `${element.x}px`;
    block.style.top = `${element.y}px`;
    if (selectedFbdId === element.id) block.classList.add("is-selected");
    if ((element.id === "pump1_run" || element.id === "out_pump1") && pump1Running) block.classList.add("is-running");
    if ((element.id === "pump2_run" || element.id === "out_pump2") && pump2Running) block.classList.add("is-running");
    if ((element.id === "alarm" || element.id === "out_alarm") && sampleOn(controllerOutputs.alarm)) block.classList.add("is-running");
    const detail = element.caption ?? (element.params?.length ? element.params.join(" · ") : element.id);
    block.innerHTML = `<span class="fbd-block-badge">${meta.badge}</span><span class="fbd-block-copy"><strong>${escapeHtml(element.title)}</strong><small>${escapeHtml(detail)}</small></span>`;

    const inputs = element.inputs ?? [];
    inputs.forEach((sourceId, inputIndex) => {
      const input = document.createElement("button");
      input.type = "button";
      input.className = "fbd-pin input";
      input.dataset["fbdInput"] = String(inputIndex);
      input.style.top = `${(FBD_BLOCK_HEIGHT * (inputIndex + 1)) / (inputs.length + 1)}px`;
      input.title = `Input ${inputIndex + 1} · ${sourceId}`;
      input.setAttribute("aria-label", `${element.title} input ${inputIndex + 1}`);
      input.addEventListener("pointerdown", (event) => event.stopPropagation());
      input.addEventListener("click", (event) => {
        event.stopPropagation();
        connectFbdInput(element.id, inputIndex);
      });
      block.append(input);
    });

    const output = document.createElement("button");
    output.type = "button";
    output.className = "fbd-pin output";
    output.title = `${element.title} output`;
    output.setAttribute("aria-label", `${element.title} output`);
    output.addEventListener("pointerdown", (event) => event.stopPropagation());
    output.addEventListener("click", (event) => {
      event.stopPropagation();
      pendingFbdOutput = pendingFbdOutput === element.id ? null : element.id;
      connectHint.hidden = pendingFbdOutput === null;
      connectHint.textContent = pendingFbdOutput ? `${element.title} → select a block input` : "";
      renderFbdPortHints();
    });
    block.append(output);

    block.addEventListener("pointerdown", (event) => beginFbdDrag(event, element.id));
    block.addEventListener("click", () => {
      selectedFbdId = element.id;
      renderFbd();
      renderFbdInspector();
    });
    fbdNodesLayer.append(block);
  }
  renderFbdEdges();
  renderFbdPortHints();
  el("fbd-artifact-summary").textContent = `${compiledFbd.elementCount} elements · ${compiledFbd.artifact.length.toLocaleString("en-US")} bytes · HMI ${compiledFbd.screenCount}`;
  if (mode === "edit") el("status-summary").textContent = `${compiledFbd.elementCount} FBD elements · ${compiledFbd.targetLabel}`;
}

function renderFbdEdges(): void {
  fbdEdgesLayer.replaceChildren();
  for (const target of fbdProgram.elements) {
    (target.inputs ?? []).forEach((sourceId, inputIndex) => {
      const source = fbdElement(sourceId);
      if (!source) return;
      const d = fbdEdgePath(source, target, inputIndex);
      const under = document.createElementNS("http://www.w3.org/2000/svg", "path");
      under.setAttribute("class", "fbd-edge-under");
      under.setAttribute("d", d);
      const edge = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const signalOn = ((source.id === "pump1_run" || source.id === "out_pump1") && pump1Running) || ((source.id === "pump2_run" || source.id === "out_pump2") && pump2Running);
      edge.setAttribute("class", `fbd-edge${signalOn ? " signal-on" : ""}`);
      edge.setAttribute("d", d);
      fbdEdgesLayer.append(under, edge);
    });
  }
}

function renderFbdPortHints(): void {
  fbdNodesLayer.querySelectorAll(".fbd-pin").forEach((node) => node.classList.remove("is-pending", "is-compatible"));
  if (!pendingFbdOutput) return;
  fbdNodesLayer.querySelector<HTMLButtonElement>(`[data-fbd-id="${CSS.escape(pendingFbdOutput)}"] .fbd-pin.output`)?.classList.add("is-pending");
  fbdNodesLayer.querySelectorAll(".fbd-pin.input").forEach((node) => node.classList.add("is-compatible"));
}

function connectFbdInput(targetId: string, inputIndex: number): void {
  if (!pendingFbdOutput) {
    toast("Select a block output first");
    return;
  }
  const target = fbdElement(targetId);
  if (!target || pendingFbdOutput === targetId || !target.inputs) {
    toast("A block cannot connect to itself", "alarm");
    return;
  }
  target.inputs = target.inputs.map((sourceId, index) => index === inputIndex ? pendingFbdOutput as string : sourceId);
  const source = fbdElement(pendingFbdOutput);
  pendingFbdOutput = null;
  connectHint.hidden = true;
  fbdDraftEdge.toggleAttribute("hidden", true);
  saveFbdProgram();
  buildFbd(false);
  audit("FBD connection changed", `${source?.title ?? "Source"} → ${target.title} input ${inputIndex + 1}`);
}

function beginFbdDrag(event: PointerEvent, id: string): void {
  if (mode !== "edit" || event.button !== 0 || (event.target as Element).closest("button")) return;
  const element = fbdElement(id);
  if (!element) return;
  const point = clientToWorld(event.clientX, event.clientY);
  fbdDrag = { id, pointerId: event.pointerId, offsetX: point.x - 20 - element.x, offsetY: point.y - 58 - element.y };
  selectedFbdId = id;
  const block = fbdNodesLayer.querySelector<HTMLElement>(`[data-fbd-id="${CSS.escape(id)}"]`);
  block?.setPointerCapture(event.pointerId);
  block?.classList.add("is-selected");
  renderFbdInspector();
}

function addFbdBlock(name: string): void {
  const element = activeProfile.createBlock(name, fbdProgram);
  if (element === null) return;
  fbdProgram.elements.push(element);
  selectedFbdId = element.id;
  saveFbdProgram();
  buildFbd(false);
}

function deleteSelectedFbd(): void {
  if (!selectedFbdId) return;
  const selectedElement = fbdElement(selectedFbdId);
  if (!selectedElement) return;
  const consumer = fbdProgram.elements.find((element) => element.inputs?.includes(selectedElement.id));
  if (consumer) {
    toast(`Disconnect ${consumer.title} before deleting this block`, "alarm");
    return;
  }
  fbdProgram.elements = fbdProgram.elements.filter((element) => element.id !== selectedElement.id);
  selectedFbdId = null;
  saveFbdProgram();
  buildFbd(false);
}

function resetFbdProgram(): void {
  fbdProgram = activeProfile.createDefaultProgram();
  selectedFbdId = "start_ton";
  pendingFbdOutput = null;
  saveFbdProgram();
  buildFbd(false);
  fitView();
  toast(`Default ${activeProfile.displayName} program restored`);
}

function buildFbd(download: boolean): void {
  const status = el("fbd-build-status");
  try {
    compiledFbd = activeProfile.compile(fbdProgram);
    const loaded = fbdRuntime?.load(compiledFbd.artifact);
    if (loaded && !loaded.ok) throw new Error(loaded.message ?? "runtime rejected the compiled artifact");
    status.textContent = "COMPILED";
    status.classList.add("good");
    status.classList.remove("bad");
    saveFbdProgram();
    renderFbd();
    renderFbdInspector();
    el("wasm-size").textContent = `${compiledFbd.artifact.length.toLocaleString("en-US")} byte artifact`;
    if (download) downloadFbdbin();
  } catch (error) {
    status.textContent = "BUILD ERROR";
    status.classList.remove("good");
    status.classList.add("bad");
    toast(error instanceof Error ? error.message : String(error), "alarm");
  }
}

function downloadFbdbin(): void {
  const blob = new Blob([compiledFbd.artifact as BlobPart], { type: activeProfile.artifactMediaType });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${PROJECT_ID}.${activeProfile.artifactExtension}`;
  link.click();
  URL.revokeObjectURL(href);
  audit(`${activeProfile.displayName} artifact built`, `${compiledFbd.elementCount} elements · ${compiledFbd.artifact.length} bytes`);
}

function findDevice(id: string): DeviceSpec | undefined {
  return devices.find((device) => device.id === id);
}

function findPort(ref: { nodeId: string; portId: string }): { device: DeviceSpec; port: PortSpec } | null {
  const device = findDevice(ref.nodeId);
  const port = device?.ports.find((candidate) => candidate.id === ref.portId);
  return device && port ? { device, port } : null;
}

function portPoint(ref: { nodeId: string; portId: string }): { x: number; y: number; side: PortSide } | null {
  const found = findPort(ref);
  return found ? { x: found.device.x + found.port.x, y: found.device.y + found.port.y, side: found.port.side } : null;
}

function portButton(ref: { nodeId: string; portId: string }): HTMLButtonElement | null {
  return nodesLayer.querySelector<HTMLButtonElement>(`.node-port[data-node-id="${CSS.escape(ref.nodeId)}"][data-port-id="${CSS.escape(ref.portId)}"]`);
}

function compatible(a: { nodeId: string; portId: string }, b: { nodeId: string; portId: string }): boolean {
  if (a.nodeId === b.nodeId) return false;
  const first = findPort(a)?.port;
  const second = findPort(b)?.port;
  if (!first || !second || first.direction === second.direction) return false;
  return first.signal === second.signal || (first.signal === "safety" && second.signal === "digital") || (first.signal === "digital" && second.signal === "safety");
}

function normalizedConnection(a: { nodeId: string; portId: string }, b: { nodeId: string; portId: string }): Connection | null {
  const first = findPort(a)?.port;
  const second = findPort(b)?.port;
  if (!first || !second || !compatible(a, b)) return null;
  const [from, to] = first.direction === "output" ? [a, b] : [b, a];
  return { id: `wire-${from.nodeId}-${from.portId}-${to.nodeId}-${to.portId}`, from: { ...from }, to: { ...to } };
}

function connectionTo(nodeId: string, portId: string): Connection | undefined {
  return connections.find((connection) => connection.to.nodeId === nodeId && connection.to.portId === portId);
}

function connectionFrom(nodeId: string, portId: string): Connection | undefined {
  return connections.find((connection) => connection.from.nodeId === nodeId && connection.from.portId === portId);
}

function isConnected(nodeId: string, portId: string): boolean {
  return connections.some((connection) =>
    (connection.from.nodeId === nodeId && connection.from.portId === portId) ||
    (connection.to.nodeId === nodeId && connection.to.portId === portId),
  );
}

function controllerMarkup(device: DeviceSpec): string {
  const connectedTerminals = device.ports
    .filter((port) => port.terminalId !== undefined && isConnected(device.id, port.id))
    .map((port) => port.terminalId as string);
  return `
    <div class="node-drag-handle" aria-hidden="true"></div>
    <div class="controller-device node-ui">${activeProfile.renderView({ connectedTerminals, defsPrefix: `studio-${device.id.replace(/[^a-z0-9-]/gi, "-")}` })}</div>`;
}

function sensorMarkup(device: DeviceSpec): string {
  return `<div class="node-drag-handle"></div><div class="sensor-body field-device node-ui"><header><strong>${escapeHtml(device.title)}</strong><i></i></header><div class="sensor-gauge"></div><div class="sensor-value"><b>—</b><small>bar</small></div><span class="device-tag">${escapeHtml(device.subtitle)}</span></div>`;
}

function pumpMarkup(device: DeviceSpec): string {
  const tag = device.id === "pump1" ? "P-101 / M1 · LEAD" : device.id === "pump2" ? "P-102 / M2 · STANDBY" : device.subtitle;
  return `<div class="node-drag-handle"></div><div class="pump-body field-device node-ui"><header><strong>${escapeHtml(device.title)}</strong><i></i></header><div class="pump-visual"><div class="pump-motor"></div><div class="pump-impeller"></div><div class="pump-pipe"></div></div><div class="pump-stats"><b>STOPPED</b><small>feedback ready</small></div><span class="device-tag">${tag}</span></div>`;
}

function reservoirMarkup(device: DeviceSpec): string {
  return `<div class="node-drag-handle"></div><div class="reservoir-body field-device node-ui"><header><strong>${escapeHtml(device.title)}</strong><i></i></header><div class="mini-tank"><span></span><b class="reservoir-value">72%</b></div><div class="reservoir-copy"><strong>${escapeHtml(device.id)}</strong><small>${escapeHtml(device.subtitle)}</small></div></div>`;
}

function headerMarkup(device: DeviceSpec): string {
  const tag = device.kind === "suctionHeader" ? "SUCTION" : device.kind === "dischargeHeader" ? "DISCHARGE" : "PROCESS";
  return `<div class="node-drag-handle"></div><div class="header-body field-device node-ui"><header><strong>${escapeHtml(device.title)}</strong><i></i></header><div class="header-pipe"><span></span><span></span><b></b></div><div class="header-copy"><strong>${tag}</strong><small>${escapeHtml(device.subtitle)}</small></div></div>`;
}

function estopMarkup(): string {
  return `<div class="node-drag-handle"></div><div class="estop-body field-device node-ui"><header><strong>Safety circuit</strong><i></i></header><button type="button" class="estop-button" title="Toggle emergency stop"></button><div class="estop-copy"><b>EMERGENCY<br>STOP</b><small>CLOSED</small></div><span class="device-tag">S0</span></div>`;
}

function registryMarkup(device: DeviceSpec): string {
  const body = device.svgText ?? `<div class="package-view-placeholder"><strong>${escapeHtml(device.title)}</strong><small>resolving package view…</small></div>`;
  return `<div class="node-drag-handle"></div><div class="package-view-body node-ui">${body}</div>`;
}

function renderNodes(): void {
  nodesLayer.replaceChildren();
  for (const device of devices) {
    const node = document.createElement("article");
    node.className = `device-node ${device.kind}-node`;
    node.dataset["nodeId"] = device.id;
    node.style.left = `${device.x}px`;
    node.style.top = `${device.y}px`;
    node.style.width = `${device.width}px`;
    node.style.height = `${device.height}px`;
    if (selected?.kind === "node" && selected.id === device.id) node.classList.add("is-selected");
    node.innerHTML = device.kind === "registry" ? registryMarkup(device) : device.kind === "controller" ? controllerMarkup(device) : device.kind === "sensor" ? sensorMarkup(device) : device.kind === "pump1" || device.kind === "pump2" ? pumpMarkup(device) : device.kind === "reservoir" ? reservoirMarkup(device) : device.kind === "suctionHeader" || device.kind === "dischargeHeader" ? headerMarkup(device) : estopMarkup();

    for (const port of device.ports) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "node-port";
      if (device.kind === "controller") button.classList.add("controller-port");
      // Registry SVGs draw their own terminal pins; keep the hit target transparent over them.
      if (device.kind === "registry" && node.querySelector(`[data-terminal-id="${CSS.escape(port.id)}"]`)) button.classList.add("controller-port");
      button.dataset["nodeId"] = device.id;
      button.dataset["portId"] = port.id;
      button.dataset["signal"] = port.signal;
      button.dataset["direction"] = port.direction;
      button.style.left = `${port.x}px`;
      button.style.top = `${port.y}px`;
      button.title = `${port.label} · ${port.direction}`;
      button.setAttribute("aria-label", button.title);
      if (isConnected(device.id, port.id)) button.classList.add("is-connected");
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        selectPort({ nodeId: device.id, portId: port.id });
      });
      node.append(button);
    }

    node.addEventListener("pointerdown", (event) => beginNodeDrag(event, device.id));
    node.addEventListener("click", (event) => {
      if ((event.target as Element).closest(".node-port")) return;
      selected = { kind: "node", id: device.id };
      renderSelection();
    });
    if (device.kind === "estop") {
      node.querySelector<HTMLButtonElement>(".estop-button")?.addEventListener("click", (event) => {
        event.stopPropagation();
        const input = el<HTMLInputElement>("emergency-stop");
        input.checked = !input.checked;
        audit(input.checked ? "Emergency stop pressed" : "Emergency stop released", "Safety input changed from the physical device", input.checked ? "alarm" : "info");
        updateVisualState();
      });
    }
    if (device.kind === "controller") {
      node.querySelectorAll<SVGGElement>("[data-plc-button]").forEach((button) => {
        const press = (event: Event) => {
          event.stopPropagation();
          button.classList.add("is-pressed");
          window.setTimeout(() => button.classList.remove("is-pressed"), 140);
          pressPanelKey(button.dataset["plcButton"] ?? "");
        };
        button.addEventListener("pointerdown", (event) => event.stopPropagation());
        button.addEventListener("click", press);
        button.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") press(event);
        });
      });
    }
    nodesLayer.append(node);
  }
  updateCatalogAvailability();
  updateProgramModeTab();
  updateVisualState();
}

function curveControl(point: { x: number; y: number; side: PortSide }, distance: number): { x: number; y: number } {
  if (point.side === "left") return { x: point.x - distance, y: point.y };
  if (point.side === "right") return { x: point.x + distance, y: point.y };
  if (point.side === "top") return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function cablePath(from: { x: number; y: number; side: PortSide }, to: { x: number; y: number; side: PortSide }): string {
  const distance = clamp(Math.hypot(to.x - from.x, to.y - from.y) * 0.36, 75, 230);
  const a = curveControl(from, distance);
  const b = curveControl(to, distance);
  return `M ${from.x} ${from.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${to.x} ${to.y}`;
}

/**
 * Which process connections carry water right now. A running pump pushes flow
 * downstream through output→input pipe hops and pulls it upstream through its
 * suction side; branches that no running pump reaches stay still. This is a
 * topology walk, not a hydraulic solver — pressure stays with the plant model.
 */
function activeProcessPipes(): Set<string> {
  const active = new Set<string>();
  const processConnections = connections.filter((connection) => findPort(connection.from)?.port.signal === "process");
  const seeds = devices.filter((device) =>
    (device.id === "pump1" && pump1Running) || (device.id === "pump2" && pump2Running),
  ).map((device) => device.id);
  for (const seed of seeds) {
    const downstream = [seed];
    const visitedDown = new Set<string>();
    while (downstream.length > 0) {
      const nodeId = downstream.pop() as string;
      if (visitedDown.has(nodeId)) continue;
      visitedDown.add(nodeId);
      for (const connection of processConnections) {
        if (connection.from.nodeId !== nodeId) continue;
        active.add(connection.id);
        downstream.push(connection.to.nodeId);
      }
    }
    const upstream = [seed];
    const visitedUp = new Set<string>();
    while (upstream.length > 0) {
      const nodeId = upstream.pop() as string;
      if (visitedUp.has(nodeId)) continue;
      visitedUp.add(nodeId);
      for (const connection of processConnections) {
        if (connection.to.nodeId !== nodeId) continue;
        active.add(connection.id);
        upstream.push(connection.from.nodeId);
      }
    }
  }
  return active;
}

function sourceSample(connection: Connection): Sample {
  if (findPort(connection.from)?.port.signal === "process") {
    return { value: activeProcessPipes().has(connection.id), quality: "good" };
  }
  if (connection.from.nodeId === "sensor" && connection.from.portId === "pressure") {
    return { value: pressure, quality: el<HTMLSelectElement>("pressure-quality").value as Quality };
  }
  if (connection.from.nodeId === "estop") {
    return { value: el<HTMLInputElement>("emergency-stop").checked, quality: "good" };
  }
  if (connection.from.nodeId === "pump1" && connection.from.portId === "feedback") {
    return { value: pump1Running && el<HTMLInputElement>("follow-feedback-1").checked, quality: "good" };
  }
  if (connection.from.nodeId === "pump2" && connection.from.portId === "feedback") {
    return { value: pump2Running && el<HTMLInputElement>("follow-feedback-2").checked, quality: "good" };
  }
  if (connection.from.nodeId === "reservoir" && connection.from.portId === "low-level") {
    return { value: tankLevel <= 15, quality: "good" };
  }
  if (connection.from.nodeId === "controller") {
    return controllerOutputs[connection.from.portId] ?? { value: false, quality: "unknown" };
  }
  const fromDevice = findDevice(connection.from.nodeId);
  if (fromDevice?.kind === "registry") return registrySample(fromDevice, connection.from.portId);
  return { value: false, quality: "unknown" };
}

function stationFlow(): number {
  return (pump1Running ? 46 : 0) + (pump2Running ? 46 : 0);
}

/** Deterministic local behavior for registry-rendered instances: outputs derive from wired inputs and plant state. */
function registrySample(device: DeviceSpec, portId: string): Sample {
  const alias = device.catalogAlias;
  if (alias === "@reference/frequency-drive") {
    if (portId === "run-feedback") return inputSample(device.id, "run", false);
    if (portId === "fault") return { value: false, quality: "good" };
    if (portId === "motor") return { value: sampleOn(inputSample(device.id, "run", false)), quality: "good" };
  }
  if (alias === "@reference/motorized-valve") {
    const open = sampleOn(inputSample(device.id, "open-command", false));
    if (portId === "opened") return { value: open, quality: "good" };
    if (portId === "closed") return { value: !open, quality: "good" };
    if (portId === "process-out") return { value: open, quality: "good" };
  }
  if (alias === "@reference/flow-meter") {
    if (portId === "flow") return { value: stationFlow(), quality: "good" };
    if (portId === "pulse") return { value: stationFlow() > 0, quality: "good" };
    if (portId === "process-out") return { value: stationFlow() > 0, quality: "good" };
  }
  if (alias === "@reference/level-transmitter" && portId === "level") {
    return { value: tankLevel, quality: "good" };
  }
  if (portId === "rs485") return { value: true, quality: "good" };
  const port = device.ports.find((candidate) => candidate.id === portId);
  if (port?.signal === "analog") return { value: 0, quality: "good" };
  return { value: false, quality: port?.signal === "digital" ? "good" : "unknown" };
}

function connectionHitPath(connection: Connection, d: string): SVGPathElement {
  const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
  hit.setAttribute("d", d);
  hit.setAttribute("class", "cable-hit");
  hit.addEventListener("click", () => {
    if (mode !== "simulate") return;
    selected = { kind: "connection", id: connection.id };
    pendingPort = null;
    draftCable.toggleAttribute("hidden", true);
    renderSelection();
  });
  return hit;
}

function renderCables(): void {
  cablesGroup.replaceChildren();
  const flowing = activeProcessPipes();
  // Pipes sit under signal wiring, exactly as in a cabinet-over-plant drawing.
  const ordered = [...connections].sort((a, b) =>
    Number(findPort(b.from)?.port.signal === "process") - Number(findPort(a.from)?.port.signal === "process"));
  for (const connection of ordered) {
    const from = portPoint(connection.from);
    const to = portPoint(connection.to);
    const source = findPort(connection.from)?.port;
    if (!from || !to || !source) continue;
    const sample = sourceSample(connection);
    const isSelected = selected?.kind === "connection" && selected.id === connection.id;

    if (source.signal === "process") {
      // A pipe is routed orthogonally from the port anchors on every render —
      // geometry is never stored, so it follows the equipment when dragged.
      const d = pointsToPath(routeOrthogonal(from, to));
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("class", `pipe${isSelected ? " is-selected" : ""}${sample.quality !== "good" ? " is-bad" : ""}`);
      group.setAttribute("data-state", flowing.has(connection.id) ? "on" : "off");
      const tube = document.createElementNS("http://www.w3.org/2000/svg", "path");
      tube.setAttribute("d", d);
      tube.setAttribute("class", "pipe-tube");
      const water = document.createElementNS("http://www.w3.org/2000/svg", "path");
      water.setAttribute("d", d);
      water.setAttribute("class", "pipe-flow");
      group.append(tube, water);
      cablesGroup.append(group, connectionHitPath(connection, d));
      continue;
    }

    const d = cablePath(from, to);
    const under = document.createElementNS("http://www.w3.org/2000/svg", "path");
    under.setAttribute("d", d);
    under.setAttribute("class", "cable-under");
    const visible = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const classes = ["cable", source.signal];
    if (sampleOn(sample) || source.signal === "analog") classes.push("is-active");
    if (sample.quality !== "good") classes.push("is-bad");
    if (isSelected) classes.push("is-selected");
    visible.setAttribute("d", d);
    visible.setAttribute("class", classes.join(" "));
    cablesGroup.append(under, visible, connectionHitPath(connection, d));
  }
  if (mode === "simulate") el("status-summary").textContent = `${devices.length} ${devices.length === 1 ? "instance" : "instances"} · ${connections.length} ${connections.length === 1 ? "connection" : "connections"}`;
}

function selectPort(ref: { nodeId: string; portId: string }): void {
  if (mode !== "simulate") return;
  if (pendingPort === null) {
    pendingPort = ref;
    connectHint.hidden = false;
    connectHint.textContent = `${findPort(ref)?.port.label ?? ref.portId} → select a compatible port`;
    renderPortHints();
    return;
  }
  if (pendingPort.nodeId === ref.nodeId && pendingPort.portId === ref.portId) {
    pendingPort = null;
    connectHint.hidden = true;
    draftCable.toggleAttribute("hidden", true);
    renderPortHints();
    return;
  }
  const next = normalizedConnection(pendingPort, ref);
  if (next === null) {
    toast("These ports are not compatible", "alarm");
    return;
  }
  // A network port is a multi-drop bus: additional drops join instead of replacing the wire.
  const isBusTarget = findPort(next.to)?.port.signal === "network";
  connections = connections.filter((connection) =>
    (isBusTarget || !(connection.to.nodeId === next.to.nodeId && connection.to.portId === next.to.portId)) &&
    connection.id !== next.id,
  );
  connections.push(next);
  selected = { kind: "connection", id: next.id };
  pendingPort = null;
  connectHint.hidden = true;
  draftCable.toggleAttribute("hidden", true);
  saveScene();
  renderNodes();
  renderCables();
  renderInspector();
  audit("Connection created", `${findPort(next.from)?.port.label ?? next.from.portId} → ${findPort(next.to)?.port.label ?? next.to.portId}`);
}

function renderPortHints(): void {
  nodesLayer.querySelectorAll(".node-port").forEach((node) => node.classList.remove("is-pending", "is-compatible"));
  if (pendingPort === null) return;
  portButton(pendingPort)?.classList.add("is-pending");
  nodesLayer.querySelectorAll<HTMLButtonElement>(".node-port").forEach((button) => {
    const candidate = { nodeId: button.dataset["nodeId"] ?? "", portId: button.dataset["portId"] ?? "" };
    if (compatible(pendingPort as { nodeId: string; portId: string }, candidate)) button.classList.add("is-compatible");
  });
}

function beginNodeDrag(event: PointerEvent, nodeId: string): void {
  if (mode !== "simulate" || event.button !== 0 || (event.target as Element).closest("button")) return;
  const device = findDevice(nodeId);
  if (!device) return;
  event.preventDefault();
  const point = clientToWorld(event.clientX, event.clientY);
  dragState = { nodeId, pointerId: event.pointerId, offsetX: point.x - device.x, offsetY: point.y - device.y };
  selected = { kind: "node", id: nodeId };
  const node = nodesLayer.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
  node?.classList.add("is-dragging", "is-selected");
  node?.setPointerCapture(event.pointerId);
  renderInspector();
}

function clientToWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvasViewport.getBoundingClientRect();
  return { x: (clientX - rect.left + canvasViewport.scrollLeft) / zoom, y: (clientY - rect.top + canvasViewport.scrollTop) / zoom };
}

function onPointerMove(event: PointerEvent): void {
  const point = clientToWorld(event.clientX, event.clientY);
  el("cursor-position").textContent = `X ${Math.round(point.x)} · Y ${Math.round(point.y)} · Grid 20 px`;
  if (mode === "edit" && fbdDrag !== null && fbdDrag.pointerId === event.pointerId) {
    const element = fbdElement(fbdDrag.id);
    if (!element) return;
    element.x = clamp(Math.round((point.x - 20 - fbdDrag.offsetX) / 10) * 10, 10, 1480);
    element.y = clamp(Math.round((point.y - 58 - fbdDrag.offsetY) / 10) * 10, 10, 625);
    const block = fbdNodesLayer.querySelector<HTMLElement>(`[data-fbd-id="${CSS.escape(element.id)}"]`);
    if (block) { block.style.left = `${element.x}px`; block.style.top = `${element.y}px`; }
    renderFbdEdges();
    return;
  }
  if (mode === "edit" && pendingFbdOutput !== null) {
    const source = fbdElement(pendingFbdOutput);
    if (source) {
      const x1 = source.x + FBD_BLOCK_WIDTH;
      const y1 = source.y + FBD_BLOCK_HEIGHT / 2;
      const x2 = point.x - 20;
      const y2 = point.y - 58;
      const dx = clamp(Math.abs(x2 - x1) * 0.48, 45, 180);
      fbdDraftEdge.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
      fbdDraftEdge.toggleAttribute("hidden", false);
    }
    return;
  }
  if (dragState !== null && dragState.pointerId === event.pointerId) {
    const device = findDevice(dragState.nodeId);
    if (!device) return;
    device.x = clamp(Math.round((point.x - dragState.offsetX) / 20) * 20, 20, WORLD.width - device.width - 20);
    device.y = clamp(Math.round((point.y - dragState.offsetY) / 20) * 20, 30, WORLD.height - device.height - 30);
    const node = nodesLayer.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(device.id)}"]`);
    if (node) { node.style.left = `${device.x}px`; node.style.top = `${device.y}px`; }
    renderCables();
  } else if (pendingPort !== null) {
    const from = portPoint(pendingPort);
    if (from) {
      const target = { x: point.x, y: point.y, side: from.side === "left" ? "right" : from.side === "right" ? "left" : from.side === "top" ? "bottom" : "top" } as const;
      draftCable.setAttribute("d", cablePath(from, target));
      draftCable.toggleAttribute("hidden", false);
    }
  }
}

function onPointerUp(event: PointerEvent): void {
  if (fbdDrag?.pointerId === event.pointerId) {
    fbdDrag = null;
    saveFbdProgram();
    renderFbdInspector();
    return;
  }
  if (dragState?.pointerId !== event.pointerId) return;
  const node = nodesLayer.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(dragState.nodeId)}"]`);
  node?.classList.remove("is-dragging");
  dragState = null;
  saveScene();
}

/** The program editor exists only while a device with a registered controller profile is on the scene. */
function programEditorAvailable(): boolean {
  return devices.some((device) => controllerProfileForRenderer(device.renderer) !== undefined);
}

function updateProgramModeTab(): void {
  const tab = document.querySelector<HTMLButtonElement>('[data-mode-button="edit"]');
  if (!tab) return;
  const available = programEditorAvailable();
  tab.hidden = !available;
  const label = tab.querySelector("b");
  if (label) label.textContent = `${activeProfile.displayName} program`;
  if (!available && mode === "edit") setMode("simulate");
}

function setMode(next: Mode): void {
  if (next === "edit" && !programEditorAvailable()) {
    toast("Add a programmable controller to the scene to edit its program", "alarm");
    return;
  }
  mode = next;
  body.dataset["mode"] = mode;
  document.querySelectorAll<HTMLButtonElement>("[data-mode-button]").forEach((button) => button.classList.toggle("is-active", button.dataset["modeButton"] === mode));
  el("workspace-title").querySelector("strong")!.textContent = mode === "edit" ? `${fbdProgram.name} · ${fbdProgram.version}` : PROJECT_TITLE;
  el("workspace-title").querySelector("span")!.textContent = mode === "edit" ? `${activeProfile.displayName} source` : mode === "simulate" ? "Registry instances · compatible ports · live runtime" : "Software SCADA · controller HMI projection";
  pendingPort = null;
  connectHint.hidden = true;
  draftCable.toggleAttribute("hidden", true);
  fbdDraftEdge.toggleAttribute("hidden", true);
  pendingFbdOutput = null;
  renderPortHints();
  renderCables();
  renderFbd();
  renderInspector();
  fitView();
  if (mode === "scada") canvasViewport.scrollTo({ left: 0, top: 28 * zoom, behavior: "smooth" });
}

function setZoom(next: number): void {
  zoom = clamp(Math.round(next * 100) / 100, 0.38, 1.35);
  canvasWorld.style.transform = `scale(${zoom})`;
  canvasWorld.style.width = `${WORLD.width * zoom}px`;
  canvasWorld.style.height = `${WORLD.height * zoom}px`;
  el("zoom-label").textContent = `${Math.round(zoom * 100)}%`;
}

function fitView(): void {
  const contentWidth = mode === "edit" ? 1760 : mode === "simulate" ? 1720 : 1180;
  const next = clamp((canvasViewport.clientWidth - 24) / contentWidth, mode === "simulate" ? 0.46 : mode === "edit" ? 0.42 : 0.55, 1);
  setZoom(next);
  canvasViewport.scrollTo({ left: 0, top: 30 * zoom, behavior: "smooth" });
}

function renderSelection(): void {
  renderNodes();
  renderCables();
  renderInspector();
}

function renderFbdInspector(): void {
  const title = el("inspector-title");
  const content = el("inspector-content");
  const element = selectedFbdId ? fbdElement(selectedFbdId) : undefined;
  if (!element) {
    title.textContent = "FBD program";
    content.innerHTML = `<div class="empty-inspector">Select a function block to edit its parameters and connections.</div>`;
    return;
  }
  const meta = activeProfile.blockMeta(element.type);
  title.textContent = element.title;
  const inputs = (element.inputs ?? []).map((sourceId, index) => {
    const source = fbdElement(sourceId);
    return `<div class="connection-row"><i class="quality-dot good"></i><span>IN${index + 1}<small>${escapeHtml(source?.title ?? sourceId)}</small></span><button type="button" data-pick-source="${index}" title="Pick another source">⌁</button></div>`;
  }).join("");
  const paramLabels = activeProfile.paramLabels(element.type);
  const params = (element.params ?? []).map((value, index) => `<label class="property-field"><span>${escapeHtml(paramLabels[index] ?? `Parameter ${index + 1}`)}</span><input type="number" data-fbd-param="${index}" value="${value}"></label>`).join("");
  content.innerHTML = `
    <div class="inspector-group"><h3>Function block</h3>
      <label class="property-field"><span>Label</span><input type="text" id="fbd-title-input" value="${escapeHtml(element.title)}"></label>
      <div class="property-row"><span>Block ID</span><code>${escapeHtml(element.id)}</code></div>
      <div class="property-row"><span>Type</span><code>${escapeHtml(meta.name)} · ${meta.badge}</code></div>
      <div class="property-row"><span>Position</span><code>${element.x}, ${element.y}</code></div>
    </div>
    ${params ? `<div class="inspector-group"><h3>Parameters</h3><div class="property-fields">${params}</div></div>` : ""}
    ${activeProfile.supportsCaption(element.type) ? `<div class="inspector-group"><h3>Operator metadata</h3><label class="property-field"><span>Caption</span><input type="text" id="fbd-caption-input" value="${escapeHtml(element.caption ?? "")}"></label><p class="inspector-note">This value is exposed to the controller HMI and operator menu.</p></div>` : ""}
    <div class="inspector-group"><h3>Signal connections</h3><div class="connection-list">${inputs || `<div class="empty-inspector">Source block · no inputs</div>`}</div></div>
    <div class="inspector-group"><h3>Artifact</h3><div class="property-row"><span>Target</span><code>${escapeHtml(compiledFbd.targetLabel)}</code></div><div class="property-row"><span>Format</span><code>${escapeHtml(activeProfile.artifactMediaType)}</code></div></div>`;

  content.querySelector<HTMLInputElement>("#fbd-title-input")?.addEventListener("change", (event) => {
    element.title = (event.target as HTMLInputElement).value;
    saveFbdProgram();
    renderFbd();
    renderFbdInspector();
  });
  content.querySelector<HTMLInputElement>("#fbd-caption-input")?.addEventListener("change", (event) => {
    element.caption = (event.target as HTMLInputElement).value;
    saveFbdProgram();
    buildFbd(false);
  });
  content.querySelectorAll<HTMLInputElement>("[data-fbd-param]").forEach((input) => input.addEventListener("change", () => {
    const index = Number(input.dataset["fbdParam"]);
    if (element.params && Number.isInteger(index)) element.params = element.params.map((value, paramIndex) => paramIndex === index ? Number(input.value) : value);
    saveFbdProgram();
    buildFbd(false);
  }));
  content.querySelectorAll<HTMLButtonElement>("[data-pick-source]").forEach((button) => button.addEventListener("click", () => {
    pendingFbdOutput = null;
    toast(`Select an output, then ${element.title} input ${Number(button.dataset["pickSource"]) + 1}`);
  }));
}

function renderInspector(): void {
  if (mode === "edit") {
    renderFbdInspector();
    return;
  }
  if (mode === "scada") return;
  const title = el("topology-inspector-title");
  const content = el("topology-inspector-content");
  if (selected === null) {
    title.textContent = "Nothing selected";
    content.innerHTML = `<div class="empty-inspector">Select a device, port, or cable on the workspace to inspect it.</div>`;
    return;
  }
  if (selected.kind === "connection") {
    const connection = connections.find((candidate) => candidate.id === selected?.id);
    if (!connection) { selected = null; renderInspector(); return; }
    const from = findPort(connection.from);
    const to = findPort(connection.to);
    title.textContent = "Physical connection";
    content.innerHTML = `
      <div class="inspector-group"><h3>Connection</h3>
        <div class="property-row"><span>Source</span><code>${escapeHtml(from?.device.title ?? connection.from.nodeId)} · ${escapeHtml(from?.port.label ?? connection.from.portId)}</code></div>
        <div class="property-row"><span>Target</span><code>${escapeHtml(to?.device.title ?? connection.to.nodeId)} · ${escapeHtml(to?.port.label ?? connection.to.portId)}</code></div>
        <div class="property-row"><span>Signal</span><code>${escapeHtml(from?.port.signal ?? "unknown")}</code></div>
        <div class="property-row"><span>Quality</span><code>${sourceSample(connection).quality}</code></div>
      </div>
      <div class="inspector-group"><h3>Runtime behavior</h3><p class="empty-inspector">The target input becomes <code>unknown</code> when this connection is removed. No value is silently synthesized.</p></div>`;
    return;
  }
  const device = findDevice(selected.id);
  if (!device) { selected = null; renderInspector(); return; }
  title.textContent = device.title;
  const portRows = device.ports.map((port) => `<div class="port-row"><i class="${port.signal}"></i><span>${escapeHtml(port.label)}<small>${port.direction} · ${port.signal}</small></span><small>${isConnected(device.id, port.id) ? "connected" : "open"}</small></div>`).join("");
  const relevant = connections.filter((connection) => connection.from.nodeId === device.id || connection.to.nodeId === device.id);
  const definition = equipmentDefinitions.find((candidate) => candidate.pkg.manifest.id === device.definitionId && candidate.pkg.manifest.version === device.definitionVersion)
    ?? equipmentDefinitions.find((candidate) => candidate.catalog.alias === device.catalogAlias);
  const connectionRows = relevant.map((connection) => {
    const peerRef = connection.from.nodeId === device.id ? connection.to : connection.from;
    const peer = findPort(peerRef);
    return `<div class="connection-row"><i class="quality-dot good"></i><span>${escapeHtml(peer?.device.title ?? peerRef.nodeId)}<small>${escapeHtml(peer?.port.label ?? peerRef.portId)}</small></span><button type="button" data-remove-connection="${escapeHtml(connection.id)}" title="Disconnect">×</button></div>`;
  }).join("");
  content.innerHTML = `
    <div class="inspector-group"><h3>Scene instance</h3><div class="property-row"><span>Instance ID</span><code>${escapeHtml(device.id)}</code></div><div class="property-row"><span>Definition</span><code>${escapeHtml(device.catalogAlias)}@${escapeHtml(device.definitionVersion)}</code></div><div class="property-row"><span>Package ID</span><code>${escapeHtml(device.definitionId)}</code></div><div class="property-row"><span>Position</span><code>${device.x}, ${device.y}</code></div></div>
    <div class="inspector-group"><h3>Resolved package</h3><div class="property-row"><span>Kind</span><code>${escapeHtml(definition?.pkg.manifest.kind ?? "resolving")}</code></div><div class="property-row"><span>Vendor</span><code>${escapeHtml(definition?.pkg.manifest.vendor.name ?? "resolving")}</code></div><div class="property-row"><span>Model ports</span><code>${definition?.model.ports.length ?? "—"}</code></div>${device.kind === "controller" ? `<div class="property-row"><span>Program</span><code>${escapeHtml(fbdProgram.name)} · ${escapeHtml(activeProfile.displayName)}</code></div>` : ""}</div>
    <div class="inspector-group"><h3>Ports</h3><div class="port-list">${portRows}</div></div>
    <div class="inspector-group"><h3>Connections</h3><div class="connection-list">${connectionRows || `<div class="empty-inspector">No active connections.</div>`}</div></div>`;
  content.querySelectorAll<HTMLButtonElement>("[data-remove-connection]").forEach((button) => button.addEventListener("click", () => removeConnection(button.dataset["removeConnection"] ?? "")));
}

function removeConnection(id: string): void {
  const connection = connections.find((candidate) => candidate.id === id);
  if (!connection) return;
  connections = connections.filter((candidate) => candidate.id !== id);
  selected = { kind: "node", id: connection.to.nodeId };
  saveScene();
  renderSelection();
  audit("Connection removed", `${findPort(connection.from)?.port.label ?? connection.from.portId} was disconnected`);
}

function deleteSelection(): void {
  if (mode === "edit") {
    deleteSelectedFbd();
    return;
  }
  if (selected?.kind === "connection") { removeConnection(selected.id); return; }
  if (selected?.kind !== "node") return;
  const device = findDevice(selected.id);
  if (!device) return;
  devices = devices.filter((candidate) => candidate.id !== device.id);
  connections = connections.filter((connection) => connection.from.nodeId !== device.id && connection.to.nodeId !== device.id);
  selected = null;
  saveScene();
  renderSelection();
  toast(`${device.title} removed from the scene`);
}

function buildRegistryPorts(definition: ResolvedEquipmentDefinition): PortSpec[] {
  const topology = definition.topology;
  if (!topology) return [];
  return Object.entries(topology.ports).flatMap(([portId, geometry]) => {
    const modelPort = definition.model.ports.find((candidate) => candidate.id === portId);
    if (!modelPort) return [];
    return [{
      id: portId,
      label: modelPort.title,
      // A bidirectional port (an RS-485 drop) joins the topology as a source toward the bus master.
      direction: modelPort.direction === "input" ? "input" as const : "output" as const,
      signal: geometry.signal ?? signalForModelPort(modelPort),
      x: geometry.x,
      y: geometry.y,
      side: geometry.side,
    }];
  });
}

function registryDeviceSpec(definition: ResolvedEquipmentDefinition): Omit<DeviceSpec, "id" | "x" | "y"> | null {
  const topology = definition.topology;
  if (!topology) return null;
  const ports = buildRegistryPorts(definition);
  if (ports.length === 0) return null;
  return {
    kind: "registry",
    definitionId: definition.pkg.manifest.id,
    definitionVersion: definition.pkg.manifest.version,
    catalogAlias: definition.catalog.alias,
    renderer: definition.catalog.renderer,
    title: definition.pkg.manifest.title,
    subtitle: definition.catalog.alias,
    width: topology.width,
    height: topology.height,
    ports,
    svgText: definition.svgText,
  };
}

function addRegistryDevice(definition: ResolvedEquipmentDefinition): void {
  const spec = registryDeviceSpec(definition);
  if (!spec) {
    toast(`${definition.pkg.manifest.title} does not declare topology geometry`, "alarm");
    return;
  }
  const instanceNumber = devices.filter((device) => device.definitionId === spec.definitionId).length + 1;
  let id = `${definition.pkg.manifest.name}-${instanceNumber}`;
  while (devices.some((device) => device.id === id)) id = `${definition.pkg.manifest.name}-${instanceNumber}-${crypto.randomUUID().slice(0, 4)}`;
  devices.push({
    ...spec,
    id,
    subtitle: `${definition.catalog.alias} · instance ${instanceNumber}`,
    x: clamp(360 + (devices.length % 6) * 90, 40, WORLD.width - spec.width - 40),
    y: clamp(130 + (devices.length % 5) * 110, 40, WORLD.height - spec.height - 40),
  });
  selected = { kind: "node", id };
  saveScene();
  renderSelection();
  toast(`${definition.pkg.manifest.title} instance added`);
}

/** Seed the default station with registry-rendered showcase equipment once the catalog resolves. */
function addShowcaseInstances(): void {
  const beacon = equipmentDefinitions.find((candidate) => candidate.catalog.alias === "@reference/alarm-beacon");
  const beaconSpec = beacon ? registryDeviceSpec(beacon) : null;
  if (beaconSpec && !devices.some((device) => device.catalogAlias === beaconSpec.catalogAlias) && findDevice("controller") && !devices.some((device) => device.id === "beacon")) {
    devices.push({ ...beaconSpec, id: "beacon", subtitle: "HA-101 · common alarm", x: 60, y: 380 });
    if (!connectionFrom("controller", "alarm")) {
      connections.push({ id: "wire-alarm-beacon", from: { nodeId: "controller", portId: "alarm" }, to: { nodeId: "beacon", portId: "alarm" } });
    }
  }
  const flow = equipmentDefinitions.find((candidate) => candidate.catalog.alias === "@reference/flow-meter");
  const flowSpec = flow ? registryDeviceSpec(flow) : null;
  if (flowSpec && !devices.some((device) => device.catalogAlias === flowSpec.catalogAlias) && findDevice("discharge-header") && !devices.some((device) => device.id === "flow-meter")) {
    devices.push({ ...flowSpec, id: "flow-meter", subtitle: "FIT-101 · station flow", x: 1480, y: 540 });
    if (!connectionFrom("discharge-header", "outlet-b")) {
      connections.push({ id: "pipe-flow-meter", from: { nodeId: "discharge-header", portId: "outlet-b" }, to: { nodeId: "flow-meter", portId: "process-in" } });
    }
  }
  saveScene();
}

function addDevice(kind: DeviceKind, definition?: ResolvedEquipmentDefinition): void {
  if (kind === "registry") {
    if (definition) addRegistryDevice(definition);
    return;
  }
  const base = DEVICE_DEFAULTS[kind];
  const resolved = definition ?? equipmentDefinitions.find((candidate) => candidate.catalog.alias === base.catalogAlias);
  const definitionId = resolved?.pkg.manifest.id ?? base.definitionId;
  const definitionVersion = resolved?.pkg.manifest.version ?? base.definitionVersion;
  const instanceNumber = devices.filter((device) => device.definitionId === definitionId).length + 1;
  let id = devices.some((device) => device.id === base.id) ? `${resolved?.pkg.manifest.name ?? base.renderer}-${instanceNumber}` : base.id;
  while (devices.some((device) => device.id === id)) id = `${resolved?.pkg.manifest.name ?? base.renderer}-${instanceNumber}-${crypto.randomUUID().slice(0, 4)}`;
  const isTemplateSlot = id === base.id;
  devices.push({
    ...base,
    id,
    definitionId,
    definitionVersion,
    title: isTemplateSlot ? base.title : resolved?.pkg.manifest.title ?? base.title,
    subtitle: isTemplateSlot ? base.subtitle : `${resolved?.catalog.alias ?? base.catalogAlias} · instance ${instanceNumber}`,
    x: clamp(360 + (devices.length % 6) * 90, 40, WORLD.width - base.width - 40),
    y: clamp(130 + (devices.length % 5) * 110, 40, WORLD.height - base.height - 40),
    ports: PORTS[kind].map((port) => ({ ...port })),
  });
  selected = { kind: "node", id };
  saveScene();
  renderSelection();
  toast(`${resolved?.pkg.manifest.title ?? base.title} instance added`);
}

function kindForDefinition(definition: ResolvedEquipmentDefinition): DeviceKind {
  if (!BUILTIN_RENDERERS.has(definition.catalog.renderer as never)) return "registry";
  if (controllerProfileForRenderer(definition.catalog.renderer) !== undefined) return "controller";
  if (definition.catalog.renderer === "pressure-transmitter") return "sensor";
  if (definition.catalog.renderer === "centrifugal-pump") {
    if (!devices.some((device) => device.id === "pump1")) return "pump1";
    if (!devices.some((device) => device.id === "pump2")) return "pump2";
    return "pump1";
  }
  if (definition.catalog.renderer === "suction-tank") return "reservoir";
  if (definition.catalog.renderer === "process-header") {
    if (!devices.some((device) => device.id === "suction-header")) return "suctionHeader";
    if (!devices.some((device) => device.id === "discharge-header")) return "dischargeHeader";
    return "suctionHeader";
  }
  return "estop";
}

function addEquipment(alias: string): void {
  const definition = equipmentDefinitions.find((candidate) => candidate.catalog.alias === alias);
  if (!definition) return;
  const kind = kindForDefinition(definition);
  addDevice(kind, definition);
}

const CATEGORY_LABELS: Record<string, string> = {
  controllers: "Controllers",
  "io-modules": "I/O modules · RS-485",
  instrumentation: "Instrumentation",
  "rotating-equipment": "Rotating equipment",
  drives: "Drives",
  valves: "Valves",
  vessels: "Vessels",
  "process-piping": "Process piping",
  safety: "Safety & annunciation",
};

const CATEGORY_ORDER = ["controllers", "io-modules", "drives", "instrumentation", "rotating-equipment", "valves", "vessels", "process-piping", "safety"];

function equipmentSvg(definition: ResolvedEquipmentDefinition): string | null {
  if (definition.svgText) return definition.svgText;
  const profileRenderer = controllerProfileForRenderer(definition.catalog.renderer);
  if (profileRenderer) return profileRenderer.renderView({ defsPrefix: `catalog-${definition.pkg.manifest.name}` });
  return null;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function equipmentThumb(definition: ResolvedEquipmentDefinition): string {
  const svg = equipmentSvg(definition);
  if (svg) return `<span class="catalog-thumb catalog-thumb-view"><img src="${svgDataUri(svg)}" alt="" loading="lazy"></span>`;
  const monogram = definition.catalog.renderer === "pressure-transmitter" ? "PT" : definition.catalog.renderer === "centrifugal-pump" ? "P" : definition.catalog.renderer === "suction-tank" ? "TK" : definition.catalog.renderer === "process-header" ? "MH" : "S0";
  return `<span class="catalog-thumb ${escapeHtml(definition.catalog.renderer)}-thumb">${monogram}</span>`;
}

function renderEquipmentCatalog(): void {
  const container = el("equipment-catalog");
  if (equipmentDefinitions.length === 0) {
    container.innerHTML = `<div class="empty-catalog">Resolving package manifests…</div>`;
    return;
  }
  const query = el<HTMLInputElement>("equipment-search").value.trim().toLowerCase();
  const matches = equipmentDefinitions.filter((definition) => {
    const manifest = definition.pkg.manifest;
    return [manifest.title, manifest.name, manifest.vendor.name, definition.catalog.alias, definition.catalog.category, ...definition.catalog.tags].join(" ").toLowerCase().includes(query);
  });
  const categories = [...new Set(matches.map((definition) => definition.catalog.category))]
    .sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 100 * Number(CATEGORY_ORDER.indexOf(a) < 0)) - (CATEGORY_ORDER.indexOf(b) + 100 * Number(CATEGORY_ORDER.indexOf(b) < 0)));
  container.innerHTML = categories.map((category) => {
    const entries = matches.filter((definition) => definition.catalog.category === category);
    const items = entries.map((definition) => {
      const manifest = definition.pkg.manifest;
      const portLabel = `${definition.model.ports.length} ${definition.model.ports.length === 1 ? "port" : "ports"}`;
      const instanceCount = devices.filter((device) => device.definitionId === manifest.id).length;
      return `<div class="equipment-row">
        <button type="button" class="catalog-item equipment-item" data-add-equipment="${escapeHtml(definition.catalog.alias)}" title="Add to topology">
          ${equipmentThumb(definition)}
          <span><strong>${escapeHtml(manifest.title)}</strong><small>${escapeHtml(definition.catalog.alias)} · ${portLabel}</small><em>${escapeHtml(manifest.vendor.name)} · v${escapeHtml(manifest.version)}</em></span>
          <span class="instance-count">${instanceCount}</span>
        </button>
        <button type="button" class="passport-button" data-passport="${escapeHtml(definition.catalog.alias)}" title="Device passport">ⓘ</button>
      </div>`;
    }).join("");
    return `<p class="catalog-group-title">${escapeHtml(CATEGORY_LABELS[category] ?? category)} <span>${entries.length}</span></p>${items}`;
  }).join("") || `<div class="empty-catalog">No equipment matches this search.</div>`;
  container.querySelectorAll<HTMLButtonElement>("[data-add-equipment]").forEach((button) => button.addEventListener("click", () => addEquipment(button.dataset["addEquipment"] ?? "")));
  container.querySelectorAll<HTMLButtonElement>("[data-passport]").forEach((button) => button.addEventListener("click", () => openPassport(button.dataset["passport"] ?? "")));
}

function passportComparatorLabel(port: { signal?: { dataType?: string; unit?: string; minimum?: number; maximum?: number }; physical?: { kind?: string; range?: string; medium?: string } }): string {
  const signalParts = [port.signal?.dataType, port.signal?.unit, port.signal?.minimum !== undefined || port.signal?.maximum !== undefined ? `${port.signal?.minimum ?? "…"}–${port.signal?.maximum ?? "…"}` : null].filter(Boolean);
  const physicalParts = [port.physical?.medium, port.physical?.kind, port.physical?.range].filter(Boolean);
  return [signalParts.join(" "), physicalParts.join(" · ")].filter((part) => part !== "").join(" · ") || "—";
}

function openPassport(alias: string): void {
  const definition = equipmentDefinitions.find((candidate) => candidate.catalog.alias === alias);
  if (!definition) return;
  const manifest = definition.pkg.manifest;
  const dialog = el<HTMLDialogElement>("passport-dialog");
  el("passport-title").textContent = manifest.title;
  const svg = equipmentSvg(definition);
  const portRows = definition.model.ports.map((port) => `<tr>
    <td><code>${escapeHtml(port.id)}</code></td>
    <td>${escapeHtml(port.title)}</td>
    <td><span class="passport-chip">${escapeHtml(port.direction)}</span></td>
    <td><span class="passport-chip domain-${escapeHtml(port.domain)}">${escapeHtml(port.domain)}</span></td>
    <td>${escapeHtml(passportComparatorLabel(port))}</td>
  </tr>`).join("");
  const parameterRows = (definition.model.parameters ?? []).map((parameter) => `<tr>
    <td><code>${escapeHtml(parameter.id)}</code></td>
    <td>${escapeHtml(parameter.title)}</td>
    <td>${escapeHtml(parameter.dataType)}${parameter.unit ? ` · ${escapeHtml(parameter.unit)}` : ""}</td>
    <td>${parameter.default !== undefined ? escapeHtml(String(parameter.default)) : "—"}${parameter.retained ? " · retained" : ""}</td>
  </tr>`).join("");
  const artifacts = [
    { label: "Device model", href: manifest.model.href, mediaType: manifest.model.mediaType, integrity: manifest.model.integrity },
    ...(manifest.views ?? []).map((view) => ({ label: `View · ${view.role}`, href: view.entrypoint.href, mediaType: view.entrypoint.mediaType, integrity: view.entrypoint.integrity })),
  ];
  const artifactRows = artifacts.map((artifact) => `<tr>
    <td>${escapeHtml(artifact.label)}</td>
    <td><code>${escapeHtml(artifact.href)}</code></td>
    <td>${escapeHtml(artifact.mediaType)}</td>
    <td>${artifact.integrity ? `<span class="passport-chip good">sha-256 pinned</span>` : `<span class="passport-chip">source · pinned by device pack</span>`}</td>
  </tr>`).join("");
  el("passport-content").innerHTML = `
    <div class="passport-hero">${svg ?? `<div class="package-view-placeholder"><strong>${escapeHtml(manifest.title)}</strong></div>`}</div>
    <div class="passport-meta">
      <div><span>Package</span><code>${escapeHtml(manifest.id)}</code></div>
      <div><span>Alias</span><code>${escapeHtml(definition.catalog.alias)}@${escapeHtml(manifest.version)}</code></div>
      <div><span>Vendor</span><strong>${escapeHtml(manifest.vendor.name)}</strong></div>
      <div><span>Kind</span><span class="passport-chip">${escapeHtml(manifest.kind)}</span></div>
      <div><span>Capabilities</span><span>${(definition.model.capabilities ?? []).map((capability) => `<span class="passport-chip">${escapeHtml(capability)}</span>`).join(" ") || "—"}</span></div>
    </div>
    <p class="passport-description">${escapeHtml(manifest.description)}</p>
    <h3>Ports</h3>
    <div class="passport-table-wrap"><table><thead><tr><th>ID</th><th>Title</th><th>Direction</th><th>Domain</th><th>Signal / physical</th></tr></thead><tbody>${portRows}</tbody></table></div>
    ${parameterRows ? `<h3>Parameters</h3><div class="passport-table-wrap"><table><thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Default</th></tr></thead><tbody>${parameterRows}</tbody></table></div>` : ""}
    <h3>Artifacts</h3>
    <div class="passport-table-wrap"><table><thead><tr><th>Artifact</th><th>Href</th><th>Media type</th><th>Integrity</th></tr></thead><tbody>${artifactRows}</tbody></table></div>
    <div class="passport-actions">
      <button type="button" class="primary-action" data-passport-add>Add to topology</button>
      ${svg ? `<button type="button" class="project-action" data-passport-download>Download view SVG</button>` : ""}
      <a class="project-action" href="${escapeHtml(definition.pkg.manifestUrl.href)}" target="_blank" rel="noreferrer">Open manifest</a>
    </div>`;
  el("passport-content").querySelector<HTMLButtonElement>("[data-passport-add]")?.addEventListener("click", () => {
    dialog.close();
    if (mode !== "simulate") setMode("simulate");
    addEquipment(alias);
  });
  el("passport-content").querySelector<HTMLButtonElement>("[data-passport-download]")?.addEventListener("click", () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${manifest.name}.svg`;
    link.click();
    URL.revokeObjectURL(href);
    toast("Front-panel SVG saved — ready for datasheets and sales pages");
  });
  dialog.showModal();
}

function resetScene(): void {
  if (mode === "edit") {
    resetFbdProgram();
    return;
  }
  devices = (Object.keys(DEVICE_DEFAULTS) as LegacyDeviceKind[]).map((kind) => ({ ...DEVICE_DEFAULTS[kind], ports: PORTS[kind].map((port) => ({ ...port })) }));
  connections = DEFAULT_CONNECTIONS.map((connection) => structuredClone(connection));
  addShowcaseInstances();
  selected = { kind: "node", id: "controller" };
  saveScene();
  renderSelection();
  fitView();
  toast("Default pump station restored");
}

function updateCatalogAvailability(): void {
  renderEquipmentCatalog();
}

function inputSample(nodeId: string, portId: string, fallback: number | boolean = false): Sample {
  const connection = connectionTo(nodeId, portId);
  return connection ? sourceSample(connection) : { value: fallback, quality: "unknown" };
}

function stepSimulation(): void {
  if (!simulationRunning || fbdRuntime === null || !findDevice("controller")) return;
  // Wired samples in, semantic outputs back — pins, scaling, and failsafe
  // sentinels are the profile adapter's business.
  fbdRuntime.writeInputs({
    pressure: inputSample("controller", "pressure", 0),
    "emergency-stop": inputSample("controller", "emergency-stop", false),
    "pump-1-feedback": inputSample("controller", "pump-1-feedback", false),
    "auto-mode": { value: el<HTMLInputElement>("auto-mode").checked, quality: "good" },
    "pump-2-feedback": inputSample("controller", "pump-2-feedback", false),
    "tank-low-level": inputSample("controller", "tank-low-level", false),
  });
  fbdRuntime.step(STEP_MS);
  controllerOutputs = fbdRuntime.outputs();

  const command1Wire = connectionFrom("controller", "pump-1-command");
  const command2Wire = connectionFrom("controller", "pump-2-command");
  const command1: Sample = command1Wire ? sourceSample(command1Wire) : { value: false, quality: "unknown" };
  const command2: Sample = command2Wire ? sourceSample(command2Wire) : { value: false, quality: "unknown" };
  pump1Running = sampleOn(command1) && command1.quality === "good";
  pump2Running = sampleOn(command2) && command2.quality === "good";

  const demand = Number(el<HTMLInputElement>("demand").value) / 100;
  const rise = (pump1Running ? 0.038 : 0) + (pump2Running ? 0.038 : 0);
  const decay = 0.004 + demand * 0.021;
  pressure = clamp(pressure + rise - decay, 0.35, 4.7);
  if (pump1Running || pump2Running) tankLevel = clamp(tankLevel - (pump1Running && pump2Running ? 0.008 : 0.004), 0, 100);
  flowTotal += stationFlow() / 36000;
  cycleCount += 1;
  if (cycleCount % 10 === 0) trend = [...trend.slice(-59), pressure];

  const alarm = sampleOn(controllerOutputs["alarm"]);
  if (alarm !== previousAlarm) {
    audit(alarm ? "Controller alarm active" : "Controller alarm cleared", alarm ? "Failsafe or feedback condition detected" : "Runtime output returned to normal", alarm ? "alarm" : "info");
    previousAlarm = alarm;
  }
  if (pump1Running !== previousPump1) {
    audit(pump1Running ? "Lead pump P-101 started" : "Lead pump P-101 stopped", `Command changed at ${pressure.toFixed(2)} bar`);
    previousPump1 = pump1Running;
  }
  if (pump2Running !== previousPump2) {
    audit(pump2Running ? "Lag pump P-102 started" : "Lag pump P-102 stopped", pump2Running ? "Cascade or standby takeover active" : `Command changed at ${pressure.toFixed(2)} bar`);
    previousPump2 = pump2Running;
  }
  updateVisualState();
}

/**
 * A key press goes two places, exactly as on the device: the controller firmware menu
 * consumes it for navigation, and on the working screen it is also an ordinary program
 * input, so the running logic can react. Menu trees, pins, and setpoint writes are the
 * profile adapter's business.
 */
function pressPanelKey(direction: string): void {
  if (fbdRuntime === null) {
    toast("Controller runtime is still loading", "alarm");
    return;
  }
  if (!["up", "down", "left", "right"].includes(direction)) return;
  const result = fbdRuntime.pressKey(direction as PanelKey);
  if (result.detail !== "") audit(`Panel key ${direction.toUpperCase()} pressed`, result.detail);
  renderControllerDisplay();
}

/** Draw the controller display (firmware menu or program screen) into its SVG slot. */
function renderControllerDisplay(): void {
  const display = nodesLayer.querySelector<SVGSVGElement>(".runtime-hmi");
  if (display && fbdRuntime !== null) fbdRuntime.renderDisplay(display);
}

function setNodeText(node: HTMLElement, selector: string, value: string): void {
  const target = node.querySelector(selector);
  if (target && target.textContent !== value) target.textContent = value;
}

function updateRegistryNodes(): void {
  for (const device of devices) {
    if (device.kind !== "registry") continue;
    const node = nodesLayer.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(device.id)}"]`);
    if (!node) continue;

    for (const port of device.ports) {
      const wired = isConnected(device.id, port.id);
      const sample = !wired ? null : port.direction === "input" ? inputSample(device.id, port.id, false) : registrySample(device, port.id);
      const active = sample !== null && (sampleOn(sample) || port.signal === "network" || (port.signal === "analog" && sample.quality === "good"));
      const pin = node.querySelector<SVGElement>(`[data-terminal-id="${CSS.escape(port.id)}"]`);
      pin?.setAttribute("data-glow", active ? (port.signal === "safety" ? "alarm" : port.direction === "input" ? "input" : "on") : "off");
      const ledMatch = /^(di|do|ai|ao|t)(\d+)$/.exec(port.id);
      if (ledMatch) node.querySelector(`[data-${ledMatch[1]}-led="${ledMatch[2]}"]`)?.setAttribute("data-lit", active ? "1" : "0");
    }

    const alias = device.catalogAlias;
    if (alias === "@reference/frequency-drive") {
      const running = sampleOn(inputSample(device.id, "run", false));
      const referenceWire = connectionTo(device.id, "speed-reference");
      const reference = referenceWire ? sourceSample(referenceWire) : null;
      const speedPercent = !running ? 0 : clamp(reference !== null && typeof reference.value === "number" && reference.quality === "good" ? reference.value : 100, 0, 100);
      const hz = 50 * speedPercent / 100;
      node.classList.toggle("is-running", running);
      setNodeText(node, "[data-vfd-hz]", `${hz.toFixed(1)} Hz`);
      setNodeText(node, "[data-vfd-state]", running ? "RUN" : "READY");
      setNodeText(node, "[data-vfd-amps]", `${(running ? 1.2 + hz * 0.14 : 0).toFixed(1)} A`);
      node.querySelector("[data-vfd-led-run]")?.setAttribute("fill", running ? "#42d77d" : "#1d3524");
    } else if (alias === "@reference/motorized-valve") {
      const open = sampleOn(inputSample(device.id, "open-command", false));
      const positionLabel = node.querySelector<SVGElement>("[data-valve-position]");
      if (positionLabel) {
        if (positionLabel.textContent !== (open ? "OPEN" : "CLOSED")) positionLabel.textContent = open ? "OPEN" : "CLOSED";
        positionLabel.setAttribute("fill", open ? "#42d77d" : "#f2c94c");
      }
      node.querySelector("[data-valve-led-open]")?.setAttribute("fill", open ? "#42d77d" : "#1d3524");
      node.querySelector("[data-valve-led-closed]")?.setAttribute("fill", open ? "#3d3413" : "#f2c94c");
      node.querySelector("[data-valve-disc]")?.setAttribute("fill", open ? "#38bdf8" : "#39455a");
    } else if (alias === "@reference/flow-meter") {
      const measuring = connectionTo(device.id, "process-in") !== undefined;
      const flow = measuring ? stationFlow() : 0;
      node.classList.toggle("is-running", flow > 0);
      setNodeText(node, "[data-flow-value]", flow.toFixed(1));
      setNodeText(node, "[data-flow-total]", `Σ ${flowTotal.toFixed(1)} m³`);
    } else if (alias === "@reference/level-transmitter") {
      const measuring = connectionTo(device.id, "process") !== undefined;
      setNodeText(node, "[data-level-value]", measuring ? String(Math.round(tankLevel)) : "—");
    } else if (alias === "@reference/alarm-beacon") {
      const alarmOn = sampleOn(inputSample(device.id, "alarm", false));
      node.classList.toggle("is-alarm", alarmOn);
      node.querySelector("[data-beacon-red]")?.setAttribute("fill", alarmOn ? "#ef4444" : "#7f1d1d");
      node.querySelector("[data-beacon-green]")?.setAttribute("fill", alarmOn ? "#14532d" : "#22c55e");
      node.querySelector("[data-beacon-waves]")?.setAttribute("opacity", alarmOn ? "1" : "0");
    }
  }
}

function updateVisualState(): void {
  const pressureQuality = connectionTo("controller", "pressure") ? el<HTMLSelectElement>("pressure-quality").value as Quality : "unknown";
  const alarm = sampleOn(controllerOutputs["alarm"]);
  const eStop = el<HTMLInputElement>("emergency-stop").checked;
  const controller = nodesLayer.querySelector<HTMLElement>(".controller-node");
  controller?.classList.toggle("is-alarm", alarm);
  // Terminal glow is keyed by semantic port IDs; the profile's view carries the
  // terminal hooks, so no vendor terminal names appear here.
  const portGlow = new Map<string, { active: boolean; kind: "on" | "alarm" | "input" }>([
    ["pump-1-command", { active: pump1Running, kind: "on" }],
    ["alarm", { active: alarm, kind: "alarm" }],
    ["pump-2-command", { active: pump2Running, kind: "on" }],
    ["suction-valve", { active: sampleOn(controllerOutputs["suction-valve"]), kind: "on" }],
    ["emergency-stop", { active: eStop, kind: "alarm" }],
    ["pump-1-feedback", { active: pump1Running && el<HTMLInputElement>("follow-feedback-1").checked, kind: "input" }],
    ["pump-2-feedback", { active: pump2Running && el<HTMLInputElement>("follow-feedback-2").checked, kind: "input" }],
    ["tank-low-level", { active: tankLevel <= 15, kind: "alarm" }],
    ["pressure", { active: pressureQuality === "good", kind: "input" }],
  ]);
  const controllerDevice = findDevice("controller");
  const terminalGlow = new Map<string, { active: boolean; kind: "on" | "alarm" | "input" }>();
  for (const port of controllerDevice?.ports ?? []) {
    const state = portGlow.get(port.id);
    if (port.terminalId && state) terminalGlow.set(port.terminalId, state);
  }
  controller?.querySelectorAll<SVGRectElement>("[data-terminal-id]").forEach((pin) => {
    const state = terminalGlow.get(pin.dataset["terminalId"] ?? "");
    pin.setAttribute("data-glow", state?.active ? state.kind : "off");
  });
  const pressureText = pressure.toFixed(2);
  renderControllerDisplay();
  const sensor = nodesLayer.querySelector<HTMLElement>(".sensor-node");
  const sensorValue = sensor?.querySelector<HTMLElement>(".sensor-value b");
  if (sensorValue) sensorValue.textContent = pressureText;
  const gauge = sensor?.querySelector<HTMLElement>(".sensor-gauge");
  gauge?.style.setProperty("--needle", `${-55 + pressure / 5 * 110}deg`);
  const pump1 = nodesLayer.querySelector<HTMLElement>(".pump1-node");
  const pump2 = nodesLayer.querySelector<HTMLElement>(".pump2-node");
  pump1?.classList.toggle("is-running", pump1Running);
  pump2?.classList.toggle("is-running", pump2Running);
  const pump1State = pump1?.querySelector<HTMLElement>(".pump-stats b");
  const pump2State = pump2?.querySelector<HTMLElement>(".pump-stats b");
  if (pump1State) pump1State.textContent = pump1Running ? "RUNNING" : "STOPPED";
  if (pump2State) pump2State.textContent = pump2Running ? "RUNNING" : "STANDBY";
  const reservoir = nodesLayer.querySelector<HTMLElement>(".reservoir-node");
  reservoir?.classList.toggle("is-low", tankLevel <= 15);
  reservoir?.querySelector<HTMLElement>(".mini-tank span")?.style.setProperty("height", `${tankLevel}%`);
  const reservoirValue = reservoir?.querySelector<HTMLElement>(".reservoir-value");
  if (reservoirValue) reservoirValue.textContent = `${Math.round(tankLevel)}%`;
  const estop = nodesLayer.querySelector<HTMLElement>(".estop-node");
  estop?.classList.toggle("is-active", eStop);
  const estopState = estop?.querySelector<HTMLElement>(".estop-copy small");
  if (estopState) estopState.textContent = eStop ? "TRIPPED" : "CLOSED";
  updateRegistryNodes();

  el("sim-pressure").textContent = pressureText;
  el("pressure-bar").style.width = `${clamp(pressure / 5 * 100, 0, 100)}%`;
  el("cycle-count").textContent = cycleCount.toLocaleString("en-US");
  el("tree-sensor-value").textContent = `${pressureText} bar · ${pressureQuality}`;
  el("tree-pump1-value").textContent = pump1Running ? "Running · lead duty" : "Stopped · available";
  el("tree-pump2-value").textContent = pump2Running ? "Running · cascade/standby" : "Standby · available";
  el("tree-level-value").textContent = `${Math.round(tankLevel)}% · ${tankLevel <= 15 ? "LOW" : "normal"}`;
  el("tree-plc-status").classList.toggle("is-alarm", alarm);
  el("tree-plc-subtitle").textContent = alarm ? "Alarm · inspect inputs" : "Running · deterministic";
  el("system-health").textContent = alarm ? "Attention" : "Healthy";
  el("system-health").classList.toggle("bad", alarm);
  el("system-health").classList.toggle("good", !alarm);

  el("scada-pressure").textContent = pressureText;
  el("scada-pump1-state").textContent = pump1Running ? "RUNNING" : "STOPPED";
  el("scada-pump2-state").textContent = pump2Running ? "RUNNING" : "STANDBY";
  el("scada-pump1-state").style.color = pump1Running ? "var(--green)" : "";
  el("scada-pump2-state").style.color = pump2Running ? "var(--green)" : "";
  el("scada-mode").textContent = el<HTMLInputElement>("auto-mode").checked ? "AUTO" : "MANUAL";
  el("scada-level").textContent = String(Math.round(tankLevel));
  el("tank-fill").style.height = `${clamp(tankLevel, 2, 98)}%`;
  el("process-pump1").classList.toggle("is-running", pump1Running);
  el("process-pump2").classList.toggle("is-running", pump2Running);
  const anyPumpRunning = pump1Running || pump2Running;
  el("flow-line").classList.toggle("is-flowing", anyPumpRunning);
  el("flow-line-out").classList.toggle("is-flowing", anyPumpRunning);
  updateBoosterStationDiagram(el<SVGSVGElement>("process-diagram"), {
    level: tankLevel,
    pressure,
    flow: (pump1Running ? 46 : 0) + (pump2Running ? 46 : 0),
    pump1Running,
    pump2Running,
    pump1Fault: pump1Running && !el<HTMLInputElement>("follow-feedback-1").checked,
    pump2Fault: pump2Running && !el<HTMLInputElement>("follow-feedback-2").checked,
    outletOpen: sampleOn(controllerOutputs["suction-valve"]) || anyPumpRunning,
    quality: pressureQuality,
  });
  el("kpi-pressure").textContent = pressureText;
  el("kpi-pump1").textContent = pump1Running ? "ON" : "OFF";
  el("kpi-pump2").textContent = pump2Running ? "ON" : "OFF";
  el("kpi-pump1").style.color = pump1Running ? "var(--green)" : "";
  el("kpi-pump2").style.color = pump2Running ? "var(--green)" : "";
  el("kpi-quality").textContent = pressureQuality.toUpperCase();
  el("kpi-quality").style.color = pressureQuality === "good" ? "var(--green)" : pressureQuality === "bad" ? "var(--red)" : "var(--yellow)";
  el("kpi-feedback1").textContent = el<HTMLInputElement>("follow-feedback-1").checked ? "FEEDBACK OK" : "FEEDBACK FAILED";
  el("kpi-feedback2").textContent = el<HTMLInputElement>("follow-feedback-2").checked ? "FEEDBACK OK" : "FEEDBACK FAILED";
  renderTrend();
  renderCables();
  if (mode === "edit") {
    for (const id of ["pump1_run", "out_pump1"]) fbdNodesLayer.querySelector(`[data-fbd-id="${id}"]`)?.classList.toggle("is-running", pump1Running);
    for (const id of ["pump2_run", "out_pump2"]) fbdNodesLayer.querySelector(`[data-fbd-id="${id}"]`)?.classList.toggle("is-running", pump2Running);
    for (const id of ["alarm", "out_alarm"]) fbdNodesLayer.querySelector(`[data-fbd-id="${id}"]`)?.classList.toggle("is-running", alarm);
    renderFbdEdges();
  }
}

function renderTrend(): void {
  const points = trend.map((value, index) => `${(index / Math.max(1, trend.length - 1)) * 320},${130 - clamp(value / 5, 0, 1) * 125}`).join(" ");
  el<SVGPolylineElement>("trend-line").setAttribute("points", points);
  const area = points ? `M ${points.replaceAll(" ", " L ")} L 320 130 L 0 130 Z` : "";
  el<SVGPathElement>("trend-area").setAttribute("d", area);
}

function audit(title: string, detail: string, kind: "info" | "alarm" = "info"): void {
  events.unshift({ id: ++eventSequence, kind, title, detail, time: new Date(), acknowledged: false });
  events.splice(24);
  renderEvents();
  toast(title, kind === "alarm" ? "alarm" : "info");
}

function renderEvents(): void {
  const list = el<HTMLUListElement>("alarm-list");
  if (events.length === 0) {
    list.innerHTML = `<li><i></i><span><strong>No events yet</strong><small>The operator audit trail will appear here.</small></span><time>—</time></li>`;
    return;
  }
  list.replaceChildren(...events.slice(0, 8).map((event) => {
    const item = document.createElement("li");
    item.className = `${event.kind}${event.acknowledged ? " acknowledged" : ""}`;
    item.innerHTML = `<i></i><span><strong>${escapeHtml(event.title)}</strong><small>${escapeHtml(event.detail)}</small></span><time>${event.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>`;
    return item;
  }));
}

function toast(message: string, kind: "info" | "alarm" = "info"): void {
  const region = el("toast-region");
  const item = document.createElement("div");
  item.className = `toast ${kind}`;
  item.textContent = message;
  region.append(item);
  window.setTimeout(() => item.remove(), 3600);
}

async function runScenarios(): Promise<void> {
  const dialog = el<HTMLDialogElement>("scenario-dialog");
  const summary = el("scenario-summary");
  const results = el("scenario-results");
  dialog.showModal();
  summary.className = "scenario-summary";
  summary.textContent = `Executing ${activeProfile.displayName} conformance checks against the compiled artifact…`;
  results.replaceChildren();
  const button = el<HTMLButtonElement>("run-scenarios");
  button.disabled = true;
  try {
    const startedAt = performance.now();
    const checks: Array<{ id: string; passed: boolean; detail: string }> = [];
    const createLoadedRuntime = async (): Promise<ControllerRuntimeHandle> => {
      const runtime = await activeProfile.createRuntime(fbdProgram);
      const loaded = runtime.load(compiledFbd.artifact);
      if (!loaded.ok) throw new Error(loaded.message ?? "runtime rejected the compiled artifact");
      runtime.writeInput("pressure", 1.0);
      runtime.writeInput("emergency-stop", false);
      runtime.writeInput("pump-1-feedback", true);
      runtime.writeInput("auto-mode", true);
      runtime.writeInput("pump-2-feedback", true);
      runtime.writeInput("tank-low-level", false);
      return runtime;
    };
    const isOn = (value: number | boolean): boolean => value === true || value === 1;
    const startRuntime = await createLoadedRuntime();
    for (let index = 0; index < 25; index += 1) startRuntime.step(100);
    checks.push({ id: "lead-pump-start", passed: isOn(startRuntime.readOutput("pump-1-command")) && !isOn(startRuntime.readOutput("pump-2-command")), detail: "P-101 starts first after the lead start delay" });
    startRuntime.writeInput("pressure", 0.5);
    for (let index = 0; index < 45; index += 1) startRuntime.step(100);
    checks.push({ id: "cascade-start", passed: isOn(startRuntime.readOutput("pump-2-command")), detail: "P-102 joins after sustained critical pressure" });
    startRuntime.writeInput("pressure", 4.0);
    startRuntime.step(100);
    checks.push({ id: "station-stop", passed: !isOn(startRuntime.readOutput("pump-1-command")) && !isOn(startRuntime.readOutput("pump-2-command")), detail: "Both pumps stop at the station high setpoint" });
    const failoverRuntime = await createLoadedRuntime();
    failoverRuntime.writeInput("pump-1-feedback", false);
    for (let index = 0; index < 60; index += 1) failoverRuntime.step(100);
    checks.push({ id: "standby-failover", passed: !isOn(failoverRuntime.readOutput("pump-1-command")) && isOn(failoverRuntime.readOutput("pump-2-command")), detail: "P-102 takes over after P-101 feedback timeout" });
    const levelRuntime = await createLoadedRuntime();
    for (let index = 0; index < 25; index += 1) levelRuntime.step(100);
    levelRuntime.writeInput("tank-low-level", true);
    levelRuntime.step(100);
    checks.push({ id: "dry-run-protection", passed: !isOn(levelRuntime.readOutput("pump-1-command")) && isOn(levelRuntime.readOutput("alarm")), detail: "Low tank level stops pumping and raises common alarm" });
    const safetyRuntime = await createLoadedRuntime();
    for (let index = 0; index < 25; index += 1) safetyRuntime.step(100);
    safetyRuntime.writeInput("emergency-stop", true);
    safetyRuntime.step(100);
    checks.push({ id: "emergency-stop", passed: !isOn(safetyRuntime.readOutput("pump-1-command")) && !isOn(safetyRuntime.readOutput("pump-2-command")), detail: "Emergency stop removes the station run permission" });
    const hmiRuntime = await createLoadedRuntime();
    hmiRuntime.step(100);
    const displayStatus = hmiRuntime.displayStatus();
    checks.push({ id: "controller-hmi", passed: displayStatus.commandCount > 0 && displayStatus.complete, detail: `${displayStatus.commandCount} draw commands emitted for the controller display` });
    const digestBytes = Uint8Array.from(compiledFbd.artifact);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", digestBytes.buffer));
    const digestLabel = Array.from(digest.slice(0, 6), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const passed = checks.filter((check) => check.passed).length;
    const result = passed === checks.length ? "passed" : "failed";
    summary.classList.add(result);
    summary.textContent = `${passed}/${checks.length} passed · ${Math.round(performance.now() - startedAt)} ms · artifact sha256:${digestLabel}…`;
    for (const scenario of checks) {
      const row = document.createElement("div");
      row.className = `scenario-result ${scenario.passed ? "passed" : "failed"}`;
      row.innerHTML = `<span>${scenario.passed ? "✓" : "×"}</span><strong>${escapeHtml(scenario.id)}</strong><small>${escapeHtml(scenario.detail)}</small>`;
      results.append(row);
    }
    audit(`${activeProfile.displayName} conformance completed`, `${passed}/${checks.length} checks passed`, result === "passed" ? "info" : "alarm");
  } catch (error) {
    summary.classList.add("failed");
    summary.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    button.disabled = false;
  }
}

function bindControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-mode-button]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset["modeButton"] as Mode)));
  document.querySelectorAll<HTMLButtonElement>("[data-add-fbd]").forEach((button) => button.addEventListener("click", () => addFbdBlock(button.dataset["addFbd"] ?? "")));
  el("compile-fbd").addEventListener("click", () => buildFbd(true));
  el("delete-selection").addEventListener("click", deleteSelection);
  el("delete-topology-selection").addEventListener("click", deleteSelection);
  el("reset-layout").addEventListener("click", resetScene);
  el("reset-topology").addEventListener("click", resetScene);
  el("export-project").addEventListener("click", downloadProject);
  const projectFile = el<HTMLInputElement>("project-file");
  el("import-project").addEventListener("click", () => projectFile.click());
  projectFile.addEventListener("change", () => {
    const file = projectFile.files?.[0];
    if (file) void importProject(file);
    projectFile.value = "";
  });
  el("zoom-in").addEventListener("click", () => setZoom(zoom + 0.1));
  el("zoom-out").addEventListener("click", () => setZoom(zoom - 0.1));
  el("zoom-label").addEventListener("click", () => setZoom(1));
  el("fit-view").addEventListener("click", fitView);
  el("wire-tool").addEventListener("click", () => toast("Select an FBD block output, then the target input"));
  canvasViewport.addEventListener("pointermove", onPointerMove);
  canvasViewport.addEventListener("pointerup", onPointerUp);
  canvasViewport.addEventListener("pointercancel", onPointerUp);
  canvasViewport.addEventListener("click", (event) => {
    if (mode === "edit" && !(event.target as Element).closest(".fbd-block")) {
      selectedFbdId = null;
      pendingFbdOutput = null;
      connectHint.hidden = true;
      fbdDraftEdge.toggleAttribute("hidden", true);
      renderFbd();
      renderFbdInspector();
    } else if (event.target === canvasViewport || event.target === canvasWorld || event.target === nodesLayer) {
      selected = null;
      pendingPort = null;
      connectHint.hidden = true;
      draftCable.toggleAttribute("hidden", true);
      renderSelection();
    }
  });
  canvasViewport.addEventListener("wheel", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
  }, { passive: false });
  window.addEventListener("keydown", (event) => {
    if (mode === "scada") return;
    if (event.key === "Escape") {
      pendingPort = null;
      pendingFbdOutput = null;
      connectHint.hidden = true;
      draftCable.toggleAttribute("hidden", true);
      fbdDraftEdge.toggleAttribute("hidden", true);
      renderPortHints();
      renderFbdPortHints();
    }
    if ((event.key === "Backspace" || event.key === "Delete") && !(event.target instanceof HTMLInputElement)) deleteSelection();
  });

  const simulationToggle = el<HTMLButtonElement>("simulation-toggle");
  simulationToggle.addEventListener("click", () => {
    simulationRunning = !simulationRunning;
    simulationToggle.innerHTML = simulationRunning ? "<span>Ⅱ</span> Pause" : "<span>▷</span> Resume";
    el("simulation-badge").textContent = simulationRunning ? "RUNNING" : "PAUSED";
    toast(simulationRunning ? "Simulation resumed" : "Simulation paused");
  });
  el<HTMLInputElement>("demand").addEventListener("input", (event) => { el("demand-output").textContent = `${(event.target as HTMLInputElement).value}%`; });
  el<HTMLInputElement>("reservoir-level").addEventListener("input", (event) => {
    tankLevel = Number((event.target as HTMLInputElement).value);
    el("level-output").textContent = `${Math.round(tankLevel)}%`;
    updateVisualState();
  });
  el("inject-pressure").addEventListener("click", () => { pressure = 0.82; audit("Low pressure injected", "Plant pressure forced to 0.82 bar for simulation"); updateVisualState(); });
  el<HTMLInputElement>("emergency-stop").addEventListener("change", (event) => { const checked = (event.target as HTMLInputElement).checked; audit(checked ? "Emergency stop pressed" : "Emergency stop released", "Safety circuit changed by simulator", checked ? "alarm" : "info"); updateVisualState(); });
  el<HTMLInputElement>("auto-mode").addEventListener("change", (event) => audit("Controller mode changed", (event.target as HTMLInputElement).checked ? "Automatic mode enabled" : "Automatic mode disabled"));
  el<HTMLSelectElement>("pressure-quality").addEventListener("change", (event) => audit("Sensor quality changed", `PT-101 quality is ${(event.target as HTMLSelectElement).value}`, (event.target as HTMLSelectElement).value === "bad" ? "alarm" : "info"));

  el("scada-auto").addEventListener("click", () => {
    const input = el<HTMLInputElement>("auto-mode");
    const next = !input.checked;
    if (!confirm(`Apply operator command: automatic mode = ${next}?`)) { audit("Command rejected", "Operator cancelled automatic-mode change"); return; }
    input.checked = next;
    audit("Command authorized", `Automatic mode set to ${next}`);
    updateVisualState();
  });
  el("scada-stop").addEventListener("click", () => {
    const input = el<HTMLInputElement>("emergency-stop");
    input.checked = !input.checked;
    audit(input.checked ? "Emergency stop commanded" : "Emergency stop reset", "Safety command applied by operator", input.checked ? "alarm" : "info");
    updateVisualState();
  });
  el("ack-alarms").addEventListener("click", () => { events.forEach((event) => { event.acknowledged = true; }); renderEvents(); toast("Events acknowledged"); });
  el("project-to-hmi").addEventListener("click", () => {
    if (activeProfile.projectScada === undefined) {
      toast(`${activeProfile.displayName} does not support SCADA projection`, "alarm");
      return;
    }
    const report = activeProfile.projectScada(fbdProgram, [
      { id: "pressure", kind: "value", label: "Header ", position: { x: 8, y: 40 }, binding: { source: "wp", ref: "wp_pressure", format: "fixed2", unit: "bar" } },
      { id: "pump1", kind: "status", label: "P-101 ", position: { x: 8, y: 70 }, binding: { source: "wp", ref: "wp_pump1", format: "bool" } },
      { id: "pump2", kind: "status", label: "P-102 ", position: { x: 168, y: 70 }, binding: { source: "wp", ref: "wp_pump2", format: "bool" } },
      { id: "auto", kind: "status", label: "AUTO ", position: { x: 8, y: 100 }, binding: { source: "wp", ref: "wp_auto", format: "bool" } },
      { id: "level", kind: "status", label: "LOW LEVEL ", position: { x: 168, y: 100 }, binding: { source: "wp", ref: "wp_level", format: "bool" } },
      { id: "alarm", kind: "status", label: "ALARM ", position: { x: 8, y: 130 }, binding: { source: "wp", ref: "wp_alarm", format: "bool" } },
      { id: "trend", kind: "trend", label: "Header ", position: { x: 8, y: 162 }, binding: { source: "wp", ref: "wp_pressure", format: "fixed2", unit: "bar" } },
      { id: "events", kind: "alarm-list", label: "Event history", position: { x: 8, y: 194 } },
      { id: "commands", kind: "command", label: "Operator commands", position: { x: 8, y: 218 } },
    ], "BOOSTER STATION");
    buildFbd(false);
    el("hmi-compatibility-summary").textContent = `${report.transferred} compatible · ${report.simplified} simplified · ${report.softwareOnly} software-only`;
    audit("SCADA projected to the controller HMI", `${report.transferred} widgets transferred, ${report.simplified} simplified, ${report.softwareOnly} kept in software`);
    toast("Controller HMI rebuilt into the release artifact");
  });
  el("run-scenarios").addEventListener("click", () => void runScenarios());
  el("close-scenarios").addEventListener("click", () => el<HTMLDialogElement>("scenario-dialog").close());
  el("close-passport").addEventListener("click", () => el<HTMLDialogElement>("passport-dialog").close());
  el<HTMLInputElement>("catalog-search").addEventListener("input", (event) => {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    document.querySelectorAll<HTMLElement>(".catalog-item").forEach((item) => { item.hidden = !item.textContent?.toLowerCase().includes(query); });
  });
  el<HTMLInputElement>("equipment-search").addEventListener("input", renderEquipmentCatalog);
}

async function loadPackage(): Promise<void> {
  const badge = el("runtime-badge");
  try {
    const [pkg, runtime] = await Promise.all([resolvePackage(PACKAGE_URL), activeProfile.createRuntime(fbdProgram)]);
    const loaded = runtime.load(compiledFbd.artifact);
    if (!loaded.ok) throw new Error(loaded.message ?? "runtime rejected the compiled artifact");
    fbdRuntime = runtime;
    el("package-title").textContent = PROJECT_TITLE;
    el("package-badge").textContent = `${pkg.manifest.name}@${pkg.manifest.version} + ${activeProfile.profileId}`;
    el("wasm-size").textContent = `${compiledFbd.artifact.length.toLocaleString("en-US")} bytes`;
    badge.classList.add("is-ready");
    badge.textContent = `${activeProfile.displayName} runtime · ${activeProfile.ioCount(fbdProgram)} ports · ${compiledFbd.targetLabel}`;
    const dot = document.createElement("i");
    badge.prepend(dot);
    audit(`${activeProfile.displayName} runtime instantiated`, `${compiledFbd.elementCount} elements · ${compiledFbd.artifact.length} byte artifact${loaded.memorySize !== undefined ? ` · ${loaded.memorySize} bytes runtime memory` : ""}`);
  } catch (error) {
    badge.classList.add("is-error");
    badge.textContent = error instanceof Error ? error.message : String(error);
    const dot = document.createElement("i");
    badge.prepend(dot);
    audit("Runtime failed to load", badge.textContent, "alarm");
  }
}

async function loadEquipmentRegistry(): Promise<void> {
  const status = el("registry-status");
  try {
    const resolved = await resolveEquipmentCatalog(CATALOG_URL);
    equipmentDefinitions = resolved.definitions;
    for (const device of devices) {
      const definition = equipmentDefinitions.find((candidate) => candidate.catalog.alias === device.catalogAlias);
      if (!definition) continue;
      device.definitionId = definition.pkg.manifest.id;
      device.definitionVersion = definition.pkg.manifest.version;
      if (device.kind === "registry") device.svgText = definition.svgText;
    }
    if (!hadStoredScene) addShowcaseInstances();
    saveScene();
    renderNodes();
    renderCables();
    status.textContent = `${equipmentDefinitions.length} packages`;
    status.classList.add("good");
    el("catalog-source").textContent = `${resolved.document.title} · resolved manifests + device models`;
    renderEquipmentCatalog();
    renderInspector();
    audit("Equipment registry resolved", `${equipmentDefinitions.length} package definitions are available to the topology editor`);
  } catch (error) {
    status.textContent = "Unavailable";
    status.classList.add("bad");
    el("equipment-catalog").innerHTML = `<div class="empty-catalog">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
    audit("Equipment registry failed to resolve", error instanceof Error ? error.message : String(error), "alarm");
  }
}

function main(): void {
  body.dataset["mode"] = mode;
  initializeBoosterStationDiagram(el<SVGSVGElement>("process-diagram"));
  restoreScene();
  restoreFbdProgram();
  bindControls();
  renderFbd();
  renderNodes();
  renderCables();
  renderInspector();
  renderEvents();
  setZoom(zoom);
  window.setTimeout(fitView, 50);
  window.setInterval(stepSimulation, STEP_MS);
  window.setInterval(() => { el("scada-clock").textContent = new Date().toLocaleString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }, 1000);
  void loadPackage();
  void loadEquipmentRegistry();
}

main();
