// cspell:words nonterminal betax
import { describe, expect, it } from 'vitest';
import { detectRailroad, parseRailroad, RULE_SYMBOL } from '../index.ts';
import type { RailroadNode } from '../index.ts';

/** The ids of a definition tree, depth first. */
function ids(n: RailroadNode): string[] {
  const kids =
    n.type === 'sequence'
      ? n.elements
      : n.type === 'choice'
        ? n.alternatives
        : n.type === 'optional' || n.type === 'repetition'
          ? [n.element]
          : [];
  return [n.astId, ...kids.flatMap(ids)];
}

const errors = (src: string) =>
  parseRailroad(src)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => d.code);

describe('railroad detection (v12 detectors, D513)', () => {
  it.each([
    ['railroad-beta\na = terminal("x") ;', 'railroad'],
    ['  RAILROAD-EBNF-BETA\na = "x" ;', 'railroadEbnf'],
    ['%% c\n%%{init: {}}%%\nrailroad-abnf-beta', 'railroadAbnf'],
    ['---\ntitle: t\n---\nrailroad-peg-beta', 'railroadPeg'],
    ['railroad-betax', 'railroad'],
    ['ra%%{init: {}}%%ilroad-peg-beta', 'railroadPeg'],
    ['flowchart TD', undefined],
    ['some text railroad-beta', undefined],
  ])('%j is %s', (src, notation) => {
    expect(detectRailroad(src)).toBe(notation);
  });

  it('reads the notation the header names, and rejects it in the wrong case', () => {
    expect(parseRailroad('railroad-peg-beta\nA <- "x" ;').model.notation).toBe('railroadPeg');
    expect(errors('RAILROAD-EBNF-BETA\na = "x" ;')).toEqual(['UNEXPECTED']);
    expect(errors('railroad-betax\na = terminal("x") ;')).toEqual(['UNEXPECTED']);
  });

  it('reads the text in the notation it is asked for, as each v12 parser did', () => {
    const r = parseRailroad('railroad-beta\na = "x" ;', { notation: 'railroadEbnf' });
    expect(r.model.notation).toBe('railroadEbnf');
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
    expect(r.model.rules.map((x) => x.name)).toEqual(['a']);
  });
});

describe('railroad AST ids and symbols (D517)', () => {
  const src = 'railroad-ebnf-beta\na = b , ( c | "d" )* ;\nb = ? x ? ;\na = b - c ;';
  const { model, ast, symbols, statements, diagnostics } = parseRailroad(src);

  it('gives rules `rule:<name>`, `@2` for a duplicate, and expressions their path', () => {
    expect(model.rules.map((r) => r.astId)).toEqual(['rule:a', 'rule:b', 'rule:a@2']);
    expect(model.rules.map((r) => ids(r.definition))).toEqual([
      ['rule:a/0', 'rule:a/0/0', 'rule:a/0/1', 'rule:a/0/1/0', 'rule:a/0/1/0/0', 'rule:a/0/1/0/1'],
      ['rule:b/0'],
      ['rule:a@2/0', 'rule:a@2/0/0', 'rule:a@2/0/1', 'rule:a@2/0/2'],
    ]);
  });

  it('has one AST node per model node, with the same ids and kinds', () => {
    const astIds = (n: { id: string; children?: { id: string }[] }): string[] => [
      n.id,
      ...(n.children ?? []).flatMap((c) => astIds(c as typeof n)),
    ];
    const rules = ast.children.filter((c) => c.type === 'Rule');
    expect(rules.map((r) => astIds(r).slice(1))).toEqual(model.rules.map((r) => ids(r.definition)));
    expect(ast.children.map((c) => c.id)).toEqual(['railroad', 'rule:a', 'rule:b', 'rule:a@2']);
  });

  it('gives each AST node the source it came from', () => {
    const rule = ast.children[1];
    expect(rule?.type).toBe('Rule');
    const text = (r: { range: { start: number; end: number } }) =>
      src.slice(r.range.start, r.range.end);
    if (rule?.type !== 'Rule') return;
    expect(text(rule)).toBe('a = b , ( c | "d" )* ;');
    const [def] = rule.children;
    expect(def?.children?.map(text)).toEqual(['b', '( c | "d" )*']);
    const exception = ast.children[3];
    if (exception?.type !== 'Rule') return;
    expect(exception.children[0]?.children?.map(text)).toEqual(['b', '-', 'c']);
  });

  it('warns once per duplicate rule, and draws both (v12 warned and kept both)', () => {
    expect(diagnostics.map((d) => [d.severity, d.code])).toEqual([
      ['warning', 'RAILROAD_DUPLICATE_RULE'],
    ]);
    expect(diagnostics[0]?.message).toBe(
      'The rule `a` is already defined at line 2: both definitions are drawn.'
    );
    expect(model.warnings).toEqual(diagnostics);
  });

  it('records rule names as `rule` symbols: defined by rules, referenced by nonterminals', () => {
    expect(
      symbols.map((s) => [s.name, s.kind, s.role, src.slice(s.range.start, s.range.end)])
    ).toEqual([
      ['a', RULE_SYMBOL, 'def', 'a'],
      ['b', RULE_SYMBOL, 'ref', 'b'],
      ['c', RULE_SYMBOL, 'ref', 'c'],
      ['b', RULE_SYMBOL, 'def', 'b'],
      ['a', RULE_SYMBOL, 'def', 'a'],
      ['b', RULE_SYMBOL, 'ref', 'b'],
      ['c', RULE_SYMBOL, 'ref', 'c'],
    ]);
    expect(statements.map((s) => s.kind)).toEqual(['header', 'rule', 'rule', 'rule']);
  });

  it('references a rule inside an IR string by the text between the quotes', () => {
    const ir = 'railroad-beta\nr = nonterminal("expr") ;';
    const ref = parseRailroad(ir).symbols.find((s) => s.role === 'ref');
    expect(ref && ir.slice(ref.range.start, ref.range.end)).toBe('expr');
  });

  it('references a rule under a PEG predicate, which draws as a special', () => {
    const peg = 'railroad-peg-beta\nA <- !B "x" ;';
    const r = parseRailroad(peg);
    expect(r.symbols.filter((s) => s.role === 'ref').map((s) => s.name)).toEqual(['B']);
    expect(r.model.rules[0]?.definition).toMatchObject({
      type: 'sequence',
      elements: [
        { type: 'special', text: '!B' },
        { type: 'terminal', value: 'x' },
      ],
    });
  });
});

