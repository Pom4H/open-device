/* ═══════════ Open Device playground — edit the model, watch the device compile, simulate the plant ═══════════
 *
 * Left: the model document (JSON). Every keystroke recompiles the front panel
 * through @open-device/core — the same compiler the website and future SCADA
 * editors use. Right: the compiled SVG plus its connection anchors, and a plant
 * simulation engine chosen by domain (water, electrical, low-voltage). Engines
 * attach to the model by port semantics — direction, domain, dataType, unit —
 * never by hard-coded names or a controller profile.
 */

import { compileFrontPanelSvg } from "./core-svg.mjs";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (sel) => document.querySelector(sel);

const PRESETS = {
  water: { title: "Pump controller", domain: "water", href: "presets/water-pump.json" },
  electrical: { title: "Feeder module", domain: "electrical", href: "presets/electrical-feeder.json" },
  fire: { title: "Detection loop module", domain: "low-voltage", href: "presets/fire-loop.json" },
};

async function loadPresetModel(id) {
  const inline = document.getElementById(`preset-${id}`);
  if (inline) return JSON.parse(inline.textContent);
  return await (await fetch(PRESETS[id].href)).json();
}

/* ─────────────── port matching: the abstraction layer ───────────────
 * Plant engines never reference port names. They ask the model for roles:
 * "first numeric signal input", "first boolean signal output", and so on. */

const analogInputs = (model) =>
  model.ports.filter((p) => p.direction === "input" && p.domain === "signal" && p.signal?.dataType === "number");
const boolOutputs = (model) =>
  model.ports.filter((p) => p.direction === "output" && p.signal?.dataType === "boolean");

