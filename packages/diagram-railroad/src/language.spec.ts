import { describe, expect, it } from 'vitest';
import type { CompletionItem, Diagnostic } from '@mermaid-js/core/parser-kit';
import { language } from './language.ts';
import { NOTATION_CATEGORIES, RAILROAD_CATEGORIES } from './facet/tables.ts';
import { nameReason } from './facet/names.ts';
import { parseForLanguage } from './facet/parse.ts';
import { parseRailroad } from './parser/index.ts';
import type { RailroadNotation } from './parser/index.ts';

const HEADERS: Readonly<Record<RailroadNotation, string>> = {
  railroad: 'railroad-beta',
  railroadEbnf: 'railroad-ebnf-beta',
  railroadAbnf: 'railroad-abnf-beta',
  railroadPeg: 'railroad-peg-beta',
};
const RULES: Readonly<Record<RailroadNotation, string>> = {
  railroad: 'b = terminal("x") ;',
  railroadEbnf: 'b = "x" ;',
  railroadAbnf: 'b = "x" ;',
  railroadPeg: 'b <- "x" ;',
};
const NOTATIONS = Object.keys(HEADERS) as RailroadNotation[];

const parse = (text: string) => parseForLanguage(text, { keepTokens: true });
const codes = (ds: readonly Diagnostic[]) => ds.map((d) => `${d.severity} ${d.code}`);
const at = (text: string, d: Diagnostic) => text.slice(d.range.start, d.range.end);

/** Completion labels at the `|` in `marked`. */
function complete(marked: string): CompletionItem[] {
  const offset = marked.indexOf('|');
  const text = marked.slice(0, offset) + marked.slice(offset + 1);
  const result = language.parse(text, { keepTokens: true, probe: offset });
  return result.probe ? language.completions(result.probe, { text, result }) : [];
}

describe('the railroad facet', () => {
  it('has one category table: each notation agrees with it on every kind it emits', () => {
    for (const table of Object.values(NOTATION_CATEGORIES)) {
      for (const [kind, category] of Object.entries(table))
        expect(RAILROAD_CATEGORIES[Number(kind)]).toBe(category);
    }
    expect(language.id).toBe('railroad');
    expect(language.namespaces).toEqual([['rule']]);
  });

  it.each(NOTATIONS)('%s: parses as the parser does, tokens kept, nothing else changed', (n) => {
    const text = `${HEADERS[n]}\na = nope ;\n${RULES[n]}\n`;
    const plain = parseRailroad(text, { keepTokens: true });
    const facet = parse(text);
    expect(facet.model).toEqual(plain.model);
    expect(facet.ast).toEqual(plain.ast);
    expect(facet.symbols).toEqual(plain.symbols);
    expect(facet.tokens).toEqual(plain.tokens);
    expect(facet.model.notation).toBe(n);
  });
});

describe('D513 hints (info, no change to the model)', () => {
  it.each(NOTATIONS)('%s: a name that starts with `title` splits', (n) => {
    const text = `${HEADERS[n]}\ntitleCase ${RULES[n].slice(2)}\n`;
    const r = parse(text);
    const hint = r.diagnostics.find((d) => d.code === 'RAILROAD_TITLE_PREFIX');
    expect(hint?.severity).toBe('info');
    expect(at(text, hint!)).toBe('titleCase');
    expect(hint?.message).toContain('`Case`');
    expect(r.model).toEqual(parseRailroad(text).model);
  });

  it.each(NOTATIONS)('%s: `title` before the notation’s `=` is a title line', (n) => {
    const text = `${HEADERS[n]}\ntitle ${RULES[n].slice(2)}\n`;
    const r = parse(text);
    expect(codes(r.diagnostics)).toEqual(['info RAILROAD_TITLE_RULE']);
    expect(r.model.title).toBe(RULES[n].slice(2));
    expect(r.model.rules).toEqual([]);
  });

  it('ABNF: a `;` with text or blanks after it on its line, not a whole-line comment', () => {
    const text = 'railroad-abnf-beta\n; own line\na = "x" ; b = "y" ;\nc = "z" ;  \nd = "w" ;\n';
    const hints = parse(text).diagnostics.filter((d) => d.code === 'RAILROAD_SEMI_COMMENT');
    expect(hints.map((d) => text.slice(d.range.start, d.range.start + 4))).toEqual([
      '; b ',
      ';  \n',
    ]);
    expect(hints[0]?.message).toContain('more text after it');
    expect(hints[1]?.message).toContain('blanks');
    // No hint in the other notations, which have no `;` comment.
    expect(parse('railroad-ebnf-beta\na = "x" ; b = "y" ;\n').diagnostics).toEqual([]);
  });

  it.each(NOTATIONS)('%s: a header in another case', (n) => {
    const header = HEADERS[n].toUpperCase();
    const text = `${header}\n${RULES[n]}\n`;
    const r = parse(text);
    expect(codes(r.diagnostics)).toEqual(['error UNEXPECTED', 'info RAILROAD_HEADER_CASE']);
    expect(at(text, r.diagnostics[1]!)).toBe(header);
    expect(r.diagnostics[1]?.message).toContain(`Write \`${HEADERS[n]}\``);
  });
});

