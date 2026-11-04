import { Kind } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

/**
 * The v12 `erDiagram.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.DirectionTB]: 'direction_tb',
  [T.DirectionBT]: 'direction_bt',
  [T.DirectionRL]: 'direction_rl',
  [T.DirectionLR]: 'direction_lr',
  [T.EntityName]: 'ENTITY_NAME',
  [T.Word]: 'WORD',
  [T.ErDiagram]: 'ER_DIAGRAM',
  [T.BlockStart]: 'BLOCK_START',
  [T.BlockStop]: 'BLOCK_STOP',
  [T.Brkt]: 'BRKT',
  [T.Comma]: 'COMMA',
  [T.StyleSeparator]: 'STYLE_SEPARATOR',
  [T.Colon]: 'COLON',
  [T.AttributeKey]: 'ATTRIBUTE_KEY',
  [T.AttributeWord]: 'ATTRIBUTE_WORD',
  [T.AttributeComment]: 'COMMENT',
  [T.Sqs]: 'SQS',
  [T.Sqe]: 'SQE',
  [T.Style]: 'STYLE',
  [T.ClassDef]: 'CLASSDEF',
  [T.Class]: 'CLASS',
  [T.Subgraph]: 'SUBGRAPH',
  [T.End]: 'END',
  [T.ZeroOrOne]: 'ZERO_OR_ONE',
  [T.OneOrMore]: 'ONE_OR_MORE',
  [T.ZeroOrMore]: 'ZERO_OR_MORE',
  [T.OnlyOne]: 'ONLY_ONE',
  [T.DecimalNum]: 'DECIMAL_NUM',
  [T.EntityOne]: 'ENTITY_ONE',
  [T.Num]: 'NUM',
  [T.MdParent]: 'MD_PARENT',
  [T.NonIdentifying]: 'NON_IDENTIFYING',
  [T.Identifying]: 'IDENTIFYING',
  [T.StyleText]: 'STYLE_TEXT',
  [T.Semi]: 'SEMI',
  [T.UnicodeText]: 'UNICODE_TEXT',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'INVALID',
};

/**
 * The jison terminal of one token. jison's `.` rules return the matched character itself as
 * the terminal, so a {@link T.Char} token is named by its text.
 */
export function jisonName(kind: number, text: string): string {
  return kind === T.Char ? text : (JISON_NAMES[kind] ?? String(kind));
}
