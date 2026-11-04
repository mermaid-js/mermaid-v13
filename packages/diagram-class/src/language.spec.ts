import { describe, expect, it } from 'vitest';
import { classLanguage, language } from './language.ts';

describe('class language facet: isValidId (rename, D92)', () => {
  it.each(['A', 'Animal', 'my_class', 'a-b', '1', 'café', 'Class', 'notes', 'direction'])(
    'accepts class name %s',
    (name) => {
      expect(classLanguage.isValidId(name)).toBeUndefined();
    }
  );

  it.each([
    ['', /empty/],
    ['a b', /spaces/],
    [' a', /spaces/],
    ['a\nb', /line break/],
    ['class', /keyword/],
    ['namespace', /keyword/],
    ['note', /keyword/],
    ['style', /keyword/],
    ['click', /keyword/],
    ['A~T~', /not a class name/],
    ['a-->b', /not a class name/],
    ['a:::b', /not a class name/],
    ['"a"', /not a class name/],
    ['a{', /not a class name/],
  ])('rejects class name %j with a reason', (name, reason) => {
    expect(classLanguage.isValidId(name)).toMatch(reason);
  });

  it('checks each symbol kind where it is written', () => {
    expect(classLanguage.isValidId('hot', 'cssClass')).toBeUndefined();
    expect(classLanguage.isValidId('a-b', 'cssClass')).toBe("'a-b' is not a style class name.");
    expect(classLanguage.isValidId('Outer', 'namespace')).toBeUndefined();
    expect(classLanguage.isValidId('A.B', 'namespace')).toMatch(/cannot contain `\.`/);
    expect(classLanguage.isValidId('a{', 'namespace')).toBe("'a{' is not a namespace name.");
    expect(classLanguage.isValidId('plug', 'interface')).toBeUndefined();
    expect(classLanguage.isValidId('a()', 'interface')).toBe("'a()' is not an interface name.");
  });
});

describe('class language facet: parse, categories, namespaces', () => {
  const text =
    'classDiagram\n  class Animal~T~ {\n    +int age\n  }\n  Animal <|-- Duck\n  click Duck href "https://example.com"\n';

  it('is the class facet, exported under the fixed name `language`', () => {
    expect(classLanguage.id).toBe('class');
    expect(language).toBe(classLanguage);
  });

  it('parses with the token stream kept and the class symbols', () => {
    const result = classLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.symbols.map((s) => `${s.role} ${s.kind}:${s.name}`)).toEqual([
      'def class:Animal',
      'ref class:Animal',
      'def class:Duck',
      'ref class:Duck',
    ]);
  });

  it('gives a generic class a symbol on its name only, so rename edits the name', () => {
    const [def] = classLanguage.parse(text, { keepTokens: true }).symbols;
    expect(text.slice(def!.range.start, def!.range.end)).toBe('Animal');
  });

  it('records the whole click statement (folding, code-to-diagram highlight)', () => {
    const { statements } = classLanguage.parse(text, { keepTokens: true });
    const click = statements.find((s) => s.kind === 'click')!;
    expect(text.slice(click.range.start, click.range.end)).toBe(
      'click Duck href "https://example.com"'
    );
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = classLanguage.parse(text, { keepTokens: true });
    const kinds = [...tokens!.kind.slice(0, tokens!.length)];
    const named = kinds.map((k) => classLanguage.categories[k]);
    expect(named).not.toContain(undefined);
    // `classDiagram`, `class` and `click`, `href` are keywords; `<|`, `--` operators.
    expect(named.filter((c) => c === 'Keyword')).toHaveLength(4);
    expect(named.filter((c) => c === 'Operator')).toHaveLength(2);
  });

  it('keeps classes, interfaces, namespaces and style classes in their own name spaces', () => {
    expect(classLanguage.namespaces).toEqual([
      ['class'],
      ['interface'],
      ['namespace'],
      ['cssClass'],
    ]);
  });
});
