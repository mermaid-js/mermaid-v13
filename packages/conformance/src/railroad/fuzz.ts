// cspell:words nonterminal terminalx xterminal accdescr acctitle
/**
 * Generated railroad inputs for the fuzz property (`fuzz.spec.ts`), per notation, adapted from
 * the reference implementation's AST-equality fuzz (`tests/support/railroad-oracle.ts` and
 * `tests/support/corpus.ts`; spec #526 adopts it as a parity
 * property, D325). Four sources of input, a quarter each: corpus inputs mutated with fragments
 * of the notation, random token pieces, well-formed grammars of random shape, and those
 * mutated. Every draw comes from one seeded generator, so a failure names a reproducible input.
 */
import type { RailroadNotation } from '@mermaid-js/diagram-railroad';

export type Rnd = () => number;

/** A linear congruential generator from `seed` (the reference implementation's `random`). */
export function random(seed: number): Rnd {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pick<X>(rnd: Rnd, list: readonly X[]): X {
  return list[Math.floor(rnd() * list.length)] as X;
}

function several(rnd: Rnd, max: number, make: () => string, joints: readonly string[]): string {
  const parts: string[] = [];
  for (let i = 1 + Math.floor(rnd() * max); i > 0; i--) parts.push(make());
  return parts.join(pick(rnd, joints));
}

/**
 * Up to three edits of a corpus input: insert, cut, splice, repeat or replace (the reference
 * implementation's `mutator`).
 */
export function mutator(
  corpus: readonly string[],
  fragments: readonly string[],
  rnd: Rnd
): () => string {
  return (): string => {
    let s = pick(rnd, corpus);
    const edits = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < edits; k++) {
      const pos = Math.floor(rnd() * (s.length + 1));
      const r = rnd();
      if (r < 0.35) {
        s = s.slice(0, pos) + pick(rnd, fragments) + s.slice(pos);
      } else if (r < 0.6) {
        s = s.slice(0, pos) + s.slice(pos + 1 + Math.floor(rnd() * 3));
      } else if (r < 0.75) {
        const other = pick(rnd, corpus);
        const from = Math.floor(rnd() * other.length);
        s = s.slice(0, pos) + other.slice(from, from + Math.floor(rnd() * 20)) + s.slice(pos);
      } else if (r < 0.9) {
        s = s.slice(0, pos) + s.slice(pos, pos + Math.floor(rnd() * 6)) + s.slice(pos);
      } else {
        s = s.slice(0, pos) + pick(rnd, fragments) + s.slice(pos + 1);
      }
    }
    return s;
  };
}

const STRINGS = [
  '"a"',
  "'b'",
  '"x y"',
  '"\\n"',
  '"\\""',
  '"q\\\\"',
  '""',
  '"+"',
  '"é"',
  "'it\\'s'",
  '"a  b"',
  '"?"',
  '";"',
  '"(*"',
];
const NAMES = [
  'r',
  'rule',
  'my_rule',
  'a-b',
  'A1',
  'terminals',
  'x_',
  'choice2',
  'accTitles',
  'digit',
  'Expr',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'titles',
  'title-x',
];

function irExpression(rnd: Rnd, depth: number): string {
  const r = rnd();
  if (depth <= 0 || r < 0.4) {
    return `${pick(rnd, ['terminal', 'nonterminal', 'special'])}(${pick(rnd, STRINGS)})`;
  }
  if (r < 0.75) {
    const items = several(rnd, 3, () => irExpression(rnd, depth - 1), [', ', ',', ' , ', ',\n  ']);
    return `${pick(rnd, ['sequence', 'choice'])}(${items})`;
  }
  return `${pick(rnd, ['optional', 'oneOrMore', 'zeroOrMore'])}( ${irExpression(rnd, depth - 1)} )`;
}

function ebnfPrimary(rnd: Rnd, depth: number): string {
  const r = rnd();
  if (depth <= 0 || r < 0.78) {
    if (rnd() < 0.1) return pick(rnd, ['? any ?', '?x?', '? two words ?']);
    return pick(rnd, rnd() < 0.5 ? STRINGS : NAMES);
  }
  const [open, close] = pick(rnd, [
    ['( ', ' )'],
    ['[ ', ' ]'],
    ['{ ', ' }'],
    ['(', ')'],
  ] as const);
  return open + ebnfChoice(rnd, depth - 1) + close;
}

