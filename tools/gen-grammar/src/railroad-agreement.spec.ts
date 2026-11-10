// cspell:words nonterminal
/**
 * Railroad highlighting (#610, D512, language.md step 3): per notation, the four-way agreement
 * of the notation's kind → category table with the TextMate, Monarch and Lezer grammars
 * generated from its own grammar file (`highlighters(target)`), over the railroad corpus files
 * that notation's detector takes and fixtures for the kinds the corpus lacks.
 */
import { describe, expect, it } from 'vitest';
import { detectRailroad } from '@mermaid-js/diagram-railroad';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad';
import {
  NOTATION_KINDS,
  railroadAbnfCategories,
  railroadCategories,
  railroadEbnfCategories,
  railroadPegCategories,
  railroadTokens,
} from '@mermaid-js/diagram-railroad/testing';
import { agreement, corpus, highlighters } from './agreement-testing.ts';
import { GRAMMARS } from './generate.ts';

const CATEGORIES: Readonly<Record<RailroadNotation, Readonly<Record<number, string>>>> = {
  railroad: railroadCategories,
  railroadEbnf: railroadEbnfCategories,
  railroadAbnf: railroadAbnfCategories,
  railroadPeg: railroadPegCategories,
};

/** Shared fixtures: the header lines, comments and directives, a YAML block in the body. */
const SHARED = (h: string): [string, string][] => [
  ['acc', `${h}\naccTitle: T\naccDescr: one line\naccDescr {\n  multi\n}\ntitle "Q"\n`],
  ['comments', `${h}\n%% a comment\n%%{init: {}}%%\n`],
  ['multi-line directive', `${h}\n%%{\n  init: {}\n}%%\n`],
  ['yaml in the body', `${h}\n---\nx: 1\n---\n`],
];

/** Per notation: sources for the kinds the corpus lacks. */
const FIXTURES: Readonly<Record<RailroadNotation, [string, string][]>> = {
  railroad: [
    ...SHARED('railroad-beta'),
    [
      'every call',
      'railroad-beta\nr = sequence(choice(terminal("a"), nonterminal(\'b\')), optional(special("c")), oneOrMore(terminal("d")), zeroOrMore(terminal("e"))) ;\n/* block */',
    ],
  ],
  railroadEbnf: [
    ...SHARED('railroad-ebnf-beta'),
    [
      'every operator',
      'railroad-ebnf-beta\nr ::= a , b | [ c ] { d } ( e ) f? g* h+ i - j ? special ? ;\n(* iso *) /* block */\ns = "x" ;',
    ],
  ],
  railroadAbnf: [
    ...SHARED('railroad-abnf-beta'),
    ['every operator', 'railroad-abnf-beta\nr = 1*a / 2b [ c ] ( %x41-5A "s" ) ; a comment\n;\n'],
  ],
  railroadPeg: [
    ...SHARED('railroad-peg-beta'),
    ['every operator', 'railroad-peg-beta\nR <- &a !b ( c / d )? e* f+ . "s" ; # comment\n'],
  ],
};

/**
 * Where TextMate and Monarch, which read a line at a time, cannot follow a token that runs over
 * line breaks (Lezer, which runs the patterns, agrees): a `---` … `---` block inside the body
 * (v12's skipped YAML token; its optional middle cannot be written as one `begin[\s\S]*?end`
 * span), only in the fixture, and an EBNF special sequence `? … ?` written over lines, in
 * `ebnf-exceptions-and-specials.mmd`. The block `accDescr { … }` is written as a span and
 * agrees. Each entry: what the line-based highlighters give, and where it is first seen.
 */
const SPECIAL = '/e2e/diagrams/railroad/nightly-check/ebnf-exceptions-and-specials.mmd';
const LINE_BASED: Readonly<Record<RailroadNotation, readonly [string, string][]>> = {
  railroad: [
    ['Yaml is Meta, highlighted Other', 'yaml in the body at 14'],
    ['Yaml is Meta, highlighted Variable', 'yaml in the body at 18'],
  ],
  railroadEbnf: [
    ['Yaml is Meta, highlighted Operator', 'yaml in the body at 19'],
    ['Yaml is Meta, highlighted Variable', 'yaml in the body at 23'],
    ['Yaml is Meta, highlighted Other', 'yaml in the body at 24'],
    ['Special is String, highlighted Operator', `${SPECIAL} at 260`],
    ['Special is String, highlighted Variable', `${SPECIAL} at 262`],
    ['Special is String, highlighted Punctuation', `${SPECIAL} at 269`],
  ],
  railroadAbnf: [
    ['Yaml is Meta, highlighted Other', 'yaml in the body at 19'],
    ['Yaml is Meta, highlighted Variable', 'yaml in the body at 23'],
    ['Yaml is Meta, highlighted Number', 'yaml in the body at 26'],
  ],
  railroadPeg: [
    ['Yaml is Meta, highlighted Other', 'yaml in the body at 18'],
    ['Yaml is Meta, highlighted Variable', 'yaml in the body at 22'],
  ],
};

const lineBased = (notation: RailroadNotation) =>
  Object.fromEntries(
    ['Monarch', 'TextMate'].flatMap((h) =>
      LINE_BASED[notation].map(([what, at]) => [`${h}: ${what}`, at])
    )
  );

describe.each(['railroad', 'railroadEbnf', 'railroadAbnf', 'railroadPeg'] as const)(
  'four-way highlighting agreement (%s)',
  (notation) => {
    it('table, TextMate, Monarch and Lezer give every token the same category', async () => {
      const target = GRAMMARS.find((g) => g.type === notation);
      if (!target) throw new Error(`no GRAMMARS row for ${notation}`);
      const sources = corpus((text) => detectRailroad(text) === notation);
      expect(sources.length).toBeGreaterThan(3);
      const result = agreement(
        {
          kinds: NOTATION_KINDS[notation],
          categories: CATEGORIES[notation],
          tokens: (src) => railroadTokens(notation, src),
        },
        await highlighters(target),
        [...FIXTURES[notation], ...sources]
      );
      expect(result.disagreements).toEqual(lineBased(notation));
      expect(result.missing, 'kinds with no sample').toEqual([]);
    }, 120_000);
  }
);
