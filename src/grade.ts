/**
 * Grading: turn a set of findings into a 0-100 score and an A-F letter grade.
 *
 * Security findings are weighted more heavily than lint findings, because the
 * whole point of skilldoctor is to surface supply-chain risk. The mapping is
 * deterministic and documented so grades are reproducible.
 */

import type { Finding, Grade, Severity } from "./types.js";

/** Penalty points per finding, by category + severity. */
const PENALTY: Record<"lint" | "security", Record<Severity, number>> = {
  lint: { error: 12, warning: 5, info: 1 },
  // Security errors are deliberately severe: a single hard hit should never
  // leave a file with a passing grade.
  security: { error: 60, warning: 20, info: 4 },
};

/** Compute a 0-100 score from findings (100 = clean). */
export function scoreFindings(findings: readonly Finding[]): number {
  let penalty = 0;
  for (const f of findings) {
    penalty += PENALTY[f.category][f.severity];
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

/** Map a numeric score to a letter grade. */
export function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/** Tally findings by severity. */
export function tally(findings: readonly Finding[]): Record<Severity, number> {
  const totals: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) totals[f.severity]++;
  return totals;
}

/**
 * Aggregate per-file scores into one overall score. We use a worst-weighted
 * average: the mean of file scores, pulled toward the single worst file so a
 * batch with one dangerous skill cannot be averaged into a good grade.
 */
export function aggregateScore(fileScores: readonly number[]): number {
  if (fileScores.length === 0) return 100;
  const mean =
    fileScores.reduce((a, b) => a + b, 0) / fileScores.length;
  const worst = Math.min(...fileScores);
  // 60% mean, 40% worst.
  return Math.round(mean * 0.6 + worst * 0.4);
}