const portRef = (p) => (p ? `port:${p.id}` : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const noise = (a) => (Math.random() - 0.5) * a;

/* ─────────────── plant engines ─────────────── */

function waterEngine(model) {
  const sensor = analogInputs(model)[0];
  const actuator = boolOutputs(model)[0];
  const max = sensor?.signal?.maximum ?? 10;
  const unit = sensor?.signal?.unit ?? "bar";
  const TRIP = max * 0.85;
  const s = { run: false, sp: max * 0.65, v: max * 0.12, tripped: false, alarm: false };
  return {
    label: "WATER · PUMP + PRESSURE LOOP",
    note: "hydraulic plant",
    mapping: [
      ["process value", sensor ? `${sensor.id} (${sensor.terminals?.map((t) => t.label).join("/") ?? "—"})` : "no numeric signal input"],
      ["actuator", actuator ? `${actuator.id} (${actuator.terminals?.map((t) => t.label).join("/") ?? "—"})` : "no boolean output"],
    ],
    primary: { label: sensor?.title ?? "process", unit, min: sensor?.signal?.minimum ?? 0, max, limit: TRIP },
    controls: [
      { kind: "toggle", label: () => (s.run ? "STOP PUMP" : "START PUMP"), armed: () => s.run, on: () => { if (!s.tripped) s.run = !s.run; } },
      { kind: "range", label: "SP", unit, min: max * 0.2, max: max * 0.95, step: 0.1, get: () => s.sp, set: (v) => { s.sp = v; } },
      { kind: "button", label: () => "⚡ Provoke overpressure", on: () => { s.sp = max * 0.95; if (!s.tripped) s.run = true; } },
      { kind: "button", label: () => "ACK", danger: true, visible: () => s.alarm, on: () => { if (s.v < TRIP) { s.alarm = false; s.tripped = false; } } },
    ],
    tick(dt) {
      if (s.run) s.v += (s.sp * 1.03 - s.v) * 0.55 * dt + noise(0.05);
      else s.v += (max * 0.12 - s.v) * 0.28 * dt + noise(0.02);
      s.v = clamp(s.v, 0, max * 1.05);
      if (s.v > TRIP && s.run) { s.run = false; s.tripped = true; s.alarm = true; }
    },
    value(ref) {
      if (ref === portRef(sensor)) return s.v;
      if (ref === portRef(actuator)) return s.run;
      if (ref === "state:power" || ref === "state:link") return true;
      if (ref === "state:alarm") return s.alarm;
      if (ref === "state:fault") return false;
      if (ref === "state:status")
        return s.alarm ? "!! OVERPRESSURE TRIP !!" : s.run ? `PUMP RUN · SP ${s.sp.toFixed(1)}` : `STANDBY · SP ${s.sp.toFixed(1)}`;
      return undefined;
    },
    primaryValue: () => s.v,
    rotor: () => s.run,
  };
}

function electricalEngine(model) {
  const sensor = analogInputs(model)[0];
  const breaker = boolOutputs(model)[0];
  const max = sensor?.signal?.maximum ?? 40;
  const unit = sensor?.signal?.unit ?? "A";
  const RATED = max * 0.8;
  const s = { closed: false, load: max * 0.35, i: 0, heat: 0, tripped: false };
  return {
    label: "ELECTRICAL · FEEDER + THERMAL TRIP",
    note: "power distribution plant",
    mapping: [
      ["phase current", sensor ? `${sensor.id} (${sensor.terminals?.map((t) => t.label).join("/") ?? "—"})` : "no numeric signal input"],
      ["breaker", breaker ? `${breaker.id} (${breaker.terminals?.map((t) => t.label).join("/") ?? "—"})` : "no boolean output"],
    ],
    primary: { label: sensor?.title ?? "current", unit, min: 0, max, limit: RATED },
    controls: [
      { kind: "toggle", label: () => (s.closed ? "OPEN BREAKER" : "CLOSE BREAKER"), armed: () => s.closed, on: () => { if (s.tripped) return; s.closed = !s.closed; if (s.closed) s.i = s.load * 2.2; } },
      { kind: "range", label: "LOAD", unit, min: 0, max, step: 0.5, get: () => s.load, set: (v) => { s.load = v; } },
      { kind: "button", label: () => "⚡ Overload", on: () => { s.load = max * 0.95; } },
      { kind: "button", label: () => "ACK", danger: true, visible: () => s.tripped, on: () => { s.tripped = false; s.heat = 0; s.load = max * 0.35; } },
    ],
    tick(dt) {
      const target = s.closed && !s.tripped ? s.load : 0;
      s.i += (target - s.i) * 3 * dt + noise(0.25);
      s.i = clamp(s.i, 0, max * 2.5);
      if (s.i > RATED) s.heat += ((s.i - RATED) / RATED) * dt * 4;
      else s.heat = Math.max(0, s.heat - dt);
      if (s.heat > 1 && s.closed) { s.closed = false; s.tripped = true; }
    },
    value(ref) {
      if (ref === portRef(sensor)) return s.i;
      if (ref === portRef(breaker)) return s.closed;
      if (ref === "state:power" || ref === "state:link") return true;
      if (ref === "state:alarm") return s.tripped;
      if (ref === "state:fault") return false;
      if (ref === "state:status")
        return s.tripped ? "!! OVERCURRENT TRIP !!" : s.closed ? `CLOSED · ${(230 - s.i * 0.35).toFixed(0)} V` : "BREAKER OPEN";
      return undefined;
    },
    primaryValue: () => s.i,
    rotor: () => s.closed,
  };
}

function lowVoltageEngine(model) {
  const loops = analogInputs(model);
  const siren = boolOutputs(model)[0];
  const unit = loops[0]?.signal?.unit ?? "kΩ";
  const max = loops[0]?.signal?.maximum ?? 20;
  const EOL = 5.6;
  const st = loops.map(() => ({ mode: "normal" }));
  const s = { alarm: false };
  const resistance = (m) =>
    m === "alarm" ? 1.2 + noise(0.1) : m === "break" ? max * 0.995 : m === "short" ? 0.12 + noise(0.04) : EOL + noise(0.15);
  const cycle = (i, mode) => { st[i].mode = st[i].mode === mode ? "normal" : mode; if (mode === "alarm" && st[i].mode === "alarm") s.alarm = true; };
  return {
    label: "LOW-VOLTAGE · SUPERVISED LOOPS",
    note: "fire / security plant",
    mapping: [
      ...loops.map((p, i) => [`loop ${i + 1}`, `${p.id} (${p.terminals?.map((t) => t.label).join("/") ?? "—"})`]),
      ["siren", siren ? `${siren.id} (${siren.terminals?.map((t) => t.label).join("/") ?? "—"})` : "no boolean output"],
    ],
    primary: { label: loops[0]?.title ?? "loop", unit, min: 0, max, limit: 2.0 },
    controls: [
      { kind: "button", label: () => "🔥 Smoke · loop 1", on: () => cycle(0, "alarm") },
      { kind: "button", label: () => "✂ Line break · loop 2", on: () => st[1] && cycle(1, "break") },
      { kind: "button", label: () => "⚡ Short · loop 2", on: () => st[1] && cycle(1, "short") },
      { kind: "button", label: () => "RESET", danger: true, visible: () => s.alarm || st.some((l) => l.mode !== "normal"), on: () => { st.forEach((l) => { l.mode = "normal"; }); s.alarm = false; } },
    ],
    tick() {},
    value(ref) {
      const li = loops.findIndex((p) => portRef(p) === ref);
      if (li >= 0) return clamp(resistance(st[li].mode), 0, max);
      if (ref === portRef(siren)) return s.alarm;
      if (ref === "state:power" || ref === "state:link") return true;
      if (ref === "state:alarm") return s.alarm;
      if (ref === "state:fault") return st.some((l) => l.mode === "break" || l.mode === "short");
      if (ref === "state:status") {
        if (s.alarm) return "!! FIRE · LOOP 1 !!";
        const f = st.findIndex((l) => l.mode === "break" || l.mode === "short");
        if (f >= 0) return `FAULT · LOOP ${f + 1} ${st[f].mode.toUpperCase()}`;
        return `NORMAL · EOL ${EOL} ${unit}`;
      }
      return undefined;
    },
    primaryValue() { return clamp(resistance(st[0]?.mode ?? "normal"), 0, max); },
    rotor: () => false,
  };
}

const ENGINES = { water: waterEngine, electrical: electricalEngine, "low-voltage": lowVoltageEngine };

/* ─────────────── editor + compiler loop ─────────────── */

const editor = $("#model-editor");
const statusEl = $("#editor-status");
const mount = $("#preview-mount");
const compilePill = $("#compile-pill");
const compileNote = $("#compile-note");

let currentPresetId = "water";
let currentModel = null;
let engine = null;
let history = [];

function compileFromEditor() {
  let model;
  try {
    model = JSON.parse(editor.value);
  } catch (e) {
    fail(`JSON: ${e.message}`);
    return;
  }
  try {
    const t0 = performance.now();
    const compiled = compileFrontPanelSvg(model, { title: PRESETS[currentPresetId].title, version: "1.0.0" });
    const ms = (performance.now() - t0).toFixed(1);
    mount.innerHTML = compiled.svg;
    renderAnchors(compiled.anchors);
    wireDeviceInteractions();
    currentModel = model;
    attachEngine(model);
    statusEl.className = "editor-status mono ok";
    statusEl.textContent = `✓ compiled in ${ms} ms · ${model.ports.length} ports · ${compiled.anchors.length} anchors`;
    compilePill.textContent = `COMPILED · ${ms} ms`;
    compileNote.textContent = `${compiled.viewBox.width}×${compiled.viewBox.height} viewBox · deterministic`;
  } catch (e) {
    fail(`model: ${e.message}`);
  }
}
function fail(msg) {
  statusEl.className = "editor-status mono err";
  statusEl.textContent = `✗ ${msg}`;
  compilePill.textContent = "COMPILE ERROR";
}

let debounceTimer;
editor.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(compileFromEditor, 350);
});

