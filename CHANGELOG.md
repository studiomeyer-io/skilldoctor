# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
