/* ═══════════════ Open Device landing — one live digital twin drives the whole page ═══════════════
 *
 * The device is not drawn anywhere on this page. The page resolves the example
 * package the way any consumer would — open-device.json → model/device-model.json —
 * and compiles the front panel with @open-device/core. One simulated instance
 * (state + naive process physics) then drives every projection: hero, catalog
 * card, docs embed, engineering view, simulation, SCADA mimic, scenario runner.
 * No frameworks — plain DOM, SVG, and Web Crypto.
 */

import { compileFrontPanelSvg } from "./core-svg.mjs";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

async function loadPackage() {
  // Single-file builds embed the package; the static site fetches it like a
  // real consumer, resolving the model artifact relative to the manifest.
  const inline = document.getElementById("device-package");
  if (inline) return JSON.parse(inline.textContent);
  const base = new URL("./pkg/", location.href);
  const manifest = await (await fetch(new URL("open-device.json", base))).json();
  const model = await (await fetch(new URL(manifest.model.href, base))).json();
  return { manifest, model };
}
const { manifest, model } = await loadPackage();
const compiled = compileFrontPanelSvg(model, { title: manifest.title, version: manifest.version });

/* ─────────────── twin state + process model ─────────────── */

const twin = {
  pump: false,
  setpoint: 6.5,
  pressure: 1.2,
  flow: 0,
  alarm: false,
  tripped: false,
  identify: false,
  speed: 1, // scenario runner accelerates time
  history: [],
  TRIP: 8.5,
  listeners: [],
  onTick(fn) { this.listeners.push(fn); },

  startPump() {
    if (this.tripped) return false;
    this.pump = true;
    return true;
  },
  stopPump() { this.pump = false; },
  setSetpoint(v) { this.setpoint = Math.min(9.5, Math.max(2, v)); },
  ack() {
    if (this.pressure < this.TRIP) { this.alarm = false; this.tripped = false; return true; }
    return false;
  },
  ping() {
    this.identify = true;
    clearTimeout(this._idTimer);
    this._idTimer = setTimeout(() => { this.identify = false; }, 3000);
  },

  tick(dt) {
    const noise = (Math.random() - 0.5) * 0.05;
    if (this.pump) {
      const target = this.setpoint * 1.03;
      this.pressure += (target - this.pressure) * 0.55 * dt + noise;
      this.flow += (12 * (this.pressure / 10) - this.flow) * 0.8 * dt;
    } else {
      this.pressure += (1.2 - this.pressure) * 0.28 * dt + noise * 0.4;
      this.flow += (0 - this.flow) * 2.2 * dt;
    }
    this.pressure = Math.max(0, this.pressure);
    // overpressure interlock: trip latches until operator ACK
    if (this.pressure > this.TRIP && this.pump) {
      this.pump = false;
      this.tripped = true;
      this.alarm = true;
    }
    this.history.push(this.pressure);
    if (this.history.length > 240) this.history.shift();
  },
};

/* ─────────────── mount the compiled panel everywhere ─────────────── */

for (const mount of document.querySelectorAll(".device-mount")) {
  mount.innerHTML = compiled.svg;
}
const devices = [...document.querySelectorAll(".device")];

/* ─────────────── terminal tooltips, generated from the model ─────────────── */

const terminalInfo = new Map();
for (const port of model.ports) {
  for (const t of port.terminals ?? []) {
    const phys = [port.physical?.kind, port.physical?.range].filter(Boolean).join(" · ");
    const sig = port.signal?.unit
      ? `${port.signal.minimum ?? 0}–${port.signal.maximum ?? "?"} ${port.signal.unit}`
      : port.signal?.dataType;
    terminalInfo.set(`${port.id}:${t.label}`, {
      name: `${t.label} · ${port.title}`,
      body: [phys, sig].filter(Boolean).join(" · "),
    });
  }
}

const tooltip = document.getElementById("tooltip");
document.addEventListener("pointerover", (e) => {
  const port = e.target.closest?.(".port");
  if (!port) { tooltip.hidden = true; return; }
  const info = terminalInfo.get(`${port.dataset.port}:${port.dataset.terminal}`);
  if (!info) return;
  tooltip.innerHTML = `<b>${info.name}</b>${info.body}`;
  tooltip.hidden = false;
});
document.addEventListener("pointermove", (e) => {
  if (tooltip.hidden) return;
  const pad = 14;
  const x = Math.min(e.clientX + pad, innerWidth - tooltip.offsetWidth - pad);
  const y = Math.min(e.clientY + pad, innerHeight - tooltip.offsetHeight - pad);
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
});

/* ─────────────── shared interactions ─────────────── */

const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

