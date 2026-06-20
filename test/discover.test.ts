import { describe, it, expect } from "vitest";
import { discoverFiles, isGlob, globToRegExp } from "../src/discover.js";
import { fixturePath } from "./helpers.js";

describe("glob helpers", () => {
  it("detects glob metacharacters", () => {
    expect(isGlob("**/SKILL.md")).toBe(true);
    expect(isGlob("a/b/c.md")).toBe(false);
    expect(isGlob("file-?.md")).toBe(true);
  });

  it("globToRegExp matches ** across segments", () => {
    const re = globToRegExp("/root/**/SKILL.md");
    expect(re.test("/root/a/SKILL.md")).toBe(true);
    expect(re.test("/root/a/b/c/SKILL.md")).toBe(true);
    expect(re.test("/root/SKILL.md")).toBe(true);
    expect(re.test("/root/a/SKILL.txt")).toBe(false);
  });

  it("globToRegExp * stays within a segment", () => {
    const re = globToRegExp("/root/*.md");
    expect(re.test("/root/a.md")).toBe(true);
    expect(re.test("/root/a/b.md")).toBe(false);
  });
});

describe("discoverFiles", () => {
  it("walks a directory recursively and finds skill files", () => {
    const files = discoverFiles([fixturePath()]);
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((f) => f.endsWith("clean-skill/SKILL.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("agents-md/AGENTS.md"))).toBe(true);
    // subagent nested under agents/
    expect(files.some((f) => f.endsWith("agents/code-reviewer.md"))).toBe(true);
  });

  it("accepts a direct file path", () => {
    const p = fixturePath("clean-skill", "SKILL.md");
    expect(discoverFiles([p])).toEqual([p]);
  });

  it("resolves a glob pattern", () => {
    const files = discoverFiles([fixturePath("**", "SKILL.md")]);
    expect(files.every((f) => f.endsWith("SKILL.md"))).toBe(true);
    expect(files.some((f) => f.endsWith("clean-skill/SKILL.md"))).toBe(true);
  });

  it("deduplicates overlapping specs", () => {
    const dir = fixturePath("clean-skill");
    const file = fixturePath("clean-skill", "SKILL.md");
    const files = discoverFiles([dir, file]);
    expect(files.filter((f) => f === file)).toHaveLength(1);
  });

  it("returns nothing for a non-existent path", () => {
    expect(discoverFiles(["/definitely/not/here/xyz"])).toEqual([]);
  });
});
