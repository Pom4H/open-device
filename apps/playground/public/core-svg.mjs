// ../../packages/core/src/svg.ts
var SCALE = 2;
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var r = (n) => Math.round(n * 10) / 10;
function compileFrontPanelSvg(model, opts = {}) {
  const face = model.faceplate;
  if (!face)
    throw new Error("model has no faceplate block; nothing to compile");
  if (face.units !== "mm")
    throw new Error(`unsupported faceplate units: ${face.units}`);
  if (!face.enclosure || !(face.enclosure.width > 0) || !(face.enclosure.height > 0)) {
    throw new Error("faceplate.enclosure needs positive width and height (mm)");
  }
  if (face.enclosure.width < 80 || face.enclosure.height < 60) {
    throw new Error("enclosure smaller than 80 × 60 mm cannot fit the v0.1 panel layout");
  }
  if (face.display && face.enclosure.height < 120) {
    throw new Error("a display needs an enclosure at least 120 mm tall in the v0.1 layout");
  }
  const eW = face.enclosure.width * SCALE;
  const eH = face.enclosure.height * SCALE;
  const eX = 30;
  const eY = 10;
  const rx = (face.enclosure.cornerRadius ?? 8) * SCALE;
  const vbW = eW + 60;
  const vbH = eH + 22;
  const anchors = [];
  const mm = (px, axis) => r((px - (axis === "x" ? eX : eY)) / SCALE);
  const mounts = face.mounting ?? [];
  const panelMount = mounts.find((m) => m.type === "panel-cutout");
  const dinMount = mounts.find((m) => m.type === "din-rail-35");
  let ears = "";
  if (panelMount) {
    const earW = 30;
    const earH = eH * 0.32;
    const earY = eY + (eH - earH) / 2;
    const screwOffsets = [earY + earH * 0.25, earY + earH * 0.75];
    const screw = (cx, cy) => `<circle cx="${r(cx)}" cy="${r(cy)}" r="6.5" fill="#b7c2ca" stroke="#8b98a2"/>` + `<path d="M${r(cx - 4)} ${r(cy)}h8M${r(cx)} ${r(cy - 4)}v8" stroke="#7c8892" stroke-width="1.4"/>`;
    let screws = "";
    let n = 0;
    for (const cx of [eX - 11, eX + eW + 11]) {
      for (const cy of screwOffsets) {
        screws += screw(cx, cy);
        anchors.push({ kind: "mount", id: `${panelMount.id}-${n++}`, x: r(cx), y: r(cy), mmX: mm(cx, "x"), mmY: mm(cy, "y") });
      }
    }
    ears = `<g data-mount="${esc(panelMount.id)}">` + `<rect x="${eX - 26}" y="${r(earY)}" width="${earW}" height="${r(earH)}" rx="7" fill="url(#g-encl)" stroke="#9aa7b1"/>` + `<rect x="${eX + eW - 4}" y="${r(earY)}" width="${earW}" height="${r(earH)}" rx="7" fill="url(#g-encl)" stroke="#9aa7b1"/>` + screws + `</g>`;
  }
  if (dinMount) {
    anchors.push({
      kind: "mount",
      id: dinMount.id,
      x: r(eX + eW / 2),
      y: r(eY + eH / 2),
      mmX: face.enclosure.width / 2,
      mmY: face.enclosure.height / 2
    });
  }
  const product = face.branding?.product ?? "";
  const brandSub = [face.branding?.modelCode, opts.title?.toUpperCase()].filter(Boolean).join(" · ");
  const brandSubX = 58 + Math.max(product.length, 4) * 10.4 + 14;
  const brand = `<g data-layer="view">` + (product ? `<text x="58" y="46" class="dev-brand">${esc(product)}</text>` : "") + (brandSub ? `<text x="${r(brandSubX)}" y="46" class="dev-brand-sub">${esc(brandSub)}</text>` : "") + (opts.version ? `<text x="${eX + eW - 20}" y="46" text-anchor="end" class="dev-ver">v${esc(opts.version)}</text>` : "") + `</g>`;
  const panelX = eX + 26;
  const panelW = eW - 52;
  const panelY = eY + 48;
  const stripH = 46;
  const panelH = eY + eH - 18 - stripH - 10 - panelY;
  let lcdFrame = "";
  let lcdContent = "";
  if (face.display) {
    const lx = panelX + 16;
    const ly = panelY + 16;
    const lw = Math.round(panelW * 0.575);
    const lh = panelH - 66;
    const box = `x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="9"`;
    lcdFrame = `<rect ${box} fill="url(#g-lcd)" stroke="#153a33"/>`;
    const overlay = `<rect ${box} fill="url(#p-scan)" pointer-events="none"/>` + `<rect ${box} fill="url(#g-glass)" pointer-events="none"/>`;
    let titleIndex = 0;
    let statusIndex = 0;
    for (const line of face.display.lines) {
      const bind = line.binds ? ` data-bind="${esc(line.binds)}"` : "";
      if (line.role === "title") {
        lcdContent += `<text x="${lx + 14}" y="${ly + 26 + titleIndex++ * 22}" class="lcd-title">${esc(line.text ?? "")}</text>`;
      } else if (line.role === "value") {
        const port = model.ports.find((p) => `port:${p.id}` === line.binds);
        const unit = line.showUnit && port?.signal?.unit ? `<tspan class="lcd-unit" dx="8">${esc(port.signal.unit)}</tspan>` : "";
        lcdContent += `<text x="${lx + 14}" y="${ly + lh - 36}" class="lcd-value"><tspan${bind}>--.-</tspan>${unit}</text>`;
      } else {
        lcdContent += `<text x="${lx + 14}" y="${ly + lh - 12 - statusIndex++ * 18}" class="lcd-status"${bind}>—</text>`;
      }
    }
    lcdContent = `<g data-layer="logic">${lcdContent}</g>${overlay}`;
  }
  let leds = "";
  let rotor = "";
  let ledIndex = 0;
  for (const ind of face.indicators ?? []) {
    if (ind.kind === "led") {
      const cy = panelY + 34 + ledIndex++ * 30;
      const cx = panelX + panelW - 102;
      leds += `<circle class="led" data-indicator="${esc(ind.id)}" cx="${cx}" cy="${cy}" r="7"/>` + `<text x="${cx + 16}" y="${cy + 4}" class="led-label">${esc(ind.label)}</text>`;
    } else {
      const cx = panelX + panelW - 82;
      const cy = panelY + panelH - 31;
      rotor = `<g data-layer="view"><circle cx="${cx}" cy="${cy}" r="17" fill="#0a1a16" stroke="#1f4a40"/></g>` + `<g data-layer="logic"><g class="twin-impeller" data-indicator="${esc(ind.id)}">` + `<path d="M${cx} ${cy} L${cx} ${cy - 14} A14 14 0 0 1 ${cx + 12} ${cy - 6} Z" fill="#38bfa0"/>` + `<path d="M${cx} ${cy} L${cx + 10} ${cy + 10} A14 14 0 0 1 ${cx - 4} ${cy + 14} Z" fill="#2c9b82"/>` + `<path d="M${cx} ${cy} L${cx - 12} ${cy + 5} A14 14 0 0 1 ${cx - 12} ${cy - 9} Z" fill="#2c9b82"/>` + `</g></g>` + `<g data-layer="view"><text x="${cx + 26}" y="${cy + 4}" class="led-label">${esc(ind.label)}</text></g>`;
    }
  }
  let controls = "";
  let controlX = panelX + 30;
  for (const ctl of face.controls ?? []) {
    const w = 52 + ctl.label.length * 7.5;
    controls += `<g class="dev-identify" data-control="${esc(ctl.id)}" data-action="${esc(ctl.action)}" role="button" tabindex="0" aria-label="${esc(ctl.label)}">` + `<rect x="${r(controlX)}" y="${panelY + panelH - 40}" width="${r(w)}" height="30" rx="15" fill="#0e2431" stroke="#2b6e5d"/>` + `<circle cx="${r(controlX + 17)}" cy="${panelY + panelH - 25}" r="5" fill="none" stroke="#55e6c1" stroke-width="1.6"/>` + `<text x="${r(controlX + 29)}" y="${panelY + panelH - 21}" class="identify-label">${esc(ctl.label)}</text>` + `</g>`;
    controlX += w + 12;
  }
  const strips = face.strips ?? [];
  let terminals = "";
  if (strips.length > 0) {
    const strip = strips[0];
    const stripX = panelX;
    const stripW = panelW;
    const stripY = eY + eH - 18 - stripH;
    const pitch = strip.pitch * SCALE;
    const owned = model.ports.flatMap((p) => (p.terminals ?? []).filter((t) => t.strip === strip.id).map((t) => ({ port: p, t }))).sort((a, b) => a.t.index - b.t.index);
    const span = (owned.length - 1) * pitch + 30;
    const startX = stripX + (stripW - span) / 2;
    let cells = "";
    for (const { port, t } of owned) {
      const x = startX + t.index * pitch;
      const cx = x + 15;
      const cy = stripY + 19;
      cells += `<g class="port" data-port="${esc(port.id)}" data-terminal="${esc(t.label)}">` + `<rect x="${r(x)}" y="${stripY + 8}" width="30" height="22" rx="4"/>` + `<circle cx="${r(cx)}" cy="${cy}" r="5"/>` + `<text x="${r(cx)}" y="${stripY + 42}">${esc(t.label)}</text>` + `</g>`;
      anchors.push({ kind: "terminal", id: t.label, port: port.id, x: r(cx), y: cy, mmX: mm(cx, "x"), mmY: mm(cy, "y") });
    }
    terminals = `<g data-layer="model" class="terminals">` + `<rect x="${stripX}" y="${stripY}" width="${stripW}" height="${stripH}" rx="9" fill="#18242d" stroke="#28353f"/>` + cells + `</g>`;
  }
  const svg = `<svg class="device" viewBox="0 0 ${vbW} ${vbH}" role="img" ` + `aria-label="${esc([product, opts.title].filter(Boolean).join(" "))} front panel — compiled from the device model">` + `<g data-layer="model">${ears}` + `<rect class="dev-shell" x="${eX}" y="${eY}" width="${eW}" height="${eH}" rx="${r(rx + 2)}" fill="url(#g-encl)" stroke="#93a1ac" filter="url(#f-soft)"/>` + `<rect x="${eX + 11}" y="${eY + 11}" width="${eW - 22}" height="${eH - 22}" rx="${r(rx * 0.75)}" fill="url(#g-encl-inner)" stroke="#b9c4cc"/>` + `</g>` + brand + `<g data-layer="view">` + `<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="13" fill="url(#g-panel)" stroke="#243542"/>` + lcdFrame + leds + controls + `</g>` + lcdContent + rotor + terminals + `</svg>`;
  return { svg, viewBox: { width: vbW, height: vbH }, anchors };
}
function computeAnchors(model, opts = {}) {
  return compileFrontPanelSvg(model, opts).anchors;
}
export {
  computeAnchors,
  compileFrontPanelSvg
};
