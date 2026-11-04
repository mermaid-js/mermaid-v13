import { describe, expect, it } from 'vitest';
import { language, stateLanguage } from './language.ts';

describe('state language facet: parse, categories, namespaces', () => {
  const text = 'stateDiagram-v2\n  [*] --> A\n  state B {\n    C --> D\n  }\n  A:::hot --> B\n';

  it('is the state facet, exported under the fixed name `language`', () => {
    expect(stateLanguage.id).toBe('state');
    expect(language).toBe(stateLanguage);
  });

  it('parses with the token stream kept and the state symbols', () => {
    const result = stateLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect([...new Set(result.symbols.map((s) => `${s.kind}:${s.name}`))].sort()).toEqual([
      'class:hot',
      'state:A',
      'state:B',
      'state:C',
      'state:D',
    ]);
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = stateLanguage.parse(text, { keepTokens: true });
    const named = [...tokens!.kind.slice(0, tokens!.length)].map(
      (k) => stateLanguage.categories[k]
    );
    expect(named).not.toContain(undefined);
    // `stateDiagram-v2` and `state` are keywords; `-->` and `:::` operators.
    expect(named.filter((c) => c === 'Keyword')).toHaveLength(2);
    expect(named.filter((c) => c === 'Operator')).toHaveLength(4);
  });

  it('puts states in one name space and classes in another', () => {
    expect(stateLanguage.namespaces).toEqual([['state'], ['class']]);
  });
});

describe('state language facet: isValidId (rename, D92)', () => {
  it.each(['A', 'state1', 'my_state', 'Idle', 'end', 'direction', '1'])('accepts %s', (name) => {
    expect(stateLanguage.isValidId(name)).toBeUndefined();
  });

  it.each([
    ['', /empty/],
    ['a b', /space/],
    ['a\nb', /line break/],
    ['note', /not a state id/],
    ['state', /not a state id/],
    ['class', /not a state id/],
    ['a-b', /not a state id/],
    ['a-->b', /not a state id/],
    ['[*]', /not a state id/],
    ['a:b', /not a state id/],
    ['a{', /not a state id/],
    ['"a"', /not a state id/],
    // Ids `class` and `style` statements cannot name (`[\w,]+`, as v12).
    ['café', /`class`/],
    ['a.b', /`class`/],
    ['a,b', /`class`/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(stateLanguage.isValidId(name)).toMatch(reason);
  });

  it('checks class names as classDef, class and ::: read them', () => {
    expect(stateLanguage.isValidId('hot', 'class')).toBeUndefined();
    expect(stateLanguage.isValidId('a,b', 'class')).toBe("'a,b' is not a class name.");
    expect(stateLanguage.isValidId('a b', 'class')).toBe('An id cannot contain spaces.');
  });
});

describe('state language facet: diagnostics', () => {
  it('lists them in source order, `STATE_NOT_DRAWN` included', () => {
    const text = 'stateDiagram-v2\n  state Lonely\n  note "floating" as N\n';
    const { diagnostics } = stateLanguage.parse(text, { keepTokens: true });
    expect(diagnostics.map((d) => d.code)).toEqual(['STATE_NOT_DRAWN', 'FLOATING_NOTE']);
  });
});
