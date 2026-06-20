/**
 * Verified format knowledge.
 *
 * Source of truth (fetched + verified at build time, see README "Sources"):
 *  - Agent Skills standard: https://agentskills.io/specification
 *  - Claude Code skills:     https://code.claude.com/docs/en/skills
 *  - Claude Code subagents:  https://code.claude.com/docs/en/sub-agents
 *  - AGENTS.md convention:   https://agents.md
 *
 * IMPORTANT design choice (anti-hallucination): we validate STRICTLY against
 * the base Agent Skills spec, RECOGNIZE the documented Claude Code extension
 * fields (so they are never flagged as "unknown"), and treat any other field
 * LENIENTLY (info-level "unknown field", never a hard error) — because clients
 * are free to add their own metadata and we must not invent rules.
 */

/** Constraints from the Agent Skills specification. */
export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
export const SKILL_COMPATIBILITY_MAX = 500;

/**
 * `name` regex per spec: 1-64 chars, lowercase a-z / 0-9 / hyphen, no leading
 * or trailing hyphen, no consecutive hyphens. Anchored, linear-time, ReDoS-safe.
 */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Fields defined by the base Agent Skills spec for a SKILL.md. */
export const SPEC_SKILL_FIELDS = new Set<string>([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

/**
 * Additional fields Claude Code documents as valid skill frontmatter. We
 * recognize these so we don't false-flag them; we don't enforce their values.
 */
export const CLAUDE_CODE_SKILL_FIELDS = new Set<string>([
  "when_to_use",
  "argument-hint",
  "arguments",
  "disable-model-invocation",
  "user-invocable",
  "disallowed-tools",
  "model",
  "effort",
  "context",
  "agent",
  "hooks",
  "paths",
  "shell",
]);

/** Fields documented for Claude Code subagent definitions. */
export const SUBAGENT_FIELDS = new Set<string>([
  "name",
  "description",
  "tools",
  "disallowedTools",
  "model",
  "permissionMode",
  "mcpServers",
  "hooks",
  "maxTurns",
  "skills",
  "initialPrompt",
  "memory",
  "effort",
  "background",
  "isolation",
  "color",
]);

/** Valid `model` alias values for a Claude Code subagent / skill. */
export const MODEL_ALIASES = new Set<string>([
  "sonnet",
  "opus",
  "haiku",
  "fable",
  "inherit",
]);

/**
 * Tools generally considered "sensitive" — write, execute, or network egress.
 * Names cover Claude Code core tools plus common variants/aliases. Matching is
 * case-insensitive and ignores any `(...)` permission specifier suffix.
 */
export const SENSITIVE_TOOLS = new Set<string>([
  "bash",
  "shell",
  "execute",
  "exec",
  "write",
  "edit",
  "multiedit",
  "notebookedit",
  "webfetch",
  "websearch",
  "fetch",
  "applypatch",
  "patch",
]);

/** Network-capable tools specifically (subset of sensitive). */
export const NETWORK_TOOLS = new Set<string>([
  "webfetch",
  "websearch",
  "fetch",
]);

/** Execution-capable tools (subset of sensitive). */
export const EXEC_TOOLS = new Set<string>(["bash", "shell", "execute", "exec"]);

/**
 * Phrases in a description that strongly imply the skill is read-only / a
 * reference or docs helper, so broad write/exec/network grants are suspicious.
 */
// High-confidence read-only *action* signals only. Doc-TYPE nouns (reference /
// docs / guide / cheat-sheet / conventions) were removed: a "deployment guide" or
// "API reference" skill can legitimately need Bash/WebFetch, so matching them
// produced least-privilege false positives that failed CI on valid skills.
export const READONLY_HINT_RE =
  /\b(read[- ]?only|look[- ]?up|lookup|summari[sz]e|explains?|describes?)\b/i;

/** Normalize a tool token: lowercase and strip a trailing `(...)` specifier. */
export function normalizeToolName(token: string): string {
  return token
    .trim()
    .replace(/\(.*\)\s*$/, "")
    .toLowerCase();
}

/**
 * Parse a `tools` / `allowed-tools` value into a list of raw tokens.
 * Accepts: a YAML list (string[]) or a space/comma-separated string.
 */
export function parseToolList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  return [];
}

/** True if a tool token is a wildcard / "all tools" grant. */
export function isWildcardTool(token: string): boolean {
  const t = token.trim().toLowerCase();
  return t === "*" || t === "all" || t === "any" || t === "everything";
}
