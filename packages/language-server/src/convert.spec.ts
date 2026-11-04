/**
 * LSP encoding of the service's results (D98): semantic tokens over the whole corpus decode
 * back to the service's tokens, cut per line; positions are UTF-16 as LSP's default.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  createLanguageService,
  LineIndex,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import type { SemanticToken } from '@mermaid-js/language-service';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeSemanticTokens, toFoldingRanges, toRange } from './convert.ts';
import { decodeTokens } from './testing/lsp-client.ts';

const CORPUS = join(import.meta.dirname, '..', '..', '..', 'e2e', 'diagrams');
const corpus = (readdirSync(CORPUS, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.mmd'))
  .sort()
  .map((f) => readFileSync(join(CORPUS, f), 'utf8'));
const legend = {
  tokenTypes: [...SEMANTIC_TOKEN_LEGEND.types],
  tokenModifiers: [...SEMANTIC_TOKEN_LEGEND.modifiers],
};
const token = (start: number, end: number, type: SemanticToken['type'] = 'string') => ({
  range: { start, end },
  type,
  modifiers: [],
});

describe('encodeSemanticTokens', () => {
  const service = createLanguageService();
  beforeAll(() => service.preload());

  it('decodes back to the service tokens over the corpus, one line each, in order', () => {
    expect(corpus.length).toBeGreaterThan(1000);
    for (const [n, text] of corpus.entries()) {
      const doc = service.update(`file:///c${n}.mmd`, text);
      const index = new LineIndex(text);
      const data = encodeSemanticTokens(index, text, doc.semanticTokens());
      // Every cut is on one line and the cuts' text, joined, is each token's text minus breaks.
      const lines = text.split(/\r\n|\r|\n/);
      let covered = '';
      let prev = { line: 0, char: 0, length: 0 };
      for (const t of decodeTokens(data, { tokenTypes: [], tokenModifiers: [] })) {
        expect(t.length).toBeGreaterThan(0);
        expect(t.char + t.length).toBeLessThanOrEqual(lines[t.line]!.length);
        const after = t.line > prev.line || t.char >= prev.char + prev.length;
        expect(after, `${n}: token at ${t.line}:${t.char} overlaps the previous one`).toBe(true);
        covered += lines[t.line]!.slice(t.char, t.char + t.length);
        prev = t;
      }
      const expected = doc
        .semanticTokens()
        .map((s) => text.slice(s.range.start, s.range.end).replace(/(?:\r\n|\r|\n)[ \t]*/g, ''))
        .join('');
      expect(covered, `corpus file ${n}`).toBe(expected);
    }
  });

  it('cuts a token at CRLF and CR line breaks too', () => {
    const text = 'ab\r\ncd\ref';
    const data = encodeSemanticTokens(new LineIndex(text), text, [token(1, 9)]);
    expect(decodeTokens(data, legend)).toEqual([
      { line: 0, char: 1, length: 1, type: 'string', modifiers: [] },
      { line: 1, char: 0, length: 2, type: 'string', modifiers: [] },
      { line: 2, char: 0, length: 2, type: 'string', modifiers: [] },
    ]);
    // Multi-line support: one token, its length counting the breaks.
    expect(encodeSemanticTokens(new LineIndex(text), text, [token(1, 9)], true)).toEqual([
      0,
      1,
      8,
      SEMANTIC_TOKEN_LEGEND.types.indexOf('string'),
      0,
    ]);
  });

  it('starts a continuation piece after the line indentation', () => {
    const text = 'A["x\n  \t  y"]';
    const data = encodeSemanticTokens(new LineIndex(text), text, [token(3, 11)]);
    expect(decodeTokens(data, legend)).toEqual([
      { line: 0, char: 3, length: 1, type: 'string', modifiers: [] },
      { line: 1, char: 5, length: 1, type: 'string', modifiers: [] },
    ]);
    // A line holding only indentation gives no piece.
    const blank = 'A["x\n   \n  y"]';
    expect(
      decodeTokens(encodeSemanticTokens(new LineIndex(blank), blank, [token(3, 14)]), legend)
    ).toHaveLength(2);
  });

  it('leaves out empty lines inside a token and an overlapping token', () => {
    const text = 'a\n\n\nb c';
    const data = encodeSemanticTokens(new LineIndex(text), text, [
      token(0, 5),
      token(4, 5, 'node'),
      token(6, 7, 'node'),
    ]);
    expect(decodeTokens(data, legend)).toEqual([
      { line: 0, char: 0, length: 1, type: 'string', modifiers: [] },
      { line: 3, char: 0, length: 1, type: 'string', modifiers: [] },
      { line: 3, char: 2, length: 1, type: 'node', modifiers: [] },
    ]);
  });

  it('counts columns in UTF-16 code units', () => {
    const text = '😀 "x\ny"';
    const data = encodeSemanticTokens(new LineIndex(text), text, [token(4, 7)]);
    expect(decodeTokens(data, legend)).toEqual([
      { line: 0, char: 4, length: 1, type: 'string', modifiers: [] },
      { line: 1, char: 0, length: 1, type: 'string', modifiers: [] },
    ]);
  });

  it('stays linear on a token over a long run of line breaks (stress)', () => {
    const time = (lines: number) => {
      const text = `"${'\n'.repeat(lines)}"`;
      const index = new LineIndex(text);
      const t = performance.now();
      const data = encodeSemanticTokens(index, text, [token(0, text.length)]);
      expect(data).toHaveLength(10);
      return performance.now() - t;
    };
    time(1000);
    const small = Math.max(time(20_000), 1);
    expect(time(200_000)).toBeLessThan(small * 40);
  });
});

describe('positions and folding', () => {
  it('converts offsets to UTF-16 line/character positions', () => {
    const text = 'a😀b\r\nc';
    const index = new LineIndex(text);
    expect(toRange(index, { start: 3, end: 7 })).toEqual({
      start: { line: 0, character: 3 },
      end: { line: 1, character: 1 },
    });
  });

  it('folds by line, keeping a closing line (`end`, `}`, `---`) visible', () => {
    const text = 'subgraph A\n  x\n  end\n';
    const index = new LineIndex(text);
    expect(
      toFoldingRanges(index, text, [
        { range: { start: 0, end: 20 }, kind: 'subgraph' },
        { range: { start: 0, end: 21 }, kind: 'chain' },
        { range: { start: 11, end: 14 }, kind: 'chain' },
      ])
    ).toEqual([{ startLine: 0, endLine: 1 }]);
    const block = 'accDescr {\n  a\n  b\n}\nA["x\ny"]\n';
    expect(
      toFoldingRanges(new LineIndex(block), block, [
        { range: { start: 0, end: 21 }, kind: 'accDescr' },
        { range: { start: 22, end: 30 }, kind: 'chain' },
      ])
    ).toEqual([
      { startLine: 0, endLine: 2 },
      { startLine: 4, endLine: 5 },
    ]);
    // A block whose closer directly follows the opener line folds nothing.
    expect(
      toFoldingRanges(new LineIndex('subgraph A\nend'), 'subgraph A\nend', [
        { range: { start: 0, end: 14 }, kind: 'subgraph' },
      ])
    ).toEqual([]);
  });
});
