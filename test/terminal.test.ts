import { describe, it, expect, afterEach } from "vitest";
import { renderTerminal } from "../src/output/terminal.js";
import { analyzeFiles } from "../src/analyze.js";
import type { AnalysisReport } from "../src/types.js";

const EMPTY: AnalysisReport = {
  files: [],
  score: 100,
  grade: "A",
  totals: { error: 0, warning: 0, info: 0 },
};

/** A report with one fixable finding (duplicate tool) + findings to render. */
function fixableReport(): AnalysisReport {
  return analyzeFiles([
    {
      filePath: "/x/d/SKILL.md",
      content:
        "---\nname: d\ndescription: a valid length description goes here for testing\nallowed-tools: Read, Read\n---\nbody",
    },
  ]);
}

describe("renderTerminal", () => {
  it("reports the empty-set message when no files were analyzed", () => {
    const out = renderTerminal(EMPTY, { color: false });
    expect(out).toBe("No skill / instruction files found.");
  });

  it("renders a `(fixable)` marker for a mechanically-fixable finding", () => {
    const out = renderTerminal(fixableReport(), { color: false });
    expect(out).toContain("tools/duplicate-tool");
    expect(out).toContain("(fixable)");
  });

  it("renders findings, the grade badge, and the severity summary footer", () => {
    const out = renderTerminal(fixableReport(), { color: false });
    expect(out).toContain("/x/d/SKILL.md");
    expect(out).toMatch(/Grade [A-F]/);
    expect(out).toMatch(/info/);
  });

  it("emits ANSI escape codes when color is forced on", () => {
    const out = renderTerminal(fixableReport(), { color: true });
    expect(/\[/.test(out)).toBe(true);
  });

  it("emits no ANSI escape codes when color is forced off", () => {
    const out = renderTerminal(fixableReport(), { color: false });
    expect(/\[/.test(out)).toBe(false);
  });

  it("renders a clean file's ✓ no-findings line", () => {
    const clean = analyzeFiles([
      {
        filePath: "/x/c/SKILL.md",
        content:
          "---\nname: c\ndescription: a valid length description goes here for testing\n---\n\nDo the thing the skill does.\n",
      },
    ]);
    const out = renderTerminal(clean, { color: false });
    expect(out).toContain("no findings");
  });
});

describe("renderTerminal — color auto-detection via env", () => {
  const saved = {
    NO_COLOR: process.env["NO_COLOR"],
    FORCE_COLOR: process.env["FORCE_COLOR"],
  };
  afterEach(() => {
    if (saved.NO_COLOR === undefined) delete process.env["NO_COLOR"];
    else process.env["NO_COLOR"] = saved.NO_COLOR;
    if (saved.FORCE_COLOR === undefined) delete process.env["FORCE_COLOR"];
    else process.env["FORCE_COLOR"] = saved.FORCE_COLOR;
  });

  it("disables color when NO_COLOR is set (auto-detect path)", () => {
    process.env["NO_COLOR"] = "1";
    delete process.env["FORCE_COLOR"];
    const out = renderTerminal(fixableReport()); // no explicit color option
    expect(/\[/.test(out)).toBe(false);
  });

  it("enables color when FORCE_COLOR is set and NO_COLOR is not", () => {
    delete process.env["NO_COLOR"];
    process.env["FORCE_COLOR"] = "1";
    const out = renderTerminal(fixableReport()); // no explicit color option
    expect(/\[/.test(out)).toBe(true);
  });
  it("falls back to stdout.isTTY when neither NO_COLOR nor FORCE_COLOR is set", () => {
    delete process.env["NO_COLOR"];
    delete process.env["FORCE_COLOR"];
    const out = renderTerminal(fixableReport()); // auto-detect → Boolean(isTTY)
    // Under the test runner stdout is not a TTY, so color is off.
    const expectedOn = Boolean(process.stdout.isTTY);
    expect(/\x1b\[/.test(out)).toBe(expectedOn);
  });
});
