# skilldoctor

**A linter and security scanner for AI-agent skill & instruction files.** Think `eslint`, but for the `SKILL.md`, `AGENTS.md`, and subagent files that agents now install like packages.

[![CI](https://github.com/studiomeyer-io/skilldoctor/actions/workflows/ci.yml/badge.svg)](https://github.com/studiomeyer-io/skilldoctor/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/skilldoctor.svg)](https://www.npmjs.com/package/skilldoctor)
[![license](https://img.shields.io/npm/l/skilldoctor.svg)](./LICENSE)

```bash
npx @studiomeyer-io/skilldoctor check .claude/skills
```

```
my-skill/SKILL.md [skill]  F (0/100)
  2:1  ✖ error  `name` "My_Skill" is invalid. Use 1-64 lowercase chars …  skill/invalid-name
  6:1  ✖ error  Contains "ignore previous instructions"-style injection.   sec/prompt-injection
  7:11 ✖ error  Outbound network call near secret/env values — possible …  sec/data-exfiltration
```

---

## Why this exists

In 2026, "skills" exploded as the way to extend coding agents. Claude Code reads `SKILL.md` files; **`AGENTS.md`** became a cross-tool convention (adopted by Cursor, Codex, Gemini CLI, Copilot, and [dozens of other agents](https://agentskills.io/clients)); subagents carry their own YAML frontmatter. The [Agent Skills](https://agentskills.io) format is now an open standard.

These files are **shared and installed like packages** — copied from a gist, cloned from a repo, pulled from a marketplace. That creates two gaps with no off-the-shelf tooling:

1. **No linter.** Nothing validates the frontmatter, catches an over-broad `tools:` grant, or flags a missing/vague `description` that makes a skill invisible to the agent.
2. **No security scan.** A skill's *body is a prompt that the agent will follow*. A malicious or careless skill can hide prompt-injection text, a `curl … $(env)` exfiltration line, or a "disable the approval prompt" instruction inside what looks like a helpful workflow. This is a real supply-chain surface — NVIDIA shipped a research scanner ("SkillSpector") for exactly this class of risk, and the broader prompt-injection/agent supply-chain problem is well documented (e.g. [Simon Willison on prompt injection](https://simonwillison.net/series/prompt-injection/), the [OWASP LLM Top 10](https://genai.owasp.org/)).

Tools that **sync/install** skills exist. A **linter + security scanner** for them did not. `skilldoctor` is that tool.

> **Honest disclaimer — heuristic, not a sandbox.** skilldoctor reads text and matches patterns. It **never executes, fetches, or evaluates anything**. It will have false positives (a legit skill that documents `curl`) and false negatives (novel obfuscation). It is a fast first line of defense and a CI gate — **not** a guarantee that an installed skill is safe. Always read skills before trusting them.

---

## Install

```bash
# one-off
npx @studiomeyer-io/skilldoctor check <path>

# or add to a project
npm install --save-dev @studiomeyer-io/skilldoctor
# (the installed command is `skilldoctor`)
```

Requires Node.js ≥ 20. Heuristic-only by default — **no API key needed**.

## Usage

```bash
skilldoctor check <path-or-glob...> [options]
```

`<path-or-glob>` can be a file, a directory (scanned recursively for `SKILL.md`, `AGENTS.md`, and `agents/*.md`), or a glob like `"**/SKILL.md"`.

| Option | Description |
| --- | --- |
| `--json <file>` | Write a machine-readable JSON report. |
| `--sarif <file>` | Write a SARIF 2.1.0 report (for GitHub code scanning). |
| `--fix` | Apply mechanical fixes in place. **Frontmatter only — never the body.** |
| `--fail-on <sev>` | Exit non-zero if any finding is at/above `error` \| `warning` \| `info`. Default `error`. |
| `--no-color` | Disable ANSI colors (also respects `NO_COLOR`). |
| `--quiet` | Suppress the terminal report (still writes `--json`/`--sarif`). |
| `-h, --help` / `-v, --version` | Help / version. |

**Exit codes:** `0` clean (relative to `--fail-on`), `1` findings at/above threshold, `2` usage error / no files found.

```bash
skilldoctor check .claude/skills --fail-on warning
skilldoctor check "**/SKILL.md" --sarif results.sarif
skilldoctor check AGENTS.md --json report.json
skilldoctor check ./skills --fix
```

## What it checks

skilldoctor validates against the **base [Agent Skills spec](https://agentskills.io/specification)** strictly, **recognizes** the documented Claude Code extension fields (so they are never mis-flagged), and treats genuinely unknown fields **leniently** (an `info`, not an error) — because clients are free to add their own metadata and the tool should not invent rules.

It understands three file kinds:

- **`SKILL.md`** — Agent Skills / Claude Code skill (frontmatter `name` + `description`, optional `allowed-tools`, …).
- **subagent** — a `.md` in an `agents/` directory (frontmatter `name`, `description`, `tools`, `model`, …).
- **`AGENTS.md`** — plain markdown, no frontmatter required; only content/security checks apply.

### Lint rules (17)

| Rule | Default severity | Fixable | What it checks |
| --- | --- | --- | --- |
| `skill/missing-name` | error | no | `name` is required. |
| `skill/invalid-name` | error | no | `name` must be 1-64 lowercase chars (`a-z 0-9 -`), no leading/trailing/consecutive hyphens. |
| `skill/name-dir-mismatch` | warning | no | `name` must match the parent directory (spec). |
| `skill/missing-description` | error | yes | `description` is required (it's how agents decide when to load a skill). |
| `skill/empty-description` | error | yes | `description` is blank. |
| `skill/description-too-short` | warning | no | Too short to convey what/when. |
| `skill/description-too-long` | warning | no | Over the 1024-char spec limit. |
| `skill/vague-description` | info | no | Generic phrasing with no trigger keywords. |
| `skill/empty-body` | warning | no | Instruction body is empty. |
| `skill/frontmatter-schema` | error | no | YAML unparseable / not a mapping / wrong field type. |
| `skill/unknown-field` | info | no | Field not in the spec or known extensions (lenient). |
| `skill/duplicate-key` | warning | no | A frontmatter key appears twice (YAML keeps the last). |
| `skill/trailing-whitespace` | info | yes | Trailing whitespace in frontmatter. |
| `skill/duplicate-name` | error | no | Two files in the set declare the same `name`. |
| `tools/wildcard-grant` | warning | no | Bare `*` / `all` grant — least-privilege violation. |
| `tools/over-broad-for-readonly` | warning | no | Read-only description but write/exec/network tools granted. |
| `tools/duplicate-tool` | info | yes | Same tool listed twice. |

### Security-scan rules (8)

Run over the **description + body**, treated as untrusted input:

| Rule | Default severity | Fixable | What it detects |
| --- | --- | --- | --- |
| `sec/prompt-injection` | error | no | "ignore previous instructions", "disregard your system prompt", role-override/jailbreak personas, injected "new instructions:". |
| `sec/disable-safety` | error | no | Instructions to disable safety/guardrails/hooks/approval, or `--dangerously-skip-permissions`. |
| `sec/data-exfiltration` | error | no | An outbound call (curl/POST/fetch to an external URL) **near** secrets/env — the exfil shape. |
| `sec/env-base64` | warning | no | base64/encode of `env`/secrets (covert exfil precursor). |
| `sec/secret-access` | warning | no | Reads `~/.ssh`, `.aws/credentials`, `.env`, known secret env vars, … |
| `sec/suspicious-tool-combo` | warning | no | A "read-only/docs" skill that grants **Bash + network** — exfil-enabling combo. |
| `sec/destructive-command` | warning | no | `rm -rf /`, `curl … \| sh`, `git push --force`, recursive `chmod 777`. |
| `sec/hidden-unicode` | warning | no | Zero-width / bidirectional control characters that hide text from a human reviewer (Trojan-Source style). |

All patterns are regex/heuristic, **ReDoS-safe** (anchored, bounded windows — no catastrophic backtracking; there's a test that throws 100 KB of adversarial input at the scanner and asserts it finishes in well under a second), and **execute nothing**.

## Grading

Each file gets a `0-100` score and an `A`–`F` grade. Findings deduct points, weighted by category and severity — **security findings weigh far more than lint findings**, so a single hard security hit cannot leave a file with a passing grade. A batch grade is the mean of file scores pulled toward the single worst file, so one dangerous skill in a set can't be averaged away.

## CI: GitHub Action

Copy [`examples/skilldoctor.yml`](examples/skilldoctor.yml) into `.github/workflows/` to lint your skills on every push and upload findings to GitHub code scanning:

```yaml
name: skilldoctor
on: [push, pull_request]
permissions:
  contents: read
  security-events: write   # required to upload SARIF
jobs:
  lint-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx @studiomeyer-io/skilldoctor check ".claude/skills" "**/AGENTS.md" --sarif skilldoctor.sarif --fail-on warning
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: skilldoctor.sarif
```

## Library API

skilldoctor ships dual ESM + CJS with TypeScript types.

```ts
import { analyzeContent, fixFile, parseFile, sarifString } from "skilldoctor";

const report = analyzeContent("my-skill/SKILL.md", contents);
console.log(report.grade, report.score);
for (const f of report.findings) {
  console.log(`${f.line}:${f.column} ${f.severity} ${f.ruleId} ${f.message}`);
}

// mechanical fixes (frontmatter only)
const fixed = fixFile(parseFile("my-skill/SKILL.md", contents));
if (fixed.changed) writeFileSync("my-skill/SKILL.md", fixed.output);
```

Key exports: `analyzeContent`, `analyzeFiles`, `analyzePaths`, `fixFile`, `parseFile`, `discoverFiles`, `renderTerminal`, `toJsonReport`/`jsonString`, `toSarif`/`sarifString`, `RULES`, and all types.

## Sources (formats verified, not invented)

skilldoctor's rules are grounded in the actual current specs (checked while building, not from memory):

- **Agent Skills standard** — [agentskills.io/specification](https://agentskills.io/specification): `name` (≤64, `^[a-z0-9]+(-[a-z0-9]+)*$`, must match directory), `description` (1-1024, required), `license`, `compatibility` (≤500), `metadata`, `allowed-tools` (space-separated, experimental).
- **Claude Code skills** — [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills): recognizes the extension fields (`when_to_use`, `disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `paths`, `shell`, …); combined `description`+`when_to_use` is truncated at 1,536 chars in the skill listing.
- **Claude Code subagents** — [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents): `name` (required, lowercase+hyphens) + `description` (required), `tools` (comma-separated or list, inherits if omitted), `model` (`sonnet`/`opus`/`haiku`/`fable`/full-id/`inherit`).
- **AGENTS.md** — [agents.md](https://agents.md): "just standard Markdown … no required fields" — so skilldoctor only content/security-checks these.

When a field's meaning is uncertain, skilldoctor **warns leniently rather than inventing a hard rule**.

## License

[MIT](./LICENSE) © 2026 StudioMeyer. See [SECURITY.md](./SECURITY.md) for the security policy and the threat-model boundaries.
