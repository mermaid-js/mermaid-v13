/**
 * v12's Langium token names for railroad's token kinds, per notation, apart from `tokens.ts`:
 * the computed keys keep a table in any chunk that imports its module, so only `testing.ts`
 * imports this one and a render chunk never carries it.
 */
// cspell:words numval rulename
import { Kind } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';
import type { RailroadNotation } from './tokens.ts';

type Names = Readonly<Record<number, string>>;

/** The rows every notation has; `P` is its terminals' prefix (`RR`, `EBNF`, `ABNF`, `PEG`). */
const common = (header: string, P: string): Names => ({
  [T.Header]: header,
  [T.Title]: 'TITLE',
  [T.AccTitle]: 'ACC_TITLE',
  [T.AccDescr]: 'ACC_DESCR',
  [T.Equals]: '=',
  [T.Semi]: ';',
  [T.LParen]: '(',
  [T.RParen]: ')',
  [T.String]: `${P}_STRING`,
  [T.Yaml]: `${P}_YAML`,
  [Kind.Directive]: `${P}_DIRECTIVE`,
  [Kind.Comment]: `${P}_SINGLE_LINE_COMMENT`,
  [Kind.Error]: 'LEXICAL_ERROR',
});

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1`, per notation
 * (dev and test use: the lexer-parity gates compare token streams by these names). Never shown
 * to users (R-ERR-5). A kind a notation never writes has no row in its table.
 */
export const LANGIUM_NAMES: Readonly<Record<RailroadNotation, Names>> = {
  railroad: {
    ...common('railroad-beta', 'RR'),
    [T.Id]: 'RR_ID',
    [T.Comma]: ',',
    [T.KwNonterminal]: 'nonterminal',
    [T.KwZeroOrMore]: 'zeroOrMore',
    [T.KwOneOrMore]: 'oneOrMore',
    [T.KwSequence]: 'sequence',
    [T.KwOptional]: 'optional',
    [T.KwTerminal]: 'terminal',
    [T.KwSpecial]: 'special',
    [T.KwChoice]: 'choice',
    [T.BlockComment]: 'RR_BLOCK_COMMENT',
  },
  railroadEbnf: {
    ...common('railroad-ebnf-beta', 'EBNF'),
    [T.Id]: 'EBNF_ID',
    [T.Define]: '::=',
    [T.Pipe]: '|',
    [T.Comma]: ',',
    [T.LBracket]: '[',
    [T.RBracket]: ']',
    [T.LBrace]: '{',
    [T.RBrace]: '}',
    [T.Question]: '?',
    [T.Star]: '*',
    [T.Plus]: '+',
    [T.Minus]: '-',
    [T.Special]: 'EBNF_SPECIAL_SEQUENCE',
    [T.BlockComment]: 'EBNF_BLOCK_COMMENT',
    [T.IsoComment]: 'EBNF_ISO_COMMENT',
  },
  railroadAbnf: {
    ...common('railroad-abnf-beta', 'ABNF'),
    [T.Id]: 'ABNF_RULENAME',
    [T.Slash]: '/',
    [T.LBracket]: '[',
    [T.RBracket]: ']',
    [T.NumVal]: 'ABNF_NUMVAL',
    [T.Repeat]: 'ABNF_REPEAT',
    [T.ExactRepeat]: 'ABNF_EXACT_REPEAT',
    [T.SemiComment]: 'ABNF_COMMENT',
  },
  railroadPeg: {
    ...common('railroad-peg-beta', 'PEG'),
    [T.Id]: 'PEG_ID',
    [T.Arrow]: '<-',
    [T.Slash]: '/',
    [T.Amp]: '&',
    [T.Bang]: '!',
    [T.Question]: '?',
    [T.Star]: '*',
    [T.Plus]: '+',
    [T.Dot]: '.',
    [T.HashComment]: 'PEG_LINE_COMMENT',
  },
};

/** The hidden Chevrotain token names of a notation (its comments, directives and YAML). */
export const LANGIUM_HIDDEN: Readonly<Record<RailroadNotation, ReadonlySet<string>>> = {
  railroad: new Set(['RR_YAML', 'RR_DIRECTIVE', 'RR_SINGLE_LINE_COMMENT', 'RR_BLOCK_COMMENT']),
  railroadEbnf: new Set([
    'EBNF_YAML',
    'EBNF_DIRECTIVE',
    'EBNF_SINGLE_LINE_COMMENT',
    'EBNF_BLOCK_COMMENT',
    'EBNF_ISO_COMMENT',
  ]),
  railroadAbnf: new Set([
    'ABNF_YAML',
    'ABNF_DIRECTIVE',
    'ABNF_SINGLE_LINE_COMMENT',
    'ABNF_COMMENT',
  ]),
  railroadPeg: new Set([
    'PEG_YAML',
    'PEG_DIRECTIVE',
    'PEG_SINGLE_LINE_COMMENT',
    'PEG_LINE_COMMENT',
  ]),
};
