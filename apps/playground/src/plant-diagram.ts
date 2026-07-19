export type PlantQuality = "good" | "stale" | "bad" | "unknown";

export interface BoosterStationState {
  level: number;
  pressure: number;
  flow: number;
  pump1Running: boolean;
  pump2Running: boolean;
  pump1Fault: boolean;
  pump2Fault: boolean;
  outletOpen: boolean;
  quality: PlantQuality;
}

type Point = { x: number; y: number };
type PortDirection = "left" | "right" | "top" | "bottom";
type Port = Point & { direction: PortDirection };
type ShapeName = "tank" | "handValve" | "pump" | "header" | "ctrlValve" | "gauge" | "instrument" | "outlet";

interface PlantNode {
  id: string;
  shape: ShapeName;
  x: number;
  y: number;
  label: string;
}

interface PlantEdge {
  id: string;
  from: { node: string; port: string };
  to: { node: string; port: string };
  flow: "pump1" | "pump2" | "station" | "leader";
}

interface ShapeDefinition {
  width: number;
  height: number;
  ports: Record<string, Port>;
}

const SHAPES: Record<ShapeName, ShapeDefinition> = {
  tank: { width: 130, height: 275, ports: { out: { x: 130, y: 210, direction: "right" }, sense: { x: 65, y: 0, direction: "top" } } },
  handValve: { width: 56, height: 86, ports: { in: { x: 0, y: 40, direction: "left" }, out: { x: 56, y: 40, direction: "right" } } },
  pump: { width: 104, height: 146, ports: { in: { x: 0, y: 52, direction: "left" }, out: { x: 104, y: 52, direction: "right" }, sense: { x: 52, y: 0, direction: "top" } } },
  header: { width: 122, height: 230, ports: { in1: { x: 0, y: 62, direction: "left" }, in2: { x: 0, y: 168, direction: "left" }, out: { x: 122, y: 115, direction: "right" }, sense: { x: 61, y: 0, direction: "top" } } },
  ctrlValve: { width: 60, height: 126, ports: { in: { x: 0, y: 62, direction: "left" }, out: { x: 60, y: 62, direction: "right" } } },
  gauge: { width: 80, height: 106, ports: { probe: { x: 40, y: 80, direction: "bottom" } } },
  instrument: { width: 54, height: 54, ports: { probe: { x: 27, y: 54, direction: "bottom" } } },
  outlet: { width: 142, height: 72, ports: { in: { x: 0, y: 36, direction: "left" } } },
};

const NODES: PlantNode[] = [
  { id: "wetwell", shape: "tank", x: 28, y: 128, label: "TK-101 · suction tank" },
  { id: "lit", shape: "instrument", x: 150, y: 38, label: "LIT-101" },
  { id: "hv1", shape: "handValve", x: 236, y: 92, label: "HV-101" },
  { id: "pump1", shape: "pump", x: 350, y: 80, label: "P-101 · lead" },
  { id: "cv1", shape: "handValve", x: 506, y: 92, label: "CV-101" },
  { id: "hv2", shape: "handValve", x: 236, y: 300, label: "HV-102" },
  { id: "pump2", shape: "pump", x: 350, y: 288, label: "P-102 · lag/standby" },
  { id: "cv2", shape: "handValve", x: 506, y: 300, label: "CV-102" },
  { id: "header", shape: "header", x: 654, y: 112, label: "Discharge header" },
  { id: "pi", shape: "gauge", x: 676, y: 8, label: "PI-101 · bar" },
  { id: "fi", shape: "instrument", x: 842, y: 98, label: "FIT-101" },
  { id: "gate", shape: "ctrlValve", x: 846, y: 198, label: "XV-101" },
  { id: "outlet", shape: "outlet", x: 958, y: 225, label: "Distribution network" },
];

