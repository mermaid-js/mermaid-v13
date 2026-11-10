/** The event modeling grammar file, read and built once (dev and CI only). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  appendMapped,
  buildLexer,
  mapped,
  parseGrammar,
  replaceMapped,
  sliceMapped,
} from '@mermaid-js/gen-grammar';
import type { Grammar, LexToken, MappedText, ModeLexer } from '@mermaid-js/gen-grammar';
import { REPO_ROOT } from '../../corpus.ts';

export const EVENTMODELING_GRAMMAR_PATH = join(
  REPO_ROOT,
  'packages/diagram-eventmodeling/grammar/eventmodeling.ebnf'
);

let cached: { grammar: Grammar; lexer: ModeLexer } | undefined;

export function eventModelingGrammar(): { grammar: Grammar; lexer: ModeLexer } {
  if (!cached) {
    const grammar = parseGrammar(readFileSync(EVENTMODELING_GRAMMAR_PATH, 'utf8'));
    cached = { grammar, lexer: buildLexer(grammar) };
  }
  return cached;
}

/** Chevrotain names (`@mermaid-js/parser@2.0.1`) of the terminals the grammar names otherwise. */
export const LANGIUM_NAME: Readonly<Record<string, string>> = {
  HEADER: 'eventmodeling',
  RESETFRAME: 'resetframe',
  READMODEL: 'readmodel',
  PROCESSOR: 'processor',
  TIMEFRAME: 'timeframe',
  COMMAND: 'command',
  ENTITY: 'entity',
  EVENT: 'event',
  JSOBJ: 'jsobj',
  FIGMA: 'figma',
  GIVEN: 'given',
  JSON: 'json',
  SALT: 'salt',
  HTML: 'html',
  TEXT: 'text',
  DATA: 'data',
  NOTE: 'note',
  WHEN: 'when',
  THEN: 'then',
  RMO: 'rmo',
  CMD: 'cmd',
  EVT: 'evt',
  PCR: 'pcr',
  URI: 'uri',
  ARROW: '->>',
  GWT: 'gwt',
  UI: 'ui',
  MD: 'md',
  TF: 'tf',
  OPEN_REF: '[[',
  CLOSE_REF: ']]',
  RF: 'rf',
  BACKTICK: '`',
  DOT: '.',
  ID: 'EM_ID',
  FRAME_ID: 'EM_FID',
  DATA_INLINE: 'EM_DATA_INLINE',
  DATA_BLOCK: 'EM_DATA_BLOCK',
  ACC_DESCR: 'EM_ACC_DESCR',
  ACC_TITLE: 'EM_ACC_TITLE',
  TITLE: 'EM_TITLE',
  YAML: 'EM_YAML',
  DIRECTIVE: 'EM_DIRECTIVE',
  COMMENT: 'EM_SINGLE_LINE_COMMENT',
  BLOCK_COMMENT: 'EM_ML_COMMENT',
  LINE_COMMENT: 'EM_SL_COMMENT',
};

/** Lexer tokens the parser skips: Langium's hidden group. */
export const HIDDEN = new Set(['YAML', 'DIRECTIVE', 'COMMENT', 'BLOCK_COMMENT', 'LINE_COMMENT']);

// v12 `diagram-api/regexes.ts`, byte for byte.
const FRONT_MATTER = /^([^\S\n\r]*)-{3}\s*[\n\r](.*?)[\n\r]\1-{3}\s*[\n\r]+/s;
// eslint-disable-next-line mermaid/no-nested-quantifier -- v12's regex byte for byte (dev-only reference)
const DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;

/**
 * The text mermaid\@12 handed its event modeling parser, built with v12's own regexes and mapped
 * back to source offsets: `preprocess.ts` `cleanupText`, front matter, `removeDirectives`, then
 * `withComments` (v12's event modeling DB set `preserveCommentsWhenParsing`: comment lines kept,
 * nothing trimmed), `encodeEntities` and the appended line break. Dev and CI only; the
 * hand-written lexer reproduces these effects without rewriting (`eventModelingView`), so this
 * is an independent reference for it.
 */
export function eventModelingLexerInput(src: string): MappedText {
  let m = mapped(src);
  m = replaceMapped(m, /\r\n?/g, () => '\n');
  m = replaceMapped(
    m,
    /<(\w+)([^>]*)>/g,
    (_, tag = '', attrs = '') => '<' + tag + attrs.replace(/="([^"]*)"/g, "='$1'") + '>'
  );
  const fm = FRONT_MATTER.exec(m.text);
  if (fm) m = sliceMapped(m, fm[0].length);
  m = replaceMapped(m, DIRECTIVE, () => '');
  m = replaceMapped(m, /style.*:\S*#.*;/g, (s) => s.slice(0, -1));
  m = replaceMapped(m, /classDef.*:\S*#.*;/g, (s) => s.slice(0, -1));
  m = replaceMapped(m, /#\w+;/g, (s) => {
    const inner = s.slice(1, -1);
    return /^\+?\d+$/.test(inner) ? `ﬂ°°${inner}¶ß` : `ﬂ°${inner}¶ß`;
  });
  return appendMapped(m, '\n', src.length);
}

export interface GrammarTokens {
  input: MappedText;
  /** Every token, hidden ones and the final `EOF` included. */
  tokens: LexToken[];
  /** Lexer-input offset where lexing failed. */
  error: number | undefined;
}

/** The grammar lexer's tokens for an event modeling source. */
export function grammarTokens(source: string): GrammarTokens {
  const input = eventModelingLexerInput(source);
  const { tokens, error } = eventModelingGrammar().lexer.lex(input.text);
  return { input, tokens, error };
}

/** The tokens the reference parser reads: not hidden. */
export function parserTokens(t: GrammarTokens): LexToken[] {
  return t.tokens.filter((k) => !HIDDEN.has(k.name));
}
