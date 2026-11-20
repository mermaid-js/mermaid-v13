/**
 * The four railroad grammar files (D512), read and built once each (dev and CI only), and how
 * their tokens are named in `@mermaid-js/parser@2.0.1`.
 */
import { join } from 'node:path';
import { Kind } from '@mermaid-js/core/parser-kit';
import type { LexToken } from '@mermaid-js/gen-grammar';
import { lexGrammar, loadGrammar } from '../../grammar-file.ts';
import type { GrammarTokens, LoadedGrammar } from '../../grammar-file.ts';
import { LANGIUM_NAMES, NOTATION_KINDS } from '@mermaid-js/diagram-railroad/testing';
import type { RailroadNotation } from '@mermaid-js/diagram-railroad/testing';
import { REPO_ROOT } from '../../corpus.ts';
import { classLexerInput } from '../../class/grammar/lexer-input.ts';

export const NOTATIONS: readonly RailroadNotation[] = [
  'railroad',
  'railroadEbnf',
  'railroadAbnf',
  'railroadPeg',
];

/** Each notation's grammar file. */
export const GRAMMAR_FILE: Readonly<Record<RailroadNotation, string>> = {
  railroad: 'railroad.ebnf',
  railroadEbnf: 'railroad-ebnf.ebnf',
  railroadAbnf: 'railroad-abnf.ebnf',
  railroadPeg: 'railroad-peg.ebnf',
};

interface Built extends LoadedGrammar {
  /** Grammar terminal → Chevrotain token name. */
  names: Readonly<Record<string, string>>;
  /** Grammar terminals the parser skips: Langium's hidden group. */
  hidden: ReadonlySet<string>;
}

const cache = new Map<RailroadNotation, Built>();

/** A kind key or grammar terminal name reduced for matching: `ACC_TITLE` ~ `AccTitle`. */
const fold = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

export function railroadGrammar(notation: RailroadNotation): Built {
  let built = cache.get(notation);
  if (!built) {
    const path = join(REPO_ROOT, 'packages/diagram-railroad/grammar', GRAMMAR_FILE[notation]);
    const { grammar, lexer } = loadGrammar(path);
    const langium = LANGIUM_NAMES[notation];
    const byKey = new Map(
      Object.entries(NOTATION_KINDS[notation]).map(([key, kind]) => [fold(key), kind])
    );
    const kindOf = (terminal: string): number | undefined => {
      if (terminal === 'DIRECTIVE') return Kind.Directive;
      if (terminal === 'COMMENT') return Kind.Comment;
      return byKey.get(fold(terminal));
    };
    const names: Record<string, string> = {};
    const hidden = new Set<string>();
    for (const terminal of grammar.tokens) {
      const kind = kindOf(terminal);
      const name = kind === undefined ? undefined : langium[kind];
      if (name === undefined) continue;
      names[terminal] = name;
      if (/YAML|DIRECTIVE|COMMENT/.test(terminal)) hidden.add(terminal);
    }
    built = { grammar, lexer, names, hidden };
    cache.set(notation, built);
  }
  return built;
}

/**
 * The grammar lexer's tokens for a railroad source. Its input is the text v12 handed its
 * parser: v12 ran the same preprocessing and `encodeEntities` for every diagram, so ER's
 * reference builder serves (the grammar-lexer spec checks it against v12's captured text).
 */
export function grammarTokens(notation: RailroadNotation, source: string): GrammarTokens {
  return lexGrammar(railroadGrammar(notation), classLexerInput(source));
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(notation: RailroadNotation, t: GrammarTokens): LexToken[] {
  const { hidden } = railroadGrammar(notation);
  return t.tokens.filter((k) => !hidden.has(k.name));
}
