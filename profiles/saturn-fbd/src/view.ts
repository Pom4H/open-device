/**
 * Browser-native Saturn-PLC front-panel view.
 *
 * The geometry is intentionally kept in the Saturn profile instead of the
 * vendor-neutral core. It mirrors the reference front panel used by
 * lanmon-design and exposes terminal anchors to topology editors.
 */

export type SaturnTerminalSignal = "digital" | "analog" | "temperature";
export type SaturnTerminalDirection = "input" | "output";
export type SaturnTerminalSide = "top" | "bottom";

export interface SaturnTerminalAnchor {
  id: string;
  x: number;
  y: number;
  side: SaturnTerminalSide;
  direction: SaturnTerminalDirection;
  signal: SaturnTerminalSignal;
}

export interface SaturnPlcViewOptions {
  connectedTerminals?: readonly string[];
  defsPrefix?: string;
}

export const SATURN_PLC_VIEW_BOX = Object.freeze({ x: 20, y: 36, width: 620, height: 340 });

const PIN = { width: 9, height: 9 } as const;
const TOP_PIN_Y = 42;
const TOP_BLOCK_Y = 48;
const BLOCK_HEIGHT = 30;
const TOP_MIDDLE_Y = 63;
const TOP_LABEL_Y = 58;
const TOP_CELL_Y = 71;
const TOP_GROUP_LABEL_Y = 90;
const FACE = { x: 30, y: 110, width: 600, height: 192 } as const;
const BOTTOM_GROUP_LABEL_Y = 322;
const BOTTOM_BLOCK_Y = 334;
const BOTTOM_MIDDLE_Y = 349;
const BOTTOM_LABEL_Y = 344;
const BOTTOM_CELL_Y = 357;
const BOTTOM_PIN_Y = 361;

const COLORS = {
  doTop: "#7ec8de",
  doBottom: "#45a8bc",
  acTop: "#f06b6f",
  acBottom: "#c93a3f",
  dcTop: "#fde68a",
  dcBottom: "#d4b02a",
  ethernet: "#4d9bff",
  rsTop: "#9ed8f7",
  rsBottom: "#5eb0e0",
  temperatureTop: "#c4a8e8",
  temperatureBottom: "#8b6cc4",
  diTop: "#72d67c",
  diBottom: "#3a9e44",
  aiTop: "#fde68a",
  aiBottom: "#d4b02a",
  groundTop: "#d8dee6",
  groundBottom: "#a8b0bc",
  aoTop: "#fde68a",
  aoBottom: "#d4b02a",
} as const;

const DEVICE_LOGO_PATH = `
  M44.0 37.0 L15.0 76.0 L2.0 124.0 L0.0 125.0 L0.0 894.0 L2.0 895.0 L10.0 935.0 L36.0 977.0 L73.0 1007.0 L124.0 1023.0 L903.0 1023.0 L948.0 1010.0 L981.0 986.0 L1012.0 942.0 L1023.0 899.0 L1023.0 127.0 L1014.0 86.0 L990.0 47.0 L953.0 17.0 L904.0 2.0 L903.0 0.0 L121.0 0.0 L120.0 2.0 L81.0 12.0 Z
  M87.0 76.0 L127.0 58.0 L898.0 58.0 L945.0 83.0 L967.0 129.0 L967.0 893.0 L939.0 944.0 L899.0 963.0 L125.0 963.0 L77.0 935.0 L58.0 891.0 L58.0 130.0 L65.0 104.0 Z
  M879.0 135.0 L448.0 135.0 L382.0 154.0 L319.0 194.0 L285.0 229.0 L263.0 261.0 L236.0 332.0 L233.0 696.0 L356.0 588.0 L358.0 378.0 L375.0 330.0 L406.0 292.0 L440.0 270.0 L482.0 258.0 L739.0 257.0 Z
  M748.0 290.0 L628.0 397.0 L625.0 607.0 L606.0 655.0 L575.0 692.0 L544.0 714.0 L498.0 728.0 L243.0 729.0 L110.0 851.0 L537.0 850.0 L594.0 833.0 L654.0 795.0 L688.0 761.0 L711.0 729.0 L731.0 690.0 L744.0 648.0 L748.0 618.0 Z
  M583.0 437.0 L579.0 437.0 L320.0 663.0 L305.0 681.0 L480.0 680.0 L498.0 675.0 L518.0 666.0 L543.0 648.0 L555.0 635.0 L567.0 618.0 L577.0 597.0 L583.0 575.0 Z
  M675.0 306.0 L507.0 306.0 L477.0 315.0 L463.0 322.0 L442.0 337.0 L425.0 355.0 L413.0 373.0 L406.0 389.0 L401.0 408.0 L401.0 544.0 L404.0 546.0 L614.0 364.0 L658.0 324.0 Z
`;