// IDENTIFY on any clone pings every clone — one twin, many projections.
for (const btn of document.querySelectorAll('[data-action="identify"]')) {
  const fire = () => {
    twin.ping();
    showToast("IDENTIFY — every projection of this twin is the same instance");
  };
  btn.addEventListener("click", fire);
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
}

// pump toggles + setpoint sliders (simulation and SCADA share the twin)
const pumpButtons = [...document.querySelectorAll("[data-pump-toggle]")];
for (const b of pumpButtons) {
  b.addEventListener("click", () => {
    if (twin.pump) { twin.stopPump(); }
    else if (!twin.startPump()) { showToast("Interlock latched — ACK the alarm in SCADA first"); }
  });
}
const spInputs = [...document.querySelectorAll("[data-setpoint]")];
for (const input of spInputs) {
  input.addEventListener("input", () => twin.setSetpoint(parseFloat(input.value)));
}
document.querySelector("[data-provoke]")?.addEventListener("click", () => {
  twin.setSetpoint(9.5);
  twin.startPump();
  showToast("Setpoint forced to 9.5 bar — watch the interlock at 8.5");
});
document.querySelector("[data-ack]")?.addEventListener("click", () => {
  if (twin.ack()) showToast("Alarm acknowledged — restart permitted");
  else showToast("Cannot ACK while pressure is above the trip limit");
});
document.querySelector("[data-add-to-project]")?.addEventListener("click", () => {
  showToast("Added @acme/pump-controller@1.0.0 — digest pinned");
});

/* ─────────────── layer spotlight (file tree + hero chips) ─────────────── */

for (const el of document.querySelectorAll("[data-layer-link]")) {
  const layer = el.dataset.layerLink;
  el.addEventListener("pointerenter", () => {
    for (const dev of devices) {
      if (layer === "scenarios" || layer === "manifest") { dev.classList.add("spot-all"); continue; }
      dev.classList.add("spot");
      for (const g of dev.querySelectorAll(`[data-layer="${layer}"]`)) g.classList.add("lit");
    }
  });
  el.addEventListener("pointerleave", () => {
    for (const dev of devices) {
      dev.classList.remove("spot", "spot-all");
      for (const g of dev.querySelectorAll(".lit")) g.classList.remove("lit");
    }
  });
}

/* ─────────────── engineering: table row ⇄ terminal highlight ─────────────── */

for (const row of document.querySelectorAll("[data-port-link]")) {
  const ids = row.dataset.portLink.split(/\s+/);
  const targets = () => devices.flatMap((d) => ids.flatMap((id) => [...d.querySelectorAll(`.port[data-port="${id}"]`)]));
  row.addEventListener("pointerenter", () => targets().forEach((p) => p.classList.add("hot")));
  row.addEventListener("pointerleave", () => targets().forEach((p) => p.classList.remove("hot")));
}

/* ─────────────── hero parallax tilt ─────────────── */

const heroStage = document.getElementById("hero-stage");
const heroTilt = document.getElementById("hero-tilt");
if (heroStage && heroTilt && !reducedMotion) {
  heroStage.addEventListener("pointermove", (e) => {
    const r = heroStage.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    heroTilt.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
  });
  heroStage.addEventListener("pointerleave", () => { heroTilt.style.transform = ""; });
}

/* ─────────────── journey tabs ─────────────── */

const tabs = [...document.querySelectorAll(".jtab")];
const panels = [...document.querySelectorAll(".jpanel")];
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const t of tabs) { t.classList.toggle("active", t === tab); t.setAttribute("aria-selected", String(t === tab)); }
    for (const p of panels) p.classList.toggle("active", p.dataset.panelId === tab.dataset.panel);
  });
}

/* ─────────────── scroll reveal ─────────────── */

const io = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
}, { threshold: 0.15 });
for (const el of document.querySelectorAll(".reveal")) io.observe(el);

/* ─────────────── render bindings ─────────────── */

const $$ = (sel) => [...document.querySelectorAll(sel)];
const bind = {
  pressure: $$('[data-bind="port:pressure"]'),
  pressureBig: $$(".twin-pressure-big"),
  pressureScada: $$(".twin-pressure-scada"),
  lcdStatus: $$('[data-bind="state:status"]'),
  statusline: $$(".twin-statusline"),
  spOut: $$(".twin-sp-out"),
  spScada: $$(".twin-sp-scada"),
  flow: $$(".twin-flow"),
  level: $$(".twin-level"),
  ledPwr: $$('[data-indicator="pwr"]'),
  ledNet: $$('[data-indicator="net"]'),
  ledIo: $$('[data-indicator="io"]'),
};
const chartLine = document.getElementById("chart-line");
const chartFill = document.getElementById("chart-fill");
const chartSp = document.getElementById("chart-sp");
const chartTrip = document.getElementById("chart-trip");
const tankLiquid = document.getElementById("tank-liquid");
const tankWave = document.getElementById("tank-wave");
const scadaWrap = document.querySelector(".scada-wrap");
const scadaAlarm = document.getElementById("scada-alarm");

