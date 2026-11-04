import { describe, expect, it } from 'vitest';
import { ARROWS } from './facet/tables.ts';
import { language, parseSequence, sequenceLanguage, sequenceTokens } from './language.ts';

describe('sequence language facet: isValidId (rename, D92)', () => {
  it.each([
    'A',
    'Alice',
    'a_b',
    'a.b',
    '1',
    'café',
    'loops',
    'ends',
    'Alice Smith',
    'A # c',
    'A#c',
  ])('accepts %j, an id the parser reads back', (name) => {
    expect(sequenceLanguage.isValidId(name)).toBeUndefined();
  });

  it.each([
    ['', /empty/],
    [' a', /space/],
    ['a ', /space/],
    ['a\nb', /line break/],
    ['a->>b', /not a participant id/],
    ['a:b', /not a participant id/],
    ['a,b', /not a participant id/],
    ['a;b', /not a participant id/],
    ['a+b', /not a participant id/],
    ['a<b', /not a participant id/],
    ['end', /not a participant id/],
    ['End', /not a participant id/],
    ['participant', /not a participant id/],
    ['loop', /not a participant id/],
  ])('rejects %j with a reason', (name, reason) => {
    expect(sequenceLanguage.isValidId(name)).toMatch(reason);
  });
});

describe('sequence language facet: parse, categories, namespaces', () => {
  const text = 'sequenceDiagram\n  participant A\n  loop every minute\n    A->>B: hi\n  end\n';

  it('is the sequence facet, exported under the fixed name `language`', () => {
    expect(sequenceLanguage.id).toBe('sequence');
    expect(language).toBe(sequenceLanguage);
  });

  it('parses with the token stream kept and one participant symbol per mention', () => {
    const result = sequenceLanguage.parse(text, { keepTokens: true });
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens?.length).toBeGreaterThan(0);
    expect(result.symbols.map((s) => `${s.kind}:${s.name}:${s.role}`)).toEqual([
      'participant:A:def',
      'participant:A:ref',
      'participant:B:def',
    ]);
  });

  it('gives every token of the parse a category', () => {
    const { tokens } = sequenceLanguage.parse(text, { keepTokens: true });
    const named = [...tokens!.kind.slice(0, tokens!.length)].map(
      (k) => sequenceLanguage.categories[k]
    );
    expect(named).not.toContain(undefined);
    // `sequenceDiagram`, `participant`, `loop` and `end`; `->>` is an operator.
    expect(named.filter((c) => c === 'Keyword')).toHaveLength(4);
    expect(named).toContain('Operator');
  });

  it('has one name space, participants', () => {
    expect(sequenceLanguage.namespaces).toEqual([['participant']]);
  });
});

describe('sequence facet tables', () => {
  it('lists every arrow once, each lexed as its own token kind and parsed as its kind', () => {
    expect(new Set(ARROWS.map((a) => a.token)).size).toBe(26);
    for (const a of ARROWS) {
      const tokens = sequenceTokens(`sequenceDiagram\nA${a.text}B: x\n`);
      expect(tokens.find((t) => t.text === a.text)?.kind, a.text).toBe(a.token);
      const [message] = parseSequence(`sequenceDiagram\nA${a.text}B: x\n`).model.statements;
      expect(message?.kind === 'message' && message.arrow, a.text).toBe(a.kind);
    }
  });
});