interface PinRect {
  x: number;
  y: number;
  centerX: number;
  index: number;
}

function pinRects(x: number, width: number, count: number, y: number): PinRect[] {
  const padding = (width - count * PIN.width) / (count + 1);
  return Array.from({ length: count }, (_, index) => {
    const pinX = x + padding + index * (PIN.width + padding);
    return { x: pinX, y, centerX: pinX + PIN.width / 2, index };
  });
}

const topRows = [
  { x: 48, width: 200, id: "X1", count: 6, from: 1 },
  { x: 258, width: 168, id: "X2", count: 5, from: 7 },
] as const;

const bottomBlocks = {
  ethernet: { x: 48, width: 52 },
  rs485: { x: 117.5, width: 48 },
  temperature: { x: 183, width: 140 },
  io: { x: 340.5, width: 204 },
  ao: { x: 562, width: 56 },
} as const;

function terminalAnchors(): SaturnTerminalAnchor[] {
  const anchors: SaturnTerminalAnchor[] = [];
  for (const row of topRows) {
    for (const pin of pinRects(row.x, row.width, row.count, TOP_PIN_Y)) {
      anchors.push({
        id: `DO${row.from + pin.index}`,
        x: pin.centerX - SATURN_PLC_VIEW_BOX.x,
        y: pin.y + PIN.height / 2 - SATURN_PLC_VIEW_BOX.y,
        side: "top",
        direction: "output",
        signal: "digital",
      });
    }
  }

  const diWidth = bottomBlocks.io.width * (10 / 14);
  for (const pin of pinRects(bottomBlocks.io.x, diWidth, 10, BOTTOM_PIN_Y)) {
    anchors.push({
      id: `DI${pin.index + 1}`,
      x: pin.centerX - SATURN_PLC_VIEW_BOX.x,
      y: pin.y + PIN.height / 2 - SATURN_PLC_VIEW_BOX.y,
      side: "bottom",
      direction: "input",
      signal: "digital",
    });
  }
  const aiX = bottomBlocks.io.x + diWidth;
  const aiWidth = bottomBlocks.io.width * (2 / 14);
  for (const pin of pinRects(aiX, aiWidth, 2, BOTTOM_PIN_Y)) {
    anchors.push({
      id: `AI${pin.index + 1}`,
      x: pin.centerX - SATURN_PLC_VIEW_BOX.x,
      y: pin.y + PIN.height / 2 - SATURN_PLC_VIEW_BOX.y,
      side: "bottom",
      direction: "input",
      signal: "analog",
    });
  }
  for (let channel = 0; channel < 5; channel += 1) {
    const channelX = bottomBlocks.temperature.x + channel * (bottomBlocks.temperature.width / 5);
    const signalPin = pinRects(channelX, bottomBlocks.temperature.width / 5, 2, BOTTOM_PIN_Y)[0];
    if (signalPin) {
      anchors.push({
        id: `T${channel + 1}`,
        x: signalPin.centerX - SATURN_PLC_VIEW_BOX.x,
        y: signalPin.y + PIN.height / 2 - SATURN_PLC_VIEW_BOX.y,
        side: "bottom",
        direction: "input",
        signal: "temperature",
      });
    }
  }
  for (let channel = 0; channel < 2; channel += 1) {
    const channelX = bottomBlocks.ao.x + channel * (bottomBlocks.ao.width / 2);
    const signalPin = pinRects(channelX, bottomBlocks.ao.width / 2, 2, BOTTOM_PIN_Y)[0];
    if (signalPin) {
      anchors.push({
        id: `AO${channel + 1}`,
        x: signalPin.centerX - SATURN_PLC_VIEW_BOX.x,
        y: signalPin.y + PIN.height / 2 - SATURN_PLC_VIEW_BOX.y,
        side: "bottom",
        direction: "output",
        signal: "analog",
      });
    }
  }
  return anchors;
}