const CHART_W = 560, CHART_H = 190, P_MAX = 10;
const yOf = (p) => CHART_H - (Math.min(p, P_MAX) / P_MAX) * (CHART_H - 12) - 6;

let wavePhase = 0;

function render() {
  const p = twin.pressure;
  const pTxt = p.toFixed(1);
  const spTxt = twin.setpoint.toFixed(1);
  const status = twin.alarm
    ? "!! OVERPRESSURE TRIP !!"
    : twin.pump ? `PUMP RUN · SP ${spTxt}` : `STANDBY · SP ${spTxt}`;

  for (const el of bind.pressure) el.textContent = pTxt;
  for (const el of bind.pressureBig) el.textContent = `${pTxt} bar`;
  for (const el of bind.pressureScada) el.textContent = `${pTxt} bar`;
  for (const el of bind.lcdStatus) el.textContent = status;
  for (const el of bind.statusline) el.textContent = `LIVE · ${pTxt} bar · ${twin.alarm ? "ALARM" : twin.pump ? "PUMP ON" : "STANDBY"}`;
  for (const el of bind.spOut) el.textContent = spTxt;
  for (const el of bind.spScada) el.textContent = spTxt;
  for (const el of bind.flow) el.textContent = `flow ${twin.flow.toFixed(1)} m³/h`;
  for (const el of bind.level) el.textContent = `${Math.round((p / P_MAX) * 100)} %`;

  for (const dev of devices) {
    dev.classList.toggle("running", twin.pump);
    dev.classList.toggle("alarm", twin.alarm);
    dev.classList.toggle("identifying", twin.identify);
  }
  for (const el of bind.ledPwr) el.classList.add("on-green");
  for (const el of bind.ledNet) { el.classList.add("blink-blue"); }
  for (const el of bind.ledIo) {
    el.classList.toggle("on-red", twin.alarm);
    el.classList.toggle("on-amber", twin.pump && !twin.alarm);
  }
  for (const b of pumpButtons) {
    b.textContent = twin.pump ? "STOP PUMP" : "START PUMP";
    b.classList.toggle("stop", twin.pump);
  }
  for (const input of spInputs) {
    if (document.activeElement !== input) input.value = twin.setpoint;
  }

  // trend chart
  if (chartLine && twin.history.length > 1) {
    const n = twin.history.length;
    const pts = twin.history.map((v, i) => `${(i / 239) * CHART_W},${yOf(v).toFixed(1)}`);
    chartLine.setAttribute("points", pts.join(" "));
    const x0 = 0, xN = ((n - 1) / 239) * CHART_W;
    chartFill.setAttribute("points", `${x0},${CHART_H} ${pts.join(" ")} ${xN},${CHART_H}`);
    chartSp.setAttribute("y1", yOf(twin.setpoint)); chartSp.setAttribute("y2", yOf(twin.setpoint));
    chartTrip.setAttribute("y1", yOf(twin.TRIP)); chartTrip.setAttribute("y2", yOf(twin.TRIP));
  }

  // scada mimic
  if (scadaWrap) {
    scadaWrap.classList.toggle("flowing", twin.pump && twin.flow > 0.4);
    scadaWrap.classList.toggle("running", twin.pump);
    scadaWrap.classList.toggle("alarm", twin.alarm);
    scadaAlarm.hidden = !twin.alarm;
    const frac = Math.min(p / P_MAX, 1);
    const H = 238, top = 96;
    const h = Math.max(4, frac * H);
    tankLiquid.setAttribute("y", (top + H - h).toFixed(1));
    tankLiquid.setAttribute("height", h.toFixed(1));
    if (!reducedMotion) {
      wavePhase += 0.15;
      const yw = top + H - h;
      const a = twin.pump ? 3.2 : 1.2;
      let d = `M646 ${yw.toFixed(1)}`;
      for (let x = 0; x <= 158; x += 8) {
        d += ` L${646 + x} ${(yw + Math.sin(wavePhase + x / 18) * a).toFixed(1)}`;
      }
      d += ` L804 ${yw + 8} L646 ${yw + 8} Z`;
      tankWave.setAttribute("d", d);
    }
  }
}

/* ─────────────── main loop ─────────────── */

const DT = 0.12;
setInterval(() => {
  twin.tick(DT * twin.speed);
  render();
}, 120);
render();

/* ─────────────── scenario runner → digest-bound evidence ─────────────── */

