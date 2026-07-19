import createFbdRuntimeModule, { type FbdWasmModule } from "../runtime/fbd-runtime.js";

/**
 * Типизированная обёртка над fbd-runtime.wasm.
 *
 * Runtime собран один раз (build.sh), пользовательские программы (.fbdbin)
 * исполняются как данные: load() → setInput() → step() → getOutput().
 * Это тот же код, который работает в контроллере Saturn-PLC.
 */

export type FbdInitError = -1 | -2 | -3 | -4 | -100;

export const INIT_ERRORS: Record<FbdInitError, string> = {
  [-1]: "Неверный код элемента в описании схемы",
  [-2]: "Не совпадает размерность сигнала или индекса элемента",
  [-3]: "Программа требует более новую версию fbd-runtime",
  [-4]: "Ошибка контрольной суммы программы",
  [-100]: "Недостаточно памяти WASM-модуля",
};

export type LoadResult =
  | { ok: true; memorySize: number }
  | { ok: false; code: number; message: string };

export interface SetpointInfo {
  index: number;
  caption: string;
  value: number;
  lowLimit: number;
  upperLimit: number;
  defValue: number;
  divider: number;
  step: number;
}

export interface WatchpointInfo {
  index: number;
  caption: string;
  value: number;
  divider: number;
}

export interface ProjectInfo {
  name: string;
  version: string;
  buildTime: string;
}

/** Команда отрисовки, записанная FBDdrawXXX в WASM-bridge */
export type HmiDrawCommand =
  | { type: "rect"; x1: number; y1: number; x2: number; y2: number; color: number }
  | { type: "text"; x: number; y: number; font: number; color: number; bkcolor: number; transparent: boolean; text: string }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; color: number }
  | { type: "ellipse"; x1: number; y1: number; x2: number; y2: number; color: number }
  | { type: "image"; x: number; y: number; image: number };

const DRAW_RECT = 0;
const DRAW_TEXT = 1;
const DRAW_LINE = 2;
const DRAW_ELLIPSE = 3;
const DRAW_IMAGE = 4;
const DRAW_END = 5;

/** Декодирование ASCIIZ-строки CP1251 из памяти WASM */
function readCp1251(heap: Uint8Array, ptr: number): string {
  if (ptr === 0) return "";
  let out = "";
  for (let i = ptr; heap[i] !== 0 && i < heap.length; i += 1) {
    const b = heap[i] ?? 0;
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b >= 0xc0) out += String.fromCharCode(b - 0xc0 + 0x410);
    else if (b === 0xa8) out += "\u0401"; // Ё
    else if (b === 0xb8) out += "\u0451"; // ё
    else if (b === 0xb9) out += "\u2116"; // №
    else if (b === 0xb0) out += "\u00b0"; // °
    else out += "?";
  }
  return out;
}

export class FbdRuntime {
  private readonly module: FbdWasmModule;
  private programPtr = 0;

  private constructor(module: FbdWasmModule) {
    this.module = module;
  }

  static async create(): Promise<FbdRuntime> {
    const module = await createFbdRuntimeModule();
    return new FbdRuntime(module);
  }

  private call(name: string, args: readonly number[]): number {
    return this.module.ccall(name, "number", args.map(() => "number"), args);
  }

  /** Загрузка программы .fbdbin: fbdInit + fbdSetMemory */
  load(program: Uint8Array, needReset = true): LoadResult {
    if (this.programPtr !== 0) {
      this.module._free(this.programPtr);
      this.programPtr = 0;
    }
    // Описание должно жить всё время работы: runtime читает его на каждом шаге
    this.programPtr = this.module._malloc(program.length);
    this.module.HEAPU8.set(program, this.programPtr);
    const result = this.call("bridge_load", [this.programPtr, needReset ? 1 : 0]);
    if (result <= 0) {
      const message = INIT_ERRORS[result as FbdInitError] ?? `Неизвестная ошибка fbdInit: ${result}`;
      return { ok: false, code: result, message };
    }
    return { ok: true, memorySize: result };
  }

  /** Один цикл контроллера: fbdDoStep(period_ms) */
  step(periodMs: number): void {
    this.call("bridge_step", [periodMs]);
  }

  /**
   * Шаг runtime с перерисовкой HMI-экрана: fbdDoStepEx(period_ms, screenIndex).
   * Возвращает команды отрисовки, записанные FBDdrawXXX.
   */
  stepAndRenderScreen(periodMs: number, screenIndex = 0): HmiDrawCommand[] {
    this.call("bridge_step_ex", [periodMs, screenIndex]);
    return this.collectDrawCommands();
  }