function renderAnchors(anchors) {
  const tbody = $("#anchor-table tbody");
  tbody.innerHTML = anchors
    .map(
      (a) =>
        `<tr><td>${a.kind}</td><td>${a.id}</td><td>${a.port ?? "—"}</td><td>${a.mmX.toFixed(1)}</td><td>${a.mmY.toFixed(1)}</td></tr>`,
    )
    .join("");
  $("#anchor-count").textContent = `(${anchors.length})`;
}

/* ─────────────── device interactions (tooltip + identify) ─────────────── */

const tooltip = $("#tooltip");
document.addEventListener("pointerover", (e) => {
  const port = e.target.closest?.(".port");
  if (!port || !currentModel) { tooltip.hidden = true; return; }
  const p = currentModel.ports.find((x) => x.id === port.dataset.port);
  if (!p) return;
  const phys = [p.physical?.kind, p.physical?.range].filter(Boolean).join(" · ");
  const sig = p.signal?.unit ? `${p.signal.minimum ?? 0}–${p.signal.maximum ?? "?"} ${p.signal.unit}` : p.signal?.dataType;
  tooltip.innerHTML = `<b>${port.dataset.terminal} · ${p.title}</b>${[phys, sig].filter(Boolean).join(" · ")}`;
  tooltip.hidden = false;
});
document.addEventListener("pointermove", (e) => {
  if (tooltip.hidden) return;
  tooltip.style.left = Math.min(e.clientX + 14, innerWidth - tooltip.offsetWidth - 14) + "px";
  tooltip.style.top = Math.min(e.clientY + 14, innerHeight - tooltip.offsetHeight - 14) + "px";
});

let identifyTimer;
function wireDeviceInteractions() {
  for (const btn of mount.querySelectorAll('[data-action="identify"]')) {
    const fire = () => {
      const dev = mount.querySelector(".device");
      dev?.classList.add("identifying");
      clearTimeout(identifyTimer);
      identifyTimer = setTimeout(() => dev?.classList.remove("identifying"), 3000);
    };
    btn.addEventListener("click", fire);
    btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
  }
}

/* ─────────────── simulation host ─────────────── */

