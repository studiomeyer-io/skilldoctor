/**
 * Security scanner — the core wedge of skilldoctor.
 *
 * Skill / instruction content is treated as UNTRUSTED INPUT (supply-chain
 * risk: skills are installed like packages). We scan the description + body for
 * patterns associated with prompt injection, data exfiltration, safety
 * bypasses, and obfuscation.
 *
 * Guarantees:
 *  - Heuristic + regex only. NOTHING is executed, fetched, or evaluated.
 *  - Every pattern is anchored/linear and ReDoS-safe: no nested unbounded
 *    quantifiers over overlapping character classes, no `(a+)+`-style traps.
 *    Where we need "x ... near ... y", we use a bounded window check on
 *    indices rather than a single backtracking regex.
 *  - This is a linter, NOT a sandbox. It will have false positives and false
 *    negatives. See README "heuristic, not a sandbox" disclaimer.
 */

import type { Finding, ParsedFile } from "../types.js";
import { getRule } from "../registry.js";
import { offsetToLineCol, makeEvidence } from "../locate.js";
import {
  parseToolList,
  normalizeToolName,
  EXEC_TOOLS,
  NETWORK_TOOLS,
  READONLY_HINT_RE,
} from "../spec.js";

/** A single regex-backed pattern. */
interface Pattern {
  ruleId: string;
  /** Linear, ReDoS-safe regex with the global flag. */
  re: RegExp;
  /** Build the message for a match. */
  message: (match: RegExpExecArray) => string;
}

/**
 * Prompt-injection phrasings. Each alternative is a fixed-ish phrase with only
 * bounded, non-overlapping wildcards (`[^\n]{0,40}` windows), so there is no
 * catastrophic backtracking.
 */
const INJECTION_PATTERNS: readonly Pattern[] = [
  {
    ruleId: "sec/prompt-injection",
    re: /ignore (?:all |any |the )?(?:previous|prior|above|earlier|preceding)[^\n]{0,30}\b(?:instruction|prompt|message|context|rule)s?/gi,
    message: () => 'Contains "ignore previous instructions"-style injection.',
  },
  {
    ruleId: "sec/prompt-injection",
    re: /disregard[^\n]{0,30}\b(?:previous|prior|system|above|all)[^\n]{0,20}\b(?:instruction|prompt|rule|message)s?/gi,
    message: () => 'Contains "disregard ... instructions/system prompt" injection.',
  },
  {
    ruleId: "sec/prompt-injection",
    re: /(?:forget|override|bypass)[^\n]{0,30}\b(?:your |the )?(?:system )?(?:prompt|instruction|rule|guideline)s?/gi,
    message: () =>
      'Instructs the agent to forget/override/bypass its prompt or rules.',
  },
  {
    ruleId: "sec/prompt-injection",
    re: /\b(?:you are now|from now on,? you are|act as)[^\n]{0,40}\b(?:DAN|jailbroken|unrestricted|developer mode|no(?:t bound by| longer bound by| restrictions))/gi,
    message: () => "Contains a role-override / jailbreak persona instruction.",
  },
  {
    ruleId: "sec/prompt-injection",
    re: /\bnew (?:system )?(?:instructions?|prompt|directive)s?\s*:/gi,
    message: () =>
      'Injects a "new instructions:" block (prompt-override pattern).',
  },
];

