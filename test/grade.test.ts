import { describe, it, expect } from "vitest";
import {
  scoreFindings,
  scoreToGrade,
  aggregateScore,
  tally,
} from "../src/grade.js";
import type { Finding } from "../src/types.js";

function f(
  category: "lint" | "security",
  severity: "error" | "warning" | "info",
): Finding {
  return {
    ruleId: "x/test",
    title: "t",
    category,
    severity,
    message: "m",
    line: 1,
    column: 1,
    fixable: false,
  };
}

describe("grading", () => {
  it("clean set scores 100 = A", () => {
    expect(scoreFindings([])).toBe(100);
    expect(scoreToGrade(100)).toBe("A");
  });

  it("a single security error tanks the score below passing", () => {
    const score = scoreFindings([f("security", "error")]);
    expect(score).toBeLessThan(60);
    expect(scoreToGrade(score)).toBe("F");
  });

  it("security findings weigh more than lint findings", () => {
    const lint = scoreFindings([f("lint", "error")]);
    const sec = scoreFindings([f("security", "error")]);
    expect(sec).toBeLessThan(lint);
  });

  it("score is clamped to [0,100]", () => {
    const many = Array.from({ length: 20 }, () => f("security", "error"));
    expect(scoreFindings(many)).toBe(0);
  });

  it("grade boundaries map correctly", () => {
    expect(scoreToGrade(90)).toBe("A");
    expect(scoreToGrade(89)).toBe("B");
    expect(scoreToGrade(80)).toBe("B");
    expect(scoreToGrade(79)).toBe("C");
    expect(scoreToGrade(70)).toBe("C");
    expect(scoreToGrade(69)).toBe("D");
    expect(scoreToGrade(60)).toBe("D");
    expect(scoreToGrade(59)).toBe("F");
  });

  it("aggregate is pulled toward the worst file", () => {
    // One perfect file + one terrible file should not average to a pass.
    const agg = aggregateScore([100, 0]);
    expect(agg).toBeLessThan(70);
  });

  it("aggregate of empty set is 100", () => {
    expect(aggregateScore([])).toBe(100);
  });

  it("tally counts severities", () => {
    const t = tally([
      f("lint", "error"),
      f("lint", "warning"),
      f("security", "warning"),
      f("lint", "info"),
    ]);
    expect(t).toEqual({ error: 1, warning: 2, info: 1 });
  });
});
