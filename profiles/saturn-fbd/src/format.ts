/**
 * Бинарный формат программ FBD для Saturn-PLC (fbd-runtime v11, crossrw/fbd-runtime).
 *
 * Файл .fbdbin — это в точности массив description[], который контроллер
 * передаёт в fbdInit() (см. demo.c в репозитории fbd-runtime: содержимое
 * файла *.fbdbin включено в прошивку как байтовый массив).
 *
 * Раскладка (little-endian, SIGNAL_SIZE=4, INDEX_SIZE=2):
 *
 *   [типы элементов]        по 1 байту: bit6 = инверсия выхода, bits0-5 = код типа
 *   [END_MARK]              1 байт: 0x80 | sizeof(tSignal) | (sizeof(tElemIndex) << 3) = 0x94
 *   [входы]                 uint16 на каждый вход каждого элемента (индекс элемента-источника)
 *   [параметры]             int32 на каждый параметр каждого элемента
 *   [кол-во опций]          1 байт
 *   [глобальные опции]      int32 × кол-во (версия RTL, netvars, экраны, размер схемы, хинты …)
 *   [подписи]               ASCIIZ (CP1251) для каждой точки WP/SP в порядке следования элементов,
 *                           затем 3 строки: имя проекта, версия, дата сборки
 *   [выравнивание]          до границы 4 байт
 *   [экраны]                FBD_SCREEN_COUNT структур tScreen (в этом компиляторе — 0)
 *   [хинты входов/выходов]  тип(1) + индекс(1) + ASCIIZ, count = FBD_OPT_HINTS_COUNT
 *   [CRC32]                 4 байта: значение fbdCRC32(данных); алгоритм таков, что
 *                           fbdCRC32(файл целиком) == 0
 */

/** Коды типов элементов (tFBD_ELEMENT_TYPE из fbdrt.h v11) */
export const ELEM = {
  OUT_PIN: 0,
  CONST: 1,
  NOT: 2,
  AND: 3,
  OR: 4,
  XOR: 5,
  RSTRG: 6,
  DTRG: 7,
  ADD: 8,
  SUB: 9,
  MUL: 10,
  DIV: 11,
  TON: 12,
  CMP: 13,
  OUT_VAR: 14,
  INP_PIN: 15,
  INP_VAR: 16,
  PID: 17,
  SUM: 18,
  COUNTER: 19,
  MUX: 20,
  ABS: 21,
  WP: 22,
  SP: 23,
  TP: 24,
  MIN: 25,
  MAX: 26,
  LIM: 27,
  EQ: 28,
  BAND: 29,
  BOR: 30,
  BXOR: 31,
  GEN: 32,
  INP_MDBS: 33,
  OUT_MDBS: 34,
  MOD: 35,
  MFUN: 36,
  EVENT: 37,
  LUT: 38,
  NLUT: 39,
  SUMM: 40,
} as const;

export type ElemCode = (typeof ELEM)[keyof typeof ELEM];

export const ELEM_TYPE_COUNT = 41;

/** FBDdefInputsCount из fbdrt.c v11 */
export const INPUTS_COUNT: readonly number[] = [
  1, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 4, 3, 3, 5, 1, 1, 0, 2, 2, 2, 3, 2, 2, 2, 2,
  2, 0, 1, 2, 0, 1, 5, 1, 5,
];

/** FBDdefParametersCount из fbdrt.c v11 */
export const PARAMS_COUNT: readonly number[] = [
  1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 0, 0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 3, 2, 0, 4, 2, 1, 66, 0,
];

/** FBDdefStorageCount из fbdrt.c v11 */
export const STORAGE_COUNT: readonly number[] = [
  0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 2, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0, 0, 0, 1,
];

/** Флаг инверсии выхода элемента */
export const INVERT_FLAG = 0x40;

export const SIGNAL_SIZE = 4;
export const INDEX_SIZE = 2;

/** Маркер конца списка элементов: 0x80 | sizeof(tSignal) | (sizeof(tElemIndex)<<3) */
export const END_MARK = 0x80 | SIGNAL_SIZE | (INDEX_SIZE << 3); // 0x94

/** Индексы глобальных опций (enum FBD_OPTIONS) */
export const OPT = {
  REQ_VERSION: 0,
  NETVAR_USE: 1,
  NETVAR_PORT: 2,
  NETVAR_GROUP: 3,
  SCREEN_COUNT: 4,
  SCHEMA_SIZE: 5,
  HINTS_COUNT: 6,
  MODBUSRTU_OPT: 7,
  MODBUSRTU_OPT2: 8,
  EVENTS_COUNT: 9,
} as const;

export const GLOBAL_OPTIONS_COUNT = 10;

/**
 * Минимальная версия RTL, которую программа требует от контроллера:
 * базовые элементы — 7, Modbus — 9, MOD/MFUN/EVENT/LUT/NLUT — 10, SUMM — 11.
 */
export function requiredRtlVersion(elementTypes: readonly number[], screenCount = 0): number {
  let version = 7;
  for (const type of elementTypes) {
    if (type === ELEM.SUMM) version = Math.max(version, 11);
    else if (type >= ELEM.MOD) version = Math.max(version, 10);
    else if (type === ELEM.INP_MDBS || type === ELEM.OUT_MDBS) version = Math.max(version, 9);
  }
  if (screenCount > 0) version = Math.max(version, 8);
  return version;
}

/**
 * CRC32 в варианте fbd-runtime: init ~0, полином 0xEDB88320 (reflected),
 * без финальной инверсии. Свойство: если дописать к данным значение
 * fbdCrc32(данные) в little-endian, CRC всего массива станет 0 —
 * именно это проверяет fbdInit().
 */
export function fbdCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const t = crc & 1 ? 0xffffffff : 0;
      crc = ((crc >>> 1) ^ (0xedb88320 & t)) >>> 0;
    }
  }
  return crc >>> 0;
}

/**
 * Кодирование строки в CP1251 (ASCIIZ-подписи в .fbdbin: кириллица —
 * однобайтовая, как в FBD2 Editor). Символы вне таблицы заменяются '?'.
 */
function normalizeCp1251Text(text: string): string {
  return text
    .replace(/\u2013/g, "-") // en-dash → дефис
    .replace(/\u2014/g, "-") // em-dash
    .replace(/\u2212/g, "-"); // minus sign
}

export function encodeCp1251(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of normalizeCp1251Text(text)) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code >= 0x410 && code <= 0x44f) {
      bytes.push(code - 0x410 + 0xc0); // А-Я а-я
    } else if (code === 0x401) {
      bytes.push(0xa8); // Ё
    } else if (code === 0x451) {
      bytes.push(0xb8); // ё
    } else if (code === 0x2116) {
      bytes.push(0xb9); // №
    } else if (code === 0xb0) {
      bytes.push(0xb0); // °
    } else {
      bytes.push(0x3f);
    }
  }
  return Uint8Array.from(bytes);
}