const EDGES: PlantEdge[] = [
  { id: "tank-hv1", from: { node: "wetwell", port: "out" }, to: { node: "hv1", port: "in" }, flow: "pump1" },
  { id: "hv1-pump1", from: { node: "hv1", port: "out" }, to: { node: "pump1", port: "in" }, flow: "pump1" },
  { id: "pump1-cv1", from: { node: "pump1", port: "out" }, to: { node: "cv1", port: "in" }, flow: "pump1" },
  { id: "cv1-header", from: { node: "cv1", port: "out" }, to: { node: "header", port: "in1" }, flow: "pump1" },
  { id: "tank-hv2", from: { node: "wetwell", port: "out" }, to: { node: "hv2", port: "in" }, flow: "pump2" },
  { id: "hv2-pump2", from: { node: "hv2", port: "out" }, to: { node: "pump2", port: "in" }, flow: "pump2" },
  { id: "pump2-cv2", from: { node: "pump2", port: "out" }, to: { node: "cv2", port: "in" }, flow: "pump2" },
  { id: "cv2-header", from: { node: "cv2", port: "out" }, to: { node: "header", port: "in2" }, flow: "pump2" },
  { id: "header-gate", from: { node: "header", port: "out" }, to: { node: "gate", port: "in" }, flow: "station" },
  { id: "gate-outlet", from: { node: "gate", port: "out" }, to: { node: "outlet", port: "in" }, flow: "station" },
  { id: "pi-header", from: { node: "pi", port: "probe" }, to: { node: "header", port: "sense" }, flow: "leader" },
  { id: "fi-gate", from: { node: "fi", port: "probe" }, to: { node: "gate", port: "in" }, flow: "leader" },
  { id: "lit-tank", from: { node: "lit", port: "probe" }, to: { node: "wetwell", port: "sense" }, flow: "leader" },
];

function nodeById(id: string): PlantNode {
  const node = NODES.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Unknown plant node ${id}`);
  return node;
}

function portPoint(reference: { node: string; port: string }): Port {
  const node = nodeById(reference.node);
  const local = SHAPES[node.shape].ports[reference.port];
  if (!local) throw new Error(`Unknown plant port ${reference.node}.${reference.port}`);
  return { x: node.x + local.x, y: node.y + local.y, direction: local.direction };
}

function stubOut(point: Point, direction: PortDirection, distance: number): Point {
  if (direction === "left") return { x: point.x - distance, y: point.y };
  if (direction === "right") return { x: point.x + distance, y: point.y };
  if (direction === "top") return { x: point.x, y: point.y - distance };
  return { x: point.x, y: point.y + distance };
}

function bends(first: Point, firstDirection: PortDirection, second: Point, secondDirection: PortDirection): Point[] {
  const firstHorizontal = firstDirection === "left" || firstDirection === "right";
  const secondHorizontal = secondDirection === "left" || secondDirection === "right";
  if (firstHorizontal && secondHorizontal) {
    const middleX = (first.x + second.x) / 2;
    return [{ x: middleX, y: first.y }, { x: middleX, y: second.y }];
  }
  if (!firstHorizontal && !secondHorizontal) {
    const middleY = (first.y + second.y) / 2;
    return [{ x: first.x, y: middleY }, { x: second.x, y: middleY }];
  }
  return firstHorizontal ? [{ x: second.x, y: first.y }] : [{ x: first.x, y: second.y }];
}

function simplify(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) < 0.5) continue;
    result.push(point);
    while (result.length >= 3) {
      const first = result[result.length - 3];
      const middle = result[result.length - 2];
      const last = result[result.length - 1];
      if (!first || !middle || !last) break;
      const collinear = (Math.abs(first.x - middle.x) < 0.5 && Math.abs(middle.x - last.x) < 0.5)
        || (Math.abs(first.y - middle.y) < 0.5 && Math.abs(middle.y - last.y) < 0.5);
      if (!collinear) break;
      result.splice(result.length - 2, 1);
    }
  }
  return result;
}

function routeOrthogonal(source: Port, target: Port): Point[] {
  const sourceStub = stubOut(source, source.direction, 24);
  const targetStub = stubOut(target, target.direction, 24);
  return simplify([source, sourceStub, ...bends(sourceStub, source.direction, targetStub, target.direction), targetStub, target]);
}

function pointsToPath(points: Point[], radius = 9): string {
  const first = points[0];
  if (!first) return "";
  let path = `M ${first.x} ${first.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    if (!previous || !corner || !next) continue;
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const appliedRadius = Math.min(radius, incoming / 2, outgoing / 2);
    if (appliedRadius < 1) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const incomingX = corner.x - ((corner.x - previous.x) / incoming) * appliedRadius;
    const incomingY = corner.y - ((corner.y - previous.y) / incoming) * appliedRadius;
    const outgoingX = corner.x + ((next.x - corner.x) / outgoing) * appliedRadius;
    const outgoingY = corner.y + ((next.y - corner.y) / outgoing) * appliedRadius;
    path += ` L ${incomingX} ${incomingY} Q ${corner.x} ${corner.y} ${outgoingX} ${outgoingY}`;
  }
  const last = points.at(-1);
  return last ? `${path} L ${last.x} ${last.y}` : path;
}

function edgeMarkup(edge: PlantEdge): string {
  const source = portPoint(edge.from);
  const target = portPoint(edge.to);
  if (edge.flow === "leader") return `<path class="pid-leader" d="M ${source.x} ${source.y} L ${target.x} ${target.y}"/>`;
  const path = pointsToPath(routeOrthogonal(source, target));
  return `<g class="pid-edge" data-flow="${edge.flow}" data-state="off"><path class="pid-tube" d="${path}"/><path class="pid-flow" d="${path}"/></g>`;
}

function tankMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-tank" data-equipment="tank" transform="translate(${node.x} ${node.y})"><rect x="0" y="3" width="130" height="228" rx="16" class="pid-metal"/><ellipse cx="65" cy="6" rx="64" ry="12" class="pid-metal-cap"/><rect x="20" y="229" width="12" height="22" class="pid-foot"/><rect x="98" y="229" width="12" height="22" class="pid-foot"/><rect x="30" y="33" width="56" height="166" rx="6" class="pid-well"/><rect data-level-fill x="33" y="36" width="50" height="160" rx="4" class="pid-level-fill"/><text data-level-value x="58" y="25" class="pid-value" text-anchor="middle">72%</text><text x="65" y="272" class="pid-label" text-anchor="middle">${node.label}</text></g>`;
}

function pumpMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-pump" data-equipment="${node.id}" data-state="off" transform="translate(${node.x} ${node.y})"><circle cx="52" cy="52" r="52" class="pid-metal-cap"/><circle cx="52" cy="52" r="38" class="pid-pump-face"/><g class="pid-impeller"><path d="M52 18 L61 44 L52 52 L43 44 Z"/><path d="M86 52 L60 61 L52 52 L60 43 Z"/><path d="M52 86 L43 60 L52 52 L61 60 Z"/><path d="M18 52 L44 43 L52 52 L44 61 Z"/></g><circle cx="52" cy="52" r="6" class="pid-hub"/><text x="52" y="126" class="pid-label" text-anchor="middle">${node.label}</text><text data-run-label x="52" y="143" class="pid-sub" text-anchor="middle">stopped</text></g>`;
}

function handValveMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-hand-valve" transform="translate(${node.x} ${node.y})"><path d="M0 24 L28 40 L0 56 Z"/><path d="M56 24 L28 40 L56 56 Z"/><path class="pid-valve-stem" d="M28 38 V4 M12 4 H44"/><text x="28" y="82" class="pid-label" text-anchor="middle">${node.label}</text></g>`;
}

function headerMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-header" transform="translate(${node.x} ${node.y})"><rect x="7" y="2" width="108" height="205" rx="54" class="pid-metal"/><ellipse cx="61" cy="10" rx="48" ry="9" class="pid-metal-cap"/><path d="M0 62H25M0 168H25M97 115H122" class="pid-nozzle"/><rect x="30" y="207" width="12" height="18" class="pid-foot"/><rect x="80" y="207" width="12" height="18" class="pid-foot"/><text x="61" y="102" class="pid-sub" text-anchor="middle">PRESSURE</text><text data-header-pressure x="61" y="124" class="pid-value" text-anchor="middle">— bar</text><text x="61" y="228" class="pid-label" text-anchor="middle">${node.label}</text></g>`;
}

function ctrlValveMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-ctrl-valve" data-equipment="gate" data-state="on" transform="translate(${node.x} ${node.y})"><path class="pid-valve-body" d="M0 44 L30 62 L0 80 Z"/><path class="pid-valve-body" d="M60 44 L30 62 L60 80 Z"/><path class="pid-valve-stem" d="M30 60V20"/><rect class="pid-valve-body" x="12" y="0" width="36" height="18" rx="6"/><text x="30" y="106" class="pid-label" text-anchor="middle">${node.label}</text><text data-run-label x="30" y="123" class="pid-sub" text-anchor="middle">open</text></g>`;
}

function gaugeMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-gauge" transform="translate(${node.x} ${node.y})"><circle cx="40" cy="42" r="38" class="pid-well"/><path d="M11 57A30 30 0 1 1 69 50" class="pid-gauge-scale"/><line data-gauge-needle x1="40" y1="42" x2="25" y2="64" class="pid-gauge-needle"/><circle cx="40" cy="42" r="4" class="pid-hub"/><text data-gauge-value x="40" y="68" class="pid-value" text-anchor="middle">—</text><text x="40" y="102" class="pid-label" text-anchor="middle">${node.label}</text></g>`;
}

function instrumentMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-instrument" data-equipment="${node.id}" transform="translate(${node.x} ${node.y})"><circle cx="27" cy="27" r="27"/><text x="27" y="17" class="pid-sub" text-anchor="middle">${node.label}</text><text data-instrument-value x="27" y="38" class="pid-value" text-anchor="middle">—</text></g>`;
}

