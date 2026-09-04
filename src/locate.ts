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

/**
 * Laenge des Laufs aus Leerzeichen und Tabs am Zeilenende. Ersetzt `/[ \t]+$/`.
 *
 * Die Regex braucht bei einer langen Kette solcher Zeichen quadratisch Zeit,
 * weil die Engine jede Startposition durchprobiert, wenn das letzte Zeichen
 * KEIN Whitespace ist (CodeQL js/polynomial-redos). Gemessen an einer Zeile aus
 * 50 000 Tabs plus einem `x`: 570 ms gegen 0 ms hier. Diese Fassung liest von
 * hinten und ist damit linear.
 *
 * Bewusst nicht `trimEnd()`: das entfernt auch \r, \n und Unicode-Leerraum und
 * waere damit nicht dasselbe.
 */
export function trailingBlankLength(line: string): number {
  let i = line.length;
  while (i > 0) {
    const code = line.charCodeAt(i - 1);
    if (code !== 32 && code !== 9) break;
    i--;
  }
  return line.length - i;
}
