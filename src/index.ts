/**
 * skilldoctor — public library API.
 *
 * A linter + security scanner for AI-agent skill & instruction files
 * (Claude Code SKILL.md, AGENTS.md, subagent definitions).
 *
 * @example
 * ```ts
 * import { analyzeContent } from "skilldoctor";
 * const report = analyzeContent("my-skill/SKILL.md", fileContents);
 * console.log(report.grade, report.findings);
 * ```
 */

// Types
export type {
  FileKind,
  Severity,
  FindingCategory,
  Finding,
  ParsedFrontmatter,
  ParsedFile,
  FileReport,
  AnalysisReport,
  Grade,
  RuleDescriptor,
  AnalyzeOptions,
} from "./types.js";
export { SEVERITY_RANK } from "./types.js";

// Core analysis
export {
  analyzeContent,
  analyzeFiles,
  analyzePaths,
  parseForFix,
} from "./analyze.js";

// Parsing
export { parseFile, extractFrontmatter, detectKind } from "./parser.js";

// Grading
export {
  scoreFindings,
  scoreToGrade,
  aggregateScore,
  tally,
} from "./grade.js";

// Rules / registry
export { RULES, getRule, allRuleIds } from "./registry.js";

// Fixing
export { fixFile, DESCRIPTION_STUB } from "./fix.js";
export type { FixResult } from "./fix.js";

// Discovery
export { discoverFiles, isGlob, globToRegExp } from "./discover.js";

// Reporters
export { renderTerminal } from "./output/terminal.js";
export { toJsonReport, jsonString, JSON_REPORT_VERSION } from "./output/json.js";
export type { JsonReport } from "./output/json.js";
export {
  toSarif,
  sarifString,
  SARIF_VERSION,
  SARIF_SCHEMA,
} from "./output/sarif.js";
