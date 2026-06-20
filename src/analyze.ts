/**
 * Analyzer — the central orchestration layer. Parses, lints, security-scans,
 * and grades one file or a set of files, and runs cross-file rules
 * (duplicate names).
 *
 * This module is pure with respect to the filesystem when given content
 * directly (`analyzeContent`); `analyzePaths` reads files for convenience.
 */

import { readFileSync } from "node:fs";
import type {
  AnalysisReport,
  AnalyzeOptions,
  FileReport,
  Finding,
  ParsedFile,
} from "./types.js";
import { parseFile } from "./parser.js";
import { lintFile } from "./rules/lint.js";
import { scanFile } from "./security/scan.js";
import { getRule } from "./registry.js";
import {
  scoreFindings,
  scoreToGrade,
  aggregateScore,
  tally,
} from "./grade.js";

/** Sort findings deterministically: by line, then column, then ruleId. */
function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      a.line - b.line ||
      a.column - b.column ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.message.localeCompare(b.message),
  );
}

/** Run all single-file rules against a ParsedFile. */
function analyzeParsed(file: ParsedFile): Finding[] {
  const findings: Finding[] = [];
  findings.push(...lintFile(file));
  findings.push(...scanFile(file));
  return findings;
}

/** Build a FileReport from a parsed file and its findings. */
function toFileReport(file: ParsedFile, findings: Finding[]): FileReport {
  const sorted = sortFindings(findings);
  const score = scoreFindings(sorted);
  return {
    filePath: file.filePath,
    kind: file.kind,
    findings: sorted,
    score,
    grade: scoreToGrade(score),
  };
}

/**
 * Cross-file rule: flag duplicate `name` values across the analyzed set.
 * Mutates the provided findings arrays (one per file, index-aligned).
 */
function applyDuplicateNameRule(
  files: readonly ParsedFile[],
  perFileFindings: Finding[][],
): void {
  const rule = getRule("skill/duplicate-name");
  const byName = new Map<string, number[]>();
  files.forEach((f, i) => {
    const name = f.frontmatter.data?.["name"];
    if (typeof name === "string" && name.trim().length > 0) {
      const key = name.trim();
      const arr = byName.get(key) ?? [];
      arr.push(i);
      byName.set(key, arr);
    }
  });
  for (const [name, indices] of byName) {
    if (indices.length < 2) continue;
    for (const i of indices) {
      const others = indices
        .filter((j) => j !== i)
        .map((j) => files[j]?.filePath ?? "?");
      perFileFindings[i]?.push({
        ruleId: rule.ruleId,
        title: rule.title,
        category: rule.category,
        severity: rule.defaultSeverity,
        message: `Duplicate skill name "${name}" — also declared in: ${others.join(
          ", ",
        )}. Clients keep only one.`,
        line: files[i]?.frontmatter.startLine || 1,
        column: 1,
        fixable: rule.fixable,
      });
    }
  }
}

/** Analyze a single file given its content. */
export function analyzeContent(
  filePath: string,
  content: string,
  options: AnalyzeOptions = {},
): FileReport {
  const parsed = parseFile(filePath, content, options.forceKind);
  const findings = analyzeParsed(parsed);
  return toFileReport(parsed, findings);
}

/** Analyze multiple files given their {path, content} pairs (no FS access). */
export function analyzeFiles(
  inputs: readonly { filePath: string; content: string }[],
  options: AnalyzeOptions = {},
): AnalysisReport {
  const parsed = inputs.map((i) =>
    parseFile(i.filePath, i.content, options.forceKind),
  );
  const perFileFindings = parsed.map((p) => analyzeParsed(p));
  applyDuplicateNameRule(parsed, perFileFindings);

  const reports: FileReport[] = parsed.map((p, i) =>
    toFileReport(p, perFileFindings[i] ?? []),
  );

  const all = reports.flatMap((r) => r.findings);
  const aggregate = aggregateScore(reports.map((r) => r.score));
  return {
    files: reports,
    score: aggregate,
    grade: scoreToGrade(aggregate),
    totals: tally(all),
  };
}

/** Analyze a list of file paths, reading each from disk. */
export function analyzePaths(
  paths: readonly string[],
  options: AnalyzeOptions = {},
): AnalysisReport {
  const inputs = paths.map((p) => ({
    filePath: p,
    content: readFileSync(p, "utf-8"),
  }));
  return analyzeFiles(inputs, options);
}

/** Re-parse content (used by the CLI to feed the fixer). */
export function parseForFix(filePath: string, content: string): ParsedFile {
  return parseFile(filePath, content);
}