function attachEngine(model) {
  const factory = ENGINES[PRESETS[currentPresetId].domain];
  engine = factory(model);
  history = [];
  $("#sim-title").textContent = engine.label;
  $("#sim-domain").textContent = engine.note;
  $("#sim-mapping").innerHTML =
    "plant ⇆ model &nbsp; " + engine.mapping.map(([k, v]) => `${k} → <b>${v}</b>`).join(" &nbsp;·&nbsp; ");
  const wrap = $("#sim-controls");
  wrap.innerHTML = "";
  for (const ctl of engine.controls) {
    if (ctl.kind === "range") {
      const label = document.createElement("label");
      label.className = "sp-label";
      label.innerHTML = `${ctl.label} <output>${ctl.get().toFixed(1)}</output> ${ctl.unit}`;
      const input = document.createElement("input");
      input.type = "range";
      input.min = ctl.min; input.max = ctl.max; input.step = ctl.step; input.value = ctl.get();
      input.addEventListener("input", () => { ctl.set(parseFloat(input.value)); label.querySelector("output").textContent = parseFloat(input.value).toFixed(1); });
      label.appendChild(input);
      wrap.appendChild(label);
    } else {
      const b = document.createElement("button");
      b.className = "btn btn-sm " + (ctl.danger ? "btn-danger" : ctl.kind === "toggle" ? "btn-primary" : "btn-ghost");
      b.addEventListener("click", () => ctl.on());
      b._ctl = ctl;
      wrap.appendChild(b);
    }
  }
}

const trendLine = $("#trend-line");
const trendFill = $("#trend-fill");
const trendLimit = $("#trend-limit");
const TREND_N = 240;

function renderFrame() {
  if (!engine || !currentModel) return;
  // text slots
  for (const el of mount.querySelectorAll("[data-bind]")) {
    const v = engine.value(el.dataset.bind);
    if (v === undefined) { el.textContent = "--"; continue; }
    el.textContent = typeof v === "number" ? v.toFixed(1) : typeof v === "boolean" ? (v ? "ON" : "OFF") : v;
  }
  // indicators
  const dev = mount.querySelector(".device");
  const defs = currentModel.faceplate?.indicators ?? [];
  for (const el of mount.querySelectorAll("[data-indicator]")) {
    const def = defs.find((d) => d.id === el.dataset.indicator);
    if (!def) continue;
    if (def.kind === "rotor") continue; // handled via root class
    const active = !!engine.value(def.binds);
    el.classList.remove("on-green", "on-blue", "on-amber", "on-red", "on-white");
    if (active) el.classList.add(`on-${def.color ?? "green"}`);
  }
  dev?.classList.toggle("running", !!engine.rotor());
  dev?.classList.toggle("alarm", !!engine.value("state:alarm"));
  // readouts
  const p = engine.primary;
  const v = engine.primaryValue();
  $("#sim-primary").textContent = `${v.toFixed(1)} ${p.unit}`;
  const status = engine.value("state:status") ?? "—";
  const statusOut = $("#sim-status");
  statusOut.textContent = status;
  statusOut.classList.toggle("alarm", !!engine.value("state:alarm"));
  // toggle/visible buttons
  for (const b of $("#sim-controls").querySelectorAll("button")) {
    const ctl = b._ctl;
    b.textContent = ctl.label();
    if (ctl.kind === "toggle") b.classList.toggle("armed", !!ctl.armed());
    if (ctl.visible) b.hidden = !ctl.visible();
  }
  // trend
  history.push(v);
  if (history.length > TREND_N) history.shift();
  if (history.length > 1) {
    const W = 560, H = 150;
    const y = (val) => H - (clamp(val - p.min, 0, p.max - p.min) / (p.max - p.min)) * (H - 12) - 6;
    const pts = history.map((val, i) => `${(i / (TREND_N - 1)) * W},${y(val).toFixed(1)}`);
    trendLine.setAttribute("points", pts.join(" "));
    trendFill.setAttribute("points", `0,${H} ${pts.join(" ")} ${((history.length - 1) / (TREND_N - 1)) * W},${H}`);
    if (p.limit !== undefined) {
      trendLimit.setAttribute("opacity", ".7");
      trendLimit.setAttribute("y1", y(p.limit)); trendLimit.setAttribute("y2", y(p.limit));
    } else trendLimit.setAttribute("opacity", "0");
  }
}

setInterval(() => {
  engine?.tick(0.12);
  renderFrame();
}, reducedMotion ? 500 : 120);

/* ─────────────── preset switching + boot ─────────────── */

async function selectPreset(id) {
  currentPresetId = id;
  for (const t of document.querySelectorAll(".ptab")) t.classList.toggle("active", t.dataset.preset === id);
  const model = await loadPresetModel(id);
  editor.value = JSON.stringify(model, null, 2);
  compileFromEditor();
}
for (const tab of document.querySelectorAll(".ptab")) {
  tab.addEventListener("click", () => selectPreset(tab.dataset.preset));
}
await selectPreset("water");
