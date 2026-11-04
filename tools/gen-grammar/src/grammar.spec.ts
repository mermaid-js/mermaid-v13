import { describe, expect, it } from 'vitest';
import {
  astOf,
  buildLexer,
  buildParser,
  lezerTokens,
  monarch,
  parseGrammar,
  textMate,
} from './index.ts';

const TINY = `
(** A tiny list language. *)
@lexer
@modes str ;
ID        /[a-z]+/          :variable ;
NUM       /[0-9]+/          :number ;
<str> STR /[^"]+/           :string ;
<str> -   /"/               pop attach-prev :string ;
<*> -     /"/               push(str) attach-next :string ;
COMMA     /,/ ;
-         / +/ ;
@grammar
list = item { COMMA item } ;
item @Item = ID | NUM | STR ;
`;

describe('grammar files', () => {
  it('reads modes, token rules and EBNF rules', () => {
    const g = parseGrammar(TINY);
    expect(g.doc).toBe('A tiny list language.');
    expect(g.modes).toEqual(['str']);
    expect(g.tokens).toEqual(['ID', 'NUM', 'STR', 'COMMA']);
    expect(g.rules.map((r) => [r.name, r.ast])).toEqual([
      ['list', undefined],
      ['item', 'Item'],
    ]);
    expect(g.start).toBe('list');
  });

  it("reads `@options case-insensitive` into every lexer and highlighter (jison's option)", () => {
    const src =
      '@lexer\n@options case-insensitive ;\nKW /end\\b/ :keyword ;\nID /[a-z]+/ ;\n- / +/ ;\n@grammar\ns = { KW | ID } ;';
    const g = parseGrammar(src);
    expect(g.ignoreCase).toBe(true);
    expect(
      buildLexer(g)
        .lex('END Abc')
        .tokens.map((t) => [t.name, t.text])
    ).toEqual([
      ['KW', 'END'],
      ['ID', 'Abc'],
    ]);
    const names = { id: 'x', extensions: ['x'] };
    expect(JSON.stringify(textMate(g, names))).toContain('(?i)end');
    expect(monarch(g, names)).toMatchObject({ ignoreCase: true });
    expect(lezerTokens(g, names, './x.js')).toContain("new RegExp(p, 'iy')");
    expect(parseGrammar(TINY).ignoreCase).toBe(false);
    expect(() => parseGrammar('@lexer\n@options loud ;\nA /a/ ;\n@grammar\ns = A ;')).toThrow(
      /line 2: unknown lexer option `loud`/
    );
  });

  it('reports unknown symbols, modes and unreachable rules with a line', () => {
    expect(() => parseGrammar('@lexer\nA /a/ push(nope) ;\n@grammar\ns = A ;')).toThrow(
      /line 2: unknown mode/
    );
    expect(() => parseGrammar('@lexer\nA /a/ ;\n@grammar\ns = B ;')).toThrow(/unknown symbol `B`/);
    expect(() => parseGrammar('@lexer\nA /a/ ;\n@grammar\ns = A ;\nt = A ;')).toThrow(
      /unreachable rules t/
    );
  });
});

describe('mode lexer', () => {
  const lexer = buildLexer(parseGrammar(TINY));

  it('tries rules in order, switches modes and attaches quote ranges to the string', () => {
    const { tokens, error } = lexer.lex('ab, "x y",7');
    expect(error).toBeUndefined();
    expect(tokens.map((t) => [t.name, t.text])).toEqual([
      ['ID', 'ab'],
      ['COMMA', ','],
      ['STR', 'x y'],
      ['COMMA', ','],
      ['NUM', '7'],
    ]);
    const str = tokens[2];
    expect([str?.start, str?.end, str?.outerStart, str?.outerEnd]).toEqual([5, 8, 4, 9]);
  });

  it('stops at the first character no rule matches', () => {
    expect(lexer.lex('ab;c').error).toBe(2);
  });
});

describe('reference parser', () => {
  const g = parseGrammar(TINY);
  const parser = buildParser(g);

  it('accepts sentences of the grammar and builds AST nodes for @-typed rules', () => {
    const tree = parser.parse(['ID', 'COMMA', 'NUM', 'COMMA', 'STR']);
    expect(tree).toBeDefined();
    expect(astOf(tree as NonNullable<typeof tree>).map((a) => [a.type, a.start, a.end])).toEqual([
      ['Item', 0, 1],
      ['Item', 2, 3],
      ['Item', 4, 5],
    ]);
  });

  it('rejects token sequences outside the grammar', () => {
    expect(parser.parse(['ID', 'COMMA'])).toBeUndefined();
    expect(parser.parse([])).toBeUndefined();
    expect(parser.parse(['ID', 'ID'])).toBeUndefined();
  });
});
