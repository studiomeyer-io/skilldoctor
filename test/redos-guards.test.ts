import { describe, it, expect } from "vitest";
import { globToRegExp } from "../src/discover.js";
import { trailingBlankLength } from "../src/locate.js";

// Regressionen zu den drei CodeQL-Funden vom 04.09.2026
// (js/regex-injection und zweimal js/polynomial-redos).

describe("globToRegExp: Grenze gegen katastrophales Backtracking", () => {
  it("nimmt die Muster an, die im Alltag vorkommen", () => {
    for (const glob of ["**/*.md", "src/**/*.ts", "*.md", "**/SKILL.md", "src/*/test/*.ts", "*a*b*c*d"]) {
      expect(() => globToRegExp(glob)).not.toThrow();
    }
  });

  it("lehnt ein Muster mit zu vielen einzelnen Sternen ab, statt haengenzubleiben", () => {
    // Ohne die Grenze braucht dieses Muster gegen einen 60-Zeichen-Pfad
    // ueber 80 Sekunden: `(?:.*/)?` gefolgt von neun `[^/]*`, die sich
    // beliebig aufteilen koennen.
    expect(() => globToRegExp("**/*a*a*a*a*a*a*a*a*b")).toThrow(/einzelne/);
  });

  it("bleibt auch bei einem boesartigen Muster unter einer Sekunde", () => {
    const ziel = "/" + "a".repeat(60);
    const start = performance.now();
    try {
      globToRegExp("**/*a*a*a*a*a*a*a*a*b").test(ziel);
    } catch {
      // erwartet: die Grenze greift
    }
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("zaehlt nur einzelne Sterne, nicht die Doppelsterne", () => {
    // Acht `**` plus ein `*` sind erlaubt: `**` erzeugt keine Aufteilung.
    expect(() => globToRegExp("**/**/**/**/**/**/**/**/*.md")).not.toThrow();
  });
});

describe("trailingBlankLength", () => {
  it("verhaelt sich wie /[ \\t]+$/", () => {
    const faelle: [string, number][] = [
      ["ohne", 0],
      ["mit  ", 2],
      ["mit\t\t", 2],
      ["gemischt \t \t", 4],
      ["", 0],
      ["   ", 3],
      ["a\u00A0", 0], // geschuetztes Leerzeichen zaehlt NICHT, wie im Original
      ["a\r", 0],     // Wagenruecklauf zaehlt NICHT, wie im Original
    ];
    for (const [ein, erwartet] of faelle) {
      expect(trailingBlankLength(ein), JSON.stringify(ein)).toBe(erwartet);
    }
  });

  it("bleibt bei einer langen Whitespace-Kette schnell", () => {
    // Mit /[ \t]+$/ braucht dieselbe Eingabe rund 570 ms.
    const boese = "\t".repeat(50_000) + "x";
    const start = performance.now();
    expect(trailingBlankLength(boese)).toBe(0);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
