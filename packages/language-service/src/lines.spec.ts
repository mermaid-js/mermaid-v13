/**
 * Line-based folding and per-line semantic tokens: the one shape every adapter (Monaco, the
 * LSP server, CodeMirror) shows, so the same document folds and highlights the same in each.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createLanguageService,
  encodeSemanticTokens,
  lineFoldingRanges,
  lineSemanticTokens,
  LineIndex,
} from './index.ts';
import type { SemanticToken } from './index.ts';

const service = createLanguageService();
beforeAll(() => service.preload());

describe('lineFoldingRanges', () => {
  it('keeps a closing line (`end`, `}`, `---`) visible and drops one-line ranges', () => {
    const text = 'subgraph A\n  x\n  end\n';
    expect(
      lineFoldingRanges(text, [
        { range: { start: 0, end: 20 }, kind: 'subgraph' },
        { range: { start: 0, end: 21 }, kind: 'chain' },
        { range: { start: 11, end: 14 }, kind: 'chain' },
      ])
    ).toEqual([{ startLine: 0, endLine: 1, kind: 'subgraph' }]);
    const block = 'accDescr {\n  a\n  b\n}\nA["x\ny"]\n';
    expect(
      lineFoldingRanges(block, [
        { range: { start: 0, end: 21 }, kind: 'accDescr' },
        { range: { start: 22, end: 30 }, kind: 'chain' },
      ])
    ).toEqual([
      { startLine: 0, endLine: 2, kind: 'accDescr' },
      { startLine: 4, endLine: 5, kind: 'chain' },
    ]);
    // A block whose closer directly follows the opener line folds nothing.
    expect(
      lineFoldingRanges('subgraph A\nend', [{ range: { start: 0, end: 14 }, kind: 'subgraph' }])
    ).toEqual([]);
  });

  it('keeps a closer line inside a range that only closes a block nested in it', () => {
    // A sequence `else` section whose last statement is an `opt … end` block: the section ends
    // on the `end` of the `opt`, which is that block's closer, not the section's.
    const text = 'alt a\n  x\nelse b\n  opt o\n    y\n  end\nelse c\n  z\nend\n';
    const at = (s: string, from = 0) => text.indexOf(s, from);
    const innerEnd = at('  end') + '  end'.length;
    expect(
      lineFoldingRanges(text, [
        { range: { start: 0, end: text.length - 1 }, kind: 'alt' },
        { range: { start: at('else b'), end: innerEnd }, kind: 'else' },
        { range: { start: at('opt o'), end: innerEnd }, kind: 'opt' },
        { range: { start: at('else c'), end: at('end\n', at('else c')) - 1 }, kind: 'else' },
      ])
    ).toEqual([
      { startLine: 0, endLine: 7, kind: 'alt' },
      { startLine: 2, endLine: 5, kind: 'else' },
      { startLine: 3, endLine: 4, kind: 'opt' },
      { startLine: 6, endLine: 7, kind: 'else' },
    ]);
  });

  it('is what a snapshot gives: the front matter keeps its closing `---`', () => {
    const text =
      '---\ntitle: T\nconfig:\n  theme: dark\n---\nflowchart LR\n  subgraph S\n    A\n  end\n';
    const doc = service.update('lines:///fm.mmd', text);
    expect(doc.lineFoldingRanges()).toEqual([
      { startLine: 0, endLine: 3, kind: 'frontMatter' },
      { startLine: 6, endLine: 7, kind: 'subgraph' },
    ]);
    expect(Object.isFrozen(doc.lineFoldingRanges())).toBe(true);
  });
});

describe('lineSemanticTokens', () => {
  const token = (start: number, end: number): SemanticToken => ({
    range: { start, end },
    type: 'string',
    modifiers: [],
  });

  it('splits a token per line, leaving out continuation indentation and empty pieces', () => {
    const text = 'A["one\n    two\n"]';
    const pieces = lineSemanticTokens(text, [token(3, text.length - 2)]);
    expect(pieces).toEqual([
      { line: 0, character: 3, length: 3, type: 'string', modifiers: [] },
      { line: 1, character: 4, length: 3, type: 'string', modifiers: [] },
    ]);
  });

  it('drops a token that overlaps the one before it, so pieces never overlap', () => {
    const text = 'abcdefgh';
    const pieces = lineSemanticTokens(text, [token(0, 4), token(2, 6), token(4, 8)]);
    expect(pieces.map((p) => [p.character, p.length])).toEqual([
      [0, 4],
      [4, 4],
    ]);
  });

  it('keeps a multi-line token whole when asked (LSP multilineTokenSupport)', () => {
    const text = 'a\n  bc';
    const pieces = lineSemanticTokens(text, [token(0, text.length)], { multiline: true });
    expect(pieces).toEqual([{ line: 0, character: 0, length: 6, type: 'string', modifiers: [] }]);
  });

  it('encodes pieces as LSP and Monaco want them: relative lines and starts', () => {
    const text = 'ab cd\nef';
    const pieces = lineSemanticTokens(text, [token(0, 2), token(3, 5), token(6, 8)]);
    expect(encodeSemanticTokens(pieces)).toEqual([0, 0, 2, 1, 0, 0, 3, 2, 1, 0, 1, 0, 2, 1, 0]);
  });

  it('is what a snapshot gives, and is linear in the line count', () => {
    const text = 'flowchart LR\n  A["one\n     two"] --> B\n';
    const doc = service.update('lines:///tokens.mmd', text);
    const strings = doc.lineSemanticTokens().filter((p) => p.type === 'string');
    expect(strings.map((p) => [p.line, p.character, p.length])).toEqual([
      [1, 5, 3],
      [2, 5, 3],
    ]);
    const time = (lines: number) => {
      const big = `"${'\n'.repeat(lines)}"`;
      const t = process.cpuUsage();
      expect(
        lineSemanticTokens(big, [token(0, big.length)], { index: new LineIndex(big) })
      ).toHaveLength(2);
      const { user, system } = process.cpuUsage(t);
      return (user + system) / 1000; // CPU ms: load elsewhere does not count
    };
    time(1000);
    const small = Math.max(time(20_000), 1);
    expect(time(200_000)).toBeLessThan(small * 40);
  });
});
