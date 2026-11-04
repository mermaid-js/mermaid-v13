/**
 * The tables gen-grammar writes from `grammar/sequence.ebnf` (D93, D94): every sequence and
 * shared token kind has a highlight category, and every keyword and operator kind a hover doc.
 * The language facet (#149) serves them; until then this spec is their only reader.
 */
import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { T } from '../parser/tokens.ts';
import { sequenceCategories } from './categories.ts';
import { sequenceDocs } from './docs.ts';

describe('sequence kind tables', () => {
  it('gives every kind a category from the grammar file', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(sequenceCategories[k]);
    expect(Object.keys(sequenceCategories)).toHaveLength(kinds.length);
    expect(sequenceCategories[T.Participant]).toBe('Keyword');
    expect(sequenceCategories[T.SolidArrow]).toBe('Operator');
    expect(sequenceCategories[T.Actor]).toBe('Variable');
    expect(sequenceCategories[T.Txt]).toBe('String');
    expect(sequenceCategories[T.Num]).toBe('Number');
    // `accDescr {` is an unnamed rule in the grammar file.
    expect(sequenceCategories[T.AccDescrMultiline]).toBe('Keyword');
  });

  it('documents every keyword and operator kind', () => {
    const missing = Object.entries(T)
      .filter(([, k]) => ['Keyword', 'Operator'].includes(sequenceCategories[k] ?? ''))
      .filter(([, k]) => !sequenceDocs[k])
      .map(([key]) => key);
    // `accDescr {` and its `}` are unnamed rules: hover shows the `accDescr` value's doc.
    expect(missing).toEqual(['AccDescrMultiline', 'AccDescrMultilineEnd']);
    expect(sequenceDocs[T.Loop]).toBe('`loop <text>` … `end`: a repeated part.');
  });
});
