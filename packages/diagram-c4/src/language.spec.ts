import { describe, expect, it } from 'vitest';
import { T as BETA } from './beta/tokens.ts';
import { c4Language, language } from './language.ts';
import { T as LEGACY } from './parser/tokens.ts';

/**
 * The C4 language facet (#543) at its own seam: the parse the service reads, completions at a
 * probe parse, hover and `isValidId`, as the language service calls them. The service-level
 * behaviour (definition, references, rename, folding, semantic tokens) is in the language
 * service's goldens (`packages/language-service/goldens/c4`).
 */
const CURSOR = '¦';

function split(marked: string): [text: string, at: number] {
  const at = marked.indexOf(CURSOR);
  return [marked.slice(0, at) + marked.slice(at + 1), at];
}

/** Completion items at `¦`, as `label -> insertText @ replaced text`. */
function complete(marked: string): string[] {
  const [text, at] = split(marked);
  const result = c4Language.parse(text, { keepTokens: true, probe: at });
  return c4Language
    .completions(result.probe!, { text, result })
    .map((c) => `${c.label} -> ${c.insertText} @ ${text.slice(c.range.start, c.range.end)}`);
}

/** Hover contents at `¦`, and the text it covers. */
function hover(marked: string): string[] | undefined {
  const [text, offset] = split(marked);
  const result = c4Language.parse(text, { keepTokens: true });
  const t = result.tokens!;
  let token: { kind: number; range: { start: number; end: number } } | undefined;
  for (let j = 0; j < t.length; j++) {
    const start = t.start[j]!;
    const end = t.end[j]!;
    if (start <= offset && offset < end) token = { kind: t.kind[j]!, range: { start, end } };
  }
  const h = c4Language.hover({ offset, ...(token && { token }) }, { text, result });
  return h && [text.slice(h.range.start, h.range.end), h.contents];
}

/** Each symbol as `<kind> <role> <name> = <text at its range>`. */
function symbols(text: string): string[] {
  const r = c4Language.parse(text, { keepTokens: true });
  return r.symbols.map(
    (s) => `${s.kind} ${s.role} ${s.name} = ${text.slice(s.range.start, s.range.end)}`
  );
}

const DOC =
  'C4Context\nPerson(customerA, "Customer A")\nSystem_Boundary(bank, "Bank") {\n  System(sys, "S")\n}\n';