function outletMarkup(node: PlantNode): string {
  return `<g class="pid-node pid-outlet" transform="translate(${node.x} ${node.y})"><path d="M0 36H106"/><path d="m94 24 14 12-14 12"/><text x="72" y="68" class="pid-label" text-anchor="middle">${node.label}</text></g>`;
}

function nodeMarkup(node: PlantNode): string {
  if (node.shape === "tank") return tankMarkup(node);
  if (node.shape === "pump") return pumpMarkup(node);
  if (node.shape === "handValve") return handValveMarkup(node);
  if (node.shape === "header") return headerMarkup(node);
  if (node.shape === "ctrlValve") return ctrlValveMarkup(node);
  if (node.shape === "gauge") return gaugeMarkup(node);
  if (node.shape === "instrument") return instrumentMarkup(node);
  return outletMarkup(node);
}

export function initializeBoosterStationDiagram(svg: SVGSVGElement): void {
  svg.innerHTML = `<title>Two-pump booster station P&amp;ID</title><desc>Suction tank, isolation valves, two parallel pumps, discharge header, pressure and flow instruments, and an outlet control valve. Pipes are routed from declared equipment ports.</desc><defs><linearGradient id="pid-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--pid-metal-1)"/><stop offset=".45" stop-color="var(--pid-metal-2)"/><stop offset="1" stop-color="var(--pid-metal-1)"/></linearGradient><radialGradient id="pid-cap" cx=".35" cy=".35" r=".9"><stop offset="0" stop-color="var(--pid-metal-cap)"/><stop offset="1" stop-color="var(--pid-metal-1)"/></radialGradient></defs><g class="pid-pipes">${EDGES.map(edgeMarkup).join("")}</g><g class="pid-equipment">${NODES.map(nodeMarkup).join("")}</g><g class="pid-quality-overlay" data-quality="good"><path d="M820 420h250"/><text x="1070" y="416" text-anchor="end">SOURCE QUALITY: GOOD</text></g>`;
}

function setText(root: ParentNode, selector: string, value: string): void {
  const node = root.querySelector(selector);
  if (node) node.textContent = value;
}

export function updateBoosterStationDiagram(svg: SVGSVGElement, state: BoosterStationState): void {
  const level = Math.min(100, Math.max(0, state.level));
  const levelHeight = 160 * level / 100;
  const levelFill = svg.querySelector<SVGRectElement>("[data-level-fill]");
  levelFill?.setAttribute("y", String(36 + 160 - levelHeight));
  levelFill?.setAttribute("height", String(levelHeight));
  setText(svg, "[data-level-value]", `${Math.round(level)}%`);
  setText(svg, "[data-header-pressure]", `${state.pressure.toFixed(2)} bar`);
  setText(svg, '[data-equipment="fi"] [data-instrument-value]', `${Math.round(state.flow)}`);
  setText(svg, '[data-equipment="lit"] [data-instrument-value]', `${Math.round(level)}%`);
  setText(svg, "[data-gauge-value]", state.pressure.toFixed(1));

  const pressureRatio = Math.min(1, Math.max(0, state.pressure / 5));
  const angle = (-195 + pressureRatio * 210) * Math.PI / 180;
  const needle = svg.querySelector<SVGLineElement>("[data-gauge-needle]");
  needle?.setAttribute("x2", String(40 + Math.cos(angle) * 26));
  needle?.setAttribute("y2", String(42 + Math.sin(angle) * 26));

  for (const [id, running, fault] of [["pump1", state.pump1Running, state.pump1Fault], ["pump2", state.pump2Running, state.pump2Fault]] as const) {
    const pump = svg.querySelector<SVGGElement>(`[data-equipment="${id}"]`);
    pump?.setAttribute("data-state", fault ? "fault" : running ? "on" : "off");
    setText(pump ?? svg, "[data-run-label]", fault ? "fault" : running ? "running" : id === "pump2" ? "standby" : "stopped");
  }
  const gate = svg.querySelector<SVGGElement>('[data-equipment="gate"]');
  gate?.setAttribute("data-state", state.outletOpen ? "on" : "off");
  setText(gate ?? svg, "[data-run-label]", state.outletOpen ? "open" : "closed");

  svg.querySelectorAll<SVGGElement>("[data-flow]").forEach((edge) => {
    const flow = edge.dataset["flow"];
    const active = flow === "pump1" ? state.pump1Running : flow === "pump2" ? state.pump2Running : (state.pump1Running || state.pump2Running) && state.outletOpen;
    edge.setAttribute("data-state", active ? "on" : "off");
  });
  const quality = svg.querySelector<SVGGElement>(".pid-quality-overlay");
  quality?.setAttribute("data-quality", state.quality);
  setText(svg, ".pid-quality-overlay text", `SOURCE QUALITY: ${state.quality.toUpperCase()}`);
}
