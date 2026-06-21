/**
 * Central rule registry — the single source of truth for every rule
 * skilldoctor can emit. SARIF requires every emitted `ruleId` to have a
 * matching `reportingDescriptor` in `driver.rules`, so we generate that list
 * from here. The README rule table is also derived from this.
 */

import type { RuleDescriptor } from "./types.js";

export const RULES: readonly RuleDescriptor[] = [
  // ---- Lint rules (frontmatter / structure) ---------------------------------
  {
    ruleId: "skill/missing-name",
    title: "Missing name",
    category: "lint",
    defaultSeverity: "error",
    description:
      "A skill or subagent frontmatter must declare a non-empty `name`. The Agent Skills spec requires it; Claude Code falls back to the directory name but a missing name is fragile.",
    fixable: false,
  },
  {
    ruleId: "skill/invalid-name",
    title: "Invalid name format",
    category: "lint",
    defaultSeverity: "error",
    description:
      "`name` must be 1-64 lowercase characters using only a-z, 0-9 and hyphens, with no leading/trailing/consecutive hyphens (Agent Skills spec).",
    fixable: false,
  },
  {
    ruleId: "skill/name-dir-mismatch",
    title: "Name does not match directory",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "The Agent Skills spec says a skill's `name` must match its parent directory name. A mismatch breaks invocation in some clients.",
    fixable: false,
  },
  {
    ruleId: "skill/missing-description",
    title: "Missing description",
    category: "lint",
    defaultSeverity: "error",
    description:
      "`description` is required and is what an agent uses to decide when to load the skill. Without it the skill is effectively invisible.",
    fixable: true,
  },
  {
    ruleId: "skill/empty-description",
    title: "Empty description",
    category: "lint",
    defaultSeverity: "error",
    description: "`description` is present but blank. It must be non-empty. The fixer deliberately does NOT auto-overwrite an existing (even empty) description with a stub, so this is reported but not auto-fixed.",
    fixable: false,
  },
  {
    ruleId: "skill/description-too-short",
    title: "Description too short",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "A very short description gives the agent almost no signal about when to use the skill. Describe both what it does and when to use it.",
    fixable: false,
  },
  {
    ruleId: "skill/description-too-long",
    title: "Description too long",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "`description` exceeds the 1024-character spec limit (Claude Code truncates the combined description+when_to_use at 1,536 chars in the skill listing).",
    fixable: false,
  },
  {
    ruleId: "skill/vague-description",
    title: "Vague description",
    category: "lint",
    defaultSeverity: "info",
    description:
      "The description is generic (e.g. 'helps with things') and lacks trigger keywords. Agents match descriptions to tasks, so specificity matters.",
    fixable: false,
  },
  {
    ruleId: "skill/empty-body",
    title: "Empty body",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "The markdown body (the actual instructions) is empty or whitespace-only. A skill with no instructions does nothing.",
    fixable: false,
  },
  {
    ruleId: "skill/frontmatter-schema",
    title: "Frontmatter schema error",
    category: "lint",
    defaultSeverity: "error",
    description:
      "The YAML frontmatter could not be parsed, is not a mapping, or a known field has the wrong type.",
    fixable: false,
  },
  {
    ruleId: "skill/unknown-field",
    title: "Unknown frontmatter field",
    category: "lint",
    defaultSeverity: "info",
    description:
      "A frontmatter field is not part of the Agent Skills spec or the known Claude Code extensions. Handled leniently (info) since clients may add their own fields.",
    fixable: false,
  },
  {
    ruleId: "skill/duplicate-key",
    title: "Duplicate frontmatter key",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "A frontmatter key appears more than once. YAML keeps the last value, silently dropping the earlier one.",
    fixable: false,
  },
  {
    ruleId: "skill/trailing-whitespace",
    title: "Trailing whitespace in frontmatter",
    category: "lint",
    defaultSeverity: "info",
    description:
      "A frontmatter line has trailing whitespace. Cosmetic, but mechanically fixable.",
    fixable: true,
  },
  {
    ruleId: "skill/duplicate-name",
    title: "Duplicate skill name in set",
    category: "lint",
    defaultSeverity: "error",
    description:
      "Two files in the analyzed set declare the same `name`. Clients keep one and silently discard the other.",
    fixable: false,
  },
  // ---- Least-privilege / tool-grant rules -----------------------------------
  {
    ruleId: "tools/wildcard-grant",
    title: "Wildcard tool grant",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "The tool grant includes a bare `*` / `all` wildcard. Least-privilege: grant only the specific tools the skill needs.",
    fixable: false,
  },
  {
    ruleId: "tools/over-broad-for-readonly",
    title: "Over-broad tools for a read-only skill",
    category: "lint",
    defaultSeverity: "warning",
    description:
      "The description implies a read-only/docs task but the skill grants write/exec/network tools (e.g. Bash, Write, Edit, WebFetch). Least-privilege violation.",
    fixable: false,
  },
  {
    ruleId: "tools/duplicate-tool",
    title: "Duplicate tool in grant",
    category: "lint",
    defaultSeverity: "info",
    description: "The same tool is listed more than once in the tool grant.",
    fixable: true,
  },
  // ---- Security scan rules --------------------------------------------------
  {
    ruleId: "sec/prompt-injection",
    title: "Prompt-injection phrasing",
    category: "security",
    defaultSeverity: "error",
    description:
      "The content contains prompt-injection-style instructions (e.g. 'ignore previous instructions', 'disregard your system prompt'). Skill content is untrusted input.",
    fixable: false,
  },
  {
    ruleId: "sec/disable-safety",
    title: "Instruction to disable safety/guardrails",
    category: "security",
    defaultSeverity: "error",
    description:
      "The content instructs the agent to disable safety checks, hooks, guardrails, or approval gates.",
    fixable: false,
  },
  {
    ruleId: "sec/data-exfiltration",
    title: "Possible data-exfiltration pattern",
    category: "security",
    defaultSeverity: "error",
    description:
      "The content combines an outbound network call (curl/POST/fetch to an external URL) with secrets/credentials/environment variables — a classic exfiltration shape.",
    fixable: false,
  },
  {
    ruleId: "sec/env-base64",
    title: "Encoding of secrets/env",
    category: "security",
    defaultSeverity: "warning",
    description:
      "The content base64-encodes (or otherwise obfuscates) environment variables or secrets, often a precursor to covert exfiltration.",
    fixable: false,
  },
  {
    ruleId: "sec/secret-access",
    title: "Reads sensitive files/secrets",
    category: "security",
    defaultSeverity: "warning",
    description:
      "The content references reading sensitive locations (~/.ssh, .env, credentials, cloud token files). Flagged for review; may be legitimate.",
    fixable: false,
  },
  {
    ruleId: "sec/suspicious-tool-combo",
    title: "Suspicious tool + content combination",
    category: "security",
    defaultSeverity: "warning",
    description:
      "A skill described as read-only/docs grants Bash plus a network/exec capability — a combination that enables exfiltration from otherwise-innocent content.",
    fixable: false,
  },
  {
    ruleId: "sec/destructive-command",
    title: "Destructive shell command in content",
    category: "security",
    defaultSeverity: "warning",
    description:
      "The content embeds a destructive command (e.g. `rm -rf /`, `curl | sh`, `git push --force`). Review before installing.",
    fixable: false,
  },
  {
    ruleId: "sec/hidden-unicode",
    title: "Hidden / bidi / zero-width Unicode",
    category: "security",
    defaultSeverity: "warning",
    description:
      "The content contains zero-width or bidirectional control characters that can hide instructions from a human reviewer (Trojan-Source style).",
    fixable: false,
  },
] as const;

const RULE_MAP = new Map<string, RuleDescriptor>(
  RULES.map((r) => [r.ruleId, r]),
);

/** Look up a rule descriptor by id. Throws if unknown (programmer error). */
export function getRule(ruleId: string): RuleDescriptor {
  const r = RULE_MAP.get(ruleId);
  if (!r) {
    throw new Error(
      `Internal error: rule '${ruleId}' is not registered in registry.ts`,
    );
  }
  return r;
}

/** All registered rule ids. */
export function allRuleIds(): string[] {
  return RULES.map((r) => r.ruleId);
}
