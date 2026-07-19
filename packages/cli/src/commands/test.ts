import { resolvePackage } from "@open-device/core";
import { runSuite } from "@open-device/scenario";

export async function test(location: string): Promise<number> {
  const pkg = await resolvePackage(location, { mode: "source" });
  const { evidence, results } = await runSuite(pkg);

  for (const result of results) {
    console.log(`${result.result === "passed" ? "✔" : "✖"} ${result.id}`);
    for (const failure of result.failures ?? []) {
      console.log(`    ${failure}`);
    }
  }

  const evidenceUrl = new URL("evidence.json", pkg.baseUrl);
  await Bun.write(evidenceUrl, `${JSON.stringify(evidence, undefined, 2)}\n`);
  console.log(
    `\n${evidence.summary.passed}/${evidence.suite.scenarioCount} passed in ` +
      `${evidence.summary.durationMs} ms — evidence written to ${evidenceUrl.pathname}`,
  );
  console.log(`  manifest ${evidence.subject.manifestIntegrity}`);
  console.log(`  logic    ${evidence.subject.logicIntegrity}`);
  console.log(`  suite    ${evidence.suite.integrity}`);
  return evidence.result === "passed" ? 0 : 1;
}
