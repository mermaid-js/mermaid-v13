/**
 * v12's Langium token names for packet's token kinds, apart from `tokens.ts`: the computed keys
 * keep the table in any chunk that imports its module, so only `testing.ts` imports this one and
 * the render chunk never carries it.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `LEXICAL_ERROR` marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.PacketBeta]: 'packet-beta',
  [T.Packet]: 'packet',
  [T.Dash]: '-',
  [T.Plus]: '+',
  [T.Colon]: ':',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.Int]: 'INT',
  [T.String]: 'STRING',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
