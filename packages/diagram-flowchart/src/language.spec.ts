import { describe, expect, it } from 'vitest';
import { flowchartLanguage, language } from './language.ts';

describe('flowchart language facet: isValidId (rename, D92)', () => {
  it.each(['A', 'node1', 'my_node', 'a-b', '1', 'café', 'End', 'ends', 'default'])(
    'accepts %s',
    (name) => {
      expect(flowchartLanguage.isValidId(name)).toBeUndefined();
    }
  );

  it.each([
    ['', /empty/],
    ['end', /keyword/],
    ['subgraph', /keyword/],
    ['a b', /space/],
    [' a', /space/],
    ['a\nb', /line break/],
    ['a-->b', /arrow/],
    ['a---b', /arrow/],
    ['a==>b', /arrow/],
    ['a-.->b', /arrow/],
    ['a[label]', /not a node id/],
    ['a:::cls', /not a node id/],
    ['a;b', /not a node id/],
    ['"a"', /not a node id/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(flowchartLanguage.isValidId(name)).toMatch(reason);
  });
});

describe('flowchart language facet: parse, categories, namespaces', () => {
  const text = 'flowchart LR\n  A --> B\n  subgraph S\n    C\n  end\n';

  it('is the flowchart facet', () => {
    expect(flowchartLanguage.id).toBe('flowchart');
  });

  it('parses with the token stream kept and the flowchart symbols', () => {
    const result = flowchartLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}`).sort()).toEqual([
      'node:A',
      'node:B',
      'node:C',
      'subgraph:S',
    ]);
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = flowchartLanguage.parse(text, { keepTokens: true });
    const kinds = [...tokens!.kind.slice(0, tokens!.length)];
    const named = kinds.map((k) => flowchartLanguage.categories[k]);
    expect(named).not.toContain(undefined);
    // `flowchart`, `subgraph` and `end` are keywords; `-->` is an operator.
    expect(named.filter((c) => c === 'Keyword')).toHaveLength(3);
    expect(named).toContain('Operator');
  });

  it('puts nodes and subgraphs in one name space, classes and edges in their own', () => {
    expect(flowchartLanguage.namespaces).toEqual([['node', 'subgraph'], ['class'], ['edge']]);
  });
});

describe('flowchart language facet: isValidId by symbol kind', () => {
  it('checks class names as classDef reads them', () => {
    expect(flowchartLanguage.isValidId('hot', 'class')).toBeUndefined();
    expect(flowchartLanguage.isValidId('a,b', 'class')).toBe("'a,b' is not a class name.");
    expect(flowchartLanguage.isValidId('a b', 'class')).toBe('An id cannot contain spaces.');
  });

  it('checks edge ids as `id@-->` reads them', () => {
    expect(flowchartLanguage.isValidId('e1', 'edge')).toBeUndefined();
    expect(flowchartLanguage.isValidId('"q"', 'edge')).toBe('\'"q"\' is not an edge id.');
  });

  it('is exported under the fixed name `language`', () => {
    expect(language).toBe(flowchartLanguage);
  });
});
