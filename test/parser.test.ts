import { describe, it, expect } from "vitest";
import { extractFrontmatter, detectKind, parseFile } from "../src/parser.js";

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
