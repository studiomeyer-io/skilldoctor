/**
 * JSON reporter. A stable, documented machine-readable shape of an analysis
 * report. Keep this versioned so downstream consumers can rely on it.
 */

import type { AnalysisReport } from "../types.js";

export const JSON_REPORT_VERSION = 1 as const;

export interface JsonReport {
  /** Schema version of this JSON output. */
  schemaVersion: typeof JSON_REPORT_VERSION;
  /** The tool that produced it. */
  tool: { name: "skilldoctor"; version: string };
  /** Aggregate grade + score. */
  summary: {
    grade: string;
    score: number;
    fileCount: number;
    errors: number;
    warnings: number;
    infos: number;
  };
  /** Per-file results. */
  files: AnalysisReport["files"];
}

/** Build the JSON report object. */
export function toJsonReport(
  report: AnalysisReport,
  toolVersion: string,
): JsonReport {
  return {
    schemaVersion: JSON_REPORT_VERSION,
    tool: { name: "skilldoctor", version: toolVersion },
    summary: {
      grade: report.grade,
      score: report.score,
      fileCount: report.files.length,
      errors: report.totals.error,
      warnings: report.totals.warning,
      infos: report.totals.info,
    },
    files: report.files,
  };
}

/** Serialize the JSON report. */
export function jsonString(
  report: AnalysisReport,
  toolVersion: string,
): string {
  return JSON.stringify(toJsonReport(report, toolVersion), null, 2);
}
