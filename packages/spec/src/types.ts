/**
 * TypeScript types for the Open Device package format, draft v0.1.
 *
 * These types mirror the JSON Schemas in `packages/spec/schemas/`. The schemas
 * validate the structural shape shared by source and release manifests; the
 * stricter release profile (exact dependency versions, mandatory integrity)
 * is enforced by `validateManifest` in release mode.
 */

export type PackageKind =
  | "physical-device"
  | "logical-device"
  | "runtime"
  | "plant-model";

export interface ArtifactRef {
  href: string;
  mediaType: string;
  integrity?: string;
  size?: number;
}

export interface Vendor {
  name: string;
  url: string;
}

export interface ViewRef {
  id: string;
  role: string;
  entrypoint: ArtifactRef;
  protocol?: string;
}

/**
 * Index-to-port-ID mapping for the scalar core Wasm ABI. Array position is
 * the numeric index passed across the Wasm boundary; the value is the port
 * or parameter ID declared in the device model.
 */
export interface LogicBindings {
  inputs: string[];
  outputs: string[];
  params?: string[];
}

export interface StandaloneLogic {
  id: string;
  mode: "standalone";
  abi: string;
  profile?: string;
  module: ArtifactRef;
  bindings?: LogicBindings;
}

export interface ProgramLogic {
  id: string;
  mode: "program";
  abi: string;
  profile?: string;
  program: ArtifactRef;
  /** `<dependency-name>#<artifact-id>` reference to a shared runtime. */
  runtime: string;
  bindings?: LogicBindings;
}

export type Logic = StandaloneLogic | ProgramLogic;

export interface ScenarioRef {
  id: string;
  target: string;
  source: ArtifactRef;
}

export interface Dependency {
  id: string;
  /** Exact semantic version in a release; a semver range is allowed in source packages. */
  version: string;
  /** Manifest digest. Mandatory in a release, optional during authoring. */
  integrity?: string;
}

export interface Provenance {
  runtimeFidelity?: "exact" | "compatible" | "unknown";
  sourceRecoverability?: "full" | "partial" | "none" | "unknown";
  semanticConfidence?: "declared" | "inferred" | "vendor-verified" | "unknown";
}

export interface PackageManifest {
  $schema?: string;
  manifestVersion: "0.1";
  id: string;
  version: string;
  kind: PackageKind;
  name: string;
  title: string;
  description: string;
  vendor: Vendor;
  license: string;
  homepage?: string;
  model: ArtifactRef;
  views?: ViewRef[];
  logic?: Logic[];
  scenarios?: ScenarioRef[];
  dependencies?: Record<string, Dependency>;
  extensions?: Record<string, unknown>;
  provenance?: Provenance;
}

// ── Device model ────────────────────────────────────────────────────────────

export type PortDirection = "input" | "output" | "bidirectional";

export interface SignalDescriptor {
  dataType: "number" | "boolean" | "integer" | "string" | "enum";
  unit?: string;
  minimum?: number;
  maximum?: number;
  values?: string[];
}

export interface PhysicalDescriptor {
  medium?: string;
  kind?: string;
  range?: string;
}

/**
 * Physical connection point owned by a port. Placement is typed (strip +
 * index) so geometry stays derivable and reusable across renderers.
 */
export interface TerminalDescriptor {
  label: string;
  strip: string;
  index: number;
}

export interface PortDescriptor {
  id: string;
  title: string;
  direction: PortDirection;
  domain: "signal" | "power" | "network" | "process";
  signal?: SignalDescriptor;
  physical?: PhysicalDescriptor;
  terminals?: TerminalDescriptor[];
}

export interface ParameterDescriptor {
  id: string;
  title: string;
  dataType: "number" | "boolean" | "integer";
  unit?: string;
  minimum?: number;
  maximum?: number;
  default?: number | boolean;
  retained?: boolean;
}

