import { describe, it, expect } from "vitest";
import { extractFrontmatter, detectKind, parseFile } from "../src/parser.js";
import { analyzeContent } from "../src/analyze.js";
import { hasRule } from "./helpers.js";

describe("extractFrontmatter", () => {
  it("parses a well-formed frontmatter block and body", () => {
    const raw = `---\nname: foo\ndescription: bar baz\n---\n\n# Body\n\ntext`;
    const { frontmatter, body, bodyStartLine } = extractFrontmatter(raw);
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.error).toBeUndefined();
    expect(frontmatter.data).toEqual({ name: "foo", description: "bar baz" });
    expect(body.startsWith("\n# Body")).toBe(true);
    // Opening fence line 1, name line 2, desc line 3, closing fence line 4,
    // first body line is line 5.
    expect(bodyStartLine).toBe(5);
  });

  it("returns present=false when there is no frontmatter", () => {
    const raw = `# Just markdown\n\nNo frontmatter here.`;
    const { frontmatter, body } = extractFrontmatter(raw);
    expect(frontmatter.present).toBe(false);
    expect(frontmatter.data).toBeUndefined();
    expect(body).toBe(raw);
  });

  it("flags unterminated frontmatter", () => {
    const raw = `---\nname: foo\ndescription: bar\n\n# no closing fence`;
    const { frontmatter } = extractFrontmatter(raw);
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.error).toMatch(/[Uu]nterminated/);
  });

  it("reports a YAML parse error for malformed frontmatter", () => {
    const raw = `---\ndescription: "unterminated\n  this: is: broken: :\n---\n\nbody`;
    const { frontmatter } = extractFrontmatter(raw);
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.error).toBeTruthy();
    expect(frontmatter.data).toBeUndefined();
  });

  it("handles CRLF line endings", () => {
    const raw = `---\r\nname: crlf\r\ndescription: works\r\n---\r\n\r\nbody`;
    const { frontmatter } = extractFrontmatter(raw);
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.data).toEqual({ name: "crlf", description: "works" });
  });
});

describe("detectKind", () => {
  it("detects AGENTS.md regardless of case", () => {
    const { frontmatter } = extractFrontmatter("# plain");
    expect(detectKind("/x/AGENTS.md", frontmatter)).toBe("agents-md");
    expect(detectKind("/x/agents.md", frontmatter)).toBe("agents-md");
  });

  it("detects SKILL.md as skill", () => {
    const { frontmatter } = extractFrontmatter(
      "---\nname: a\ndescription: long enough description here\n---\nbody",
    );
    expect(detectKind("/x/a/SKILL.md", frontmatter)).toBe("skill");
  });

  it("detects a subagent inside an agents/ directory", () => {
    const { frontmatter } = extractFrontmatter(
      "---\nname: rev\ndescription: reviews code thoroughly and reports\ntools: Read\n---\nprompt",
    );
    expect(detectKind("/proj/.claude/agents/rev.md", frontmatter)).toBe(
      "subagent",
    );
  });

  it("falls back to unknown for a plain .md with no skill frontmatter", () => {
    const { frontmatter } = extractFrontmatter("# notes\n\njust notes");
    expect(detectKind("/x/notes.md", frontmatter)).toBe("unknown");
  });
});

describe("parseFile", () => {
  it("respects a forced kind", () => {
    const parsed = parseFile("/x/whatever.md", "# hi", "skill");
    expect(parsed.kind).toBe("skill");
  });
});

describe("extractFrontmatter — defensive YAML edge cases", () => {
  it("treats an empty frontmatter block as an empty mapping (no error)", () => {
    const { frontmatter } = extractFrontmatter("---\n\n---\n\nbody");
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.error).toBeUndefined();
    expect(frontmatter.data).toEqual({});
  });

  it("treats a comment-only frontmatter block as an empty mapping", () => {
    const { frontmatter } = extractFrontmatter("---\n# just a comment\n---\n\nbody");
    expect(frontmatter.error).toBeUndefined();
    expect(frontmatter.data).toEqual({});
  });

  it("reports an error when the frontmatter is a bare scalar, not a mapping", () => {
    const { frontmatter } = extractFrontmatter("---\njust a bare string\n---\n\nbody");
    expect(frontmatter.error).toMatch(/mapping/i);
    expect(frontmatter.data).toBeUndefined();
  });

  it("reports an error when the frontmatter is a top-level YAML list", () => {
    const { frontmatter } = extractFrontmatter("---\n- a\n- b\n---\n\nbody");
    expect(frontmatter.error).toMatch(/mapping/i);
    expect(frontmatter.data).toBeUndefined();
  });

  it("strips a leading UTF-8 BOM before the opening fence", () => {
    const parsed = parseFile(
      "/x/b/SKILL.md",
      "﻿---\nname: b\ndescription: bom-prefixed but still valid here\n---\nbody",
    );
    expect(parsed.frontmatter.present).toBe(true);
    expect(parsed.frontmatter.data).toEqual({
      name: "b",
      description: "bom-prefixed but still valid here",
    });
  });
});

describe("detectKind — subagent disambiguation", () => {
  it("classifies an agents/ file with only a description as a subagent", () => {
    const { frontmatter } = extractFrontmatter(
      "---\ndescription: only a description here, no name\n---\nbody",
    );
    expect(detectKind("/proj/agents/thing.md", frontmatter)).toBe("subagent");
  });

  it("classifies an agents/ file with only a name as a subagent", () => {
    const { frontmatter } = extractFrontmatter("---\nname: thing\n---\nbody");
    expect(detectKind("/proj/agents/thing.md", frontmatter)).toBe("subagent");
  });

  it("does NOT treat an agents/ file with no frontmatter as a subagent", () => {
    const { frontmatter } = extractFrontmatter("# plain notes, no frontmatter\n");
    expect(detectKind("/proj/agents/notes.md", frontmatter)).toBe("unknown");
  });
});

describe("detectKind — skill fallback by frontmatter shape", () => {
  it("classifies a non-SKILL.md file with name+description as a skill", () => {
    const { frontmatter } = extractFrontmatter(
      "---\nname: thing\ndescription: a real description for this skill manifest\n---\nbody",
    );
    expect(detectKind("/x/foo.md", frontmatter)).toBe("skill");
  });

  it("does NOT upgrade a non-agents file that has only a name to a skill", () => {
    const { frontmatter } = extractFrontmatter("---\nname: thing\n---\nbody");
    expect(detectKind("/x/foo.md", frontmatter)).toBe("unknown");
  });
});

describe("extractFrontmatter — non-YAMLParseError throws are caught", () => {
  it("surfaces a dangling YAML alias (ReferenceError) as a frontmatter error", () => {
    // `*undef` references an anchor that was never defined → the yaml library
    // throws a ReferenceError, NOT a YAMLParseError. It must still be reported.
    const { frontmatter } = extractFrontmatter(
      "---\nname: a\ndescription: *undef\n---\nbody",
    );
    expect(frontmatter.present).toBe(true);
    expect(frontmatter.error).toBeTruthy();
    expect(frontmatter.data).toBeUndefined();
  });

  it("analyzeContent reports skill/frontmatter-schema for a dangling alias", () => {
    const r = analyzeContent(
      "/x/a/SKILL.md",
      "---\nname: a\ndescription: *undef\n---\nbody",
    );
    expect(hasRule(r.findings, "skill/frontmatter-schema")).toBe(true);
  });
});
