/**
 * Timeline token kinds. They mirror the terminals of v12's `timeline.jison`, so the lexer can
 * be checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums
 * are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `timeline` with no direction. */
  Timeline: F,
  /** `timeline LR` (blanks and tabs between, one token). */
  TimelineLR: F + 1,
  /** `timeline TD`. */
  TimelineTD: F + 2,
  /** `title`, one `\s` and the rest of the line, one token (the `\s` may be a line break). */
  Title: F + 3,
  /** `accTitle:` with the blanks around the colon. */
  AccTitle: F + 4,
  AccTitleValue: F + 5,
  /** `accDescr:` with the blanks around the colon. */
  AccDescr: F + 6,
  AccDescrValue: F + 7,
  /** `accDescr {` and the blanks after it (jison returns no token for it). */
  AccDescrMultiline: F + 8,
  AccDescrMultilineValue: F + 9,
  /** The `}` closing `accDescr {` (jison returns no token for it). */
  AccDescrMultilineEnd: F + 10,
  /** `section`, one `\s` and the text up to a `:` or the line end, one token. */
  Section: F + 11,
  /** `:`, one `\s` and the event text: up to a `:` that a blank follows, or the line end. */
  Event: F + 12,
  /** A run of `[^#:\n]`: the period text, trailing blanks kept. */
  Period: F + 13,
  /** jison's `INVALID` (a `:` no event starts at). Not a lexical error. */
  Invalid: F + 14,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 15,
} as const;

/**
 * The v12 `timeline.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry have no jison token; `LEXICAL_ERROR` marks where jison threw.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Timeline]: 'timeline',
  [T.TimelineLR]: 'timeline_lr',
  [T.TimelineTD]: 'timeline_td',
  [T.Title]: 'title',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.Section]: 'section',
  [T.Event]: 'event',
  [T.Period]: 'period',
  [T.Invalid]: 'INVALID',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
