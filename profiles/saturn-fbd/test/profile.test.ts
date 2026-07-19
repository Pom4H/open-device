import { describe, expect, test } from "bun:test";

import { FbdRuntime, PANEL_MENU_ITEMS, SATURN_KEYS, reducePanel, type PanelContext, type PanelScreen, SATURN_TERMINAL_ANCHORS, compileSaturnProgram, createPumpProgram, fbdCrc32, projectScadaToHmi, renderSaturnPlcSvg, saturnTerminalAnchor } from "../src/index.ts";

describe("Saturn FBD profile", () => {
  test("compiles the editable source to a valid fbdbin with the program's working screen", () => {
    const source = createPumpProgram();
    const compiled = compileSaturnProgram(source);
    expect(compiled.elementCount).toBe(58);
    // The program declares its working screen only; the standard menu is the firmware's.
    expect(compiled.screenCount).toBe(1);
    expect(source.hmiScreens[0]!.screenType).toBe("main");
    expect(compiled.requiredRtlVersion).toBeGreaterThanOrEqual(8);
    expect(fbdCrc32(compiled.fbdbin)).toBe(0);
  });

  test("the front-panel keypad drives the schema inside the runtime", async () => {
    const source = createPumpProgram();
    const compiled = compileSaturnProgram(source);
    const runtime = await FbdRuntime.create();
    expect(runtime.load(compiled.fbdbin)).toEqual(expect.objectContaining({ ok: true }));
    // Pressure well above the start setpoint: automatic logic has no reason to run the pump.
    runtime.setInput(source.bindings.inputs.pressure!, 400);
    runtime.setInput(source.bindings.inputs["emergency-stop"]!, 0);
    runtime.setInput(source.bindings.inputs["auto-mode"]!, 1);
    runtime.setInput(source.bindings.inputs["pump-1-feedback"]!, 1);
    runtime.setInput(source.bindings.inputs["tank-low-level"]!, 0);
    for (let i = 0; i < 30; i += 1) runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-1-command"]!)).toBe(0);

    // One scan of the ▲ key sets the manual run latch; the pump starts after the lead delay.
    runtime.setInput(SATURN_KEYS.UP, 1);
    runtime.step(100);
    runtime.setInput(SATURN_KEYS.UP, 0);
    for (let i = 0; i < 30; i += 1) runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-1-command"]!)).toBe(1);

    // ▼ resets the same latch and the pump stops — all decided by the program, not the host.
    runtime.setInput(SATURN_KEYS.DOWN, 1);
    runtime.step(100);
    runtime.setInput(SATURN_KEYS.DOWN, 0);
    runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-1-command"]!)).toBe(0);
  });

  test("the firmware menu walks the device tree from §8 over live HMI points", async () => {
    const source = createPumpProgram();
    const runtime = await FbdRuntime.create();
    expect(runtime.load(compileSaturnProgram(source).fbdbin)).toEqual(expect.objectContaining({ ok: true }));
    runtime.step(100);
    const ctx: PanelContext = {
      setpoints: Array.from({ length: runtime.setpointCount }, (_, index) => {
        const sp = runtime.getSetpoint(index);
        return { index, caption: sp.caption, value: sp.value, lowLimit: sp.lowLimit, upperLimit: sp.upperLimit, divider: sp.divider, step: sp.step };
      }),
      watchpoints: [],
      projectName: source.name,
      version: source.version,
    };
    expect(ctx.setpoints.length).toBeGreaterThan(0);
    expect(PANEL_MENU_ITEMS.map((item) => item.label)).toEqual(["Точки контроля", "Точки регулирования", "Об устройстве"]);

    const press = (screen: PanelScreen, button: "up" | "down" | "left" | "right") => reducePanel(screen, button, ctx);

    // main → menu → «Точки регулирования» → список → редактирование
    let screen: PanelScreen = { kind: "main" };
    screen = press(screen, "right").screen;
    expect(screen).toEqual({ kind: "menu", index: 0 });
    screen = press(screen, "down").screen;
    expect(screen).toEqual({ kind: "menu", index: 1 });
    screen = press(screen, "right").screen;
    expect(screen).toEqual({ kind: "setpoints", index: 0 });
    screen = press(screen, "right").screen;
    expect(screen.kind).toBe("setpoint-edit");

    // ▲ меняет черновик на шаг уставки, ▶ записывает его в работающую программу
    const before = ctx.setpoints[0]!;
    screen = press(screen, "up").screen;
    expect((screen as { draft: number }).draft).toBe(before.value + before.step);
    const committed = press(screen, "right");
    expect(committed.commit).toEqual({ index: 0, value: before.value + before.step });
    runtime.setSetpoint(committed.commit!.index, committed.commit!.value);
    expect(runtime.getSetpoint(0).value).toBe(before.value + before.step);

    // ◀ поднимается обратно по дереву до рабочего экрана
    screen = press(committed.screen, "left").screen;
    expect(screen).toEqual({ kind: "menu", index: 1 });
    expect(press(screen, "left").screen).toEqual({ kind: "main" });
  });

  test("executes the compiled artifact in the actual FBD runtime", async () => {
    const source = createPumpProgram();
    const compiled = compileSaturnProgram(source);
    const runtime = await FbdRuntime.create();
    expect(runtime.load(compiled.fbdbin)).toEqual(expect.objectContaining({ ok: true }));
    runtime.setInput(source.bindings.inputs.pressure!, 100);
    runtime.setInput(source.bindings.inputs["emergency-stop"]!, 0);
    runtime.setInput(source.bindings.inputs["auto-mode"]!, 1);
    runtime.setInput(source.bindings.inputs["pump-1-feedback"]!, 1);
    runtime.setInput(source.bindings.inputs["pump-2-feedback"]!, 1);
    runtime.setInput(source.bindings.inputs["tank-low-level"]!, 0);
    for (let i = 0; i < 25; i += 1) runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-1-command"]!)).toBe(1);
    expect(runtime.getOutput(source.bindings.outputs["pump-2-command"]!)).toBe(0);
    runtime.setInput(source.bindings.inputs.pressure!, 50);
    for (let i = 0; i < 45; i += 1) runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-2-command"]!)).toBe(1);
    expect(runtime.stepAndRenderScreen(100, 0).length).toBeGreaterThan(0);
  });

  test("fails over to P-102 when P-101 feedback is missing", async () => {
    const source = createPumpProgram();
    const runtime = await FbdRuntime.create();
    expect(runtime.load(compileSaturnProgram(source).fbdbin)).toEqual(expect.objectContaining({ ok: true }));
    runtime.setInput(source.bindings.inputs.pressure!, 100);
    runtime.setInput(source.bindings.inputs["emergency-stop"]!, 0);
    runtime.setInput(source.bindings.inputs["auto-mode"]!, 1);
    runtime.setInput(source.bindings.inputs["pump-1-feedback"]!, 0);
    runtime.setInput(source.bindings.inputs["pump-2-feedback"]!, 1);
    runtime.setInput(source.bindings.inputs["tank-low-level"]!, 0);
    for (let i = 0; i < 60; i += 1) runtime.step(100);
    expect(runtime.getOutput(source.bindings.outputs["pump-1-command"]!)).toBe(0);
    expect(runtime.getOutput(source.bindings.outputs["pump-2-command"]!)).toBe(1);
    expect(runtime.getOutput(source.bindings.outputs.alarm!)).toBe(1);
  });

  test("reports which SCADA widgets can be projected to controller HMI", () => {
    const projection = projectScadaToHmi([
      { id: "pressure", kind: "value", label: "P ", position: { x: 8, y: 48 }, binding: { source: "wp", ref: "wp_pressure", format: "fixed2", unit: "bar" } },
      { id: "trend", kind: "trend", label: "Trend ", position: { x: 8, y: 80 }, binding: { source: "wp", ref: "wp_pressure", format: "fixed2" } },
      { id: "command", kind: "command", label: "Start", position: { x: 8, y: 120 } },
    ]);
    expect(projection.report.map((item) => item.status)).toEqual(["transferred", "simplified", "software-only"]);
  });

  test("publishes the exact Saturn front-panel geometry and terminal anchors", () => {
    const svg = renderSaturnPlcSvg({ connectedTerminals: ["DO1", "DI1", "AI1"] });
    expect(svg).toContain('viewBox="20 36 620 340"');
    expect(svg).toContain('data-terminal-id="DO1"');
    expect(svg).toContain('data-plc-button="right"');
    expect(svg).toContain("МНПП Сатурн");
    expect(SATURN_TERMINAL_ANCHORS).toHaveLength(30);
    expect(saturnTerminalAnchor("DO1")).toEqual(expect.objectContaining({ side: "top", direction: "output" }));
    expect(saturnTerminalAnchor("AI1")).toEqual(expect.objectContaining({ side: "bottom", signal: "analog" }));
  });
});
