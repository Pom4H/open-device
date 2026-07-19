// Minimal static dev server for the playground. No bundler, no framework.
// Usage: bun run serve.ts  (or `bun run dev` from this directory)

const root = new URL("./public/", import.meta.url).pathname;

const server = Bun.serve({
  port: Number(process.env.PORT ?? 4174),
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = Bun.file(root + pathname.slice(1));
    if (await file.exists()) return new Response(file);
    return new Response("Not found", { status: 404 });
  },
});

console.log(`open-device playground → http://localhost:${server.port}`);
