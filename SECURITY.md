# Security Policy

## Reporting a vulnerability

If you find a security issue in skilldoctor itself, please **do not open a public
issue**. Email the maintainers at **security@studiomeyer.io** (or open a private
GitHub security advisory). We aim to acknowledge within 72 hours.

Please include: affected version, a reproduction (a minimal skill/instruction
file that triggers the issue), and the impact you observed.

## Threat model — what skilldoctor is and is not

skilldoctor is a **static, heuristic linter + scanner**. Understanding its
boundaries is part of using it safely.

### What it does

- Reads skill / instruction files as **text**.
- Parses YAML frontmatter and matches documented patterns (lint + security).
- Emits findings, a grade, JSON, and SARIF.

### What it explicitly does NOT do

- **It never executes, sources, evals, or imports** any analyzed file.
- **It never makes network requests** as part of scanning. Heuristic-only by
  default; no API key required.
- **It is not a sandbox** and not a proof of safety. A clean skilldoctor report
  means "none of our heuristics fired," not "this skill is safe to run."

### Known limitations (by design)

- **False positives.** A legitimate skill that documents `curl`, `rm`, or quotes
  an injection string as an example may be flagged. Review findings in context.
- **False negatives.** Novel obfuscation, logic split across referenced files,
  or instructions phrased to evade the patterns can slip through.
- skilldoctor analyzes the files you point it at. It does **not** follow
  `references/` includes or fetch remote content.

### Safe-by-construction properties we maintain

- **No code execution** anywhere in the analysis path.
- **ReDoS resistance.** All scanner regexes are anchored/linear with bounded
  look-windows — no catastrophic backtracking. A regression test feeds the
  scanner large adversarial input and asserts it completes quickly.
- **`--fix` never rewrites body content.** Auto-fix only touches YAML
  frontmatter in deterministic, idempotent ways, so it can never silently alter
  (or appear to "sanitize") instruction text.

## Supported versions

The latest published `0.x` release receives security fixes. skilldoctor is
pre-1.0; APIs and rules may change between minor versions.
