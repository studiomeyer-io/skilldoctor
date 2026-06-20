import { describe, it, expect } from "vitest";
import { analyzeContent, analyzeFiles } from "../src/analyze.js";
import { parseToolList, isWildcardTool, normalizeToolName } from "../src/spec.js";
import { getRule, allRuleIds, RULES } from "../src/registry.js";
import { fixturePath, readFixture, hasRule } from "./helpers.js";

describe("analyze — cross-file duplicate-name rule", () => {
  it("flags the same `name` declared in two files in the set", () => {
    const report = analyzeFiles([
      {
        filePath: fixturePath("dup-a", "SKILL.md"),
        content: readFixture("dup-a", "SKILL.md"),
      },
      {
        filePath: fixturePath("dup-b", "SKILL.md"),
        content: readFixture("dup-b", "SKILL.md"),
      },
    ]);
    expect(report.files).toHaveLength(2);
    // Both files are told about the collision, pointing at the other file.
    for (const file of report.files) {
      expect(hasRule(file.findings, "skill/duplicate-name")).toBe(true);
    }
    const msg = report.files[0]!.findings.find(
      (f) => f.ruleId === "skill/duplicate-name",
    )!.message;
    expect(msg).toContain("shared-name");
    expect(msg).toContain("dup-b");
  });

  it("does NOT flag duplicate-name when each file has a distinct name", () => {
    const report = analyzeFiles([
      {
        filePath: "/x/a/SKILL.md",
        content:
          "---\nname: a\ndescription: a valid length description goes here for testing\n---\nbody",
      },
      {
        filePath: "/x/b/SKILL.md",
        content:
          "---\nname: b\ndescription: a valid length description goes here for testing\n---\nbody",
      },
    ]);
    for (const file of report.files) {
      expect(hasRule(file.findings, "skill/duplicate-name")).toBe(false);
    }
  });

  it("aggregates a clean set to grade A and tallies zero findings", () => {
    const report = analyzeFiles([
      {
        filePath: fixturePath("clean-skill", "SKILL.md"),
        content: readFixture("clean-skill", "SKILL.md"),
      },
    ]);
    expect(report.grade).toBe("A");
    expect(report.score).toBe(100);
    expect(report.totals).toEqual({ error: 0, warning: 0, info: 0 });
  });
});

describe("lint — name present-but-missing + unknown kind", () => {
  it("reports missing-name when frontmatter has a description but no name", () => {
    const r = analyzeContent(
      "/x/p/SKILL.md",
      "---\ndescription: a valid length description goes here for testing\n---\nbody",
    );
    expect(hasRule(r.findings, "skill/missing-name")).toBe(true);
    expect(hasRule(r.findings, "skill/missing-description")).toBe(false);
  });

  it("produces no lint findings for an unclassifiable plain markdown file", () => {
    const r = analyzeContent("/x/notes.md", "# Notes\n\nJust some prose, no frontmatter.");
    expect(r.kind).toBe("unknown");
    expect(r.findings).toHaveLength(0);
  });
});

describe("spec — parseToolList / wildcard / normalize", () => {
  it("parses a YAML list value and filters out non-strings", () => {
    expect(parseToolList(["Read", "Write", 5 as unknown as string, "Edit"])).toEqual([
      "Read",
      "Write",
      "Edit",
    ]);
  });

  it("parses a comma/space separated string", () => {
    expect(parseToolList("Read, Write Edit")).toEqual(["Read", "Write", "Edit"]);
  });

  it("returns [] for a non-string, non-array value", () => {
    expect(parseToolList(42)).toEqual([]);
    expect(parseToolList(undefined)).toEqual([]);
  });

  it("recognizes wildcard tokens and ignores ordinary tools", () => {
    expect(isWildcardTool("*")).toBe(true);
    expect(isWildcardTool("All")).toBe(true);
    expect(isWildcardTool("everything")).toBe(true);
    expect(isWildcardTool("Read")).toBe(false);
  });

  it("strips a permission specifier when normalizing a tool name", () => {
    expect(normalizeToolName("Bash(git:*)")).toBe("bash");
    expect(normalizeToolName("  WebFetch  ")).toBe("webfetch");
  });
});

describe("registry — getRule lookup", () => {
  it("returns the descriptor for a known rule id", () => {
    const r = getRule("sec/prompt-injection");
    expect(r.ruleId).toBe("sec/prompt-injection");
    expect(r.category).toBe("security");
    expect(r.defaultSeverity).toBe("error");
  });

  it("throws for an unregistered rule id (programmer error)", () => {
    expect(() => getRule("nope/does-not-exist")).toThrow(/not registered/);
  });

  it("allRuleIds returns one id per registered rule", () => {
    expect(allRuleIds()).toHaveLength(RULES.length);
    expect(new Set(allRuleIds()).size).toBe(RULES.length); // all unique
  });
});

import { findKeyLine, offsetToLineCol, makeEvidence } from "../src/locate.js";

describe("lint — flow-mapping frontmatter (keys not on their own lines)", () => {
  it("still flags a wildcard grant when frontmatter is a YAML flow mapping", () => {
    // Keys live inside `{ ... }` so findKeyLine cannot locate a `key:` line and
    // falls back to the frontmatter start line — the finding still fires.
    const r = analyzeContent(
      "/x/flowname/SKILL.md",
      '---\n{ name: flowname, description: "a valid length description goes here", allowed-tools: "*" }\n---\nbody',
    );
    expect(hasRule(r.findings, "tools/wildcard-grant")).toBe(true);
    const wf = r.findings.find((f) => f.ruleId === "tools/wildcard-grant")!;
    expect(wf.line).toBeGreaterThanOrEqual(1);
  });

  it("a SKILL.md with no real parent directory does not trip name-dir-mismatch", () => {
    const r = analyzeContent(
      "SKILL.md",
      "---\nname: thing\ndescription: a valid length description goes here for testing\n---\nbody",
    );
    expect(hasRule(r.findings, "skill/name-dir-mismatch")).toBe(false);
  });
});

describe("locate helpers", () => {
  it("findKeyLine returns the frontmatter start line when the key is absent", () => {
    expect(findKeyLine("name: a\ndescription: b", "missing", 2)).toBe(2);
  });

  it("findKeyLine returns the correct 1-based line when the key is present", () => {
    expect(findKeyLine("name: a\ndescription: b", "description", 2)).toBe(3);
  });

  it("offsetToLineCol clamps an out-of-range offset to the text length", () => {
    const text = "ab\ncd";
    expect(offsetToLineCol(text, 999)).toEqual({ line: 2, column: 3 });
    expect(offsetToLineCol(text, -5)).toEqual({ line: 1, column: 1 });
  });

  it("makeEvidence collapses whitespace and truncates over the max length", () => {
    expect(makeEvidence("  a\n  b\tc  ")).toBe("a b c");
    const long = makeEvidence("x".repeat(200), 10);
    expect(long.length).toBe(10);
    expect(long.endsWith("…")).toBe(true);
  });
});