export const SATURN_TERMINAL_ANCHORS: readonly SaturnTerminalAnchor[] = Object.freeze(terminalAnchors());

export function saturnTerminalAnchor(id: string): SaturnTerminalAnchor | undefined {
  return SATURN_TERMINAL_ANCHORS.find((anchor) => anchor.id === id);
}

function pinMarkup(pin: PinRect, terminalId: string | null, connected: ReadonlySet<string>): string {
  const className = terminalId === null
    ? "saturn-terminal-pin saturn-terminal-pin--fixed"
    : `saturn-terminal-pin${connected.has(terminalId) ? " saturn-terminal-pin--connected" : ""}`;
  const attributes = terminalId === null ? "" : ` data-terminal-id="${terminalId}"`;
  return `<rect class="${className}"${attributes} x="${pin.x}" y="${pin.y}" width="${PIN.width}" height="${PIN.height}" rx="1.5"/>`;
}

function splitBlock(x: number, width: number, top: string, bottom: string, clipId: string): string {
  return `<defs><clipPath id="${clipId}"><rect x="${x}" y="${BOTTOM_BLOCK_Y}" width="${width}" height="${BLOCK_HEIGHT}" rx="4"/></clipPath></defs>
    <g clip-path="url(#${clipId})"><rect x="${x}" y="${BOTTOM_BLOCK_Y}" width="${width}" height="15" fill="${top}"/><rect x="${x}" y="${BOTTOM_MIDDLE_Y}" width="${width}" height="15" fill="${bottom}"/><line x1="${x}" y1="${BOTTOM_MIDDLE_Y}" x2="${x + width}" y2="${BOTTOM_MIDDLE_Y}" class="saturn-cell-rule"/></g>
    <rect x="${x}" y="${BOTTOM_BLOCK_Y}" width="${width}" height="${BLOCK_HEIGHT}" rx="4" class="saturn-block-outline"/>`;
}

function topTerminalBlocks(connected: ReadonlySet<string>, prefix: string): string {
  const outputs = topRows.map((row) => {
    const pins = pinRects(row.x, row.width, row.count, TOP_PIN_Y);
    const pinViews = pins.map((pin) => pinMarkup(pin, `DO${row.from + pin.index}`, connected)).join("");
    const labels = pins.map((pin) => `<text x="${pin.centerX}" y="${TOP_CELL_Y}" class="saturn-terminal-text">DO${row.from + pin.index}</text>`).join("");
    return `<g><defs><clipPath id="${prefix}-${row.id}"><rect x="${row.x}" y="${TOP_BLOCK_Y}" width="${row.width}" height="${BLOCK_HEIGHT}" rx="4"/></clipPath></defs>
      <g clip-path="url(#${prefix}-${row.id})"><rect x="${row.x}" y="${TOP_BLOCK_Y}" width="${row.width}" height="15" fill="${COLORS.doTop}"/><rect x="${row.x}" y="${TOP_MIDDLE_Y}" width="${row.width}" height="15" fill="${COLORS.doBottom}"/><line x1="${row.x}" y1="${TOP_MIDDLE_Y}" x2="${row.x + row.width}" y2="${TOP_MIDDLE_Y}" class="saturn-cell-rule"/></g>
      <rect x="${row.x}" y="${TOP_BLOCK_Y}" width="${row.width}" height="${BLOCK_HEIGHT}" rx="4" class="saturn-block-outline"/>${pinViews}${labels}<text x="${row.x + row.width / 2}" y="${TOP_GROUP_LABEL_Y}" class="saturn-group-label">${row.id}</text></g>`;
  }).join("");

  const acPins = pinRects(506, 48, 2, TOP_PIN_Y).map((pin) => pinMarkup(pin, null, connected)).join("");
  const dcPins = pinRects(566, 52, 2, TOP_PIN_Y);
  return `${outputs}
    <g><defs><clipPath id="${prefix}-X3"><rect x="506" y="${TOP_BLOCK_Y}" width="48" height="${BLOCK_HEIGHT}" rx="4"/></clipPath></defs><g clip-path="url(#${prefix}-X3)"><rect x="506" y="${TOP_BLOCK_Y}" width="48" height="15" fill="${COLORS.acTop}"/><rect x="506" y="${TOP_MIDDLE_Y}" width="48" height="15" fill="${COLORS.acBottom}"/></g><rect x="506" y="${TOP_BLOCK_Y}" width="48" height="${BLOCK_HEIGHT}" rx="4" class="saturn-block-outline"/>${acPins}<text x="530" y="${TOP_LABEL_Y}" class="saturn-power-label saturn-power-label--light">AC ~220V</text><text x="530" y="${TOP_GROUP_LABEL_Y}" class="saturn-group-label">X3</text></g>
    <g><defs><clipPath id="${prefix}-X4"><rect x="566" y="${TOP_BLOCK_Y}" width="52" height="${BLOCK_HEIGHT}" rx="4"/></clipPath></defs><g clip-path="url(#${prefix}-X4)"><rect x="566" y="${TOP_BLOCK_Y}" width="52" height="15" fill="${COLORS.dcTop}"/><rect x="566" y="${TOP_MIDDLE_Y}" width="52" height="15" fill="${COLORS.dcBottom}"/></g><rect x="566" y="${TOP_BLOCK_Y}" width="52" height="${BLOCK_HEIGHT}" rx="4" class="saturn-block-outline"/>${dcPins.map((pin) => pinMarkup(pin, null, connected)).join("")}<text x="592" y="${TOP_LABEL_Y}" class="saturn-power-label">DC 12-24V</text>${dcPins.map((pin) => `<text x="${pin.centerX}" y="${TOP_CELL_Y}" class="saturn-polarity">${pin.index === 0 ? "−" : "+"}</text>`).join("")}<text x="592" y="${TOP_GROUP_LABEL_Y}" class="saturn-group-label">X4</text></g>`;
}

