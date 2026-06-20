import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Finding, FileReport } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to a fixture under test/fixtures. */
export function fixturePath(...parts: string[]): string {
  return join(here, "fixtures", ...parts);
}

/** Read a fixture file's contents. */
export function readFixture(...parts: string[]): string {
  return readFileSync(fixturePath(...parts), "utf-8");
}

/** True if any finding has the given ruleId. */
export function hasRule(findings: readonly Finding[], ruleId: string): boolean {
  return findings.some((f) => f.ruleId === ruleId);
}

/** All ruleIds present in a report's findings. */
export function ruleIds(report: FileReport): string[] {
  return report.findings.map((f) => f.ruleId);
}
