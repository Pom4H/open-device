import { encodeCp1251 } from "./format.js";

/** Размер физического дисплея Saturn-PLC (fbdrt.h) */
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 240;

/** Индекс «нет привязки» для valueElem / visibleElem */
export const HMI_NO_ELEM = 0xffff;

/** Типы примитивов экрана (fbdrt.c drawCurrentScreen) */
export const SCR_ELEM = {
  LINE: 0,
  RECT: 1,
  TEXT: 2,
  IMAGE: 3,
  GAUGE: 4,
  CIRCLE: 5,
} as const;

/** Условия видимости (fbdrt.c isScrElemVisible) */
export const VIS_COND = {
  ALWAYS: 0,
  EQ: 1,
  NE: 2,
  GT: 3,
  LT: 4,
} as const;

/** Экранирует literal `%` для snprintf в fbd-runtime (`%` → `%%`) */
export function escapeHmiFormatLiteral(text: string): string {
  return text.replace(/%/g, "%%");
}

/** Цвета RGB565 для тёмной темы дисплея */
export const HMI_COLOR = {
  BG: 0x0841,
  HEADER: 0x2945,
  TEXT: 0xffff,
  ACCENT: 0x07ff,
  ALARM: 0xf800,
  MUTED: 0xad55,
  BAR: 0x0320,
} as const;

export interface HmiVisibility {
  cond: (typeof VIS_COND)[keyof typeof VIS_COND];
  elemIndex: number;
  value: number;
}

export interface HmiTextElement {
  kind: "text";
  x: number;
  y: number;
  text: string;
  color?: number;
  bkcolor?: number;
  font?: number;
  /** Индекс FBD-элемента для подстановки в snprintf; HMI_NO_ELEM — статический текст */
  valueElem?: number;
  divider?: number;
  visible?: HmiVisibility;
}

export interface HmiRectElement {
  kind: "rect";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: number;
  visible?: HmiVisibility;
}

export type HmiElement = HmiTextElement | HmiRectElement;

export interface HmiScreenSpec {
  bkcolor?: number;
  /** Период перерисовки, мс */
  period?: number;
  elements: readonly HmiElement[];
}

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushI32(out: number[], value: number): void {
  const v = value | 0;
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

function pushF32(out: number[], value: number): void {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, value, true);
  const bytes = new Uint8Array(buf);
  out.push(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
}

function padTo4(size: number): number {
  return (size + 3) & ~3;
}

function encodeVisibility(out: number[], visible: HmiVisibility | undefined, baseLen: number): void {
  if (visible === undefined) {
    pushU16(out, VIS_COND.ALWAYS);
    pushU16(out, HMI_NO_ELEM);
    pushI32(out, 0);
    return;
  }
  pushU16(out, visible.cond);
  pushU16(out, visible.elemIndex);
  pushI32(out, visible.value);
  void baseLen;
}

function encodeTextBytes(text: string): number[] {
  return [...encodeCp1251(text), 0];
}

function encodeTextElement(el: HmiTextElement): Uint8Array {
  const textBytes = encodeTextBytes(el.text);
  const structSize = padTo4(24 + textBytes.length);
  const bytes: number[] = [];

  pushU16(bytes, structSize);
  pushU16(bytes, SCR_ELEM.TEXT);
  encodeVisibility(bytes, el.visible, structSize);
  pushU16(bytes, el.x);
  pushU16(bytes, el.y);
  pushU16(bytes, el.color ?? HMI_COLOR.TEXT);
  pushU16(bytes, el.bkcolor ?? HMI_COLOR.BG);
  pushU16(bytes, el.valueElem ?? HMI_NO_ELEM);
  bytes.push((el.font ?? 0) | 0x80); // прозрачный фон
  bytes.push(el.divider ?? 0);
  bytes.push(...textBytes);
  while (bytes.length < structSize) bytes.push(0);

  return Uint8Array.from(bytes);
}

function encodeRectElement(el: HmiRectElement): Uint8Array {
  const structSize = 24;
  const bytes: number[] = [];

  pushU16(bytes, structSize);
  pushU16(bytes, SCR_ELEM.RECT);
  encodeVisibility(bytes, el.visible, structSize);
  pushU16(bytes, el.x1);
  pushU16(bytes, el.y1);
  pushU16(bytes, el.x2);
  pushU16(bytes, el.y2);
  pushU16(bytes, el.color ?? HMI_COLOR.HEADER);
  pushU16(bytes, 0);

  return Uint8Array.from(bytes);
}

function encodeElement(el: HmiElement): Uint8Array {
  switch (el.kind) {
    case "text":
      return encodeTextElement(el);
    case "rect":
      return encodeRectElement(el);
    default: {
      const _exhaustive: never = el;
      throw new Error(`Неизвестный примитив HMI: ${String(_exhaustive)}`);
    }
  }
}

/** Кодирует один экран tScreen для секции .fbdbin */
export function encodeHmiScreen(spec: HmiScreenSpec): Uint8Array {
  const elementBytes = spec.elements.map(encodeElement);
  const headerSize = 8;
  const bodySize = elementBytes.reduce((sum, b) => sum + b.length, 0);
  const totalLen = headerSize + bodySize;

  const out: number[] = [];
  pushU16(out, totalLen);
  pushU16(out, spec.bkcolor ?? HMI_COLOR.BG);
  pushU16(out, spec.period ?? 500);
  pushU16(out, spec.elements.length);
  for (const chunk of elementBytes) {
    out.push(...chunk);
  }

  return Uint8Array.from(out);
}

export interface DecodedHmiScreen {
  len: number;
  bkcolor: number;
  period: number;
  elemCount: number;
  elements: DecodedHmiElement[];
}

export interface DecodedHmiElement {
  len: number;
  type: number;
  visibleCond: number;
  visibleElem: number;
  visibleValue: number;
  x1: number;
  y1: number;
}

function readU16(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readI32(data: Uint8Array, offset: number): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getInt32(0, true);
}

/** Декодер заголовка экрана и базовых полей элементов (для roundtrip-тестов) */
export function decodeHmiScreen(data: Uint8Array): DecodedHmiScreen {
  const len = readU16(data, 0);
  const bkcolor = readU16(data, 2);
  const period = readU16(data, 4);
  const elemCount = readU16(data, 6);
  const elements: DecodedHmiElement[] = [];

  let offset = 8;
  for (let i = 0; i < elemCount; i += 1) {
    const elemLen = readU16(data, offset);
    elements.push({
      len: elemLen,
      type: readU16(data, offset + 2),
      visibleCond: readU16(data, offset + 4),
      visibleElem: readU16(data, offset + 6),
      visibleValue: readI32(data, offset + 8),
      x1: readU16(data, offset + 12),
      y1: readU16(data, offset + 14),
    });
    offset += elemLen;
  }

  if (offset !== len) {
    throw new Error(`Несогласованный len экрана: ожидалось ${len}, прочитано ${offset}`);
  }

  return { len, bkcolor, period, elemCount, elements };
}