function bottomTerminalBlocks(connected: ReadonlySet<string>, prefix: string): string {
  const ethernet = bottomBlocks.ethernet;
  const rs = bottomBlocks.rs485;
  const temperature = bottomBlocks.temperature;
  const io = bottomBlocks.io;
  const ao = bottomBlocks.ao;

  const tempWidth = temperature.width / 5;
  const temperatureMarkup = Array.from({ length: 5 }, (_, channel) => {
    const x = temperature.x + channel * tempWidth;
    const pins = pinRects(x, tempWidth, 2, BOTTOM_PIN_Y);
    return `<g>${channel > 0 ? `<line x1="${x}" y1="${BOTTOM_BLOCK_Y}" x2="${x}" y2="${BOTTOM_BLOCK_Y + BLOCK_HEIGHT}" class="saturn-cell-rule"/>` : ""}<text x="${x + tempWidth / 2}" y="${BOTTOM_LABEL_Y}" class="saturn-bottom-title saturn-bottom-title--light">T${channel + 1}</text>${pins.map((pin) => `<text x="${pin.centerX}" y="${BOTTOM_CELL_Y}" class="saturn-bottom-cell saturn-bottom-cell--light">${pin.index === 0 ? "+" : "⊥"}</text>`).join("")}${pins.map((pin) => pinMarkup(pin, pin.index === 0 ? `T${channel + 1}` : null, connected)).join("")}</g>`;
  }).join("");

  const diWidth = io.width * (10 / 14);
  const aiWidth = io.width * (2 / 14);
  const groundWidth = io.width * (2 / 14);
  const segments = [
    { x: io.x, width: diWidth, top: COLORS.diTop, bottom: COLORS.diBottom, title: "DI", labels: Array.from({ length: 10 }, (_, index) => String(index + 1)), prefix: "DI" },
    { x: io.x + diWidth, width: aiWidth, top: COLORS.aiTop, bottom: COLORS.aiBottom, title: "AI", labels: ["1", "2"], prefix: "AI" },
    { x: io.x + diWidth + aiWidth, width: groundWidth, top: COLORS.groundTop, bottom: COLORS.groundBottom, title: "⊥", labels: ["⊥", "⊥"], prefix: null },
  ] as const;
  const ioMarkup = segments.map((segment, segmentIndex) => {
    const pins = pinRects(segment.x, segment.width, segment.labels.length, BOTTOM_PIN_Y);
    return `<g>${segmentIndex > 0 ? `<line x1="${segment.x}" y1="${BOTTOM_BLOCK_Y}" x2="${segment.x}" y2="${BOTTOM_BLOCK_Y + BLOCK_HEIGHT}" class="saturn-cell-rule"/>` : ""}<rect x="${segment.x}" y="${BOTTOM_BLOCK_Y}" width="${segment.width}" height="15" fill="${segment.top}"/><rect x="${segment.x}" y="${BOTTOM_MIDDLE_Y}" width="${segment.width}" height="15" fill="${segment.bottom}"/><text x="${segment.x + segment.width / 2}" y="${BOTTOM_LABEL_Y}" class="saturn-bottom-title">${segment.title}</text>${pins.map((pin) => `<text x="${pin.centerX}" y="${BOTTOM_CELL_Y}" class="saturn-bottom-cell">${segment.labels[pin.index] ?? ""}</text>`).join("")}${pins.map((pin) => pinMarkup(pin, segment.prefix === null ? null : `${segment.prefix}${pin.index + 1}`, connected)).join("")}</g>`;
  }).join("");

  const aoChannelWidth = ao.width / 2;
  const aoMarkup = Array.from({ length: 2 }, (_, channel) => {
    const x = ao.x + channel * aoChannelWidth;
    const pins = pinRects(x, aoChannelWidth, 2, BOTTOM_PIN_Y);
    return `<g>${channel > 0 ? `<line x1="${x}" y1="${BOTTOM_BLOCK_Y}" x2="${x}" y2="${BOTTOM_BLOCK_Y + BLOCK_HEIGHT}" class="saturn-cell-rule"/>` : ""}<text x="${x + aoChannelWidth / 2}" y="${BOTTOM_LABEL_Y}" class="saturn-bottom-title">AO${channel + 1}</text>${pins.map((pin) => `<text x="${pin.centerX}" y="${BOTTOM_CELL_Y}" class="saturn-bottom-cell">${pin.index === 0 ? "+" : "⊥"}</text>`).join("")}${pins.map((pin) => pinMarkup(pin, pin.index === 0 ? `AO${channel + 1}` : null, connected)).join("")}</g>`;
  }).join("");

  const rsPins = pinRects(rs.x, rs.width, 2, BOTTOM_PIN_Y);
  return `<g><text x="${ethernet.x + ethernet.width / 2}" y="${BOTTOM_GROUP_LABEL_Y}" class="saturn-group-label">X5</text><rect x="${ethernet.x}" y="${BOTTOM_BLOCK_Y}" width="${ethernet.width}" height="${BLOCK_HEIGHT}" rx="4" fill="${COLORS.ethernet}" class="saturn-block-outline"/><g class="saturn-ethernet-icon"><rect x="${ethernet.x + 21.5}" y="${BOTTOM_BLOCK_Y + 5}" width="9" height="5" rx="1"/><path d="M${ethernet.x + 26} ${BOTTOM_BLOCK_Y + 10}v6m-8 0h16m-16 0v4m16-4v4"/><rect x="${ethernet.x + 13.5}" y="${BOTTOM_BLOCK_Y + 20}" width="9" height="5" rx="1"/><rect x="${ethernet.x + 29.5}" y="${BOTTOM_BLOCK_Y + 20}" width="9" height="5" rx="1"/></g></g>
    <g><text x="${rs.x + rs.width / 2}" y="${BOTTOM_GROUP_LABEL_Y}" class="saturn-group-label">X6</text>${splitBlock(rs.x, rs.width, COLORS.rsTop, COLORS.rsBottom, `${prefix}-X6`)}<text x="${rs.x + rs.width / 2}" y="${BOTTOM_LABEL_Y}" class="saturn-bottom-title">RS 485</text>${rsPins.map((pin) => `<text x="${pin.centerX}" y="${BOTTOM_CELL_Y}" class="saturn-bottom-cell saturn-bottom-cell--light">${pin.index === 0 ? "A" : "B"}</text>`).join("")}${rsPins.map((pin) => pinMarkup(pin, null, connected)).join("")}</g>
    <g><text x="${temperature.x + temperature.width / 2}" y="${BOTTOM_GROUP_LABEL_Y}" class="saturn-group-label">X7</text>${splitBlock(temperature.x, temperature.width, COLORS.temperatureTop, COLORS.temperatureBottom, `${prefix}-X7`)}${temperatureMarkup}</g>
    <g><text x="${io.x + io.width / 2}" y="${BOTTOM_GROUP_LABEL_Y}" class="saturn-group-label">X8</text><defs><clipPath id="${prefix}-X8"><rect x="${io.x}" y="${BOTTOM_BLOCK_Y}" width="${io.width}" height="${BLOCK_HEIGHT}" rx="4"/></clipPath></defs><g clip-path="url(#${prefix}-X8)">${ioMarkup}</g><rect x="${io.x}" y="${BOTTOM_BLOCK_Y}" width="${io.width}" height="${BLOCK_HEIGHT}" rx="4" class="saturn-block-outline"/></g>
    <g><text x="${ao.x + ao.width / 2}" y="${BOTTOM_GROUP_LABEL_Y}" class="saturn-group-label">X9</text>${splitBlock(ao.x, ao.width, COLORS.aoTop, COLORS.aoBottom, `${prefix}-X9`)}${aoMarkup}</g>`;
}