const runBtn = document.getElementById("run-scenarios");
const scLog = document.getElementById("sc-log");
const scItems = Object.fromEntries($$("#sc-list li").map((li) => [li.dataset.sc, li]));
let running = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
function slog(cls, msg) {
  const t = (performance.now() / 1000).toFixed(2).padStart(7, "0");
  logLines.push(`[${t}] ${msg}`);
  const line = document.createElement("div");
  line.innerHTML = `<span class="t">${t}</span><span class="${cls}">${msg}</span>`;
  scLog.appendChild(line);
  scLog.scrollTop = scLog.scrollHeight;
}
function mark(id, state, icon) {
  const li = scItems[id];
  li.classList.remove("running", "pass", "fail");
  if (state) li.classList.add(state);
  li.querySelector("i").textContent = icon;
}
async function waitFor(cond, timeoutMs, label) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (cond()) return true;
    await sleep(80);
  }
  slog("warn", `timeout waiting: ${label}`);
  return false;
}

async function runSuite() {
  if (running) return;
  running = true;
  runBtn.disabled = true;
  runBtn.textContent = "RUNNING…";
  scLog.textContent = "";
  logLines.length = 0;
  for (const id of Object.keys(scItems)) mark(id, "", "○");
  document.getElementById("evidence-body").hidden = true;
  document.getElementById("evidence-empty").hidden = false;
  document.getElementById("evidence-card").classList.remove("sealed");

  twin.speed = 4; // accelerate the deterministic clock for the demo
  slog("act", "runner attach · clock ×4 · artifacts digest-checked");

  // 1 — cold-start interlock
  mark("boot", "running", "●");
  slog("act", "scenario cold-start: reset outputs, observe 1 s");
  twin.stopPump(); twin.alarm = false; twin.tripped = false; twin.setSetpoint(6.5);
  await sleep(900);
  const bootOk = !twin.pump && twin.pressure < 4;
  mark("boot", bootOk ? "pass" : "fail", bootOk ? "✓" : "✗");
  slog(bootOk ? "ok" : "warn", `assert pump=off pressure<4.0 → ${bootOk ? "PASS" : "FAIL"}`);

  // 2 — reach setpoint
  mark("reach", "running", "●");
  slog("act", "scenario closed-loop: SP=6.5, cmd START via DO1");
  twin.setSetpoint(6.5); twin.startPump();
  const reached = await waitFor(() => Math.abs(twin.pressure - 6.5) < 0.4, 9000, "|PT-101 − SP| < 0.4");
  mark("reach", reached ? "pass" : "fail", reached ? "✓" : "✗");
  slog(reached ? "ok" : "warn", `assert |PV−SP|<0.4 within window → ${reached ? "PASS" : "FAIL"} (PV ${twin.pressure.toFixed(2)})`);

  // 3 — overpressure trip
  mark("trip", "running", "●");
  slog("act", "scenario overpressure: force SP=9.5, expect trip at 8.5");
  twin.setSetpoint(9.5);
  const tripped = await waitFor(() => twin.alarm && !twin.pump, 9000, "interlock trip");
  mark("trip", tripped ? "pass" : "fail", tripped ? "✓" : "✗");
  slog(tripped ? "ok" : "warn", `assert alarm latched ∧ DO1=off → ${tripped ? "PASS" : "FAIL"}`);

  // 4 — recovery
  mark("recover", "running", "●");
  slog("act", "scenario recovery: wait PV < trip, operator ACK, restart");
  twin.setSetpoint(6.5);
  await waitFor(() => twin.pressure < twin.TRIP - 0.3, 9000, "pressure decay");
  const acked = twin.ack();
  const restarted = acked && twin.startPump();
  mark("recover", restarted ? "pass" : "fail", restarted ? "✓" : "✗");
  slog(restarted ? "ok" : "warn", `assert ACK clears latch ∧ restart accepted → ${restarted ? "PASS" : "FAIL"}`);

  twin.speed = 1;
  const allPass = bootOk && reached && tripped && restarted;
  slog(allPass ? "ok" : "warn", allPass ? "suite PASS 4/4 — sealing evidence" : "suite finished with failures");

  // digest the actual run log with Web Crypto — real, not decorative
  const data = new TextEncoder().encode(logLines.join("\n"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  document.getElementById("evidence-digest").textContent = `run-log@sha256:${hex.slice(0, 12)}…${hex.slice(-4)}`;
  document.getElementById("evidence-empty").hidden = true;
  document.getElementById("evidence-body").hidden = false;
  if (allPass) document.getElementById("evidence-card").classList.add("sealed");
  slog("ok", `evidence sha256:${hex.slice(0, 16)}…`);

  runBtn.disabled = false;
  runBtn.textContent = "▶ RUN AGAIN";
  running = false;
}
runBtn?.addEventListener("click", runSuite);
