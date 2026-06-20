#!/usr/bin/env node
/**
 * skilldoctor CLI.
 *
 * Usage:
 *   skilldoctor check <path-or-glob...> [options]
 *
 * A hand-rolled arg parser is used deliberately: the surface is small (one
 * subcommand + a handful of flags), so a parser keeps the published binary
 * dependency-free and tiny rather than pulling in commander/yargs.
 */

import { writeFileSync } from "node:fs";
import { analyzePaths, parseForFix } from "./analyze.js";
import { discoverFiles } from "./discover.js";
import { renderTerminal } from "./output/terminal.js";
import { jsonString } from "./output/json.js";
import { sarifString } from "./output/sarif.js";
import { fixFile } from "./fix.js";
import { SEVERITY_RANK, type Severity } from "./types.js";
import { readFileSync } from "node:fs";
import { VERSION } from "./version.js";

interface CliOptions {
  paths: string[];
  json?: string;
  sarif?: string;
  fix: boolean;
  failOn?: Severity;
  color?: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const HELP = `skilldoctor v${VERSION}
Linter + security scanner for AI-agent skill & instruction files.

USAGE
  skilldoctor check <path-or-glob...> [options]

ARGUMENTS
  <path-or-glob>     One or more files, directories, or globs. Directories are
                     scanned recursively for SKILL.md / AGENTS.md / agents/*.md.

OPTIONS
  --json <file>      Write a JSON report to <file>.
  --sarif <file>     Write a SARIF 2.1.0 report to <file> (for GitHub code scanning).
  --fix              Apply mechanical fixes in place (frontmatter only; never the body).
  --fail-on <sev>    Exit non-zero if any finding is at or above <sev>:
                     error | warning | info. Default: error.
  --no-color         Disable ANSI colors (also respects NO_COLOR).
  --quiet            Suppress the terminal report (still writes --json/--sarif).
  -h, --help         Show this help.
  -v, --version      Print the version.

EXIT CODES
  0  no findings at or above --fail-on threshold
  1  findings at or above the threshold
  2  usage error / no files found

EXAMPLES
  skilldoctor check .claude/skills
  skilldoctor check "**/SKILL.md" --sarif results.sarif --fail-on warning
  skilldoctor check AGENTS.md --json report.json
`;

/** Parse argv (excluding node + script) into options. */
export function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = {
    paths: [],
    fix: false,
    quiet: false,
    help: false,
    version: false,
  };

  // Allow a leading "check" subcommand (optional but documented).
  let args = [...argv];
  if (args[0] === "check") args = args.slice(1);

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    switch (a) {
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "-v":
      case "--version":
        opts.version = true;
        break;
      case "--fix":
        opts.fix = true;
        break;
      case "--quiet":
        opts.quiet = true;
        break;
      case "--no-color":
        opts.color = false;
        break;
      case "--color":
        opts.color = true;
        break;
      case "--json":
        opts.json = requireValue(args, ++i, "--json");
        break;
      case "--sarif":
        opts.sarif = requireValue(args, ++i, "--sarif");
        break;
      case "--fail-on": {
        const v = requireValue(args, ++i, "--fail-on");
        if (v !== "error" && v !== "warning" && v !== "info") {
          throw new UsageError(
            `--fail-on must be one of: error, warning, info (got "${v}")`,
          );
        }
        opts.failOn = v;
        break;
      }
      default:
        if (a.startsWith("-")) {
          throw new UsageError(`Unknown option: ${a}`);
        }
        opts.paths.push(a);
    }
  }
  return opts;
}

class UsageError extends Error {}

function requireValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const v = args[index];
  if (v === undefined || v.startsWith("-")) {
    throw new UsageError(`${flag} requires a value`);
  }
  return v;
}

/** The main entry point. Returns the process exit code. */
export function run(argv: readonly string[]): number {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      process.stderr.write(`Error: ${e.message}\n\n${HELP}`);
      return 2;
    }
    throw e;
  }

  if (opts.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (opts.help || opts.paths.length === 0) {
    process.stdout.write(HELP);
    // No paths is a usage problem unless they explicitly asked for help.
    return opts.help ? 0 : 2;
  }

  const files = discoverFiles(opts.paths);
  if (files.length === 0) {
    process.stderr.write(
      "No skill / instruction files found for the given path(s).\n",
    );
    return 2;
  }

  // Optionally fix first, then analyze the (possibly) fixed files.
  if (opts.fix) {
    for (const f of files) {
      const content = readFileSync(f, "utf-8");
      const parsed = parseForFix(f, content);
      const result = fixFile(parsed);
      if (result.changed) {
        writeFileSync(f, result.output, "utf-8");
        if (!opts.quiet) {
          process.stdout.write(
            `fixed ${f} (${result.applied.join(", ")})\n`,
          );
        }
      }
    }
  }

  const report = analyzePaths(files);

  // Write machine outputs.
  if (opts.json) {
    writeFileSync(opts.json, jsonString(report, VERSION) + "\n", "utf-8");
  }
  if (opts.sarif) {
    writeFileSync(
      opts.sarif,
      sarifString(report, { version: VERSION }) + "\n",
      "utf-8",
    );
  }

  // Terminal output.
  if (!opts.quiet) {
    const term = renderTerminal(
      report,
      opts.color === undefined ? {} : { color: opts.color },
    );
    process.stdout.write(term + "\n");
  }

  // Exit-code gating.
  const threshold = SEVERITY_RANK[opts.failOn ?? "error"];
  const hasFailure = report.files.some((file) =>
    file.findings.some((f) => SEVERITY_RANK[f.severity] >= threshold),
  );
  return hasFailure ? 1 : 0;
}

// Execute only when invoked as the binary, not when imported (e.g. by tests).
// We detect "am I the entry script" by matching the entry filename. This works
// for the built bin (dist/cli.js / dist/cli.cjs) and stays inert under vitest,
// where process.argv[1] points at the test runner rather than this file.
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = entry.replace(/\\/g, "/").split("/").pop() ?? "";
  return /^cli(\.[cm]?js)?$/.test(base) || base === "skilldoctor";
}

if (isCliEntry()) {
  process.exitCode = run(process.argv.slice(2));
}
