/**
 * Core domain types for skilldoctor.
 *
 * These types describe what a parsed agent-skill / instruction file looks like,
 * what a finding is, and the shape of an analysis result. They form the public
 * library API surface (re-exported from `index.ts`).
 */

/** The kind of agent-instruction file we detected. */
export type FileKind =
  /** A Claude Code / Agent Skills `SKILL.md` (has a `name`+`description` frontmatter). */
  | "skill"
  /** A Claude Code subagent definition (frontmatter with `name`+`description`, body = system prompt). */
  | "subagent"
  /** An `AGENTS.md` instruction file (plain markdown, no frontmatter required). */
  | "agents-md"
  /** A markdown file with frontmatter we could not confidently classify. */
  | "unknown";

/** Severity of a finding, ordered from most to least serious. */
export type Severity = "error" | "warning" | "info";

/** Numeric rank for a severity — higher means more serious. Used for `--fail-on`. */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

/** Category groups findings for reporting and weighting. */
export type FindingCategory = "lint" | "security";

/** A single problem found in a file. */
export interface Finding {
  /** Stable rule identifier, e.g. `skill/missing-description` or `sec/prompt-injection`. */
  ruleId: string;
  /** Human-readable rule title (short). */
  title: string;
  /** Category — lint or security. */
  category: FindingCategory;
  /** Severity of this occurrence. */
  severity: Severity;
  /** One-line explanation of the problem in context. */
  message: string;
  /** 1-based line number in the source file (best effort; 1 if unknown). */
  line: number;
  /** 1-based column number (best effort; 1 if unknown). */
  column: number;
  /** Optional snippet of the offending text (truncated, never executed). */
  evidence?: string;
  /** Whether `--fix` can mechanically repair this finding. */
  fixable: boolean;
}

/** Frontmatter parsed from a file, normalized to a plain record. */
export interface ParsedFrontmatter {
  /** Whether a frontmatter block was present at all. */
  present: boolean;
  /** Raw frontmatter source (between the `---` fences), if present. */
  raw: string;
  /** Parsed key/value data. `undefined` when frontmatter is absent or unparseable. */
  data: Record<string, unknown> | undefined;
  /** A YAML parse error message, if parsing failed. */
  error: string | undefined;
  /** 1-based line where the frontmatter body starts (line after the opening fence). */
  startLine: number;
  /** 1-based line where the frontmatter body ends (the closing fence line). */
  endLine: number;
}

/** A fully parsed agent-instruction file, ready to lint. */
export interface ParsedFile {
  /** Absolute or relative path as supplied by the caller. */
  filePath: string;
  /** Detected file kind. */
  kind: FileKind;
  /** Parsed frontmatter. */
  frontmatter: ParsedFrontmatter;
  /** The markdown body (everything after the frontmatter block). */
  body: string;
  /** 1-based line number where the body begins in the original file. */
  bodyStartLine: number;
  /** The complete, unmodified file contents. */
  raw: string;
}

/** Result of analyzing one file. */
export interface FileReport {
  filePath: string;
  kind: FileKind;
  findings: Finding[];
  /** Numeric score 0-100 for this file. */
  score: number;
  /** Letter grade A-F derived from the score. */
  grade: Grade;
}

/** Aggregate result of analyzing one or more files. */
export interface AnalysisReport {
  files: FileReport[];
  /** Aggregate numeric score 0-100 across all files (worst-weighted average). */
  score: number;
  /** Aggregate letter grade. */
  grade: Grade;
  /** Total finding counts by severity across all files. */
  totals: Record<Severity, number>;
}

/** Letter grades. */
export type Grade = "A" | "B" | "C" | "D" | "F";

/** A rule's static descriptor (used for SARIF `driver.rules` and docs). */
export interface RuleDescriptor {
  ruleId: string;
  title: string;
  category: FindingCategory;
  defaultSeverity: Severity;
  /** Short description of what the rule checks and why. */
  description: string;
  /** Whether occurrences of this rule are mechanically fixable. */
  fixable: boolean;
}

/** Options controlling analysis behavior. */
export interface AnalyzeOptions {
  /**
   * Override the auto-detected file kind. Mostly useful for tests and for
   * files whose name does not follow convention.
   */
  forceKind?: FileKind;
}
