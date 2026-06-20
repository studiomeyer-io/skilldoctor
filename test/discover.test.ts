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

describe("discoverFiles — ignored directories", () => {
  it("walks a real directory and never descends into node_modules", () => {
    const found = discoverFiles([fixturePath()]);
    // The fixtures tree has no node_modules, but the IGNORED_DIRS guard must
    // hold: every result is a .md and none sits under an ignored dir.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.toLowerCase().endsWith(".md"))).toBe(true);
    expect(found.some((f) => f.includes("/node_modules/"))).toBe(false);
    expect(found.some((f) => f.includes("/.git/"))).toBe(false);
  });
});

describe("globToRegExp — ** consuming a trailing slash", () => {
  it("matches a/**/b at zero depth and at depth", () => {
    const re = globToRegExp("/r/a/**/b.md");
    expect(re.test("/r/a/b.md")).toBe(true);
    expect(re.test("/r/a/x/y/b.md")).toBe(true);
    expect(re.test("/r/a/b.txt")).toBe(false);
  });

  it("escapes regex metacharacters in literal path segments", () => {
    const re = globToRegExp("/r/a.b+c/SKILL.md");
    expect(re.test("/r/a.b+c/SKILL.md")).toBe(true);
    // The '.' and '+' are literal, not regex wildcards.
    expect(re.test("/r/axbxc/SKILL.md")).toBe(false);
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("discoverFiles — filesystem walk edge cases", () => {
  it("descends real subdirectories but skips IGNORED_DIRS (node_modules, .git)", () => {
    const root = mkdtempSync(join(tmpdir(), "skilldoctor-"));
    try {
      writeFileSync(join(root, "AGENTS.md"), "top\n");
      mkdirSync(join(root, "sub"));
      writeFileSync(join(root, "sub", "SKILL.md"), "nested\n");
      mkdirSync(join(root, "node_modules"));
      writeFileSync(join(root, "node_modules", "SKILL.md"), "ignored\n");
      mkdirSync(join(root, ".git"));
      writeFileSync(join(root, ".git", "AGENTS.md"), "ignored\n");

      const found = discoverFiles([root]);
      expect(found.some((f) => f.endsWith("/AGENTS.md"))).toBe(true);
      expect(found.some((f) => f.endsWith("/sub/SKILL.md"))).toBe(true);
      expect(found.some((f) => f.includes("/node_modules/"))).toBe(false);
      expect(found.some((f) => f.includes("/.git/"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("silently skips an unreadable directory instead of throwing", () => {
    if (process.getuid && process.getuid() === 0) return; // root bypasses perms
    const root = mkdtempSync(join(tmpdir(), "skilldoctor-"));
    const locked = join(root, "locked");
    try {
      writeFileSync(join(root, "SKILL.md"), "ok\n");
      mkdirSync(locked);
      writeFileSync(join(locked, "SKILL.md"), "hidden\n");
      chmodSync(locked, 0o000);

      const found = discoverFiles([root]);
      // The readable file is found; the unreadable dir is skipped without error.
      expect(found.some((f) => f.endsWith("/SKILL.md"))).toBe(true);
    } finally {
      chmodSync(locked, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ignores a non-existent spec mixed with a real one", () => {
    const root = mkdtempSync(join(tmpdir(), "skilldoctor-"));
    try {
      writeFileSync(join(root, "SKILL.md"), "ok\n");
      const found = discoverFiles(["/no/such/path/here", root]);
      expect(found).toHaveLength(1);
      expect(found[0]!.endsWith("/SKILL.md")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("discover — non-markdown + glob ? / base-dir", () => {
  it("collects .md files but skips non-markdown files during a walk", () => {
    const root = mkdtempSync(join(tmpdir(), "skilldoctor-"));
    try {
      writeFileSync(join(root, "SKILL.md"), "x\n");
      writeFileSync(join(root, "README.md"), "z\n");
      writeFileSync(join(root, "notes.txt"), "y\n");
      const found = discoverFiles([root]);
      expect(found.some((f) => f.endsWith("/SKILL.md"))).toBe(true);
      expect(found.some((f) => f.endsWith("/notes.txt"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("globToRegExp ? matches exactly one character within a segment", () => {
    const re = globToRegExp("/r/file-?.md");
    expect(re.test("/r/file-a.md")).toBe(true);
    expect(re.test("/r/file-ab.md")).toBe(false);
    expect(re.test("/r/file-.md")).toBe(false);
  });

  it("resolves a glob whose base directory is the fixtures root", () => {
    const files = discoverFiles([fixturePath("*-skill", "SKILL.md")]);
    expect(files.some((f) => f.endsWith("clean-skill/SKILL.md"))).toBe(true);
  });
});
