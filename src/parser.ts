/**
 * Parsing layer: split an agent-instruction file into frontmatter + body,
 * parse the YAML frontmatter, and classify the file kind.
 *
 * We do NOT execute anything. We only read text. The YAML parser is configured
 * defensively (no custom tags, no anchors expansion blow-up via the default
 * parser limits in the `yaml` package).
 */

import { basename } from "node:path";
import { parse as parseYaml, YAMLParseError } from "yaml";
import type { FileKind, ParsedFile, ParsedFrontmatter } from "./types.js";

/** Matches a leading frontmatter fence at the very start of the file. */
const OPENING_FENCE = /^---[ \t]*\r?\n/;

/**
 * Extract a frontmatter block from raw file contents.
 *
 * Frontmatter must start on line 1 with `---` and end with a line that is
 * exactly `---` (optionally followed by trailing whitespace). Anything after
 * the closing fence is the body.
 */
export function extractFrontmatter(raw: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
  bodyStartLine: number;
} {
  if (!OPENING_FENCE.test(raw)) {
    return {
      frontmatter: {
        present: false,
        raw: "",
        data: undefined,
        error: undefined,
        startLine: 0,
        endLine: 0,
      },
      body: raw,
      bodyStartLine: 1,
    };
  }

  // Split into lines while preserving the ability to compute line numbers.
  const lines = raw.split(/\r?\n/);
  // Line 0 is the opening "---". Find the next standalone "---".
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i] ?? "")) {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    // Opening fence with no closing fence: treat as malformed frontmatter.
    // Everything after the opening fence is considered frontmatter source so
    // the schema layer can report the parse problem with a location.
    const fmLines = lines.slice(1);
    const fmRaw = fmLines.join("\n");
    return {
      frontmatter: {
        present: true,
        raw: fmRaw,
        data: undefined,
        error: "Unterminated frontmatter: opening '---' has no closing '---'.",
        startLine: 2,
        endLine: lines.length,
      },
      body: "",
      bodyStartLine: lines.length + 1,
    };
  }

  const fmLines = lines.slice(1, closingIndex);
  const fmRaw = fmLines.join("\n");
  const bodyLines = lines.slice(closingIndex + 1);
  const body = bodyLines.join("\n");
  const bodyStartLine = closingIndex + 2; // 1-based line of first body line

  let data: Record<string, unknown> | undefined;
  let error: string | undefined;
  try {
    const parsed: unknown = parseYaml(fmRaw, {
      // Defensive: keep parsing strict-ish but lenient on duplicate keys so we
      // can detect duplicates ourselves rather than throwing.
      uniqueKeys: false,
      strict: false,
    });
    if (parsed === null || parsed === undefined) {
      data = {};
    } else if (typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else {
      error = "Frontmatter must be a YAML mapping (key: value pairs).";
    }
  } catch (e) {
    if (e instanceof YAMLParseError) {
      error = e.message.split("\n")[0] ?? e.message;
    } else if (e instanceof Error) {
      error = e.message;
    } else {
      error = "Unknown YAML parse error.";
    }
  }

  return {
    frontmatter: {
      present: true,
      raw: fmRaw,
      data,
      error,
      startLine: 2,
      endLine: closingIndex + 1, // 1-based line of the closing fence
    },
    body,
    bodyStartLine,
  };
}

/** Lowercase, slash-normalized path for matching. */
function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").toLowerCase();
}

/**
 * Classify the file kind from its path and parsed frontmatter.
 *
 * Heuristics (deliberately conservative — when unsure we lean "skill" only if
 * the filename is SKILL.md, otherwise "unknown" or "agents-md"):
 *  - `AGENTS.md` (any case) -> agents-md
 *  - `SKILL.md` (any case) -> skill
 *  - a `.md` file inside an `agents/` directory with frontmatter -> subagent
 *  - a `.md` file with `name`+`description` frontmatter -> skill (best guess)
 *  - otherwise -> unknown
 */
export function detectKind(
  filePath: string,
  frontmatter: ParsedFrontmatter,
): FileKind {
  const norm = normalizePath(filePath);
  const base = basename(norm);

  if (base === "agents.md") return "agents-md";
  if (base === "skill.md") return "skill";

  const inAgentsDir = /(^|\/)agents\/[^/]+\.md$/.test(norm);
  const data = frontmatter.data;
  const hasName = !!data && typeof data["name"] === "string";
  const hasDescription = !!data && typeof data["description"] === "string";

  // A subagent lives in an agents/ dir and is keyed by name+description, and
  // typically declares `tools` (comma string) and/or `model`.
  if (inAgentsDir && frontmatter.present && (hasName || hasDescription)) {
    return "subagent";
  }

  // Fallback: frontmatter that looks like a skill manifest.
  if (frontmatter.present && hasName && hasDescription) {
    return "skill";
  }

  // A markdown file with no frontmatter that is not AGENTS.md — we cannot
  // confidently lint it as a skill, so mark unknown.
  return "unknown";
}

/** Parse raw file contents at a given path into a ParsedFile. */
export function parseFile(
  filePath: string,
  raw: string,
  forceKind?: FileKind,
): ParsedFile {
  // Strip a single leading UTF-8 BOM (common on Windows): it precedes the `---`
  // fence (→ frontmatter missed → false missing-name/description errors) and would
  // also trip the hidden-unicode security rule. A leading BOM is benign.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const { frontmatter, body, bodyStartLine } = extractFrontmatter(raw);
  const kind = forceKind ?? detectKind(filePath, frontmatter);
  return { filePath, kind, frontmatter, body, bodyStartLine, raw };
}
