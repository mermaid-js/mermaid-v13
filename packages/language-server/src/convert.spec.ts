/**
 * LSP encoding of the service's results (D98): semantic tokens over the whole corpus decode
 * back to the service's tokens, cut per line; positions are UTF-16 as LSP's default.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createLanguageService,
  encodeSemanticTokens as encodeLines,
  LineIndex,
  lineSemanticTokens,
  SEMANTIC_TOKEN_LEGEND,
} from '@mermaid-js/language-service';
import type { SemanticToken } from '@mermaid-js/language-service';
import { beforeAll, describe, expect, it } from 'vitest';
import { toFoldingRange, toMarkup, toRange } from './convert.ts';
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
/** The server's encoding: the service's per-line tokens (whole with `multiline`), delta-coded. */
const encodeSemanticTokens = (
  index: LineIndex,
  text: string,
  tokens: readonly SemanticToken[],
  multiline = false
) => encodeLines(lineSemanticTokens(text, tokens, { index, multiline }));
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
      const t = process.cpuUsage();
      const data = encodeSemanticTokens(index, text, [token(0, text.length)]);
      expect(data).toHaveLength(10);
      const { user, system } = process.cpuUsage(t);
      return (user + system) / 1000; // CPU ms: load elsewhere does not count
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

  it('passes the service line folds on, marking comment folds', () => {
    expect(toFoldingRange({ startLine: 0, endLine: 2, kind: 'subgraph' })).toEqual({
      startLine: 0,
      endLine: 2,
    });
    expect(toFoldingRange({ startLine: 1, endLine: 3, kind: 'comment' })).toEqual({
      startLine: 1,
      endLine: 3,
      kind: 'comment',
    });
  });
});

describe('plain-text markup', () => {
  it('drops the marks but keeps backticks that are part of a code span', () => {
    expect(toMarkup('**node** `B`', false).value).toBe('node B');
    // A label holding a backtick: the service fences it with two (tables.ts `code`).
    expect(toMarkup('label ``a`b``', false).value).toBe('label a`b');
    expect(toMarkup('``` `` ```', false).value).toBe('``');
    expect(toMarkup('**x** `**y**`', false).value).toBe('x **y**');
    expect(toMarkup('**node** `B`', true)).toEqual({ kind: 'markdown', value: '**node** `B`' });
  });
});
