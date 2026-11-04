import { describe, expect, it } from 'vitest';
import { erLanguage, language } from './language.ts';

const CURSOR = '¦';

/** `text` with `¦` as the cursor: the probe parse and the facet's completion labels there. */
function complete(marked: string): string[] {
  const at = marked.indexOf(CURSOR);
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const result = erLanguage.parse(text, { keepTokens: true, probe: at });
  return erLanguage.completions(result.probe!, { text, result }).map((c) => c.label);
}

function hover(marked: string): string | undefined {
  const at = marked.indexOf(CURSOR);
  const text = marked.slice(0, at) + marked.slice(at + 1);
  const result = erLanguage.parse(text, { keepTokens: true });
  const symbol = result.symbols.find((s) => s.range.start <= at && at <= s.range.end);
  const tokens = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const start = tokens.start[i]!;
    const end = tokens.end[i]!;
    if (start <= at && at < end) token = { kind: tokens.kind[i]!, range: { start, end } };
  }
  return erLanguage.hover({ offset: at, token, symbol }, { text, result })?.contents;
}

describe('er language facet: parse, categories, namespaces', () => {
  const text = 'erDiagram\n  A ||--o{ B : x\n  subgraph S\n    C\n  end\n';

  it('is the er facet, exported under the fixed name `language`', () => {
    expect(erLanguage.id).toBe('er');
    expect(language).toBe(erLanguage);
  });

  it('parses with the token stream kept and the ER symbols', () => {
    const result = erLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}`)).toEqual([
      'entity:A',
      'entity:B',
      'subgraph:S',
      'entity:C',
    ]);
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = erLanguage.parse(text, { keepTokens: true });
    const named = [...tokens!.kind.slice(0, tokens!.length)].map((k) => erLanguage.categories[k]);
    expect(named).not.toContain(undefined);
    // `erDiagram`, `subgraph` and `end` are keywords; `||`, `--`, `o{` operators.
    expect(named.filter((c) => c === 'Keyword')).toHaveLength(3);
    expect(named.filter((c) => c === 'Operator')).toHaveLength(3);
  });

  it('puts entities and subgraphs in one name space, classes in their own', () => {
    expect(erLanguage.namespaces).toEqual([['entity', 'subgraph'], ['class']]);
  });
});

describe('er language facet: isValidId (rename, D92)', () => {
  it.each(['A', 'CUSTOMER', 'line-item', 'a.b', 'café', 'ends', 'ones', '1', 'u'])(
    'accepts %s',
    (name) => {
      expect(erLanguage.isValidId(name)).toBeUndefined();
    }
  );

  it.each([
    ['', /empty/],
    ['a b', /spaces/],
    ['a\nb', /line break/],
    ['end', /keyword/],
    ['End', /keyword/],
    ['subgraph', /keyword/],
    ['erDiagram', /keyword/],
    ['one', /cardinality or line/],
    ['many', /cardinality or line/],
    ['to', /cardinality or line/],
    ['a||', /cardinality or line/],
    ['"a"', /not an entity name/],
    ['a:::b', /not an entity name/],
    ['a[b]', /not an entity name/],
    ['a{', /not an entity name/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(erLanguage.isValidId(name)).toMatch(reason);
  });

  it('checks subgraph ids as entity names (one name space)', () => {
    expect(erLanguage.isValidId('Sales', 'subgraph')).toBeUndefined();
    expect(erLanguage.isValidId('end', 'subgraph')).toMatch(/keyword/);
  });

  it('checks class names as classDef reads them', () => {
    expect(erLanguage.isValidId('hot', 'class')).toBeUndefined();
    expect(erLanguage.isValidId('a,b', 'class')).toBe("'a,b' is not a class name.");
    expect(erLanguage.isValidId('a b', 'class')).toBe('A name cannot contain spaces.');
  });
});

describe('er language facet: probe mode (R-LANG-7)', () => {
  const mode = (marked: string) => {
    const at = marked.indexOf(CURSOR);
    const text = marked.slice(0, at) + marked.slice(at + 1);
    return erLanguage.parse(text, { keepTokens: true, probe: at }).probe?.mode;
  };

  it("records the lexer's start condition at the offset", () => {
    expect(mode('erDiagram\n  A ¦')).toBe('INITIAL');
    expect(mode('erDiagram\n  A {\n    string ¦\n  }')).toBe('block');
    expect(mode('erDiagram\n  A {\n    `my ¦type` x\n  }')).toBe('blockBq');
    expect(mode('erDiagram\n  style A fi¦ll:#f00\n')).toBe('style');
    expect(mode('erDiagram\n  accTitle: a ¦title\n')).toBe('accTitle');
    expect(mode('erDiagram\n  accDescr {\n    a ¦b\n  }\n')).toBe('accDescrMultiline');
  });

  it('names comments, directives and front matter instead', () => {
    expect(mode('erDiagram\n  %% a ¦comment\n')).toBe('comment');
    expect(mode('%%{init: {"theme": "¦dark"}}%%\nerDiagram\n')).toBe('directive');
    expect(mode('---\ntitle: ¦x\n---\nerDiagram\n')).toBe('frontMatter');
  });
});

describe('er language facet: completions (D95)', () => {
  it('offers the header keyword in an empty text', () => {
    expect(complete('¦')).toEqual(['erDiagram']);
  });

  it('offers the cardinality for the end being written', () => {
    expect(complete('erDiagram\n  A }¦')).toEqual(['}|', '}o']);
    expect(complete('erDiagram\n  A ||--¦')).toEqual(['||', 'o|', '|{', 'o{']);
    expect(complete('erDiagram\n  A ||-¦')).toEqual(['--']);
  });

  it('offers entities after a relationship and classes after `:::`', () => {
    expect(complete('erDiagram\n  CUSTOMER ||--o{ ORDER : x\n  ORDER ||--o{ ¦')).toEqual([
      'CUSTOMER',
      'ORDER',
    ]);
    expect(complete('erDiagram\n  classDef hot fill:#f00\n  A:::¦')).toEqual(['hot']);
  });

  it('offers keys after an attribute name, and the types in use at a line start', () => {
    expect(complete('erDiagram\n  A {\n    string id ¦\n  }')).toEqual(
      expect.arrayContaining(['PK', 'FK', 'UK'])
    );
    expect(complete('erDiagram\n  A {\n    int n\n  }\n  B {\n    ¦\n  }')).toEqual(['int']);
  });

  it('offers nothing in values, labels and aliases', () => {
    expect(complete('erDiagram\n  accTitle: a¦')).toEqual([]);
    expect(complete('erDiagram\n  A ||--o{ B : ¦')).toEqual([]);
    expect(complete('erDiagram\n  A[¦')).toEqual([]);
  });
});

describe('er language facet: hover (D93)', () => {
  it('describes an entity, a cardinality and a key', () => {
    const doc = 'erDiagram\n  A ||--o{ B : has\n  A {\n    string id PK\n  }\n';
    expect(hover(`erDiagram\n  ¦${doc.slice(12)}`)).toContain('**entity** `A`');
    const card = hover('erDiagram\n  A ||--o¦{ B : has\n');
    expect(card).toContain('zero or more');
    expect(card).toContain('`A` (exactly one) to `B` (zero or more)');
    expect(hover('erDiagram\n  A {\n    string id P¦K\n  }\n')).toContain('primary key');
  });
});
