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

  it.each(NOTATIONS)(
    '%s: parses as the parser does (with the symbols of failed rules), tokens kept',
    (n) => {
      const text = `${HEADERS[n]}\na = nope ;\n${RULES[n]}\n`;
      const plain = parseRailroad(text, { keepTokens: true, keepFailedRules: true });
      const facet = parse(text);
      expect(facet.model).toEqual(plain.model);
      expect(facet.ast).toEqual(plain.ast);
      expect(facet.symbols).toEqual(plain.symbols);
      expect(facet.tokens).toEqual(plain.tokens);
      expect(facet.model.notation).toBe(n);
    }
  );
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

  it.each([
    ['railroad', 'title_x = terminal("x") ;', 'title_x'],
    ['railroadEbnf', 'title_x = "x" ;', 'title_x'],
    ['railroadPeg', 'title_x <- "x" ;', 'title_x'],
    ['railroadAbnf', 'titlex = "x" ;', 'titlex'],
  ] as const)(
    '%s: a glued name that starts with a name character splits (v12)',
    (n, rule, word) => {
      const text = `${HEADERS[n]}\n${rule}\n`;
      const hint = parse(text).diagnostics.find((d) => d.code === 'RAILROAD_TITLE_PREFIX');
      expect(hint && at(text, hint)).toBe(word);
    }
  );

  it.each([
    ['railroadAbnf', 'title_x = "x" ;'],
    ['railroadAbnf', 'title-x = "x" ;'],
    ['railroadPeg', 'title-x <- "x" ;'],
    ['railroad', 'title-x = terminal("x") ;'],
  ] as const)('%s: no split hint where v12 has a lexer error instead (%s)', (n, rule) => {
    const r = parse(`${HEADERS[n]}\n${rule}\n`);
    expect(codes(r.diagnostics)).not.toContain('info RAILROAD_TITLE_PREFIX');
    expect(r.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it.each([
    ['railroad', 'title=terminal("x") ;'],
    ['railroadEbnf', 'title::="x" ;'],
    ['railroadAbnf', 'title="x" ;'],
    ['railroadPeg', 'title<-"x" ;'],
  ] as const)('%s: `title` glued to the notation’s `=` (v12 rejects it)', (n, rule) => {
    const text = `${HEADERS[n]}\n${rule}\n`;
    const r = parse(text);
    expect(codes(r.diagnostics)).toContain('info RAILROAD_TITLE_RULE');
  });

  it('ABNF: a `;` comment that swallows the rule’s end, not a deliberate comment', () => {
    const text =
      'railroad-abnf-beta\n; own line\na = "x" ; b = "y" ;\nc = "z" ;  \nd = "w"   ; first\n  / "v" ;\ne = "u" ; last\n';
    const hints = parse(text).diagnostics.filter((d) => d.code === 'RAILROAD_SEMI_COMMENT');
    expect(hints.map((d) => text.slice(d.range.start, d.range.start + 4))).toEqual([
      '; b ',
      ';  \n',
      '; la',
    ]);
    expect(hints[0]?.message).toContain('more text after it');
    expect(hints[1]?.message).toContain('blanks');
    // No hint in the other notations, which have no `;` comment.
    expect(parse('railroad-ebnf-beta\na = "x" ; b = "y" ;\n').diagnostics).toEqual([]);
  });

  it.each(NOTATIONS)(
    '%s: a header in another case has one diagnostic, saying what v12 does',
    (n) => {
      const header = HEADERS[n].toUpperCase();
      const text = `${header}\n${RULES[n]}\n`;
      const r = parse(text);
      expect(codes(r.diagnostics)).toEqual(['error UNEXPECTED']);
      expect(r.diagnostics[0]?.message).toContain('detects');
    }
  );

  it('adds nothing to a probe parse (completion)', () => {
    const text = 'RAILROAD-BETA\ntitleCase = nonterminal("x") ;\n/* a\n b */\n';
    const probe = language.parse(text, { keepTokens: true, probe: 3 });
    const plain = parseRailroad(text, { keepTokens: true, probe: 3 });
    expect(probe.diagnostics).toEqual(plain.diagnostics);
    expect(probe.statements).toEqual(plain.statements);
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

  it.each([
    ['railroad', 'a = nonterminal("b") ;\nb = sequence(nonterminal("a") ;\n', ['b', 'a']],
    ['railroadEbnf', 'a = b ;\nb = a | | c ;\nc = "x" ;\n', ['b', 'a', 'c']],
    ['railroadAbnf', 'a = b ;\nb = a / / c ;\nc = "x" ;\n', ['b', 'a', 'c']],
    ['railroadPeg', 'a <- b ;\nb <- a / / c ;\nc <- "x" ;\n', ['b', 'a', 'c']],
  ] as const)('%s: a rule that fails to parse still defines its name', (n, body, names) => {
    const text = `${HEADERS[n]}\n${body}`;
    const r = parse(text);
    expect(r.diagnostics.filter((d) => d.code === 'RAILROAD_UNDEFINED_RULE')).toEqual([]);
    const second = r.symbols.filter(
      (s) =>
        s.range.start > text.indexOf('\nb') &&
        s.range.start < text.indexOf(';', text.indexOf('\nb')) + 2
    );
    expect(second.map((s) => s.name)).toEqual(names);
    expect(second[0]?.role).toBe('def');
    // The model and AST stay as the parser leaves them (T2): no rule `b`.
    expect(r.model.rules.map((x) => x.name)).toEqual(
      parseRailroad(text).model.rules.map((x) => x.name)
    );
    expect(r.model.rules.map((x) => x.name)).not.toContain('b');
  });

  it('a name with no `=` after it defines nothing', () => {
    const r = parse('railroad-ebnf-beta\nb "x" ;\na = b ;\n');
    expect(r.symbols.filter((s) => s.role === 'def').map((s) => s.name)).toEqual(['a']);
  });
});

describe('folding', () => {
  it('adds multi-line comments and EBNF specials, inside the rule that holds them', () => {
    const text = 'railroad-ebnf-beta\n(* a\n b *)\na = ? x\n y ? (* c\n d *) ;\n/* one line */\n';
    const kinds = (s: readonly { kind: string; children?: unknown[] }[]): unknown =>
      s.map((x) => (x.children ? [x.kind, kinds(x.children as never)] : x.kind));
    expect(kinds(parse(text).statements)).toEqual([
      'header',
      'comment',
      ['rule', ['special', 'comment']],
    ]);
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

  it('shows the rule’s first line up to the rule’s end, not a comment after it', () => {
    const shown = hover('railroad-peg-beta\na <- |b ;\nb <- "1" ; # note\n');
    expect(shown).toContain('b <- "1" ;\n');
    expect(shown).not.toContain('note');
    const items = complete('railroad-peg-beta\nb <- "1" ; # note\na <- |');
    expect(items.find((i) => i.label === 'b')?.documentation).not.toContain('note');
  });

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
