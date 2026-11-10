import { describe, expect, it } from 'vitest';
import { CR, isSpace, LF, localOffset, SourceOffsets } from '@mermaid-js/core/parser-kit';
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
 *   lexer errors first) is the line, counted the same way, of one of v13's error diagnostics.
 *   Only a `STRAY_BLANK` may name it in its related range instead: v13 reports the blank, v12
 *   the indent after it. A Langium error at the end of the text names no line (`line ?`).
 * - **Columns of a box error.** v12 gave none. v13's `BOX_EMPTY_NODE` starts at the line's first
 *   branch glyph in the source, its `BOX_UNEXPECTED_INDENT` at the line's start (Pele's mapping).
 * - **Columns of a Langium error.** v12's column is in the rewritten text (it never remapped
 *   columns). Taken back through v13's box pass (whose rewrite is gated against v12's) to the
 *   source character it came from, it is where one of those diagnostics starts. The corpus holds
 *   lines where the two columns differ: tabs, `#name;` entities and deep or narrow prefixes.
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
    if (c === CR && text.charCodeAt(i + 1) === LF) continue;
    if (c === LF || c === CR) out.push(i + 1);
  }
  return out;
}

const BRANCH = /[└┗├┣]/;
const BOX_CODES: Readonly<Record<string, string>> = {
  'Empty node': 'BOX_EMPTY_NODE',
  'Unexpected indentation': 'BOX_UNEXPECTED_INDENT',
};

describe('treeView box-mode diagnostics (D486)', () => {
  it("name v12's line and point at the source column", async () => {
    const oracle = await loadOracle();
    const diffs: string[] = [];
    let lines = 0;
    let boxColumns = 0;
    let columns = 0;
    /** Langium columns where the source column is not v12's. */
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
      const lineOfView = (v: number) => {
        let k = 0;
        while (k + 1 < starts.length && (starts[k + 1] ?? Infinity) <= v) k++;
        return k + 1;
      };
      const lineOf = (at: number) => lineOfView(localOffset(view, at));
      const errors = parseTreeView(src).diagnostics.filter((d) => d.severity === 'error');
      const ranges: Range[] = errors.flatMap((d) => [
        d.range,
        ...(d.code === 'STRAY_BLANK' ? (d.related ?? []).map((r) => r.range) : []),
      ]);
      lines++;
      if (!ranges.some((r) => lineOf(r.start) === place.line)) {
        diffs.push(
          `${item.id}: v12 line ${place.line} (${v12.error.slice(0, 80)}), v13 lines ${ranges.map((r) => lineOf(r.start)).join(', ')}: ${errors.map((e) => e.message).join(' | ')}`
        );
        continue;
      }
      if (box.kind === 'error') {
        // v12's box error: its line in the view, then the glyph or the line start in the source.
        const kind = Object.keys(BOX_CODES).find((k) => v12.error.includes(k)) ?? '';
        const lineStart = starts[place.line - 1] ?? p;
        const lineEnd = starts[place.line] ?? view.text.length;
        const glyph = view.text.slice(lineStart, lineEnd).search(BRANCH);
        const expected = toSource(lineStart + (kind === 'Empty node' ? glyph : 0));
        boxColumns++;
        if (!errors.some((d) => d.code === BOX_CODES[kind] && d.range.start === expected)) {
          diffs.push(
            `${item.id}: v12 ${kind} on line ${place.line} is source offset ${expected}, v13 ${errors.map((d) => `${d.code}@${d.range.start}`).join(', ')}`
          );
        }
        continue;
      }
      if (place.column === undefined) continue;
      // The rewritten line v12 named: the one that came from v12's line `place.line`.
      const { text, first } = box.rewrite;
      const rewrittenStarts = [0, ...breaksIn(text, 0, text.length)];
      const k = rewrittenStarts.findIndex((s) => {
        const v = first[s];
        return v !== undefined && lineOfView(v) === place.line && s < text.length - 1;
      });
      const v = first[(rewrittenStarts[k] ?? 0) + place.column - 1];
      if (k < 0 || v === undefined) {
        diffs.push(`${item.id}: v12's line ${place.line} is not in the rewrite`);
        continue;
      }
      columns++;
      const expected = toSource(v);
      const sourceLineStart =
        Math.max(src.lastIndexOf('\n', expected - 1), src.lastIndexOf('\r', expected - 1)) + 1;
      if (expected - sourceLineStart !== place.column - 1) moved++;
      if (!ranges.some((r) => r.start === expected)) {
        diffs.push(
          `${item.id}: v12 column ${place.column} is source offset ${expected}, v13 diagnostics at ${ranges.map((r) => r.start).join(', ')}`
        );
      }
    }
    process.stdout.write(
      `treeView box-mode diagnostics: ${lines} rejected box sources, ${boxColumns} box-error columns, ${columns} rewritten columns checked (${moved} not v12's)\n`
    );
    expect(lines).toBeGreaterThan(30);
    expect(boxColumns).toBeGreaterThan(30);
    expect(columns).toBeGreaterThan(20);
    expect(moved).toBeGreaterThan(10);
    expect(diffs).toEqual([]);
  }, 120_000);
});
