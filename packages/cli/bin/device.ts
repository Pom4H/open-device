#!/usr/bin/env bun
import { check } from "../src/commands/check.ts";
import { pack } from "../src/commands/pack.ts";
import { test } from "../src/commands/test.ts";

const USAGE = `Open Device CLI (pre-alpha)

Usage:
  device check <package-dir|manifest>   validate a source package
  device test  <package-dir|manifest>   run scenarios against packaged logic and write evidence
  device pack  <package-dir> [out-dir]  produce an integrity-pinned release in dist/
`;

const [command, target, extra] = Bun.argv.slice(2);

try {
  switch (command) {
    case "check":
      process.exit(await check(target ?? "."));
      break;
    case "test":
      process.exit(await test(target ?? "."));
      break;
    case "pack":
      process.exit(await pack(target ?? ".", extra));
      break;
    default:
      console.log(USAGE);
      process.exit(command === undefined || command === "help" ? 0 : 2);
  }
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && "diagnostics" in error) {
    for (const diagnostic of (error as { diagnostics: { path: string; message: string }[] }).diagnostics) {
      console.error(`  ${diagnostic.path}: ${diagnostic.message}`);
    }
  }
  process.exit(1);
}