/**
 * Data anchor inside a faceplate: `port:<portId>` binds to a model port
 * value; `state:<name>` binds to a host-provided device state such as
 * power, link, or status.
 */
export type BindReference = string;

export interface FaceplateEnclosure {
  width: number;
  height: number;
  depth?: number;
  cornerRadius?: number;
}

export interface FaceplateMounting {
  id: string;
  type: "din-rail-35" | "panel-cutout" | "surface-screw";
  fasteners?: number;
}

export interface FaceplateStrip {
  id: string;
  edge: "top" | "bottom" | "left" | "right";
  pitch: number;
}

export interface FaceplateDisplayLine {
  id: string;
  role: "title" | "value" | "status";
  text?: string;
  binds?: BindReference;
  showUnit?: boolean;
}

export interface FaceplateDisplay {
  id: string;
  technology?: "lcd" | "oled";
  lines: FaceplateDisplayLine[];
}

export interface FaceplateIndicator {
  id: string;
  label: string;
  kind: "led" | "rotor";
  color?: "green" | "blue" | "amber" | "red" | "white";
  binds?: BindReference;
}

export interface FaceplateControl {
  id: string;
  label: string;
  kind: "button";
  action: "identify" | "custom";
}

/**
 * Declarative physical packaging. A conforming compiler turns this block
 * into the front-panel SVG with terminal and mounting anchors; it never
 * requires vendor-drawn artwork.
 */
export interface Faceplate {
  units: "mm";
  enclosure: FaceplateEnclosure;
  branding?: { product?: string; modelCode?: string };
  mounting?: FaceplateMounting[];
  strips?: FaceplateStrip[];
  display?: FaceplateDisplay;
  indicators?: FaceplateIndicator[];
  controls?: FaceplateControl[];
}

export interface DeviceModel {
  modelVersion: "0.1";
  capabilities?: string[];
  ports: PortDescriptor[];
  parameters?: ParameterDescriptor[];
  faceplate?: Faceplate;
}

// ── Value frames ────────────────────────────────────────────────────────────

export type Quality = "good" | "stale" | "bad" | "unknown";

export interface Sample {
  value: number | boolean;
  quality: Quality;
  sourceTime?: string;
  unit?: string;
}

export interface ValueFrame {
  sequence: number;
  sourceTime?: string;
  values: Record<string, Sample>;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

export interface WriteStep {
  write: Record<string, { value: number | boolean; quality?: Quality }>;
}

export interface TickStep {
  tick: { durationMs: number; periodMs: number };
}

export type Comparator =
  | { equals: number | boolean }
  | { approx: { value: number; tolerance: number } }
  | { min?: number; max?: number }
  | { quality: Quality };

export interface ExpectStep {
  expect: Record<string, Comparator>;
}

export interface ResetStep {
  reset: "cold" | "warm";
}

export type ScenarioStep = WriteStep | TickStep | ExpectStep | ResetStep;

export interface Scenario {
  scenarioVersion: "0.1";
  id: string;
  title: string;
  target: string;
  reset?: "cold" | "warm";
  steps: ScenarioStep[];
}

// ── Evidence ────────────────────────────────────────────────────────────────

export interface EvidenceSubject {
  packageId: string;
  packageVersion: string;
  manifestIntegrity: string;
  logicIntegrity: string;
  runtimeIntegrity?: string;
}

export interface ScenarioResult {
  id: string;
  result: "passed" | "failed";
  failures?: string[];
}

export interface EvidenceDocument {
  evidenceVersion: "0.1";
  result: "passed" | "failed";
  subject: EvidenceSubject;
  suite: {
    integrity: string;
    scenarioCount: number;
  };
  runner: {
    name: string;
    version: string;
    engine: string;
  };
  summary: {
    passed: number;
    failed: number;
    durationMs: number;
  };
  scenarios: ScenarioResult[];
  createdAt: string;
}

// ── Diagnostics ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  path: string;
  message: string;
}

export type ValidationMode = "source" | "release";