/** Instructions to disable safety, hooks, approval gates, guardrails. */
const SAFETY_PATTERNS: readonly Pattern[] = [
  {
    ruleId: "sec/disable-safety",
    // Negative lookbehind: don't flag safety *documentation* like
    // "never disable the content filter" / "do not bypass guardrails".
    re: /(?<!\b(?:never|not|do not|don'?t|cannot|must not|should not)\s{1,6})\b(?:disable|turn off|bypass|skip|remove|ignore)[^\n]{0,40}\b(?:safety|guardrail|guard|content[- ]?filter|moderation|approval|confirmation|hook)s?\b/gi,
    message: () => "Instructs the agent to disable safety/guardrails/hooks.",
  },
  {
    ruleId: "sec/disable-safety",
    re: /(?<!\b(?:never|not|do not|don'?t|cannot|must not|should not)\s{1,6})\b(?:without|skip|no need for|don'?t (?:ask|request|require))[^\n]{0,30}\b(?:permission|approval|confirmation|consent)\b/gi,
    message: () =>
      "Tells the agent to act without permission/approval/confirmation.",
  },
  {
    ruleId: "sec/disable-safety",
    re: /--dangerously-skip-permissions|CLAUDE_SKIP_[A-Z_]+\s*=\s*1|--yolo\b/g,
    message: () =>
      "References a flag/env that disables the harness safety prompts.",
  },
];

/** Encoding / obfuscation of secrets or environment. */
const ENCODE_PATTERNS: readonly Pattern[] = [
  {
    ruleId: "sec/env-base64",
    re: /\b(?:base64|btoa|b64encode|xxd|openssl enc)\b[^\n]{0,60}\b(?:env|environ|secret|token|key|password|credential)/gi,
    message: () => "Encodes environment/secret values (possible covert exfil).",
  },
  {
    ruleId: "sec/env-base64",
    re: /\b(?:env|printenv|cat[^\n]{0,20}\.env)\b[^\n]{0,30}\|\s*(?:base64|xxd|openssl)/gi,
    message: () => "Pipes environment/.env contents into an encoder.",
  },
];

/** Reads of sensitive files / secret stores. */
const SECRET_ACCESS_PATTERNS: readonly Pattern[] = [
  {
    ruleId: "sec/secret-access",
    re: /(?:~\/?\.ssh\/|\.ssh\/id_(?:rsa|ed25519|ecdsa)|authorized_keys|known_hosts)/g,
    message: () => "References SSH key material (~/.ssh, id_rsa, …).",
  },
  {
    ruleId: "sec/secret-access",
    re: /(?:\.aws\/credentials|\.config\/gcloud|\.kube\/config|\.docker\/config\.json|\.netrc|\.npmrc)\b/g,
    message: () => "References a cloud/credential config file.",
  },
  {
    ruleId: "sec/secret-access",
    re: /\b(?:cat|read|open|less|head|tail)\b[^\n]{0,20}\b[^\n]{0,40}\.env(?:\.[a-z]+)?\b/gi,
    message: () => "Reads a .env file (may contain secrets).",
  },
  {
    ruleId: "sec/secret-access",
    re: /\b(?:AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GITHUB_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|GH_TOKEN|NPM_TOKEN|STRIPE_[A-Z_]*KEY|DATABASE_URL)\b/g,
    message: (m) => `References a known secret environment variable (${m[0]}).`,
  },
];

/** Destructive commands embedded in content. */
const DESTRUCTIVE_PATTERNS: readonly Pattern[] = [
  {
    ruleId: "sec/destructive-command",
    re: /\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/|~|\$HOME|\*)/gi,
    message: () => "Contains a recursive force-delete (rm -rf) of a broad path.",
  },
  {
    ruleId: "sec/destructive-command",
    re: /\b(?:curl|wget)\b[^\n]{0,80}\|\s*(?:sudo\s+)?(?:bash|sh|zsh|python3?|node)\b/gi,
    message: () => "Pipes a downloaded script straight into a shell (curl | sh).",
  },
  {
    ruleId: "sec/destructive-command",
    re: /\bgit\s+push[^\n]{0,40}(?:--force\b|-f\b|\+[A-Za-z])/gi,
    message: () => "Contains a force-push (git push --force).",
  },
  {
    ruleId: "sec/destructive-command",
    re: /\b(?:chmod|chown)\s+-R[^\n]{0,20}(?:777|a\+rwx)/gi,
    message: () => "Recursively grants world-writable permissions.",
  },
];

/**
 * Exfiltration: an outbound network call to an external URL combined with
 * secrets/env. We detect this as a co-occurrence within a bounded window
 * rather than one big regex (avoids backtracking and catches real cases).
 */
const OUTBOUND_RE =
  /\b(?:curl|wget|fetch|axios|http(?:s)?\.request|requests\.(?:post|get)|invoke-webrequest|Invoke-RestMethod)\b[^\n]{0,200}https?:\/\/[^\s"'`]+/gi;

const SECRET_NEAR_RE =
  /\b(?:env|environ|process\.env|secret|token|api[_-]?key|password|credential|\$[A-Z_]{3,})\b/i;

/** All single-regex pattern groups. */
const SINGLE_PATTERN_GROUPS: readonly (readonly Pattern[])[] = [
  INJECTION_PATTERNS,
  SAFETY_PATTERNS,
  ENCODE_PATTERNS,
  SECRET_ACCESS_PATTERNS,
  DESTRUCTIVE_PATTERNS,
];

/**
 * Zero-width and bidirectional control characters (Trojan-Source style hiding).
 * Built from explicit code points so the source stays plain-ASCII and portable:
 *  - U+200B-U+200F  zero-width space/joiners + LRM/RLM
 *  - U+202A-U+202E  bidi embedding/override (LRE/RLE/PDF/LRO/RLO)
 *  - U+2060         word joiner
 *  - U+2066-U+2069  bidi isolates (LRI/RLI/FSI/PDI)
 *  - U+FEFF         zero-width no-break space / BOM
 */
const HIDDEN_UNICODE_RE = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\u2066-\\u2069\\uFEFF]",
  "g",
);

function finding(
  ruleId: string,
  message: string,
  line: number,
  column: number,
  evidence?: string,
): Finding {
  const rule = getRule(ruleId);
  const f: Finding = {
    ruleId: rule.ruleId,
    title: rule.title,
    category: rule.category,
    severity: rule.defaultSeverity,
    message,
    line: Math.max(1, line),
    column: Math.max(1, column),
    fixable: rule.fixable,
  };
  if (evidence !== undefined) f.evidence = evidence;
  return f;
}

/**
 * Scan one parsed file's untrusted content (description + body).
 * The body is offset by `bodyStartLine` for accurate line numbers; the
 * description is reported at its frontmatter line.
 */
export function scanFile(file: ParsedFile): Finding[] {
  const findings: Finding[] = [];

  // Build the scannable text segments with their base line offsets.
  type Segment = { text: string; baseLine: number };
  const segments: Segment[] = [];

  // Body segment.
  if (file.body.length > 0) {
    segments.push({ text: file.body, baseLine: file.bodyStartLine });
  }
  // Description segment (from frontmatter). Reported at frontmatter start so we
  // still flag injection hidden inside a description string.
  const desc = file.frontmatter.data?.["description"];
  if (typeof desc === "string" && desc.length > 0) {
    segments.push({ text: desc, baseLine: file.frontmatter.startLine || 1 });
  }

  // For AGENTS.md / unknown there is no frontmatter; scan the whole raw file.
  if (file.kind === "agents-md" || file.kind === "unknown") {
    segments.length = 0;
    segments.push({ text: file.raw, baseLine: 1 });
  }

  for (const seg of segments) {
    runSinglePatterns(seg.text, seg.baseLine, findings);
    runExfilCheck(seg.text, seg.baseLine, findings);
    runHiddenUnicode(seg.text, seg.baseLine, findings);
  }

  // Tool-aware checks need the frontmatter, not just text.
  runSuspiciousToolCombo(file, findings);

  return findings;
}

function locInSegment(
  text: string,
  index: number,
  baseLine: number,
): { line: number; column: number } {
  const { line, column } = offsetToLineCol(text, index);
  return { line: baseLine + (line - 1), column };
}

function runSinglePatterns(
  text: string,
  baseLine: number,
  findings: Finding[],
): void {
  for (const group of SINGLE_PATTERN_GROUPS) {
    for (const pat of group) {
      // Reset lastIndex defensively since these are module-level globals.
      pat.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = pat.re.exec(text)) !== null) {
        const { line, column } = locInSegment(text, m.index, baseLine);
        findings.push(
          finding(pat.ruleId, pat.message(m), line, column, makeEvidence(m[0])),
        );
        // Avoid infinite loops on zero-width matches.
        if (m.index === pat.re.lastIndex) pat.re.lastIndex++;
        if (++guard > 1000) break; // hard cap, pathological input safety
      }
    }
  }
}

