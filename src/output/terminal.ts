/**
 * Terminal reporter. Human-readable, optionally colorized (auto-disabled when
 * not a TTY or when NO_COLOR is set). No external dependency — small ANSI
 * helpers only.
 */

import type {
  AnalysisReport,
  FileReport,
  Finding,
  Grade,
  Severity,
} from "../types.js";

interface TerminalOptions {
  /** Force color on/off. Defaults to auto-detect. */
  color?: boolean;
}

const ANSI = {
  reset: "[0m",
  bold: "[1m",
  dim: "[2m",
  red: "[31m",
  green: "[32m",
  yellow: "[33m",
  blue: "[34m",
  magenta: "[35m",
  cyan: "[36m",
  gray: "[90m",
} as const;

function colorEnabled(opt?: boolean): boolean {
  if (opt !== undefined) return opt;
  if (process.env["NO_COLOR"] !== undefined) return false;
  if (process.env["FORCE_COLOR"] !== undefined) return true;
  return Boolean(process.stdout.isTTY);
}

function paint(s: string, code: string, on: boolean): string {
  return on ? `${code}${s}${ANSI.reset}` : s;
}

const SEVERITY_ICON: Record<Severity, string> = {
  error: "✖",
  warning: "⚠",
  info: "ℹ",
};

const SEVERITY_COLOR: Record<Severity, string> = {
  error: ANSI.red,
  warning: ANSI.yellow,
  info: ANSI.blue,
};

const GRADE_COLOR: Record<Grade, string> = {
  A: ANSI.green,
  B: ANSI.green,
  C: ANSI.yellow,
  D: ANSI.yellow,
  F: ANSI.red,
};

function severityLabel(sev: Severity, on: boolean): string {
  return paint(`${SEVERITY_ICON[sev]} ${sev}`, SEVERITY_COLOR[sev], on);
}

function fileHeader(file: FileReport, on: boolean): string {
  const gradeBadge = paint(
    ` ${file.grade} `,
    `${ANSI.bold}${GRADE_COLOR[file.grade]}`,
    on,
  );
  const kind = paint(`[${file.kind}]`, ANSI.gray, on);
  return `${paint(file.filePath, ANSI.bold, on)} ${kind} ${gradeBadge}${paint(
    `(${file.score}/100)`,
    ANSI.dim,
    on,
  )}`;
}

function findingLine(f: Finding, on: boolean): string {
  const loc = paint(`${f.line}:${f.column}`, ANSI.gray, on);
  const sev = severityLabel(f.severity, on);
  const rule = paint(f.ruleId, ANSI.cyan, on);
  let out = `  ${loc}  ${sev}  ${f.message}  ${rule}`;
  if (f.fixable) out += paint(" (fixable)", ANSI.dim, on);
  if (f.evidence) {
    out += `\n      ${paint("↳ " + f.evidence, ANSI.gray, on)}`;
  }
  return out;
}

/** Render a full analysis report as a terminal string. */
export function renderTerminal(
  report: AnalysisReport,
  options: TerminalOptions = {},
): string {
  const on = colorEnabled(options.color);
  const lines: string[] = [];

  if (report.files.length === 0) {
    return paint("No skill / instruction files found.", ANSI.yellow, on);
  }

  for (const file of report.files) {
    lines.push(fileHeader(file, on));
    if (file.findings.length === 0) {
      lines.push(paint("  ✓ no findings", ANSI.green, on));
    } else {
      for (const f of file.findings) {
        lines.push(findingLine(f, on));
      }
    }
    lines.push("");
  }

  // Summary footer.
  const { error, warning, info } = report.totals;
  const summaryBadge = paint(
    ` Grade ${report.grade} `,
    `${ANSI.bold}${GRADE_COLOR[report.grade]}`,
    on,
  );
  lines.push(
    paint("─".repeat(48), ANSI.gray, on),
  );
  lines.push(
    `${summaryBadge} ${paint(`${report.score}/100`, ANSI.bold, on)}  across ${
      report.files.length
    } file(s)`,
  );
  lines.push(
    `  ${paint(`${error} error(s)`, error ? ANSI.red : ANSI.gray, on)}  ` +
      `${paint(`${warning} warning(s)`, warning ? ANSI.yellow : ANSI.gray, on)}  ` +
      `${paint(`${info} info`, info ? ANSI.blue : ANSI.gray, on)}`,
  );

  return lines.join("\n");
}
