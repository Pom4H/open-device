// Stages the static site: bundles the core SVG compiler for the browser and
// copies the example package into public/pkg/ so the page consumes it exactly
// like any other Open Device consumer would (manifest → model → compiled SVG).
// Usage: bun run build.ts

const here = (p: string) => new URL(p, import.meta.url).pathname;

const result = await Bun.build({
  entrypoints: [here("../../packages/core/src/svg.ts")],
  target: "browser",
  format: "esm",
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
await Bun.write(here("./public/core-svg.mjs"), await result.outputs[0].text());

const pkg = "../../examples/pump-controller/";
await Bun.write(here("./public/pkg/open-device.json"), Bun.file(here(pkg + "open-device.json")));
await Bun.write(here("./public/pkg/model/device-model.json"), Bun.file(here(pkg + "model/device-model.json")));

console.log("staged: public/core-svg.mjs, public/pkg/ (from examples/pump-controller)");
