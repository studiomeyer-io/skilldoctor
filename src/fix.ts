/**
 * --fix engine. Mechanically repairs the safe, unambiguous subset of findings.
 *
 * HARD RULE: we never rewrite the markdown body content (that could neutralize
 * malicious instructions silently, or mangle legitimate prose). We only touch
 * the YAML frontmatter, and only in deterministic, reversible ways:
 *   1. trim trailing whitespace on frontmatter lines
 *   2. add a missing `description:` stub with a TODO marker
 *   3. de-duplicate tools within `allowed-tools` / `tools` (preserving order)
 *
 * The fixer is idempotent: running it twice produces identical output.
 */

import type { ParsedFile } from "./types.js";
import { parseToolList } from "./spec.js";

/** Marker used for an inserted stub so humans (and tests) can find it. */
export const DESCRIPTION_STUB =
  "TODO describe what this skill does and when to use it.";

export interface FixResult {
  /** The (possibly) rewritten file contents. */
  output: string;
  /** True if anything changed. */
  changed: boolean;
  /** Names of the fixes applied. */
  applied: string[];
}

/**
 * Apply mechanical fixes to a parsed file's raw text and return the result.
 * Only skill/subagent files with frontmatter are fixed; AGENTS.md/unknown are
 * returned unchanged.
 */
export function fixFile(file: ParsedFile): FixResult {
  const applied: string[] = [];

  if (file.kind === "agents-md" || file.kind === "unknown") {
    return { output: file.raw, changed: false, applied };
  }
  if (!file.frontmatter.present) {
    return { output: file.raw, changed: false, applied };
  }
  // Never "fix" frontmatter we could not parse — we'd be editing around a
  // structure we don't understand and could corrupt it. Leave it for a human.
  if (file.frontmatter.error) {
    return { output: file.raw, changed: false, applied };
  }

  // Work on the frontmatter lines only; reattach body verbatim afterwards.
  const fmLines = file.frontmatter.raw.split("\n");

  // 1) Trim trailing whitespace on each frontmatter line.
  let trimmedAny = false;
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i] ?? "";
    const trimmed = line.replace(/[ \t]+$/, "");
    if (trimmed !== line) {
      fmLines[i] = trimmed;
      trimmedAny = true;
    }
  }
  if (trimmedAny) applied.push("trailing-whitespace");

  // 2) De-duplicate tool lists written as inline strings.
  for (const key of ["allowed-tools", "tools"]) {
    const idx = fmLines.findIndex((l) =>
      new RegExp(`^${key}\\s*:`).test(l ?? ""),
    );
    if (idx === -1) continue;
    const line = fmLines[idx] ?? "";
    const m = new RegExp(`^(${key}\\s*:\\s*)(.*)$`).exec(line);
    if (!m) continue;
    const prefix = m[1] as string;
    const rest = (m[2] ?? "").trim();
    // Only handle the inline-string form (not block YAML lists, which span
    // multiple lines — those are left to the human to keep --fix safe).
    if (rest.length === 0 || rest.startsWith("[")) continue;
    const tokens = parseToolList(rest);
    if (tokens.length === 0) continue;
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const t of tokens) {
      // Dedup by the FULL token, never a specifier-stripped name: `Bash(git:*)`
      // and `Bash(jq:*)` are DIFFERENT grants and must both survive. Only collapse
      // genuinely identical tokens (e.g. `Read Read`).
      const key = t.trim();
      if (!seen.has(key)) {
        deduped.push(t);
        seen.add(key);
      }
    }
    if (deduped.length !== tokens.length) {
      const sep = rest.includes(",") ? ", " : " ";
      fmLines[idx] = prefix + deduped.join(sep);
      applied.push(`dedupe-${key}`);
    }
  }

  // 3) Add a missing `description:` stub (only if truly absent — never
  //    overwrite an existing one, even an empty string).
  const hasDescriptionKey = fmLines.some((l) => /^description\s*:/.test(l ?? ""));
  const data = file.frontmatter.data;
  const descMissing =
    !data || data["description"] === undefined || data["description"] === null;
  if (!hasDescriptionKey && descMissing) {
    // Insert after `name:` ONLY when `name` is a simple inline scalar. If `name`
    // has a block value (a sequence/mapping on following indented lines), inserting
    // between the key and its value would split them and produce invalid YAML, so
    // insert at the very top instead (always valid).
    const nameIdx = fmLines.findIndex((l) => /^name\s*:/.test(l ?? ""));
    let insertAt = 0;
    if (nameIdx !== -1) {
      const nameHasInlineValue = /^name\s*:\s*\S/.test(fmLines[nameIdx] ?? "");
      const nextIsContinuation = /^\s/.test(fmLines[nameIdx + 1] ?? "");
      insertAt = nameHasInlineValue && !nextIsContinuation ? nameIdx + 1 : 0;
    }
    fmLines.splice(insertAt, 0, `description: "${DESCRIPTION_STUB}"`);
    applied.push("add-description-stub");
  }

  if (applied.length === 0) {
    return { output: file.raw, changed: false, applied };
  }

  const newFrontmatter = fmLines.join("\n");
  const eol = file.raw.includes("\r\n") ? "\r\n" : "\n";
  const rebuilt =
    "---" +
    eol +
    newFrontmatter.split("\n").join(eol) +
    eol +
    "---" +
    eol +
    file.body.split("\n").join(eol);

  return { output: rebuilt, changed: true, applied };
}
