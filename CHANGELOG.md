# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`--fix` no longer rewrites the body's line endings.** When a file had a CRLF
  frontmatter but an LF-only body (or a lone `CR`), the rebuild re-joined the
  body with the frontmatter's EOL, silently converting every body line ending.
  `--fix` now re-attaches the body **byte-for-byte** from the original source —
  the (untrusted) body is never altered, reflowed, or re-encoded.
- **Exfiltration detection caught a real bypass.** A secret referenced as a
  shell/JS variable next to an outbound call — e.g.
  `curl -H "Authorization: Bearer $ANTHROPIC_API_KEY" https://…`, a named secret
  env var, or `${UPPER_VAR}` — was silently **not** flagged (a leading `\b`
  before `$` can never match a `$` preceded by whitespace). The
  "secret near an outbound call" check now recognizes `$VAR` / `${VAR}` (upper
  case env convention), `process.env.X`, and named secret env vars, while still
  ignoring benign lowercase shell vars like `$id` / `$result` (no new false
  positives).

### Changed

- **`sec/prompt-injection` now catches phrases split across a line break.** The
  per-line patterns could be bypassed by inserting a newline mid-phrase
  (`ignore the`⏎`previous instructions`); a second, deliberately tight canonical
  pass over a newline-flattened copy now catches that. Duplicate findings are
  de-duplicated, and it stays ReDoS-safe.
- **`skill/empty-description` is now `fixable: false`.** It was advertised as
  fixable, but `--fix` deliberately does not auto-overwrite an existing (even
  empty) description with a stub. The registry/SARIF `fixable` flag now matches
  the real behavior.
- **CI: bumped pinned GitHub Actions** (supersedes Dependabot #1) —
  `actions/checkout@v7`, `actions/setup-node@v6`,
  `github/codeql-action/upload-sarif@v4`, `actions/upload-artifact@v7`. The
  copy-paste workflow in `examples/` and the README snippet were bumped to match.

### Tests

- Added a `--fix` safety suite (round-trip / idempotency / body-preservation
  across every fixture, plus a CRLF-body regression) and a registry-integrity
  check that every `fixable: true` rule is actually repaired by `--fix`.
- Added bypass-caught + benign-allowed tests for the multi-line injection and
  corrected exfil detection, plus stricter SARIF 2.1.0 conformance assertions.
  Test count: 178 → 258.

## [0.1.0] - 2026-06-20

Initial release. Published to npm as **`@studiomeyer-io/skilldoctor`** (the CLI
command is `skilldoctor`).

### Added

- **CLI** — `skilldoctor check <path-or-glob...>` over `SKILL.md`, `AGENTS.md`, and
  `agents/*.md` subagent files. `--json`, `--sarif` (2.1.0), `--fix`,
  `--fail-on <sev>`, `--no-color`/`NO_COLOR`, `--quiet`. Exit codes `0`/`1`/`2`.
- **17 lint rules** — name/description validity (Agent Skills spec
  `^[a-z0-9]+(-[a-z0-9]+)*$`, 1-1024 description), name↔directory match,
  frontmatter schema, duplicate keys/names, and `tools/*` least-privilege checks
  (wildcard grant, over-broad-for-readonly, duplicate tool).
- **8 security-scan rules** — `prompt-injection`, `disable-safety`,
  `data-exfiltration`, `env-base64`, `secret-access`, `suspicious-tool-combo`,
  `destructive-command`, `hidden-unicode` (Trojan-Source). All regex/heuristic,
  ReDoS-safe, and **execute nothing**.
- **Grading** — per-file `0-100` + `A`-`F`; security findings weighted far above
  lint; a batch grade is pulled toward the single worst file.
- **`--fix`** — mechanical fixes, **frontmatter only, never the body**; idempotent;
  no-op on unparseable frontmatter.
- **Library API** — `analyzeContent`, `analyzeFiles`, `analyzePaths`, `fixFile`,
  `parseFile`, `discoverFiles`, `renderTerminal`, `toJsonReport`/`jsonString`,
  `toSarif`/`sarifString`, `RULES`. Dual ESM + CJS, `are-the-types-wrong` 4/4.
- **GitHub Action** example in `examples/skilldoctor.yml` (SARIF upload to code
  scanning).
- Format rules recognize the documented Claude Code skill/subagent extension
  fields (13 + 16) and treat unknown fields leniently (`info`, never a hard error).

### Security

- The content scanner reads hostile skills **as data** only — no `eval`/`exec`/
  `fetch`. Content regexes are ReDoS-resistant (2-5 MB pathological input
  finishes < 200 ms) and the YAML parser caps alias expansion (Billion-Laughs
  blocked). UTF-8 BOM is stripped before parsing.

[Unreleased]: https://github.com/studiomeyer-io/skilldoctor/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/studiomeyer-io/skilldoctor/releases/tag/v0.1.0