function navigationButton(direction: "up" | "down" | "left" | "right", cx: number, cy: number, fill: string): string {
  const path = direction === "up"
    ? `M${cx} ${cy - 6}l-6.5 10h13z`
    : direction === "down"
      ? `M${cx} ${cy + 6}l-6.5 -10h13z`
      : direction === "left"
        ? `M${cx - 6} ${cy}l10 -6.5v13z`
        : `M${cx + 6} ${cy}l-10 -6.5v13z`;
  return `<g class="saturn-nav-button" data-plc-button="${direction}" role="button" tabindex="0" aria-label="Saturn PLC ${direction} button"><circle cx="${cx}" cy="${cy}" r="25" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="20" fill="${fill}"/><path d="${path}"/></g>`;
}

export function renderSaturnPlcSvg(options: SaturnPlcViewOptions = {}): string {
  const connected = new Set(options.connectedTerminals ?? []);
  const prefix = (options.defsPrefix ?? "saturn-plc").replace(/[^a-zA-Z0-9_-]/g, "-");
  const screen = { x: 214, y: 122, width: 232, height: 168 } as const;
  // `role="group"`, not `img`: an image role would prune the panel keys and terminals
  // from the accessibility tree and make them unreachable by keyboard.
  return `<svg class="saturn-plc-svg" viewBox="20 36 620 340" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Saturn-PLC front panel with live terminals and controller HMI">
    <defs><filter id="${prefix}-soft" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#334155" flood-opacity=".16"/></filter></defs>
    <g filter="url(#${prefix}-soft)"><rect x="28" y="68" width="604" height="276" rx="18" fill="#eef1f5" stroke="#b7c0cc" stroke-width="1.4"/></g>
    ${topTerminalBlocks(connected, prefix)}
    ${bottomTerminalBlocks(connected, prefix)}
    <rect x="${FACE.x}" y="${FACE.y}" width="${FACE.width}" height="${FACE.height}" rx="6" fill="#eceff4" stroke="#c5cdd8" stroke-width="1.2"/>
    <line x1="460" y1="118" x2="460" y2="294" stroke="#d0d6de"/>
    <g class="saturn-copy"><text x="50" y="132">Многофункциональный</text><text x="50" y="147">универсальный</text><text x="50" y="162">контроллер</text><text x="50" y="190" class="saturn-model-name">Saturn-PLC</text><g transform="translate(50 200) scale(.015625)"><rect x="-32" y="-32" width="1088" height="1088" rx="70" fill="#fff"/><path d="${DEVICE_LOGO_PATH}" fill="#00307c" fill-rule="evenodd"/></g><text x="73" y="213" class="saturn-brand-name">МНПП Сатурн</text><text x="50" y="246" class="saturn-spec">Un=220В, 50Гц</text><text x="50" y="258" class="saturn-spec">Pn=2.5Вт</text><text x="50" y="270" class="saturn-spec">IP20</text><text x="150" y="270" class="saturn-eac">EAC</text></g>
    <g class="saturn-screen-shell"><rect x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" rx="8"/><rect x="219" y="127" width="222" height="158" rx="6" class="saturn-screen-inner"/><svg class="runtime-hmi" x="219" y="127" width="222" height="158" viewBox="0 0 320 240" overflow="hidden" role="img" aria-label="Saturn PLC runtime HMI"></svg></g>
    <g aria-label="Saturn PLC navigation buttons">${navigationButton("up", 542, 166, "#7ba7d7")}${navigationButton("down", 542, 246, "#7ba7d7")}${navigationButton("left", 502, 206, "#f37021")}${navigationButton("right", 582, 206, "#8dc63f")}</g>
  </svg>`;
}
