/**
 * ER token kinds. They mirror the terminals of v12's `erDiagram.jison`, so the lexer can be
 * checked token by token against it. Where jison returns one terminal from several rules
 * (`ONE_OR_MORE` from `1+`, `|{`, `one or more`, …), there is one kind; the text tells the
 * spellings apart. Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  AccTitle: F,
  AccTitleValue: F + 1,
  AccDescr: F + 2,
  AccDescrValue: F + 3,
  AccDescrMultilineValue: F + 4,
  DirectionTB: F + 5,
  DirectionBT: F + 6,
  DirectionRL: F + 7,
  DirectionLR: F + 8,
  /** `"…"` without `%`, `\`, CR, LF, VT or BS, and not empty. */
  EntityName: F + 9,
  /** Any other `"…"`, line breaks included. */
  Word: F + 10,
  ErDiagram: F + 11,
  BlockStart: F + 12,
  BlockStop: F + 13,
  Brkt: F + 14,
  Comma: F + 15,
  StyleSeparator: F + 16,
  Colon: F + 17,
  AttributeKey: F + 18,
  AttributeWord: F + 19,
  /** An attribute's `"…"` comment (jison `COMMENT`; not a `%%` comment). */
  AttributeComment: F + 20,
  Sqs: F + 21,
  Sqe: F + 22,
  Style: F + 23,
  ClassDef: F + 24,
  Class: F + 25,
  Subgraph: F + 26,
  /** `end` with the blanks and line breaks after it, as jison's `end\b\s*`. */
  End: F + 27,
  ZeroOrOne: F + 28,
  OneOrMore: F + 29,
  ZeroOrMore: F + 30,
  OnlyOne: F + 31,
  DecimalNum: F + 32,
  /** A `1` that is an entity name, not a cardinality. */
  EntityOne: F + 33,
  Num: F + 34,
  MdParent: F + 35,
  NonIdentifying: F + 36,
  Identifying: F + 37,
  StyleText: F + 38,
  Semi: F + 39,
  UnicodeText: F + 40,
  /** One character jison's `.` rules return as itself (`?`, `*`, `,` in a block, …). */
  Char: F + 41,
  /** jison's `EOF` token: the end of the text, reached in the initial state. Zero-width. */
  Eof: F + 42,
} as const;
