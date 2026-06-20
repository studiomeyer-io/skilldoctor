/**
 * Lint rules for skill / subagent / AGENTS.md files.
 *
 * Each rule is a small pure function over a ParsedFile that pushes Findings.
 * All locations are best-effort 1-based line numbers into the original file.
 *
 * Leniency policy: unknown frontmatter fields are info-level, not errors —
 * we never invent hard requirements beyond the verified spec.
 */

import { basename, dirname } from "node:path";
import type { Finding, ParsedFile } from "../types.js";
import { getRule } from "../registry.js";
import { findKeyLine, makeEvidence } from "../locate.js";
import {
  SKILL_NAME_RE,
  SKILL_NAME_MAX,
  SKILL_DESCRIPTION_MAX,
  SPEC_SKILL_FIELDS,
  CLAUDE_CODE_SKILL_FIELDS,
  SUBAGENT_FIELDS,
  SENSITIVE_TOOLS,
  READONLY_HINT_RE,
  parseToolList,
  normalizeToolName,
  isWildcardTool,
} from "../spec.js";

/** Build a Finding from a rule id, filling defaults from the registry. */
function finding(
  ruleId: string,
  message: string,
  line: number,
  opts: { column?: number; evidence?: string } = {},
): Finding {
  const rule = getRule(ruleId);
  const f: Finding = {
    ruleId: rule.ruleId,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    message,
    line: Math.max(1, line),
    column: Math.max(1, opts.column ?? 1),
    fixable: rule.fixable,
  };
  if (opts.evidence !== undefined) f.evidence = opts.evidence;
  return f;
}

/** Vague-description heuristic: very generic phrasing, no concrete keywords. */
const VAGUE_RE =
  /^(helps?( you)?( with)?|does (stuff|things)|a skill( for)?|utility|tool|assistant|various|misc(ellaneous)?)\b/i;

/**
 * Lint a single parsed file. `allNames` is used for the cross-file
 * duplicate-name rule and is filled by the analyzer.
 */
export function lintFile(file: ParsedFile): Finding[] {
  const findings: Finding[] = [];
  const { frontmatter, kind } = file;

  // AGENTS.md is plain markdown — only check that it has content.
  if (kind === "agents-md") {
    if (file.raw.trim().length === 0) {
      findings.push(
        finding(
          "skill/empty-body",
          "AGENTS.md is empty. It should contain project instructions for agents.",
          1,
        ),
      );
    }
    return findings;
  }

  // Unknown markdown with no recognizable frontmatter: nothing actionable to
  // lint as a skill. Return empty (the analyzer notes the kind).
  if (kind === "unknown") {
    return findings;
  }

  const fmStart = frontmatter.startLine || 1;

  // Frontmatter parse / shape errors.
  if (frontmatter.present && frontmatter.error) {
    findings.push(
      finding(
        "skill/frontmatter-schema",
        `Frontmatter could not be parsed: ${frontmatter.error}`,
        fmStart,
      ),
    );
    // Without parsed data we cannot run field-level rules.
    if (!frontmatter.data) return findings;
  }

  if (!frontmatter.present || !frontmatter.data) {
    // A skill/subagent without frontmatter is missing both required fields.
    findings.push(
      finding(
        "skill/missing-name",
        "No frontmatter found; a skill/subagent requires `name` and `description`.",
        1,
      ),
    );
    findings.push(
      finding(
        "skill/missing-description",
        "No frontmatter found; `description` is required.",
        1,
      ),
    );
    return findings;
  }

  const data = frontmatter.data;

  lintName(file, data, findings);
  lintDescription(file, data, findings);
  lintBody(file, findings);
  lintTools(file, data, findings);
  lintUnknownFields(file, data, findings);
  lintTrailingWhitespace(file, findings);
  lintDuplicateKeys(file, findings);

  return findings;
}

