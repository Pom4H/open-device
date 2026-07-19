/**
 * Типы для модуля, сгенерированного Emscripten (build.sh).
 * Файл поддерживается вручную и не перезаписывается сборкой.
 */

export interface FbdWasmModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  ccall(
    name: string,
    returnType: "number" | "string" | null,
    argTypes: readonly ("number" | "string")[],
    args: readonly (number | string)[],
  ): number;
}

declare function createFbdRuntimeModule(
  overrides?: Record<string, unknown>,
): Promise<FbdWasmModule>;

export default createFbdRuntimeModule;
