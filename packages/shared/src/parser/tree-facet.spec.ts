import { describe, expect, it } from 'vitest';
import type { ProbeResult, SymbolOccurrence, TokenStream } from '@mermaid-js/core/parser-kit';
import { span } from './facet.ts';
import {
  classItems,
  lineAfter,
  namesOutside,
  outlineKeywords,
  statementStartWord,
  tokenAt,
} from './tree-facet.ts';

/** Tokens as `[kind, start, end]`. */
const tokens = (list: readonly (readonly [number, number, number])[]): TokenStream =>
  ({
    length: list.length,
    kind: Uint16Array.from(list.map(([k]) => k)),
    start: Uint32Array.from(list.map(([, s]) => s)),
    end: Uint32Array.from(list.map(([, , e]) => e)),
  }) as unknown as TokenStream;

const probe = (offset: number, prefixStart: number, expected: number[] = []): ProbeResult => ({
  offset,
  expected,
  mode: 'INITIAL',
  prefix: { start: prefixStart, end: offset },
});

const cls = (name: string, start: number): SymbolOccurrence =>
  ({ kind: 'class', name, range: span(start, start + name.length) }) as SymbolOccurrence;

describe('tree facet helpers', () => {
  it('lineAfter stops at any line break', () => {
    expect(lineAfter('ab\ncd', 1)).toBe('b');
    expect(lineAfter('ab cd', 0)).toBe('ab');
    expect(lineAfter('ab', 2)).toBe('');
  });

  it('tokenAt finds the last token of the kinds holding an offset', () => {
    const t = tokens([
      [1, 0, 2],
      [2, 2, 4],
      [1, 4, 6],
    ]);
    expect(tokenAt(t, 2, [1, 2])).toBe(1);
    expect(tokenAt(t, 2, [1])).toBe(0);
    expect(tokenAt(t, 7, [1])).toBe(-1);
  });

  it('namesOutside leaves out the names of the line but the one at the word', () => {
    const symbols = [cls('a', 0), cls('b', 10), cls('c', 12), cls('d', 20)];
    expect(namesOutside(symbols, 'class', span(10, 14), span(12, 13))).toEqual(['a', 'd']);
    expect(namesOutside([cls('b', 0), cls('b', 10)], 'class', span(10, 11), span(5, 6))).toEqual(
      []
    );
  });

  it('classItems offers the other class names for the word in a `:::` line', () => {
    // `x\nn:::hot co`: 7 = `:::`, 8 = class names.
    const text = 'hot\nn:::hot co';
    const t = tokens([
      [1, 0, 3],
      [7, 5, 8],
      [8, 8, 14],
    ]);
    const symbols = [cls('cold', 0), cls('hot', 8), cls('co', 12)];
    const kinds = { start: 7, names: 8 };
    expect(classItems(text, t, symbols, 14, kinds)).toEqual([
      { label: 'cold', kind: 'class', insertText: 'cold', range: span(12, 14) },
    ]);
    expect(classItems(text, t, symbols, 6, kinds)).toBeUndefined();
    expect(classItems(text, t, symbols, 1, kinds)).toBeUndefined();
  });

  it('statementStartWord takes the word only after the indent', () => {
    const text = 'kanban\n  ab(c)';
    expect(statementStartWord(text, probe(10, 9), /^[^\s()]*/)).toEqual({
      prefix: 'a',
      range: span(9, 11),
    });
    expect(statementStartWord(text, probe(9, 9), /^[^\s()]*/)).toEqual({
      prefix: '',
      range: span(9, 9),
    });
    expect(statementStartWord('a b', probe(3, 2), /^\S*/)).toBeUndefined();
  });

  it('outlineKeywords offers the header, else the decorations after a node', () => {
    const kinds = { header: [1, 'kanban'] as const, nodeId: 2, iconStart: 3, classStart: 4 };
    const docs = { 1: 'The header.' };
    const at = { prefix: 'K', range: span(0, 1) };
    expect(outlineKeywords(at, new Set([1]), kinds, docs, false)).toEqual([
      {
        label: 'kanban',
        kind: 'keyword',
        insertText: 'kanban',
        range: span(0, 1),
        documentation: 'The header.',
      },
    ]);
    const empty = { prefix: '', range: span(5, 5) };
    expect(outlineKeywords(empty, new Set([2]), kinds, docs, false)).toEqual([]);
    expect(outlineKeywords(empty, new Set([2]), kinds, docs, true).map((i) => i.label)).toEqual([
      '::icon()',
      ':::',
    ]);
  });
});
