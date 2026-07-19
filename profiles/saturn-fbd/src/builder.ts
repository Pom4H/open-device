import {
  ELEM,
  ELEM_TYPE_COUNT,
  END_MARK,
  GLOBAL_OPTIONS_COUNT,
  INPUTS_COUNT,
  INVERT_FLAG,
  OPT,
  PARAMS_COUNT,
  encodeCp1251,
  fbdCrc32,
  requiredRtlVersion,
  type ElemCode,
} from "./format.js";
import { encodeHmiScreen, type HmiScreenSpec } from "./hmi.js";

/**
 * Низкоуровневый сборщик схемы: элементы → байты .fbdbin.
 * Индексы входов задаются символьными ссылками (id), допускаются
 * обратные связи (RS-защёлки, контроль обратной связи насоса).
 */

export interface ElementSpec {
  /** Символьное имя элемента для ссылок и листинга */
  id: string;
  type: ElemCode;
  /** Инвертировать выходной сигнал (bit6 в коде типа) */
  invert?: boolean;
  /** Ссылки на id элементов-источников, по количеству входов типа */
  inputs?: readonly string[];
  /** Параметры int32, по количеству параметров типа */
  params?: readonly number[];
  /** Подпись для WP/SP (кодируется в CP1251) */
  caption?: string;
  /** Комментарий для листинга */
  comment?: string;
}

export interface IoHint {
  /** 0 — вход, 1 — выход, 2 — событие */
  type: 0 | 1 | 2;
  index: number;
  text: string;
}

export interface SchemaMeta {
  projectName: string;
  projectVersion: string;
  buildTime: string;
  hints?: readonly IoHint[];
  /** HMI-экраны для записи в .fbdbin (tScreen × SCREEN_COUNT) */
  screens?: readonly HmiScreenSpec[] | readonly Uint8Array[];
}

export interface ListingRow {
  index: number;
  id: string;
  type: string;
  inputs: string;
  params: string;
  comment: string;
}

export interface CompiledSchema {
  /** Готовый файл .fbdbin */
  fbdbin: Uint8Array;
  /** Количество элементов схемы */
  elementCount: number;
  /** Количество HMI-экранов */
  screenCount: number;
  /** Требуемая версия RTL */
  requiredRtlVersion: number;
  /** Человекочитаемый листинг для аудита */
  listing: ListingRow[];
}

const TYPE_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(ELEM).map(([name, code]) => [code, name]),
);

