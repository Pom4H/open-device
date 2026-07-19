import type { HmiScreenModel } from "./types.js";
import {
  escapeHmiFormatLiteral,
  HMI_COLOR,
  HMI_NO_ELEM,
  type HmiScreenSpec,
  VIS_COND,
  encodeHmiScreen,
} from "./hmi.js";

export interface HmiCompileContext {
  /** id FBD-элемента → индекс в схеме */
  elementIndex: ReadonlyMap<string, number>;
}

function resolveBinding(
  ctx: HmiCompileContext,
  binding: HmiScreenModel["elements"][number]["binding"],
): { valueElem: number; divider: number; format: string } | null {
  if (binding === undefined) return null;
  const idx = ctx.elementIndex.get(binding.ref);
  if (idx === undefined) {
    throw new Error(`HMI: элемент «${binding.ref}» не найден в FBD-схеме`);
  }
  switch (binding.format) {
    case "bool":
      return { valueElem: idx, divider: 0, format: "%.0f" };
    case "int":
      return { valueElem: idx, divider: 0, format: "%.0f" };
    case "fixed1":
      return { valueElem: idx, divider: 1, format: "%.1f" };
    case "fixed2":
    default:
      return { valueElem: idx, divider: 2, format: "%.2f" };
  }
}

const VIS_CONDS = { eq: VIS_COND.EQ, ne: VIS_COND.NE, gt: VIS_COND.GT, lt: VIS_COND.LT } as const;

/** Resolve a per-element visibility condition to the schema element index the firmware compares. */
function resolveVisibility(
  ctx: HmiCompileContext,
  visible: HmiScreenModel["elements"][number]["visible"],
): { cond: (typeof VIS_COND)[keyof typeof VIS_COND]; elemIndex: number; value: number } | undefined {
  if (visible === undefined) return undefined;
  const elemIndex = ctx.elementIndex.get(visible.ref);
  if (elemIndex === undefined) {
    throw new Error(`HMI: элемент «${visible.ref}» не найден в FBD-схеме`);
  }
  return { cond: VIS_CONDS[visible.cond], elemIndex, value: visible.value };
}

function compileStatusElements(
  el: HmiScreenModel["elements"][number],
  ctx: HmiCompileContext,
  onLabel: string,
  offLabel: string,
): HmiScreenSpec["elements"] {
  if (el.binding === undefined) return [];
  const idx = ctx.elementIndex.get(el.binding.ref);
  if (idx === undefined) return [];

  const visible = resolveVisibility(ctx, el.visible);
  const base = {
    kind: "text" as const,
    ...(visible === undefined ? {} : { visible }),
    x: el.position.x + (el.label?.length ?? 0) * 8,
    y: el.position.y,
    font: el.font ?? 0,
    valueElem: HMI_NO_ELEM,
    divider: 0,
  };

  return [
    {
      ...base,
      text: onLabel,
      color: HMI_COLOR.ACCENT,
      visible: { cond: VIS_COND.EQ, elemIndex: idx, value: 1 },
    },
    {
      ...base,
      text: offLabel,
      color: HMI_COLOR.MUTED,
      visible: { cond: VIS_COND.EQ, elemIndex: idx, value: 0 },
    },
  ];
}

/** Собирает tScreen из модели проекта и карты индексов FBD */
export function compileHmiScreen(screen: HmiScreenModel, ctx: HmiCompileContext): Uint8Array {
  const elements: HmiScreenSpec["elements"][number][] = [];

  for (const el of screen.elements) {
    const visible = resolveVisibility(ctx, el.visible);
    const withVisibility = visible === undefined ? {} : { visible };
    if (el.primitive === "rect" || el.primitive === "line") {
      const w = el.width ?? 100;
      const h = el.height ?? 24;
      elements.push({
        kind: "rect",
        x1: el.position.x,
        y1: el.position.y,
        x2: el.position.x + w,
        y2: el.position.y + h,
        color: el.color ?? HMI_COLOR.HEADER,
        ...withVisibility,
      });
      continue;
    }

    if (el.primitive === "status" && el.binding !== undefined) {
      if (el.label !== undefined && el.label.length > 0) {
        elements.push({
          kind: "text",
          x: el.position.x,
          y: el.position.y,
          text: escapeHmiFormatLiteral(el.label),
          color: el.color ?? HMI_COLOR.TEXT,
          font: el.font ?? 0,
          valueElem: HMI_NO_ELEM,
          ...withVisibility,
        });
      }
      const labels = el.binding.ref === "wp_alarm" ? { on: "ДА", off: "НЕТ" } : { on: "ВКЛ", off: "ВЫКЛ" };
      elements.push(...compileStatusElements(el, ctx, labels.on, labels.off));
      continue;
    }

    const binding = resolveBinding(ctx, el.binding);
    const label = escapeHmiFormatLiteral(el.label ?? "");
    const unit = escapeHmiFormatLiteral(el.binding?.unit ?? "");
    const text =
      binding === null
        ? label
        : unit.length > 0
          ? `${label}${binding.format} ${unit}`
          : `${label}${binding.format}`;

    elements.push({
      kind: "text",
      x: el.position.x,
      y: el.position.y,
      text,
      color: el.color ?? (el.primitive === "alarmBanner" ? HMI_COLOR.ALARM : HMI_COLOR.TEXT),
      font: el.font ?? (el.primitive === "value" ? 1 : 0),
      valueElem: binding?.valueElem ?? HMI_NO_ELEM,
      divider: binding?.divider ?? 0,
      ...withVisibility,
    });
  }

  return encodeHmiScreen({
    bkcolor: screen.backgroundColor ?? HMI_COLOR.BG,
    period: screen.period ?? 500,
    elements: elements as HmiScreenSpec["elements"],
  });
}

export function compileHmiScreens(
  screens: readonly HmiScreenModel[],
  ctx: HmiCompileContext,
): Uint8Array[] {
  return screens.map((screen) => compileHmiScreen(screen, ctx));
}