describe('D517 undefined references', () => {
  it.each(NOTATIONS)('%s: a warning at each reference to no rule', (n) => {
    const ref: Record<RailroadNotation, string> = {
      railroad: 'a = sequence(nonterminal("b"), nonterminal("c")) ;',
      railroadEbnf: 'a = b c ;',
      railroadAbnf: 'a = b c ;',
      railroadPeg: 'a <- b c ;',
    };
    const text = `${HEADERS[n]}\n${ref[n]}\n${RULES[n]}\n`;
    const warned = parse(text).diagnostics.filter((d) => d.code === 'RAILROAD_UNDEFINED_RULE');
    expect(warned.map((d) => [d.severity, at(text, d)])).toEqual([['warning', 'c']]);
  });
});

describe('folding', () => {
  it('adds multi-line comments and EBNF specials, inside their rule', () => {
    const text = 'railroad-ebnf-beta\n(* a\n b *)\na = ? x\n y ? ;\n/* one line */\n';
    const kinds = (s: readonly { kind: string; children?: unknown[] }[]): unknown =>
      s.map((x) => (x.children ? [x.kind, kinds(x.children as never)] : x.kind));
    expect(kinds(parse(text).statements)).toEqual(['header', 'comment', ['rule', ['special']]]);
  });
});

describe('names', () => {
  it.each([
    ['', 'cannot be empty'],
    ['2x', 'is not a rule name'],
    ['a b', 'is not a rule name'],
    ['titled', 'starts with `title`'],
    ['title', 'starts with `title`'],
  ])('refuses %j', (name, reason) => {
    expect(nameReason(name)).toContain(reason);
    expect(language.isValidId(name, 'rule')).toContain(reason);
  });

  it.each(['a', '_a', 'a-b', 'my_rule', 'choice', 'Ti'])('takes %j', (name) => {
    expect(language.isValidId(name, 'rule')).toBeUndefined();
  });
});

describe('completion', () => {
  const labels = (items: CompletionItem[]) => items.map((i) => i.label);

  it('offers the four headers at the start', () => {
    expect(labels(complete('railroad-|beta'))).toEqual([
      'railroad-beta',
      'railroad-ebnf-beta',
      'railroad-abnf-beta',
      'railroad-peg-beta',
    ]);
  });

  it('offers only the headers where the header goes, in an empty text too', () => {
    expect(labels(complete('|'))).toEqual([
      'railroad-beta',
      'railroad-ebnf-beta',
      'railroad-abnf-beta',
      'railroad-peg-beta',
    ]);
  });

  it('offers rule names where an element goes, by notation', () => {
    expect(labels(complete('railroad-ebnf-beta\nab = "1" ;\nc = a|'))).toEqual(['ab']);
    expect(labels(complete('railroad-abnf-beta\nab = "1" ;\nc = a|'))).toEqual(['ab']);
    expect(labels(complete('railroad-peg-beta\nab <- "1" ;\nc <- a|'))).toEqual(['ab']);
    const ir = complete('railroad-beta\nab = terminal("1") ;\nc = |');
    expect(ir.find((i) => i.label === 'ab')?.insertText).toBe('nonterminal("ab")');
    const quoted = complete('railroad-beta\nab = terminal("1") ;\nc = nonterminal("a|") ;');
    expect(quoted.map((i) => [i.label, i.insertText])).toEqual([['ab', 'ab']]);
    // Not in a terminal's string, nor at a new rule's name.
    expect(complete('railroad-beta\nab = terminal("1") ;\nc = terminal("a|") ;')).toEqual([]);
    expect(labels(complete('railroad-ebnf-beta\nab = "1" ;\na|'))).toEqual([]);
  });

  it('offers the notation’s operators after an element', () => {
    expect(labels(complete('railroad-peg-beta\na <- b |;'))).toContain('/');
    expect(labels(complete('railroad-ebnf-beta\na = b |;'))).toContain('|');
    expect(labels(complete('railroad-abnf-beta\na = b |;'))).toEqual(
      expect.arrayContaining(['/', '*', '1*', ';'])
    );
  });
});

describe('hover', () => {
  const hover = (marked: string) => {
    const offset = marked.indexOf('|');
    const text = marked.slice(0, offset) + marked.slice(offset + 1);
    const result = parse(text);
    const symbol = result.symbols.find((s) => s.range.start <= offset && offset <= s.range.end);
    let token: { kind: number; range: { start: number; end: number } } | undefined;
    const t = result.tokens!;
    for (let j = 0; j < t.length; j++)
      if (t.start[j]! <= offset && offset < t.end[j]!)
        token = { kind: t.kind[j]!, range: { start: t.start[j]!, end: t.end[j]! } };
    return language.hover({ offset, token, symbol }, { text, result })?.contents;
  };

  it('shows the first line of the rule a name refers to', () => {
    expect(hover('railroad-peg-beta\na <- |b ;\nb <- "1"\n  / "2" ;')).toContain('b <- "1" …');
    expect(hover('railroad-peg-beta\na <- |c ;')).toContain('No rule named `c`');
  });

  it('shows what an ABNF repeat was read as', () => {
    expect(hover('railroad-abnf-beta\na = |2*5"x" ;')).toContain('At least 2 times and at most 5');
    expect(hover('railroad-abnf-beta\na = |3"x" ;')).toContain('Exactly 3 times');
  });

  it('shows the notation’s doc of a keyword', () => {
    expect(hover('railroad-beta\na = |choice(terminal("1")) ;')).toContain(
      'one of the expressions'
    );
  });
});
