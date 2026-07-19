import { resolvePackage, type ResolvedPackage } from "@open-device/core";
import type { DeviceModel, PortDescriptor } from "@open-device/spec";

/** Renderers with hand-built playground DOM. Anything else falls back to the package view. */
export type BuiltinRenderer = "saturn-plc" | "pressure-transmitter" | "centrifugal-pump" | "suction-tank" | "process-header" | "emergency-stop";

export const BUILTIN_RENDERERS = new Set<BuiltinRenderer>(["saturn-plc", "pressure-transmitter", "centrifugal-pump", "suction-tank", "process-header", "emergency-stop"]);

export const TOPOLOGY_EXTENSION = "https://open-device.dev/extensions/topology-node";

export type TopologySignal = "analog" | "digital" | "safety" | "process" | "power" | "network";
export type TopologySide = "top" | "right" | "bottom" | "left";

export interface TopologyPortGeometry {
  x: number;
  y: number;
  side: TopologySide;
  signal?: TopologySignal;
}

export interface TopologyNodeExtension {
  view?: string;
  width: number;
  height: number;
  ports: Record<string, TopologyPortGeometry>;
}

export interface EquipmentCatalogEntry {
  alias: string;
  manifest: string;
  category: string;
  renderer: string;
  tags: string[];
}

interface EquipmentCatalogDocument {
  catalogVersion: "0.1";
  id: string;
  title: string;
  entries: EquipmentCatalogEntry[];
}

export interface ResolvedEquipmentDefinition {
  catalog: EquipmentCatalogEntry;
  pkg: ResolvedPackage;
  model: DeviceModel;
  /** Inline SVG text of the package front-panel view, when the package ships one. */
  svgText: string | null;
  topology: TopologyNodeExtension | null;
}

function isEntry(value: unknown): value is EquipmentCatalogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<EquipmentCatalogEntry>;
  return typeof entry.alias === "string"
    && typeof entry.manifest === "string"
    && typeof entry.category === "string"
    && typeof entry.renderer === "string"
    && entry.renderer.length > 0
    && Array.isArray(entry.tags)
    && entry.tags.every((tag) => typeof tag === "string");
}

export function parseEquipmentCatalog(value: unknown): EquipmentCatalogDocument {
  if (typeof value !== "object" || value === null) throw new Error("Equipment catalog must be an object");
  const document = value as Partial<EquipmentCatalogDocument>;
  if (document.catalogVersion !== "0.1" || typeof document.id !== "string" || typeof document.title !== "string" || !Array.isArray(document.entries) || !document.entries.every(isEntry)) {
    throw new Error("Invalid equipment catalog document");
  }
  return document as EquipmentCatalogDocument;
}

const SIDES = new Set<TopologySide>(["top", "right", "bottom", "left"]);
const SIGNALS = new Set<TopologySignal>(["analog", "digital", "safety", "process", "power", "network"]);

export function parseTopologyExtension(manifestExtensions: Record<string, unknown> | undefined): TopologyNodeExtension | null {
  const raw = manifestExtensions?.[TOPOLOGY_EXTENSION];
  if (typeof raw !== "object" || raw === null) return null;
  const extension = raw as Partial<TopologyNodeExtension>;
  if (typeof extension.width !== "number" || typeof extension.height !== "number" || typeof extension.ports !== "object" || extension.ports === null) return null;
  const ports: Record<string, TopologyPortGeometry> = {};
  for (const [portId, geometry] of Object.entries(extension.ports)) {
    if (typeof geometry !== "object" || geometry === null) return null;
    const { x, y, side, signal } = geometry as Partial<TopologyPortGeometry>;
    if (typeof x !== "number" || typeof y !== "number" || !side || !SIDES.has(side)) return null;
    if (signal !== undefined && !SIGNALS.has(signal)) return null;
    ports[portId] = signal === undefined ? { x, y, side } : { x, y, side, signal };
  }
  const node = { width: extension.width, height: extension.height, ports };
  return typeof extension.view === "string" ? { ...node, view: extension.view } : node;
}

/** Derive a topology wire signal from the declared model port when the extension does not name one. */
export function signalForModelPort(port: PortDescriptor): TopologySignal {
  if (port.domain === "process") return "process";
  if (port.domain === "power") return "power";
  if (port.domain === "network") return "network";
  const dataType = port.signal?.dataType;
  return dataType === "number" || dataType === "integer" ? "analog" : "digital";
}

async function loadFrontPanelSvg(pkg: ResolvedPackage, topology: TopologyNodeExtension | null): Promise<string | null> {
  const view = pkg.manifest.views?.find((candidate) => candidate.id === (topology?.view ?? "front-panel"))
    ?? pkg.manifest.views?.find((candidate) => candidate.entrypoint.mediaType.startsWith("image/svg"));
  if (!view || !view.entrypoint.mediaType.startsWith("image/svg")) return null;
  const bytes = await pkg.loadArtifact(view.entrypoint);
  return new TextDecoder().decode(bytes);
}

export async function resolveEquipmentCatalog(catalogUrl: string): Promise<{ document: EquipmentCatalogDocument; definitions: ResolvedEquipmentDefinition[] }> {
  const response = await fetch(catalogUrl);
  if (!response.ok) throw new Error(`${catalogUrl} responded with ${response.status}`);
  const document = parseEquipmentCatalog(await response.json());
  const definitions = await Promise.all(document.entries.map(async (entry) => {
    const manifestUrl = new URL(entry.manifest, catalogUrl).href;
    const pkg = await resolvePackage(manifestUrl);
    const model = await pkg.loadModel();
    const topology = parseTopologyExtension(pkg.manifest.extensions);
    const svgText = await loadFrontPanelSvg(pkg, topology).catch(() => null);
    return { catalog: entry, pkg, model, svgText, topology };
  }));
  return { document, definitions };
}
