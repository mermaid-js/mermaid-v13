import { describe, expect, it } from 'vitest';
import { isSpace, localOffset, SourceOffsets } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { parseTreeView } from '@mermaid-js/diagram-treeview';
import { treeViewLex, treeViewView } from '@mermaid-js/diagram-treeview/testing';
import { loadOracle } from '../oracle.ts';
import { treeViewGateCorpus } from './corpus.ts';

/**
 * Box-mode diagnostics (D486, #572; GAPS T2): on every source of the gate corpus that v12
 * rejected after its box pass ran (it rewrote the text, or it threw), v13's diagnostics name the
 * line v12 named, and point at the source column.
 *
 * - **Lines.** v12's message names a line of the text its treeView parser got (front matter,
 *   directives and comment lines removed, leading blanks trimmed): its box pass's own `Line N:`,
 *   or Langium's `line N` taken back through `remapErrorLines`. Its first line (Langium lists
 *   lexer errors first) is the line, counted the same way, of one of v13's error diagnostics or
 *   of a range they relate to. A Langium error at the end of the text names no line (`line ?`).
 * - **Columns.** v12's column is in the rewritten text (it never remapped columns). Taken back
 *   through v13's box pass (whose rewrite is gated against v12's) to the source character it
 *   came from, it is where one of v13's error diagnostics, or a range they relate to, starts.
 */
interface V12Place {
  line: number;
  column?: number;
}

/** The first `line N` (and `column C`) of v12's message. */
function v12Place(message: string): V12Place | undefined {
  const m = /\bline\s+(\d+)(?:, column (\d+))?/i.exec(message);
  if (!m) return undefined;
  return { line: Number(m[1]), ...(m[2] ? { column: Number(m[2]) } : {}) };
}

/** Line breaks: CRLF, CR or LF, as v12 read them all as LF. */
function breaksIn(text: string, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    const c = text.charCodeAt(i);
    if (c === 13 && text.charCodeAt(i + 1) === 10) continue;
    if (c === 10 || c === 13) out.push(i + 1);
  }
  return out;
}

describe('treeView box-mode diagnostics (D486)', () => {
  it("name v12's line and point at the source column", async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let lines = 0;
    let columns = 0;
    /** Columns where the source column is not v12's (the narrow box-drawing cases). */
    let moved = 0;
    for (const item of await treeViewGateCorpus()) {
      const { box } = treeViewLex(item.source);
      if (box.kind === 'none') continue;
      const v12 = await oracle.parse(item.source);
      if (v12.accepted) continue;
      const place = v12Place(v12.error);
      if (!place) continue;
      const src = item.source;
      const { bodyStart, view } = treeViewView(src);
      const offsets = view.runs ? new SourceOffsets(view.runs) : undefined;
      const toSource = (v: number) => (offsets ? offsets.source(v) : v);
      // v12's text: the view from the body, leading blanks trimmed.
      let p = localOffset(view, bodyStart);
      while (p < view.text.length && isSpace(view.text.charCodeAt(p))) p++;
      const starts = [p, ...breaksIn(view.text, p, view.text.length)];
      const lineOf = (at: number) => {
        const v = localOffset(view, at);
        let k = 0;
        while (k + 1 < starts.length && (starts[k + 1] ?? Infinity) <= v) k++;
        return k + 1;
      };
      const result = parseTreeView(src);
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      const ranges: Range[] = errors.flatMap((d) => [
        d.range,
        ...(d.related ?? []).map((r) => r.range),
      ]);
      const v13Lines = new Set(ranges.map((r) => lineOf(r.start)));
      lines++;
      if (!v13Lines.has(place.line)) {
        diffs.push(
          `${item.id}: v12 line ${place.line} (${v12.error.slice(0, 80)}), v13 lines ${[...v13Lines].join(', ')}: ${errors.map((e) => e.message).join(' | ')}`
        );
        continue;
      }
      if (box.kind !== 'rewrite' || place.column === undefined) continue;
      // The rewritten line v12 named: the one that came from v12's line `place.line`.
      const { text, first } = box.rewrite;
      const rewrittenStarts = [0, ...breaksIn(text, 0, text.length)];
      const k = rewrittenStarts.findIndex((s) => {
        const v = first[s];
        if (v === undefined) return false;
        let n = 0;
        while (n + 1 < starts.length && (starts[n + 1] ?? Infinity) <= v) n++;
        return n + 1 === place.line && s < text.length - 1;
      });
      const at = (rewrittenStarts[k] ?? 0) + place.column - 1;
      const v = first[at];
      if (k < 0 || v === undefined) {
        diffs.push(`${item.id}: v12's line ${place.line} is not in the rewrite`);
        continue;
      }
      columns++;
      const expected = toSource(v);
      const lineStart =
        Math.max(src.lastIndexOf('\n', expected - 1), src.lastIndexOf('\r', expected - 1)) + 1;
      if (expected - lineStart !== place.column - 1) moved++;
      if (!ranges.some((r) => r.start === expected)) {
        diffs.push(
          `${item.id}: v12 column ${place.column} is source offset ${expected}, v13 diagnostics at ${ranges.map((r) => r.start).join(', ')}`
        );
      }
    }
    process.stdout.write(
      `treeView box-mode diagnostics: ${lines} rejected box sources, ${columns} columns checked (${moved} not v12's)\n`
    );
    expect(lines).toBeGreaterThan(30);
    expect(columns).toBeGreaterThan(10);
    expect(moved).toBeGreaterThan(2);
    expect(diffs).toEqual([]);
  }, 120_000);
});