function pushU16(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushI32(out: number[], value: number): void {
  const v = value | 0;
  out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

export function buildSchema(elements: readonly ElementSpec[], meta: SchemaMeta): CompiledSchema {
  if (elements.length === 0) {
    throw new Error("Схема пуста: нет элементов");
  }
  if (elements.length > 0xfffe) {
    throw new Error("Слишком много элементов схемы");
  }

  const indexOf = new Map<string, number>();
  elements.forEach((el, i) => {
    if (indexOf.has(el.id)) throw new Error(`Дублирующийся id элемента: ${el.id}`);
    indexOf.set(el.id, i);
  });

  // Валидация количества входов/параметров по таблицам fbd-runtime
  for (const el of elements) {
    if (el.type >= ELEM_TYPE_COUNT) throw new Error(`Неизвестный тип элемента: ${el.type}`);
    const needInputs = INPUTS_COUNT[el.type] ?? 0;
    const needParams = PARAMS_COUNT[el.type] ?? 0;
    const gotInputs = el.inputs?.length ?? 0;
    const gotParams = el.params?.length ?? 0;
    if (gotInputs !== needInputs) {
      throw new Error(`${el.id}: у ${TYPE_NAMES[el.type]} должно быть ${needInputs} входов, задано ${gotInputs}`);
    }
    if (gotParams !== needParams) {
      throw new Error(`${el.id}: у ${TYPE_NAMES[el.type]} должно быть ${needParams} параметров, задано ${gotParams}`);
    }
    for (const ref of el.inputs ?? []) {
      if (!indexOf.has(ref)) throw new Error(`${el.id}: вход ссылается на несуществующий элемент «${ref}»`);
    }
    const needsCaption = el.type === ELEM.WP || el.type === ELEM.SP;
    if (needsCaption && el.caption === undefined) {
      throw new Error(`${el.id}: точке WP/SP нужна подпись (caption)`);
    }
  }

  const bytes: number[] = [];

  // 1. Типы элементов + маркер конца
  for (const el of elements) {
    bytes.push((el.type & 0x3f) | (el.invert === true ? INVERT_FLAG : 0));
  }
  bytes.push(END_MARK);

  // 2. Входы (uint16 на вход)
  for (const el of elements) {
    for (const ref of el.inputs ?? []) {
      const idx = indexOf.get(ref);
      pushU16(bytes, idx ?? 0);
    }
  }

  // 3. Параметры (int32 на параметр)
  for (const el of elements) {
    for (const p of el.params ?? []) {
      pushI32(bytes, p);
    }
  }

  // 4. Глобальные опции; SCHEMA_SIZE заполняется после сборки
  const hints = meta.hints ?? [];
  const screens = meta.screens ?? [];
  const rtlVersion = requiredRtlVersion(elements.map((el) => el.type), screens.length);
  bytes.push(GLOBAL_OPTIONS_COUNT);
  const optionsOffset = bytes.length;
  const options = new Array<number>(GLOBAL_OPTIONS_COUNT).fill(0);
  options[OPT.REQ_VERSION] = rtlVersion;
  options[OPT.SCREEN_COUNT] = screens.length;
  options[OPT.HINTS_COUNT] = hints.length;
  for (const value of options) pushI32(bytes, value);

  // 5. Подписи точек WP/SP в порядке следования элементов, затем 3 строки проекта
  for (const el of elements) {
    if (el.type === ELEM.WP || el.type === ELEM.SP) {
      bytes.push(...encodeCp1251(el.caption ?? ""), 0);
    }
  }
  bytes.push(...encodeCp1251(meta.projectName), 0);
  bytes.push(...encodeCp1251(meta.projectVersion), 0);
  bytes.push(...encodeCp1251(meta.buildTime), 0);

  // 6. Выравнивание до 4 байт (fbdInit выравнивает указатель экранов)
  while (bytes.length % 4 !== 0) bytes.push(0);

  // 7. Экраны HMI: tScreen × SCREEN_COUNT
  for (const screen of screens) {
    const encoded = screen instanceof Uint8Array ? screen : encodeHmiScreen(screen);
    bytes.push(...encoded);
  }

  // 8. Хинты входов/выходов: type(1), index(1), ASCIIZ
  for (const hint of hints) {
    bytes.push(hint.type, hint.index, ...encodeCp1251(hint.text), 0);
  }

  // 9. SCHEMA_SIZE = полный размер файла, включая 4 байта CRC
  const totalSize = bytes.length + 4;
  const sizeOffset = optionsOffset + OPT.SCHEMA_SIZE * 4;
  bytes[sizeOffset] = totalSize & 0xff;
  bytes[sizeOffset + 1] = (totalSize >>> 8) & 0xff;
  bytes[sizeOffset + 2] = (totalSize >>> 16) & 0xff;
  bytes[sizeOffset + 3] = (totalSize >>> 24) & 0xff;

  // 10. CRC32: дописываем значение fbdCrc32(данных) — тогда CRC файла целиком == 0
  const data = Uint8Array.from(bytes);
  const crc = fbdCrc32(data);
  const fbdbin = new Uint8Array(totalSize);
  fbdbin.set(data);
  fbdbin[data.length] = crc & 0xff;
  fbdbin[data.length + 1] = (crc >>> 8) & 0xff;
  fbdbin[data.length + 2] = (crc >>> 16) & 0xff;
  fbdbin[data.length + 3] = (crc >>> 24) & 0xff;

  const listing: ListingRow[] = elements.map((el, i) => ({
    index: i,
    id: el.id,
    type: (TYPE_NAMES[el.type] ?? String(el.type)) + (el.invert === true ? " (инв.)" : ""),
    inputs: (el.inputs ?? []).join(", "),
    params: (el.params ?? []).join(", "),
    comment: el.comment ?? (el.caption !== undefined ? `«${el.caption}»` : ""),
  }));

  return {
    fbdbin,
    elementCount: elements.length,
    screenCount: screens.length,
    requiredRtlVersion: rtlVersion,
    listing,
  };
}