function lintName(
  file: ParsedFile,
  data: Record<string, unknown>,
  findings: Finding[],
): void {
  const fmStart = file.frontmatter.startLine || 1;
  const nameRaw = data["name"];
  const nameLine = findKeyLine(file.frontmatter.raw, "name", fmStart);

  if (nameRaw === undefined || nameRaw === null) {
    findings.push(
      finding("skill/missing-name", "Missing required `name` field.", fmStart),
    );
    return;
  }
  if (typeof nameRaw !== "string") {
    findings.push(
      finding(
        "skill/frontmatter-schema",
        `\`name\` must be a string, got ${typeof nameRaw}.`,
        nameLine,
      ),
    );
    return;
  }
  const name = nameRaw.trim();
  if (name.length === 0) {
    findings.push(
      finding("skill/missing-name", "`name` is empty.", nameLine),
    );
    return;
  }
  if (name.length > SKILL_NAME_MAX || !SKILL_NAME_RE.test(name)) {
    findings.push(
      finding(
        "skill/invalid-name",
        `\`name\` "${name}" is invalid. Use 1-${SKILL_NAME_MAX} lowercase chars (a-z, 0-9, hyphens), no leading/trailing/consecutive hyphens.`,
        nameLine,
        { evidence: makeEvidence(name) },
      ),
    );
    return;
  }
  // name-must-match-directory (spec rule). Only meaningful for SKILL.md, where
  // the parent directory is the skill name.
  if (basename(file.filePath).toLowerCase() === "skill.md") {
    const dir = basename(dirname(file.filePath));
    if (dir && dir !== "." && dir !== "" && dir.toLowerCase() !== name) {
      findings.push(
        finding(
          "skill/name-dir-mismatch",
          `\`name\` "${name}" does not match the parent directory "${dir}". The Agent Skills spec requires them to match.`,
          nameLine,
        ),
      );
    }
  }
}

function lintDescription(
  file: ParsedFile,
  data: Record<string, unknown>,
  findings: Finding[],
): void {
  const fmStart = file.frontmatter.startLine || 1;
  const descRaw = data["description"];
  const descLine = findKeyLine(file.frontmatter.raw, "description", fmStart);

  if (descRaw === undefined || descRaw === null) {
    findings.push(
      finding(
        "skill/missing-description",
        "Missing required `description` field. Agents use it to decide when to load the skill.",
        fmStart,
      ),
    );
    return;
  }
  if (typeof descRaw !== "string") {
    findings.push(
      finding(
        "skill/frontmatter-schema",
        `\`description\` must be a string, got ${typeof descRaw}.`,
        descLine,
      ),
    );
    return;
  }
  const desc = descRaw.trim();
  if (desc.length === 0) {
    findings.push(
      finding("skill/empty-description", "`description` is empty.", descLine),
    );
    return;
  }
  if (desc.length < 20) {
    findings.push(
      finding(
        "skill/description-too-short",
        `\`description\` is only ${desc.length} characters. Describe what the skill does AND when to use it (include trigger keywords).`,
        descLine,
        { evidence: makeEvidence(desc) },
      ),
    );
  }
  if (desc.length > SKILL_DESCRIPTION_MAX) {
    findings.push(
      finding(
        "skill/description-too-long",
        `\`description\` is ${desc.length} characters, over the ${SKILL_DESCRIPTION_MAX}-char spec limit.`,
        descLine,
      ),
    );
  }
  if (VAGUE_RE.test(desc)) {
    findings.push(
      finding(
        "skill/vague-description",
        "`description` reads as generic. Add concrete capabilities and trigger phrases so agents match it to real tasks.",
        descLine,
        { evidence: makeEvidence(desc) },
      ),
    );
  }
}

function lintBody(file: ParsedFile, findings: Finding[]): void {
  if (file.body.trim().length === 0) {
    findings.push(
      finding(
        "skill/empty-body",
        "The instruction body is empty. Add the steps/instructions the agent should follow.",
        file.bodyStartLine,
      ),
    );
  }
}

