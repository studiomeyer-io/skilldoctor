/**
 * File discovery. Given path(s) — a file, a directory, or a glob — resolve the
 * set of candidate markdown files to analyze.
 *
 * Deliberately dependency-free: a small recursive walker plus a minimal glob
 * matcher cover our needs (`**`, `*`, `?`) without pulling in fast-glob/globby.
 */

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, sep, posix } from "node:path";

/** Directories we never descend into. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

/** Candidate filenames/patterns when scanning a directory tree. */
function isCandidateMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".md")) return false;
  // We care about SKILL.md, AGENTS.md, and any .md inside an agents/ dir, but
  // when walking a directory we collect all .md and let the analyzer classify.
  return true;
}

/** True if a path string contains glob metacharacters. */
export function isGlob(p: string): boolean {
  return /[*?[\]{}]/.test(p);
}

/**
 * Convert a glob to an anchored RegExp. Supports `**` (any depth, incl. zero),
 * `*` (within a path segment), `?` (single char), and literal text. Forward
 * slashes only (we normalize input to posix).
 */
export function globToRegExp(glob: string): RegExp {
  const g = glob.replace(/\\/g, "/");
  let re = "";
  for (let i = 0; i < g.length; i++) {
    const c = g[i] as string;
    if (c === "*") {
      if (g[i + 1] === "*") {
        // `**` — match across segments (including none). Consume an optional
        // following slash so `a/**/b` matches `a/b`.
        i++;
        if (g[i + 1] === "/") i++;
        // Collapse a RUN of consecutive `**` (with their optional slashes) into a
        // SINGLE group. Emitting one optional `.*` group per `**` makes adjacent
        // groups overlap and backtrack catastrophically (ReDoS) when the trailing
        // literal fails to match — e.g. `**/**/**.../SKILL.md`.
        while (g[i + 1] === "*" && g[i + 2] === "*") {
          i += 2;
          if (g[i + 1] === "/") i++;
        }
        re += "(?:.*/)?";
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

/** Recursively walk a directory, collecting candidate markdown files. */
function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (st.isFile() && isCandidateMarkdown(entry)) {
      out.push(full);
    }
  }
}

/** Find the longest non-glob prefix directory of a glob pattern. */
function globBaseDir(glob: string): string {
  const norm = glob.replace(/\\/g, "/");
  const firstMeta = norm.search(/[*?[\]{}]/);
  const head = firstMeta === -1 ? norm : norm.slice(0, firstMeta);
  const lastSlash = head.lastIndexOf("/");
  const base = lastSlash === -1 ? "." : head.slice(0, lastSlash) || "/";
  return base;
}

/** To posix-style separators for matching. */
function toPosix(p: string): string {
  return p.split(sep).join(posix.sep);
}

/**
 * Resolve one or more input specs into a deduplicated, sorted list of absolute
 * file paths. Each spec may be a file, a directory, or a glob.
 */
export function discoverFiles(specs: readonly string[]): string[] {
  const found = new Set<string>();

  for (const spec of specs) {
    if (isGlob(spec)) {
      const base = resolve(globBaseDir(spec));
      const collected: string[] = [];
      walk(base, collected);
      const re = globToRegExp(toPosix(resolve(spec)));
      for (const f of collected) {
        if (re.test(toPosix(f))) found.add(f);
      }
      continue;
    }

    const abs = resolve(spec);
    if (!existsSync(abs)) {
      // Skip silently here; the caller reports "no files" overall.
      continue;
    }
    const st = statSync(abs);
    if (st.isDirectory()) {
      const collected: string[] = [];
      walk(abs, collected);
      for (const f of collected) found.add(f);
    } else if (st.isFile()) {
      found.add(abs);
    }
  }

  return [...found].sort();
}