describe('the c4 facet', () => {
  it('is exported under the name the service imports', () => {
    expect(language).toBe(c4Language);
    expect(language.id).toBe('c4');
    expect(language.namespaces).toEqual([['element'], ['boundary']]);
    expect(language.declaredOnly).toBe(true);
  });

  it('records aliases bare or in their quotes, an element first for a reference (D458)', () => {
    const text =
      'C4Context\nBoundary(x, "X") {\n  Person(p, "P")\n}\nSystem("x", "X system")\nRel(p, "x", "Uses")\nRel(p, " x ", "Padded")\nUpdateElementStyle(x, $bgColor="red")';
    expect(symbols(text)).toEqual([
      'boundary def x = x',
      'element def p = p',
      'element def x = "x"',
      'element ref p = p',
      'element ref x = "x"',
      'element ref p = p',
      // Not written as it is: the service drops it, and refuses to rename `x`.
      'element ref x = " x "',
      'element ref x = x',
    ]);
  });

  it('records the aliases named arguments give: `$alias`, `$parentBoundary`, `$from`, `$to`', () => {
    const text =
      'C4Context\nBoundary(b, "B") {\n  Person(p, "P")\n}\nPerson(a, "A", $alias="q")\nUpdateElementStyle(q, $parentBoundary="b")\nRel(p, p, "x", $to=" q ")\nRel(p, q, "y", $from="#35;")';
    expect(symbols(text)).toEqual([
      'boundary def b = b',
      'element def p = p',
      // D458: the `$alias` that renames the new element defines it; `a` names nothing now.
      'element def q = q',
      'boundary ref b = b',
      'element ref q = q',
      'element ref p = p',
      'element ref p = p',
      'element ref q = q',
      'element ref p = p',
      'element ref q = q',
      // An entity: not written as it is.
      'element ref &#35; = $from="#35;"',
    ]);
  });

  it('refuses the aliases D458 names, and any that would not read back', () => {
    expect(c4Language.isValidId('customer_A')).toBeUndefined();
    expect(c4Language.isValidId('b-1', 'boundary')).toBeUndefined();
    expect(c4Language.isValidId('two words')).toMatch(/blank/);
    expect(c4Language.isValidId('a\tb')).toMatch(/blank/);
    expect(c4Language.isValidId('a,b')).toMatch(/`,` or `\)`/);
    expect(c4Language.isValidId('a)')).toMatch(/`,` or `\)`/);
    expect(c4Language.isValidId('a"b')).toMatch(/no escapes/);
    expect(c4Language.isValidId('$a')).toMatch(/named argument/);
    expect(c4Language.isValidId('')).toMatch(/empty/);
    expect(c4Language.isValidId('a#35;')).toMatch(/would not read/);
    expect(c4Language.isValidId('a', 'relation')).toMatch(/not a C4 symbol kind/);
  });

  it('completes the headers on the first line and the macros at a line start', () => {
    expect(complete('C4D¦')).toEqual([
      'C4Dynamic -> C4Dynamic @ C4D',
      'C4Deployment -> C4Deployment @ C4D',
    ]);
    expect(complete(`${DOC}BiR¦`)).toEqual(['BiRel -> BiRel( @ BiR']);
    // A `(` already there is kept.
    expect(complete(`${DOC}Rel_B¦(a, b, "x")`)).toEqual(['Rel_Back -> Rel_Back @ Rel_B']);
    // Not after other text on the line.
    expect(complete(`${DOC}Person(a, "A") Rel¦`)).toEqual([]);
  });

  it('completes the title and accessibility statements at a line start (#700)', () => {
    const all = complete(`${DOC}¦`);
    // After the macros, in the order the parser takes them.
    expect(all.slice(-3)).toEqual([
      'title -> title @ ',
      'accTitle -> accTitle:  @ ',
      'accDescr -> accDescr:  @ ',
    ]);
    // A `title` at its line's end stands alone (D452): `title ` with no text is an error.
    expect(complete(`${DOC}ti¦`)).toEqual(['title -> title @ ti']);
    expect(complete(`${DOC}acc¦`)).toEqual([
      'accTitle -> accTitle:  @ acc',
      'accDescr -> accDescr:  @ acc',
    ]);
    // In a boundary too, but not as its first statement: the parser takes none there.
    expect(complete(`${DOC}Boundary(b, "B") {\n  Person(p, "P")\n  accT¦\n}`)).toEqual([
      'accTitle -> accTitle:  @ accT',
    ]);
    expect(complete(`${DOC}Boundary(b, "B") {\n  accT¦\n}`)).toEqual([]);
    expect(complete(`${DOC}Boundary(b, "B") {\n  Per¦\n}`)).toHaveLength(2);
    // What follows the word already is kept: a blank, a `:`, the `{` of a block.
    expect(complete(`${DOC}ti¦ Plan`)).toEqual(['title -> title @ ti']);
    expect(complete(`${DOC}accD¦: text`)).toEqual(['accDescr -> accDescr @ accD']);
    expect(complete(`${DOC}accD¦ {\n  text\n}`)).toEqual(['accDescr -> accDescr @ accD']);
    // Not where the header goes, and not after other text on the line.
    expect(complete('ti¦')).toEqual([]);
    expect(complete(`${DOC}Person(a, "A") ti¦`)).toEqual([]);
  });

  it('completes aliases in the reference slots only', () => {
    expect(complete(`${DOC}Rel(¦`)).toEqual([
      'customerA -> customerA @ ',
      'bank -> bank @ ',
      'sys -> sys @ ',
    ]);
    expect(complete(`${DOC}RelIndex(1, c¦`)).toEqual(['customerA -> customerA @ c']);
    expect(complete(`${DOC}RelIndex(c¦`)).toEqual([]);
    expect(complete(`${DOC}Rel(customerA, sys, "s¦`)).toEqual([]);
    expect(complete(`${DOC}Person(c¦`)).toEqual([]);
    // In the blanks before a typed end: the item replaces the end, blanks and all.
    expect(complete(`${DOC}Rel(customerA,¦ sy)`)).toEqual([
      'customerA -> customerA @  sy',
      'bank -> bank @  sy',
      'sys -> sys @  sy',
    ]);
    // A quoted end still open over a line break replaces nothing off the cursor's line.
    expect(complete(`${DOC}Rel(customerA, "x\ns¦`)).toEqual([]);
  });

  it('completes `$` names after the `$` only', () => {
    expect(complete(`${DOC}Rel(a, b, "x", "techn", ¦$descr="d")`)).toEqual([]);
    expect(complete(`${DOC}Rel(a, b, "x", "techn", $¦`)).toEqual([
      'descr -> descr=" @ ',
      'sprite -> sprite=" @ ',
      'tags -> tags=" @ ',
      'link -> link=" @ ',
    ]);
    expect(complete(`${DOC}Rel(a, b, "x", $techn="t", $descr="¦`)).toEqual([]);
  });

  it('completes nothing in comments, labels or accessibility text', () => {
    expect(complete(`${DOC}%% Rel(¦`)).toEqual([]);
    expect(complete(`${DOC}accTitle: Per¦`)).toEqual([]);
    expect(complete(`${DOC}Person(a, "Per¦")`)).toEqual([]);
  });

  it('hovers the slot an argument fills, by position or by name', () => {
    expect(hover(`${DOC}Rel(customerA, sys, "Uses", "JD¦BC")`)?.[1]).toContain(
      '**`techn`**\n\nArgument 4 of `Rel`.'
    );
    expect(hover(`${DOC}RelIndex(1, customerA, s¦ys, "Uses")`)?.[1]).toContain('**`to`**');
    expect(hover(`${DOC}Rel(customerA, sys, "Uses", $col¦our="3")`)?.[1]).toContain(
      'Not a name `Rel` reads'
    );
    expect(hover(`${DOC}UpdateRelStyle(customerA, sys, $off¦setX="3")`)?.[1]).toContain(
      'Moves the relation’s label across'
    );
    expect(hover(`${DOC}Rel(customerA, s¦ys, "Uses")`)?.[1]).toContain(
      '**system** `sys`\n\nLabel: `S`\n\nIn `bank`'
    );
    expect(hover(`${DOC}Rel(customerA, sys, "Uses")¦`)).toBeUndefined();
  });

  it('hovers the keyword alone, not the text a token takes after it', () => {
    expect(hover('C4Context\nti¦tle A title\nPerson(a, "A")')?.[0]).toBe('title');
    expect(hover('C4Context\naccDescr {\n  x\n¦}\nPerson(a, "A")')?.[0]).toBe('}');
  });
});

describe("the c4 facet's kind to category table", () => {
  it("holds legacy C4's kinds and c4-beta's apart, so one table serves both", () => {
    const legacy = new Set<number>(Object.values(LEGACY));
    expect(Object.values(BETA).filter((k) => legacy.has(k))).toEqual([]);
  });

  it('categorises a c4-beta kind as its grammar says, and a legacy kind as before', () => {
    expect(c4Language.categories[BETA.SoftwareSystem]).toBe('Keyword');
    expect(c4Language.categories[BETA.String]).toBe('String');
    expect(c4Language.categories[BETA.Tag]).toBe('Variable');
    expect(c4Language.categories[BETA.ArrowRight]).toBe('Operator');
    expect(c4Language.categories[LEGACY.Person]).toBe('Keyword');
    expect(c4Language.categories[LEGACY.Str]).toBe('String');
  });
});