  private collectDrawCommands(): HmiDrawCommand[] {
    const count = this.call("bridge_draw_count", []);
    const commands: HmiDrawCommand[] = [];
    for (let i = 0; i < count; i += 1) {
      const type = this.call("bridge_draw_type", [i]);
      switch (type) {
        case DRAW_RECT:
          commands.push({
            type: "rect",
            x1: this.call("bridge_draw_x1", [i]),
            y1: this.call("bridge_draw_y1", [i]),
            x2: this.call("bridge_draw_x2", [i]),
            y2: this.call("bridge_draw_y2", [i]),
            color: this.call("bridge_draw_color", [i]),
          });
          break;
        case DRAW_TEXT:
          commands.push({
            type: "text",
            x: this.call("bridge_draw_x1", [i]),
            y: this.call("bridge_draw_y1", [i]),
            font: this.call("bridge_draw_font", [i]),
            color: this.call("bridge_draw_color", [i]),
            bkcolor: this.call("bridge_draw_bkcolor", [i]),
            transparent: this.call("bridge_draw_transparent", [i]) !== 0,
            text: readCp1251(this.module.HEAPU8, this.call("bridge_draw_text_ptr", [i])),
          });
          break;
        case DRAW_LINE:
          commands.push({
            type: "line",
            x1: this.call("bridge_draw_x1", [i]),
            y1: this.call("bridge_draw_y1", [i]),
            x2: this.call("bridge_draw_x2", [i]),
            y2: this.call("bridge_draw_y2", [i]),
            color: this.call("bridge_draw_color", [i]),
          });
          break;
        case DRAW_ELLIPSE:
          commands.push({
            type: "ellipse",
            x1: this.call("bridge_draw_x1", [i]),
            y1: this.call("bridge_draw_y1", [i]),
            x2: this.call("bridge_draw_x2", [i]),
            y2: this.call("bridge_draw_y2", [i]),
            color: this.call("bridge_draw_color", [i]),
          });
          break;
        case DRAW_IMAGE:
          commands.push({
            type: "image",
            x: this.call("bridge_draw_x1", [i]),
            y: this.call("bridge_draw_y1", [i]),
            image: this.call("bridge_draw_image", [i]),
          });
          break;
        case DRAW_END:
          break;
        default:
          break;
      }
    }
    return commands;
  }

  /** Был ли вызван FBDdrawEnd в последнем шаге отрисовки */
  get drawEndSeen(): boolean {
    return this.call("bridge_draw_end_seen", []) !== 0;
  }

  /** Установить значение входного контакта (FBDgetProc(FBD_PIN, pin)) */
  setInput(pin: number, value: number | boolean): void {
    this.call("bridge_set_input", [pin, typeof value === "boolean" ? (value ? 1 : 0) : value]);
  }

  /** Последнее значение, записанное схемой в выходной контакт */
  getOutput(pin: number): number {
    return this.call("bridge_get_output", [pin]);
  }

  get setpointCount(): number {
    return this.call("bridge_sp_count", []);
  }

  getSetpoint(index: number): SetpointInfo {
    const captionPtr = this.call("bridge_sp_caption", [index]);
    return {
      index,
      caption: readCp1251(this.module.HEAPU8, captionPtr),
      value: this.call("bridge_sp_field", [index, 0]),
      lowLimit: this.call("bridge_sp_field", [index, 1]),
      upperLimit: this.call("bridge_sp_field", [index, 2]),
      defValue: this.call("bridge_sp_field", [index, 3]),
      divider: this.call("bridge_sp_field", [index, 4]),
      step: this.call("bridge_sp_field", [index, 5]),
    };
  }

  setSetpoint(index: number, value: number): void {
    this.call("bridge_sp_set", [index, value]);
  }

  get watchpointCount(): number {
    return this.call("bridge_wp_count", []);
  }

  getWatchpoint(index: number): WatchpointInfo {
    const captionPtr = this.call("bridge_wp_caption", [index]);
    return {
      index,
      caption: readCp1251(this.module.HEAPU8, captionPtr),
      value: this.call("bridge_wp_value", [index]),
      divider: this.call("bridge_wp_divider", [index]),
    };
  }

  /** Имя, версия и дата сборки, зашитые в программу */
  getProjectInfo(): ProjectInfo {
    return {
      name: readCp1251(this.module.HEAPU8, this.call("bridge_project_field", [0])),
      version: readCp1251(this.module.HEAPU8, this.call("bridge_project_field", [1])),
      buildTime: readCp1251(this.module.HEAPU8, this.call("bridge_project_field", [2])),
    };
  }

  /** Хинт входа (type=0) или выхода (type=1) по номеру контакта */
  getIoHint(type: 0 | 1, pin: number): string {
    return readCp1251(this.module.HEAPU8, this.call("bridge_io_hint", [type, pin]));
  }
}
