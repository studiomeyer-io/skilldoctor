# Contributing to skilldoctor

Thanks for considering a contribution. skilldoctor lints and **security-scans**
files that an agent will treat as instructions, so two rules are non-negotiable:
every rule is **grounded in a real spec or threat class** (never invented from
opinion), and the scanner **never executes anything** — it reads text and matches
patterns. New rules ship with a fixture and a test.

## Quick Start

```sh
git clone https://github.com/studiomeyer-io/skilldoctor
cd skilldoctor
npm ci
npm run typecheck      # tsc --noEmit, strict
npm run build          # tsup, dual ESM + CJS
npm test               # vitest, incl. the ReDoS / Billion-Laughs tests
npm run attw           # are-the-types-wrong, must stay 4/4
node dist/cli.js check examples   # dogfood: scan our own fixtures (Grade A)
```

Node **20+**. CI runs on Node 20 and 22.

## What we accept

- **New lint rules** — but each must cite the spec it enforces (Agent Skills
  spec, Claude Code skill/subagent docs). A rule with no spec grounding is an
  opinion, not a lint. Unknown fields stay lenient (`info`), never a hard error.
- **New security rules** — must map to a documented threat class (prompt
  injection, data exfil, Trojan-Source, supply-chain). Ship the malicious **and**
  the benign fixture so we can measure false positives, and prove the pattern is
  ReDoS-safe (anchored, bounded — there's a test that throws 100 KB of adversarial
  input and asserts sub-second completion).
- **False-positive fixes.** A legit skill that gets mis-flagged is a real bug —
  send the fixture.
- **Docs.** Typo fixes, clarifications, ecosystem links.

## What we are slow on

- **Executing, fetching, or sandboxing skills.** skilldoctor is heuristic-only by
  design — that boundary is the safety guarantee, not a limitation. We will decline
  anything that runs untrusted content.
- **Runtime dependencies.** A scanner's dependency tree is itself a supply-chain
  surface. Discuss before adding one.
- **Rules invented from taste.** If you can't point at a spec or a threat, open an
  issue to discuss before a PR.

## Pull Request Process

1. Open an issue or draft PR first for anything non-trivial.
2. One logical change per PR.
3. CI must be green: `typecheck`, `build`, `test`, `attw`.
4. Add a `CHANGELOG.md` entry under `[Unreleased]`.
5. For security-impacting changes, see [SECURITY.md](SECURITY.md) — please email
   instead of opening a public issue.

## Coding Standards

- TypeScript strict. No `any` in shipped code.
- New rules go in `rules/lint.ts` or `security/scan.ts` with a stable `ruleId`
  (`category/kebab-name`) and a SARIF `reportingDescriptor`.
- `--fix` may only touch frontmatter, must be idempotent, and must no-op on
  unparseable input.
- Dual ESM/CJS correctness enforced — keep `are-the-types-wrong` at 4/4.

## Testing

- Tests live in `test/`, fixture-driven. Each rule needs a positive and a negative
  fixture; security rules also need a ReDoS-timing assertion.
- New behavior needs a test that fails on `main` and passes with your patch.

## Releasing (maintainers)

- Bump `version` in `package.json` and add a dated section to `CHANGELOG.md`.
- Tag `vX.Y.Z` on `main`. `publish.yml` runs `npm publish --provenance --access public`
  via OIDC (needs the `NPM_TOKEN` repo secret).

## License

By contributing, you agree your work is licensed under the [MIT License](LICENSE).

## Code of Conduct

Be kind. Assume good faith. We are a small studio in Palma de Mallorca — no drama,
disagreement is fine, contempt is not.
