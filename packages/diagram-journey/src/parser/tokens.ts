/**
 * Journey token kinds. They mirror the terminals of v12's `journey.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `journey` keyword (`\b` after it). */
  Journey: F,
  /** `title\s[^#\n;]+`: the keyword and its text, one token. */
  Title: F + 1,
  /** `accTitle\s*:\s*`. */
  AccTitle: F + 2,
  AccTitleValue: F + 3,
  /** `accDescr\s*:\s*`. */
  AccDescr: F + 4,
  AccDescrValue: F + 5,
  /** `accDescr\s*{` (jison matches it and returns no token). */
  AccDescrMultiline: F + 6,
  AccDescrMultilineValue: F + 7,
  /** The `}` closing a multi-line description (jison returns no token). */
  AccDescrMultilineEnd: F + 8,
  /** `section\s[^#:\n;]+`: the keyword and its name, one token. */
  Section: F + 9,
  /** `[^#:\n;]+`. */
  TaskName: F + 10,
  /** `:[^#\n;]+`. */
  TaskData: F + 11,
  /** A `:` with nothing after it on the line (no grammar rule takes it). */
  Colon: F + 12,
  /** jison's `<<EOF>>` terminal `EOF`, zero-width at the end of the source. */
  Eof: F + 13,
  /** jison's `INVALID` (`.`, in practice a `;`). Not a lexical error. */
  Invalid: F + 14,
} as const;

/**
 * The jison terminal each kind stands for (parser-method §1). Kinds without one (the
 * `accDescr {` opener and its `}`, comments, directives) are left out of the parity gate.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Journey]: 'journey',
  [T.Title]: 'title',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.Section]: 'section',
  [T.TaskName]: 'taskName',
  [T.TaskData]: 'taskData',
  [T.Colon]: ':',
  [T.Eof]: 'EOF',
  [T.Invalid]: 'INVALID',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