function runExfilCheck(
  text: string,
  baseLine: number,
  findings: Finding[],
): void {
  OUTBOUND_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = OUTBOUND_RE.exec(text)) !== null) {
    // Look in a bounded window around the outbound call for a secret/env token.
    const start = Math.max(0, m.index - 160);
    const end = Math.min(text.length, m.index + m[0].length + 160);
    const window = text.slice(start, end);
    if (SECRET_NEAR_RE.test(window)) {
      const { line, column } = locInSegment(text, m.index, baseLine);
      findings.push(
        finding(
          "sec/data-exfiltration",
          "Outbound network call near secret/env values — possible data exfiltration.",
          line,
          column,
          makeEvidence(m[0]),
        ),
      );
    }
    if (m.index === OUTBOUND_RE.lastIndex) OUTBOUND_RE.lastIndex++;
    if (++guard > 1000) break;
  }
}

function runHiddenUnicode(
  text: string,
  baseLine: number,
  findings: Finding[],
): void {
  HIDDEN_UNICODE_RE.lastIndex = 0;
  const m = HIDDEN_UNICODE_RE.exec(text);
  if (m) {
    const { line, column } = locInSegment(text, m.index, baseLine);
    findings.push(
      finding(
        "sec/hidden-unicode",
        "Contains zero-width or bidirectional Unicode control characters that can hide text from a human reviewer.",
        line,
        column,
      ),
    );
  }
}

/**
 * Tool-aware: a skill/subagent described as read-only/docs that nonetheless
 * grants Bash plus a network/exec tool — the shape that turns innocent content
 * into an exfiltration vector.
 */
function runSuspiciousToolCombo(file: ParsedFile, findings: Finding[]): void {
  const data = file.frontmatter.data;
  if (!data) return;
  const toolValue = data["allowed-tools"] ?? data["tools"];
  const tokens = parseToolList(toolValue).map((t) => normalizeToolName(t));
  if (tokens.length === 0) return;

  const hasExec = tokens.some((t) => EXEC_TOOLS.has(t));
  const hasNet = tokens.some((t) => NETWORK_TOOLS.has(t));
  const desc = typeof data["description"] === "string" ? data["description"] : "";
  const readonly = READONLY_HINT_RE.test(desc);

  if (readonly && hasExec && hasNet) {
    findings.push(
      finding(
        "sec/suspicious-tool-combo",
        "A read-only/docs skill grants both shell execution and network access — this combination enables data exfiltration. Remove one or revise the description.",
        file.frontmatter.startLine || 1,
        1,
        makeEvidence(tokens.join(", ")),
      ),
    );
  }
}