function ebnfTerm(rnd: Rnd, depth: number): string {
  let s = ebnfPrimary(rnd, depth);
  while (rnd() < 0.25) {
    s += pick(rnd, [
      '?',
      '*',
      '+',
      ' - ' + ebnfPrimary(rnd, depth - 1),
      '-' + ebnfPrimary(rnd, depth - 1),
    ]);
  }
  return s;
}

function ebnfChoice(rnd: Rnd, depth: number): string {
  const sequence = () =>
    several(rnd, 3, () => ebnfTerm(rnd, depth), [' ', ' , ', ',', ' (* c *) ']);
  return several(rnd, 3, sequence, [' | ', '|']);
}

function abnfAlternation(rnd: Rnd, depth: number): string {
  const element = (): string => {
    const repeat = pick(rnd, ['', '', '', '*', '1*', '2*3', '3', '*4', '0*1', '1', '0']);
    if (depth <= 0 || rnd() < 0.78) {
      return (
        repeat +
        pick(rnd, [
          '"s"',
          '"a b"',
          '""',
          '%x41',
          '%d1.2',
          '%b0-1',
          'name',
          'DIGIT',
          'rule-name',
          'a1',
        ])
      );
    }
    const [open, close] = pick(rnd, [
      ['( ', ' )'],
      ['[ ', ' ]'],
      ['(', ')'],
    ] as const);
    return repeat + open + abnfAlternation(rnd, depth - 1) + close;
  };
  return several(rnd, 3, () => several(rnd, 3, element, [' ', '  ', '\n  ']), [' / ', '/']);
}

function pegChoice(rnd: Rnd, depth: number): string {
  const prefix = (): string => {
    const head = pick(rnd, ['', '', '', '&', '!']);
    const tail = pick(rnd, ['', '', '', '?', '*', '+']);
    if (depth <= 0 || rnd() < 0.78) {
      return head + (rnd() < 0.1 ? '.' : pick(rnd, rnd() < 0.5 ? STRINGS : NAMES)) + tail;
    }
    return `${head}( ${pegChoice(rnd, depth - 1)} )${tail}`;
  };
  return several(rnd, 3, () => several(rnd, 3, prefix, [' ', '  ', ' # c\n  ']), [' / ', '/']);
}

/** Fragments every notation shares: the header lines, blanks, comments, strings and names. */
const COMMON = [
  'title',
  'title ',
  'title "T"',
  "title 'T'",
  'title "a\\"b"',
  'title "',
  'accTitle: ',
  'accTitle',
  'accDescr: ',
  'accDescr {',
  'accDescr{x}',
  '}',
  '\n',
  '\r\n',
  ' ',
  '\t',
  '%%',
  '%% c',
  '%%{init: {}}%%',
  '---',
  '---\n',
  '---\nx: 1\n---\n',
  '\\',
  '\\"',
  "\\'",
  '\\n',
  '"',
  "'",
  '"a"',
  "'b'",
  '""',
  '"a b"',
  '"\\t\\\\"',
  ';',
  ' ;',
  ';\n',
  '=',
  '(',
  ')',
  ',',
  'x',
  'é',
  '#35;',
  '-',
  '_',
  '0',
  '9',
  'a-b',
  'A_1',
  '/*',
  '*/',
  '/* c */',
  'titles',
  'title-x',
  'title_',
];

export interface FuzzNotation {
  notation: RailroadNotation;
  keyword: string;
  fragments: readonly string[];
  seeds: readonly string[];
  /** A well-formed rule of random shape. */
  rule: (rnd: Rnd) => string;
}

