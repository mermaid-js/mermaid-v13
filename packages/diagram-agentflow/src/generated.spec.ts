import { describe, expect, it } from 'vitest';
import { T } from './parser/tokens.ts';
import { agentflowCategories } from './generated/categories.ts';
import { agentflowDocs } from './generated/docs.ts';

/**
 * The tables `pnpm gen:grammar` makes from `grammar/agentflow.ebnf` (D93, D94), for the
 * language facet (T6, #549): every kind has a highlight category, a `%%` comment is a comment
 * (a token in agentflow, #544), and the keywords and operators hover explains have docs.
 */
describe('generated agentflow tables', () => {
  it('categorise the keywords, links, comments, ids and metadata', () => {
    expect(agentflowCategories[T.Graph]).toBe('Keyword');
    expect(agentflowCategories[T.Flow]).toBe('Keyword');
    expect(agentflowCategories[T.Connector]).toBe('Keyword');
    expect(agentflowCategories[T.Global]).toBe('Keyword');
    expect(agentflowCategories[T.Link]).toBe('Operator');
    expect(agentflowCategories[T.Comment]).toBe('Comment');
    expect(agentflowCategories[T.NodeString]).toBe('Variable');
    expect(agentflowCategories[T.ShapeData]).toBe('Meta');
  });

  it('document every keyword and operator kind', () => {
    expect(agentflowDocs[T.Flow]).toMatch(/flow/);
    expect(agentflowDocs[T.Connector]).toMatch(/connector/);
    for (const [key, kind] of Object.entries(T)) {
      const category = agentflowCategories[kind];
      if (category === 'Keyword' || category === 'Operator') {
        expect(agentflowDocs[kind], key).toBeDefined();
      }
    }
  });
});