function lintTools(
  file: ParsedFile,
  data: Record<string, unknown>,
  findings: Finding[],
): void {
  const fmStart = file.frontmatter.startLine || 1;
  // Skills use `allowed-tools`; subagents use `tools`.
  const keys = ["allowed-tools", "tools"] as const;
  for (const key of keys) {
    if (!(key in data)) continue;
    const value = data[key];
    const line = findKeyLine(file.frontmatter.raw, key, fmStart);
    if (
      value !== undefined &&
      value !== null &&
      typeof value !== "string" &&
      !Array.isArray(value)
    ) {
      findings.push(
        finding(
          "skill/frontmatter-schema",
          `\`${key}\` must be a space/comma-separated string or a YAML list.`,
          line,
        ),
      );
      continue;
    }
    const tokens = parseToolList(value);
    if (tokens.length === 0) continue;

    // Wildcard grant.
    const wild = tokens.find((t) => isWildcardTool(t));
    if (wild) {
      findings.push(
        finding(
          "tools/wildcard-grant",
          `\`${key}\` grants a wildcard ("${wild}"). Least-privilege: list only the specific tools this skill needs.`,
          line,
          { evidence: makeEvidence(tokens.join(", ")) },
        ),
      );
    }

    // Duplicate tools.
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const t of tokens) {
      // Compare FULL tokens: `Bash(git:*)` and `Bash(jq:*)` are different grants,
      // not duplicates. Only flag genuinely identical tokens (e.g. `Read Read`).
      const key = t.trim();
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    }
    if (dups.size > 0) {
      findings.push(
        finding(
          "tools/duplicate-tool",
          `\`${key}\` lists duplicate tool(s): ${[...dups].join(", ")}.`,
          line,
        ),
      );
    }

    // Least-privilege: read-only description but sensitive tools granted.
    const desc =
      typeof data["description"] === "string"
        ? (data["description"] as string)
        : "";
    const sensitiveGranted = tokens
      .map((t) => normalizeToolName(t))
      .filter((n) => SENSITIVE_TOOLS.has(n));
    if (
      !wild &&
      sensitiveGranted.length > 0 &&
      READONLY_HINT_RE.test(desc)
    ) {
      findings.push(
        finding(
          "tools/over-broad-for-readonly",
          `Description implies a read-only task but \`${key}\` grants write/exec/network tool(s): ${[
            ...new Set(sensitiveGranted),
          ].join(", ")}. Drop them or adjust the description.`,
          line,
          { evidence: makeEvidence(desc) },
        ),
      );
    }
  }
}

function lintUnknownFields(
  file: ParsedFile,
  data: Record<string, unknown>,
  findings: Finding[],
): void {
  const fmStart = file.frontmatter.startLine || 1;
  const allowed =
    file.kind === "subagent"
      ? SUBAGENT_FIELDS
      : unionFields();
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) {
      findings.push(
        finding(
          "skill/unknown-field",
          `Unknown frontmatter field "${key}" — not part of the Agent Skills spec or known Claude Code extensions. (Lenient: clients may add custom fields.)`,
          findKeyLine(file.frontmatter.raw, key, fmStart),
        ),
      );
    }
  }
}

/** Skills accept spec fields + Claude Code extension fields. */
function unionFields(): Set<string> {
  const s = new Set<string>(SPEC_SKILL_FIELDS);
  for (const f of CLAUDE_CODE_SKILL_FIELDS) s.add(f);
  return s;
}

function lintTrailingWhitespace(file: ParsedFile, findings: Finding[]): void {
  if (!file.frontmatter.present) return;
  const lines = file.frontmatter.raw.split(/\r?\n/);
  const fmStart = file.frontmatter.startLine || 1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/[ \t]+$/.test(l) && l.trim().length > 0) {
      findings.push(
        finding(
          "skill/trailing-whitespace",
          "Frontmatter line has trailing whitespace.",
          fmStart + i,
        ),
      );
    }
  }
}

function lintDuplicateKeys(file: ParsedFile, findings: Finding[]): void {
  if (!file.frontmatter.present) return;
  const lines = file.frontmatter.raw.split(/\r?\n/);
  const fmStart = file.frontmatter.startLine || 1;
  const seen = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    // Only consider top-level keys (no leading whitespace) of the form `key:`.
    const m = /^([A-Za-z0-9_-]+)\s*:/.exec(l);
    if (!m) continue;
    const key = m[1] as string;
    if (seen.has(key)) {
      findings.push(
        finding(
          "skill/duplicate-key",
          `Frontmatter key "${key}" appears more than once; YAML keeps only the last value.`,
          fmStart + i,
        ),
      );
    } else {
      seen.set(key, i);
    }
  }
}
