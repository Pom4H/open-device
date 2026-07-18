import { dirname, extname, resolve } from "node:path";

const repositoryRoot = process.cwd();
const errors: string[] = [];
const files = new Set<string>();

for (const pattern of [
  "*.md",
  "*.json",
  ".github/**/*.md",
  ".github/**/*.json",
  "apps/**/*.md",
  "apps/**/*.json",
  "packages/**/*.md",
  "packages/**/*.json",
  "profiles/**/*.md",
  "profiles/**/*.json",
  "examples/**/*.md",
  "examples/**/*.json",
  "docs/**/*.md",
  "docs/**/*.json",
]) {
  for await (const path of new Bun.Glob(pattern).scan({ cwd: repositoryRoot })) {
    files.add(path);
  }
}

const packageNames = new Map<string, string>();
for (const path of [...files].sort()) {
  if (extname(path) !== ".json") continue;
  try {
    const value = (await Bun.file(path).json()) as { name?: unknown };
    if (path.endsWith("package.json") && typeof value.name === "string") {
      const previous = packageNames.get(value.name);
      if (previous !== undefined) {
        errors.push(`${path}: duplicate package name ${value.name} (also in ${previous})`);
      } else {
        packageNames.set(value.name, path);
      }
    }
  } catch (error) {
    errors.push(`${path}: invalid JSON: ${String(error)}`);
  }
}

const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
for (const path of [...files].sort()) {
  if (extname(path) !== ".md") continue;
  const source = await Bun.file(path).text();
  for (const match of source.matchAll(markdownLink)) {
    const rawTarget = match[1]?.trim();
    if (rawTarget === undefined || rawTarget === "") continue;

    const target = rawTarget.startsWith("<") && rawTarget.endsWith(">")
      ? rawTarget.slice(1, -1)
      : rawTarget.split(/\s+/, 1)[0] ?? rawTarget;
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;

    const withoutFragment = target.split("#", 1)[0];
    if (withoutFragment === undefined || withoutFragment === "") continue;

    const decoded = decodeURIComponent(withoutFragment);
    const linkedPath = resolve(repositoryRoot, dirname(path), decoded);
    if (!(await Bun.file(linkedPath).exists())) {
      errors.push(`${path}: missing relative link target ${target}`);
    }
  }
}

for (const required of [
  "README.md",
  "AGENTS.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/architecture.md",
  "docs/package-format.md",
  "docs/runtime-abi.md",
  "docs/security-model.md",
]) {
  if (!(await Bun.file(resolve(repositoryRoot, required)).exists())) {
    errors.push(`missing required file ${required}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Documentation check passed: ${files.size} files, ${packageNames.size} packages.`);