export const FUZZ_NOTATIONS: readonly FuzzNotation[] = [
  {
    notation: 'railroad',
    keyword: 'railroad-beta',
    fragments: [
      ...COMMON,
      'railroad-beta',
      'terminal',
      'nonterminal',
      'special',
      'sequence',
      'choice',
      'optional',
      'oneOrMore',
      'zeroOrMore',
      'terminal("a")',
      'nonterminal("b")',
      'special("c")',
      'sequence(',
      'choice(',
      'optional(',
      'oneOrMore(',
      'zeroOrMore(',
      'terminalx',
      'xterminal',
      'choice1',
      'r = terminal("a") ;',
      ', ',
      '))',
      '"),',
    ],
    seeds: [
      'railroad-beta',
      'railroad-beta\ntitle Example Grammar\naccTitle: Accessible Railroad\naccDescr: Railroad description\nrule = terminal("a") ;',
      'railroad-beta\nr1 = optional(terminal("a")) ;\nr2 = oneOrMore(terminal("b")) ;\nr3 = zeroOrMore(terminal("c")) ;',
      'railroad-beta\n/* comment before the first rule */\nrule = terminal("a") ;\nnext = nonterminal("rule") ;',
      'railroad-beta\naccDescr {\n  two\n  lines\n}\ntitle "Quoted \\"title\\"" %% c\nr = special(\'x\\ty\') ; %% d\n',
      'railroad-beta title x\ntitles = sequence(choice(terminal("a")), optional(oneOrMore(zeroOrMore(nonterminal("n"))))) ;',
      '---\ntitle: x\n---\nrailroad-beta\nr = choice(terminal("a"), sequence(terminal("b"), terminal("c")), special("d")) ;',
    ],
    rule: (rnd) => `${pick(rnd, NAMES)} = ${irExpression(rnd, 4)} ;`,
  },
  {
    notation: 'railroadEbnf',
    keyword: 'railroad-ebnf-beta',
    fragments: [
      ...COMMON,
      'railroad-ebnf-beta',
      '::=',
      '|',
      '[',
      ']',
      '{',
      '}',
      '?',
      '*',
      '+',
      ' - ',
      '? x ?',
      '?  ?',
      '??',
      '? a; ?',
      '?x?',
      '(*',
      '*)',
      '(* c *)',
      '(**)',
      '(*)',
      '( a )',
      '[ a ]',
      '{ a }',
      'a?',
      'a*',
      'a+',
      'a - b',
      'a , b',
      'a | b',
      'r = a ;',
      'r ::= "a" ;',
      '- (',
      '-- ',
      '---x',
    ],
    seeds: [
      'railroad-ebnf-beta',
      'railroad-ebnf-beta\nr = a , b , c ;\ns ::= "x" | [ y ] | { z } | ( a b ) ;',
      'railroad-ebnf-beta\nr = ? any character ? - "x" ;\ns = a - ( b | c )* - d? ;',
      'railroad-ebnf-beta\n(* iso *) /* w3c */ %% mermaid\nr = a? b* c+ ;',
      'railroad-ebnf-beta\naccDescr {\n  d\n}\nr = { a } ;\naccDescr { e',
      'railroad-ebnf-beta\nr = a? b? ;\ns = a ? b ;',
      'railroad-ebnf-beta\ntitle "T"\nr = "\\"" \'\\\'\' "\\n" ;',
    ],
    rule: (rnd) => `${pick(rnd, NAMES)} ${pick(rnd, ['=', '::='])} ${ebnfChoice(rnd, 3)} ;`,
  },
  {
    notation: 'railroadAbnf',
    keyword: 'railroad-abnf-beta',
    fragments: [
      ...COMMON,
      'railroad-abnf-beta',
      '/',
      '[',
      ']',
      '*',
      '1*',
      '*2',
      '2*4',
      '3',
      '03',
      '%x41',
      '%d65',
      '%b1000001',
      '%x30-39',
      '%x0D.0A',
      '%x',
      '%X4f.',
      '%x1-',
      '; comment',
      ';x',
      '; ',
      ' ;\n',
      '*a',
      '1*( a )',
      '[ a ]',
      '( a / b )',
      'a / b',
      'r = a ;\n',
      'r = "a" ;',
      'rule-name',
      '2DIGIT',
      '**',
      '1*2*3',
    ],
    seeds: [
      'railroad-abnf-beta',
      'railroad-abnf-beta\nr = 2*4a 3b *c 1*d *5e [ f ] ( g / h ) ;\ns = %x41 %d65.66 %b1-0 "str" ;',
      'railroad-abnf-beta\nr = a ; a comment\n  / b ;\n',
      'railroad-abnf-beta\ntitle "T"\naccTitle: at\nr = "a" ;\n; trailing comment',
      'railroad-abnf-beta\nr = *( a / "b" ) 1*2[ c ] ;\n',
    ],
    rule: (rnd) =>
      `${pick(rnd, ['r', 'rule', 'a-b', 'A1', 'titles'])} = ${abnfAlternation(rnd, 3)} ;${pick(rnd, ['', '', '', ' c'])}`,
  },
  {
    notation: 'railroadPeg',
    keyword: 'railroad-peg-beta',
    fragments: [
      ...COMMON,
      'railroad-peg-beta',
      '<-',
      '<',
      '/',
      '&',
      '!',
      '?',
      '*',
      '+',
      '.',
      '# comment',
      '#x',
      '#',
      '&a',
      '!a',
      '!(',
      '&"x"',
      'a?',
      'a*',
      'a+',
      '( a )',
      'a / b',
      'R <- a ;',
      'R <- "a" ;',
      '!.',
      '&&',
      '??',
      '..',
    ],
    seeds: [
      'railroad-peg-beta',
      'railroad-peg-beta\nR <- &a !b c? d* e+ . ;\nS <- ( a / b ) / !( c d )* ;',
      'railroad-peg-beta\n# a comment\nR <- "a" # another\n  / \'b\' ;',
      'railroad-peg-beta\ntitle "T"\nEnd <- !. ;\nAny <- &"x" . ;',
    ],
    rule: (rnd) => `${pick(rnd, NAMES)} <- ${pegChoice(rnd, 3)} ;`,
  },
];

