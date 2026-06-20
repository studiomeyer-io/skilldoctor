import { describe, it, expect } from "vitest";
import { analyzeContent } from "../src/analyze.js";
import { fixturePath, readFixture, hasRule } from "./helpers.js";

/** Analyze a fixture by its directory + filename, using its real path. */
function analyzeFixture(dir: string, file = "SKILL.md") {
  return analyzeContent(fixturePath(dir, file), readFixture(dir, file));
}

describe("lint rules", () => {
  it("clean skill has no findings and grade A", () => {
    const r = analyzeFixture("clean-skill");
    expect(r.findings).toHaveLength(0);
    expect(r.grade).toBe("A");
    expect(r.score).toBe(100);
  });

  it("missing description is an error", () => {
    const r = analyzeFixture("missing-desc");
    expect(hasRule(r.findings, "skill/missing-description")).toBe(true);
    expect(r.grade).not.toBe("A");
  });

  it("empty description is an error", () => {
    const r = analyzeFixture("empty-desc");
    expect(hasRule(r.findings, "skill/empty-description")).toBe(true);
  });

  it("short description warns", () => {
    const r = analyzeFixture("short-desc");
    expect(hasRule(r.findings, "skill/description-too-short")).toBe(true);
  });

  it("vague description is info-flagged without being too short", () => {
    const r = analyzeFixture("vague-desc");
    expect(hasRule(r.findings, "skill/vague-description")).toBe(true);
    expect(hasRule(r.findings, "skill/description-too-short")).toBe(false);
  });

  it("invalid name format is an error", () => {
    const r = analyzeContent(
      "/x/Bad_Name/SKILL.md",
      "---\nname: Bad_Name\ndescription: a valid length description goes here for testing\n---\nbody",
    );
    expect(hasRule(r.findings, "skill/invalid-name")).toBe(true);
  });

  it("name not matching the directory warns", () => {
    const r = analyzeContent(
      "/x/wrong-dir/SKILL.md",
      "---\nname: other-name\ndescription: a valid length description goes here for testing\n---\nbody",
    );
    expect(hasRule(r.findings, "skill/name-dir-mismatch")).toBe(true);
  });

  it("wildcard tool grant warns", () => {
    const r = analyzeFixture("wildcard-tools");
    expect(hasRule(r.findings, "tools/wildcard-grant")).toBe(true);
  });

  it("over-broad tools for a read-only description warn (least privilege)", () => {
    const r = analyzeFixture("over-privileged");
    expect(hasRule(r.findings, "tools/over-broad-for-readonly")).toBe(true);
  });

  it("duplicate tools are flagged", () => {
    const r = analyzeContent(
      "/x/dup/SKILL.md",
      "---\nname: dup\ndescription: a valid length description goes here for testing\nallowed-tools: Read, Read, Grep\n---\nbody",
    );
    expect(hasRule(r.findings, "tools/duplicate-tool")).toBe(true);
  });

  it("empty body warns", () => {
    const r = analyzeContent(
      "/x/eb/SKILL.md",
      "---\nname: eb\ndescription: a valid length description goes here for testing\n---\n",
    );
    expect(hasRule(r.findings, "skill/empty-body")).toBe(true);
  });

  it("malformed frontmatter is a schema error", () => {
    const r = analyzeFixture("malformed-fm");
    expect(hasRule(r.findings, "skill/frontmatter-schema")).toBe(true);
  });

  it("duplicate frontmatter key warns", () => {
    const r = analyzeFixture("duplicate-key");
    expect(hasRule(r.findings, "skill/duplicate-key")).toBe(true);
  });

  it("trailing whitespace in frontmatter is flagged as fixable", () => {
    const r = analyzeFixture("trailing-ws");
    const f = r.findings.find((x) => x.ruleId === "skill/trailing-whitespace");
    expect(f).toBeTruthy();
    expect(f?.fixable).toBe(true);
  });

  it("unknown frontmatter field is lenient (info)", () => {
    const r = analyzeContent(
      "/x/uf/SKILL.md",
      "---\nname: uf\ndescription: a valid length description goes here for testing\nbananas: yes\n---\nbody",
    );
    const f = r.findings.find((x) => x.ruleId === "skill/unknown-field");
    expect(f).toBeTruthy();
    expect(f?.severity).toBe("info");
  });

  it("recognizes Claude Code extension fields without flagging them", () => {
    const r = analyzeContent(
      "/x/cc/SKILL.md",
      '---\nname: cc\ndescription: a valid length description goes here for testing\nwhen_to_use: when X happens\ndisable-model-invocation: true\nmodel: inherit\n---\nbody',
    );
    expect(hasRule(r.findings, "skill/unknown-field")).toBe(false);
  });

  it("AGENTS.md is treated as plain markdown (no skill rules)", () => {
    const r = analyzeContent(
      fixturePath("agents-md", "AGENTS.md"),
      readFixture("agents-md", "AGENTS.md"),
    );
    expect(hasRule(r.findings, "skill/missing-name")).toBe(false);
    expect(hasRule(r.findings, "skill/missing-description")).toBe(false);
  });

  it("empty AGENTS.md warns about empty body", () => {
    const r = analyzeContent("/x/AGENTS.md", "   \n  ");
    expect(hasRule(r.findings, "skill/empty-body")).toBe(true);
  });

  it("subagent with tools field is valid and not flagged unknown", () => {
    const r = analyzeContent(
      fixturePath("subagent", "agents", "code-reviewer.md"),
      readFixture("subagent", "agents", "code-reviewer.md"),
    );
    expect(r.kind).toBe("subagent");
    expect(hasRule(r.findings, "skill/unknown-field")).toBe(false);
  });
});
