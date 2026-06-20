/**
 * Small location helpers. Given source text and an offset (or a key/regex),
 * compute 1-based line/column. Used so findings can point at a real location.
 */

/** Convert a 0-based character offset into a 1-based {line, column}. */
export function offsetToLineCol(
  text: string,
  offset: number,
): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastNewline = i;
    }
  }
  const column = clamped - lastNewline;
  return { line, column };
}

/**
 * Find the 1-based line of a top-level YAML key within frontmatter source.
 * Returns the offset of `frontmatterStartLine` if not found.
 */
export function findKeyLine(
  frontmatterRaw: string,
  key: string,
  frontmatterStartLine: number,
): number {
  const lines = frontmatterRaw.split(/\r?\n/);
  const re = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) {
      return frontmatterStartLine + i;
    }
  }
  return frontmatterStartLine;
}

/** Escape a string for safe use inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Truncate evidence to a sane length, single line, never executed. */
export function makeEvidence(snippet: string, max = 120): string {
  const oneLine = snippet.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "…";
}
