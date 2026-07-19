// Stages the playground: bundles the core SVG compiler for the browser and
// copies the model presets. The water preset is the real pump-controller
// example package model — the playground consumes it like any other consumer.
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

await Bun.write(
  here("./public/presets/water-pump.json"),
  Bun.file(here("../../examples/pump-controller/model/device-model.json")),
);
await Bun.write(here("./public/presets/electrical-feeder.json"), Bun.file(here("./presets/electrical-feeder.json")));
await Bun.write(here("./public/presets/fire-loop.json"), Bun.file(here("./presets/fire-loop.json")));

console.log("staged: public/core-svg.mjs, public/presets/");
