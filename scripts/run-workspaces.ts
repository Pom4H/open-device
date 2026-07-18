import { dirname, resolve } from "node:path";

interface WorkspacePackage {
  name?: string;
  scripts?: Record<string, string>;
}

const task = Bun.argv[2];
const requestedPackage = Bun.argv[3];

if (task === undefined) {
  console.error("Usage: bun scripts/run-workspaces.ts <task> [package-name]");
  process.exit(2);
}

const packageFiles = new Set<string>();
for (const pattern of [
  "apps/*/package.json",
  "packages/*/package.json",
  "profiles/*/package.json",
  "examples/*/package.json",
]) {
  for await (const path of new Bun.Glob(pattern).scan({ cwd: process.cwd() })) {
    packageFiles.add(path);
  }
}

let executed = 0;
for (const packageFile of [...packageFiles].sort()) {
  const manifest = (await Bun.file(packageFile).json()) as WorkspacePackage;
  if (requestedPackage !== undefined && manifest.name !== requestedPackage) continue;
  if (manifest.scripts?.[task] === undefined) continue;

  executed += 1;
  console.log(`\n${manifest.name ?? packageFile}: ${task}`);
  const child = Bun.spawn(["bun", "run", task], {
    cwd: resolve(dirname(packageFile)),
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) process.exit(exitCode);
}

if (executed === 0) {
  const scope = requestedPackage === undefined ? "workspace" : requestedPackage;
  console.log(`No ${task} script is defined in ${scope} yet.`);
}