const HEADERS = [
  'title T\n',
  'title "Quoted \\" t"\n',
  "title 'q'\n",
  'accTitle: a  b\n',
  'accDescr: d\n',
  'accDescr {\n multi\n line\n}\n',
  'title\n',
];

/** Well-formed text of random shape in one notation (the reference implementation's `grammar`). */
export function grammar(n: FuzzNotation, rnd: Rnd): string {
  let s = n.keyword + pick(rnd, ['\n', ' ', '\n\n']);
  while (rnd() < 0.25) s += pick(rnd, HEADERS);
  for (let i = Math.floor(rnd() * 4); i > 0; i--)
    s += n.rule(rnd) + pick(rnd, ['\n', '\n\n', '\n%% c\n']);
  return s;
}

/**
 * Token-level pieces in a random order, most of them well-formed on their own (the reference
 * implementation's `pieces`).
 */
export function pieces(n: FuzzNotation, rnd: Rnd): string {
  let s = rnd() < 0.9 ? n.keyword + pick(rnd, ['\n', ' ', '\n\n', '']) : '';
  for (let i = 1 + Math.floor(rnd() * 14); i > 0; i--) {
    s += pick(rnd, n.fragments) + pick(rnd, ['', ' ', ' ', '\n']);
  }
  return s;
}

const RE_KEYWORD = /railroad-(?:ebnf-|abnf-|peg-)?beta/;

/**
 * The notation's own corpus inputs, then its seeds, then the other notations' inputs under this
 * keyword, which exercise the error paths and the shared constructs (the reference implementation's
 * `corpusFor`).
 */
export function fuzzCorpus(n: FuzzNotation, all: readonly string[]): string[] {
  const own = all.filter((src) => src.includes(n.keyword));
  const borrowed = all
    .filter((src) => !src.includes(n.keyword))
    .map((src) => src.replace(RE_KEYWORD, n.keyword));
  return [...own, ...n.seeds, ...borrowed];
}

/** `count` inputs for `n`: a quarter each of mutated corpus, pieces, grammars, mutated grammars. */
export function fuzzInputs(
  n: FuzzNotation,
  corpus: readonly string[],
  count: number,
  seed: number
): { kind: number; source: string }[] {
  const rnd = random(seed);
  const mutated = mutator(corpus, n.fragments, rnd);
  const make = [mutated, () => pieces(n, rnd), () => grammar(n, rnd), () => grammar(n, rnd)];
  const out: { kind: number; source: string }[] = [];
  for (let i = 0; i < count; i++) {
    const kind = i % 4;
    let src = (make[kind] ?? mutated)();
    if (kind === 3) src = mutator([src], n.fragments, rnd)();
    if (src.length <= 2000) out.push({ kind, source: src });
  }
  return out;
}
