import { join, normalize } from "node:path";

import index from "./index.html";

const EXAMPLES_ROOT = new URL("../../examples/", import.meta.url).pathname;

function servePackageFile(request: Bun.BunRequest<"/packages/*">): Response | Promise<Response> {
  const relative = normalize(new URL(request.url).pathname.replace("/packages/", ""));
  if (relative.startsWith("..") || relative.startsWith("/")) {
    return new Response("forbidden", { status: 403 });
  }
  const file = Bun.file(join(EXAMPLES_ROOT, relative));
  return file.exists().then((exists) =>
    exists ? new Response(file) : new Response("not found", { status: 404 }),
  );
}

const server = Bun.serve({
  port: Number(process.env["PORT"] ?? 8787),
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/packages/*": servePackageFile,
  },
});

console.log(`Open Device playground → ${server.url}`);
