import { describe, expect, it } from 'vitest';
import { Kind, TOKEN_CATEGORIES } from '@mermaid-js/core/parser-kit';
import { StateTokenKind as T } from '@mermaid-js/diagram-state';
// The checked-in tables, read from source: the facet (#151) will export them from `./language`.
import { stateCategories } from '../../../packages/diagram-state/src/generated/categories.ts';
import { stateDocs } from '../../../packages/diagram-state/src/generated/docs.ts';

describe('state kind → category table and keyword docs', () => {
  it('gives every state and shared kind a highlight category', () => {
    const kinds = [...Object.values(T), ...Object.values(Kind)];
    for (const k of kinds) expect(TOKEN_CATEGORIES, `kind ${k}`).toContain(stateCategories[k]);
    expect(Object.keys(stateCategories)).toHaveLength(kinds.length);
  });

  it('takes the category from the grammar file’s scopes, unnamed rules included', () => {
    expect(stateCategories[T.Sd]).toBe('Keyword');
    expect(stateCategories[T.Arrow]).toBe('Operator');
    expect(stateCategories[T.Id]).toBe('Variable');
    expect(stateCategories[T.Descr]).toBe('String');
    expect(stateCategories[T.EdgeState]).toBe('Constant');
    // Text jison consumes without a terminal: `state`, `<<fork>>`, `end note`.
    expect(stateCategories[T.State]).toBe('Keyword');
    expect(stateCategories[T.Marker]).toBe('Keyword');
    expect(stateCategories[T.EndNote]).toBe('Keyword');
  });

  it('documents keywords from the grammar file', () => {
    expect(stateDocs[T.Note]).toMatch(/^`note left of A : text`/);
    expect(stateDocs[T.Concurrent]).toMatch(/regions/);
    expect(stateDocs[T.Fork]).toMatch(/pseudo-state/);
  });
});
