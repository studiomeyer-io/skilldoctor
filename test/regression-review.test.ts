import { describe, it, expect } from "vitest";
import { fixFile } from "../src/fix.js";
import { parseFile } from "../src/parser.js";
import { analyzeContent } from "../src/analyze.js";
import { globToRegExp } from "../src/discover.js";
import { hasRule } from "./helpers.js";

// Regressions for the adversarial review of 2026-06-20.

describe("HIGH: --fix must never produce invalid YAML", () => {
  it("inserts the description stub WITHOUT splitting a block-valued name:", () => {
    // `name:` with a folded-scalar block value — inserting between the key and its
    // continuation would yield unparseable YAML.
    const src = "---\nname: >\n  my skill\n---\n\nbody\n";
    const fixed = fixFile(parseFile("/x/my-skill/SKILL.md", src));
    expect(fixed.changed).toBe(true);
    const reparsed = parseFile("/x/my-skill/SKILL.md", fixed.output);
    expect(reparsed.frontmatter.error).toBeUndefined(); // still valid YAML
    expect(reparsed.frontmatter.data?.["description"]).toBeDefined();
  });

  it("no-ops on frontmatter it cannot parse (never edits around a broken structure)", () => {
    const src = '---\nname: a\ndescription: "unterminated\n---\nbody\n';
    const parsed = parseFile("/x/a/SKILL.md", src);
    expect(parsed.frontmatter.error).toBeDefined();
    const fixed = fixFile(parsed);
    expect(fixed.changed).toBe(false);
    expect(fixed.output).toBe(src);
  });
});

describe("HIGH: tool grants with different specifiers are distinct, not duplicates", () => {
  const src =
    "---\nname: deploy\ndescription: a sufficiently long description for the linter to accept\nallowed-tools: Bash(git:*) Bash(jq:*) Read Read\n---\nbody\n";

  it("--fix dedups Read Read but KEEPS both Bash(git:*) and Bash(jq:*)", () => {
    const fixed = fixFile(parseFile("/x/deploy/SKILL.md", src));
    expect(fixed.output).toContain("Bash(git:*)");
    expect(fixed.output).toContain("Bash(jq:*)");
    // the genuine duplicate collapsed
    expect(fixed.output.match(/Read/g)?.length).toBe(1);
  });

  it("lint does not flag Bash(git:*) Bash(jq:*) as duplicate tools", () => {
    const r = analyzeContent(
      "/x/deploy/SKILL.md",
      "---\nname: deploy\ndescription: a sufficiently long description for the linter to accept\nallowed-tools: Bash(git:*) Bash(jq:*) Read\n---\nbody\n",
    );
    expect(hasRule(r.findings, "tools/duplicate-tool")).toBe(false);
  });
});

describe("MEDIUM: glob matcher is ReDoS-safe", () => {
  it("a 20x ** glob builds and rejects a non-match near-instantly", () => {
    const re = globToRegExp("/root/" + "**/".repeat(20) + "SKILL.md");
    const start = Date.now();
    const matched = re.test("/root/a/b/c/d/e/NOPE.txt");
    expect(matched).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000); // was exponential (>8s) before
  });
});

describe("LOW: a leading UTF-8 BOM does not break a valid skill", () => {
  it("BOM-prefixed skill is parsed normally (no false missing-field / hidden-unicode)", () => {
    const src =
      "﻿---\nname: csv-validator\ndescription: a sufficiently long description for the linter to accept\n---\nbody\n";
    const r = analyzeContent("/x/csv-validator/SKILL.md", src);
    expect(hasRule(r.findings, "skill/missing-name")).toBe(false);
    expect(hasRule(r.findings, "skill/missing-description")).toBe(false);
    expect(hasRule(r.findings, "sec/hidden-unicode")).toBe(false);
  });
});

describe("FP: safety DOCUMENTATION is not flagged as a safety bypass", () => {
  it('"never disable the content filter / do not skip approval" is clean', () => {
    const r = analyzeContent(
      "/x/s/SKILL.md",
      '---\nname: s\ndescription: "Security helper. Never disable the content filter and do not skip the approval step."\n---\nbody\n',
    );
    expect(hasRule(r.findings, "sec/disable-safety")).toBe(false);
  });
});

describe("FP: a deployment guide that needs Bash is not over-broad", () => {
  it('"deployment guide" + Bash does not trip over-broad-for-readonly', () => {
    const r = analyzeContent(
      "/x/deploy-guide/SKILL.md",
      '---\nname: deploy-guide\ndescription: "A deployment guide that runs the release pipeline."\nallowed-tools: Bash\n---\nbody\n',
    );
    expect(hasRule(r.findings, "tools/over-broad-for-readonly")).toBe(false);
  });
});