describe('railroad title and accessibility (D218)', () => {
  it('takes the in-text title, else the front-matter one', () => {
    const fm = '---\ntitle: From front matter\n---\n';
    expect(parseRailroad(`${fm}railroad-beta\ntitle In text`).model.title).toBe('In text');
    expect(parseRailroad(`${fm}railroad-beta`).model.title).toBe('From front matter');
    expect(parseRailroad(`${fm}railroad-beta\ntitle`).model.title).toBe('From front matter');
    expect(parseRailroad('railroad-beta').model).not.toHaveProperty('title');
  });

  it('keeps the last of each, as Langium assigned them', () => {
    const { model } = parseRailroad(
      'railroad-abnf-beta\ntitle "a"\naccTitle: x\naccTitle:   y  z\naccDescr {\n  one\n   two\n}\ntitle "b"'
    );
    expect(model).toMatchObject({ title: 'b', accTitle: 'y z', accDescr: 'one\ntwo' });
  });

  it('splits a name that starts with `title` (D513)', () => {
    const { model } = parseRailroad('railroad-beta\ntitleCase = terminal("x") ;');
    expect(model.rules.map((r) => r.name)).toEqual(['Case']);
    expect(model).not.toHaveProperty('title');
  });
});

describe('railroad depth limit (R-SEC-5)', () => {
  it('reports expressions nested past `maxDepth` once, and parses the rules around them', () => {
    const deep = `railroad-beta\na = terminal("x") ;\nb = ${'optional('.repeat(5)}terminal("y")${')'.repeat(5)} ;\nc = terminal("z") ;`;
    const r = parseRailroad(deep, { maxDepth: 4 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
    expect(r.model.rules.map((x) => x.name)).toEqual(['a', 'c']);
    expect(errors(deep)).toEqual([]);
  });

  it('counts stacked postfixes too', () => {
    const r = parseRailroad('railroad-ebnf-beta\na = b???? ;', { maxDepth: 3 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
  });

  it('counts groups before reading them, so deep nesting never exhausts the stack', () => {
    const r = parseRailroad(`railroad-ebnf-beta\na = ${'('.repeat(100_000)} ;`);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT']);
  });
});

describe('railroad review fixes (#610)', () => {
  const messages = (src: string) => parseRailroad(src).diagnostics.map((d) => d.message);

  it('reports every rule nested past the limit, not only the first', () => {
    const deep = `${'optional('.repeat(4)}terminal("y")${')'.repeat(4)}`;
    const r = parseRailroad(`railroad-beta\na = ${deep} ;\nb = ${deep} ;`, { maxDepth: 3 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(['DEPTH_LIMIT', 'DEPTH_LIMIT']);
  });

  it('says the keyword is in the wrong case only when it is', () => {
    expect(messages('railroad-beta;\na = terminal("x") ;')[0]).toMatch(/blank or a line break/);
    expect(messages('railroad-peg-beta# c\nA <- "x" ;')[0]).toMatch(/blank or a line break/);
    expect(messages('Railroad-Beta\na = terminal("x") ;')[0]).toMatch(/lower case/);
  });

  it.each([
    ['railroad-ebnf-beta\na = "x" - ;', '`-` needs an element after it'],
    ['railroad-ebnf-beta\na = "x" , ;', '`,` needs an element after it'],
    ['railroad-abnf-beta\na = 2* ;', 'a repeat needs an element after it'],
    ['railroad-peg-beta\nA <- & ;', '`&` needs an element after it'],
    ['railroad-peg-beta\nA <- "x" ! ;', '`!` needs an element after it'],
    ['railroad-ebnf-beta\na = "x" | ;', 'an alternative cannot be empty'],
  ])('names what lacks its operand in %j', (src, hint) => {
    const [m] = messages(src);
    expect(m).toContain(hint);
    if (!hint.startsWith('an alternative')) expect(m).not.toContain('alternative cannot be empty');
  });

  it('does not count parentheses that draw nothing toward the depth limit', () => {
    const n = 150;
    for (const src of [
      `railroad-ebnf-beta\na = ${'( '.repeat(n)}b${' )'.repeat(n)} ;`,
      `railroad-abnf-beta\na = ${'( '.repeat(n)}b${' )'.repeat(n)} ;`,
      `railroad-peg-beta\nA <- ${'( '.repeat(n)}b${' )'.repeat(n)} ;`,
      `railroad-beta\na = ${'sequence('.repeat(n)}terminal("b")${')'.repeat(n)} ;`,
    ]) {
      expect(parseRailroad(src).diagnostics).toEqual([]);
    }
  });

  it('records a rule name as defined only when the rule parses', () => {
    const r = parseRailroad('railroad-ebnf-beta\na = b | ;\nc = d ;');
    expect(r.symbols.map((s) => [s.name, s.role])).toEqual([
      ['c', 'def'],
      ['d', 'ref'],
    ]);
    expect(r.ast.children.map((c) => c.id)).toEqual(['railroad', 'rule:c']);
  });

  it('keeps a header statement that stands where the header should be', () => {
    const r = parseRailroad('title T\na = terminal("x") ;', { notation: 'railroad' });
    expect(r.model.title).toBe('T');
    expect(r.model.rules.map((x) => x.name)).toEqual(['a']);
    expect(r.diagnostics.map((d) => d.code)).toEqual(['UNEXPECTED']);
  });
});

// D710, amending D563: a token is drawn as written, so the model holds what is drawn. A `#name;`
// code is its character (v12 drew it so); an `&name;` the author typed stays as written. A code
// is read after the string's escapes, so `#bsol;n` is a backslash and an n.
describe('railroad token text (D710)', () => {
  const definition = (src: string) => parseRailroad(src).model.rules[0]!.definition;

  it.each([
    ['railroad-beta\nr = terminal("#lt;&lt;#bsol;n") ;', '<&lt;\\n'],
    ['railroad-ebnf-beta\nr = "#lt;&lt;#bsol;n" ;', '<&lt;\\n'],
    ['railroad-abnf-beta\nr = "#lt;&lt;" ;', '<&lt;'],
    ['railroad-peg-beta\nr <- "#lt;&lt;#quot;" ;', '<&lt;"'],
  ])('reads %j as written', (src, value) => {
    expect(definition(src)).toMatchObject({ type: 'terminal', value });
  });

  it('marks PEG predicates and `.` literal, and no other special', () => {
    expect(definition('railroad-peg-beta\nr <- &"#lt;" !b . ;')).toMatchObject({
      elements: [
        { type: 'special', text: '&"<"', literal: true },
        { type: 'special', text: '!b', literal: true },
        { type: 'special', text: '.', literal: true },
      ],
    });
    const ebnf = definition('railroad-ebnf-beta\nr = ? #lt;x ? ;');
    expect(ebnf).toEqual({ type: 'special', astId: ebnf.astId, text: '&lt;x' });
  });
});
