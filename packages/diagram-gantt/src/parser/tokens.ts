/**
 * Gantt token kinds. They mirror the terminals of v12's `gantt.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned). Kinds marked "no jison token" are matched by a jison rule that returns nothing; v13
 * keeps them so every character of the text belongs to a token.
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `gantt\b`. */
  Gantt: F,
  /** `dateFormat`, one `\s` and a run of `[^#\n;]`, one token (the `\s` may be a line break). */
  DateFormat: F + 1,
  /** `inclusiveEndDates\b`. */
  InclusiveEndDates: F + 2,
  /** `topAxis\b`. */
  TopAxis: F + 3,
  /** `axisFormat\s[^#\n;]+`. */
  AxisFormat: F + 4,
  /** `tickInterval\s[^#\n;]+`. */
  TickInterval: F + 5,
  /** `includes\s[^#\n;]+`. */
  Includes: F + 6,
  /** `excludes\s[^#\n;]+`. */
  Excludes: F + 7,
  /** `todayMarker\s[^\n;]+` (`#` allowed). */
  TodayMarker: F + 8,
  /** `weekday\s+monday\b` … `weekday\s+sunday\b`: seven kinds in v12's order. */
  WeekdayMonday: F + 9,
  WeekdayTuesday: F + 10,
  WeekdayWednesday: F + 11,
  WeekdayThursday: F + 12,
  WeekdayFriday: F + 13,
  WeekdaySaturday: F + 14,
  WeekdaySunday: F + 15,
  /** `weekend\s+friday\b`, `weekend\s+saturday\b`. */
  WeekendFriday: F + 16,
  WeekendSaturday: F + 17,
  /** `\d\d\d\d-\d\d-\d\d\b`: no grammar rule takes it (a task text starting with a date). */
  Date: F + 18,
  /** `title\s[^\n]+`, one token (a bare `title` takes the next line). */
  Title: F + 19,
  /** `accTitle\s*:\s*`. */
  AccTitle: F + 20,
  AccTitleValue: F + 21,
  /** `accDescr\s*:\s*`. */
  AccDescr: F + 22,
  AccDescrValue: F + 23,
  /** `accDescr\s*\{` (no jison token; the blanks after it belong to the value). */
  AccDescrMultiline: F + 24,
  AccDescrMultilineValue: F + 25,
  /** The `}` closing `accDescr {` (no jison token). */
  AccDescrMultilineEnd: F + 26,
  /** `accDescription\s[^#\n;]+`: lexed, but no grammar rule takes it. */
  AccDescription: F + 27,
  /** `section\s[^\n]+`, one token. */
  Section: F + 28,
  /** `[^:\n]+`: a task's text, trailing blanks kept (a leading `#` or `;` is text). */
  TaskText: F + 29,
  /** `:[^#\n;]+`: a task's data, the `:` included. */
  TaskData: F + 30,
  /** A `:` no task data follows (jison's `':'`). */
  Colon: F + 31,
  /** `click[\s]+` (no jison token): enters the `click` state. */
  ClickKeyword: F + 32,
  /** `<click>[^\s\n]*`: the task ids after `click`, one token (`a,b`). */
  ClickId: F + 33,
  /** `<click>[\s\n]`: the one blank or line break that leaves the state (no jison token). */
  ClickEnd: F + 34,
  /** `href[\s]+"` (no jison token): enters the `href` state. */
  HrefKeyword: F + 35,
  /** `<href>[^"]*`: the link. */
  Href: F + 36,
  /** `<href>"` (no jison token). */
  HrefEnd: F + 37,
  /** `call[\s]+` (no jison token): enters the `callbackname` state. */
  CallKeyword: F + 38,
  /** `<callbackname>[^(]*`. */
  CallbackName: F + 39,
  /** `<callbackname>\([\s]*\)` (no jison token). */
  CallbackEmptyArgs: F + 40,
  /** `<callbackname>\(` (no jison token): enters `callbackargs`. */
  CallbackArgsOpen: F + 41,
  /** `<callbackargs>[^)]*`. */
  CallbackArgs: F + 42,
  /** `<callbackargs>\)` (no jison token). */
  CallbackArgsClose: F + 43,
  /**
   * `%%{` where jison's first rule takes it: it begins a start condition `gantt.jison` never
   * declares, so jison throws on the next token. v13 follows it with an `Error` token to the
   * line end.
   */
  OpenDirective: F + 44,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 45,
} as const;

/**
 * The v12 `gantt.jison` terminal each kind stands for (dev and test use: the lexer-parity gate
 * compares token streams by these names). Never shown to users (R-ERR-5). Kinds without an
 * entry have no jison token; `LEXICAL_ERROR` marks where jison threw.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Gantt]: 'gantt',
  [T.DateFormat]: 'dateFormat',
  [T.InclusiveEndDates]: 'inclusiveEndDates',
  [T.TopAxis]: 'topAxis',
  [T.AxisFormat]: 'axisFormat',
  [T.TickInterval]: 'tickInterval',
  [T.Includes]: 'includes',
  [T.Excludes]: 'excludes',
  [T.TodayMarker]: 'todayMarker',
  [T.WeekdayMonday]: 'weekday_monday',
  [T.WeekdayTuesday]: 'weekday_tuesday',
  [T.WeekdayWednesday]: 'weekday_wednesday',
  [T.WeekdayThursday]: 'weekday_thursday',
  [T.WeekdayFriday]: 'weekday_friday',
  [T.WeekdaySaturday]: 'weekday_saturday',
  [T.WeekdaySunday]: 'weekday_sunday',
  [T.WeekendFriday]: 'weekend_friday',
  [T.WeekendSaturday]: 'weekend_saturday',
  [T.Date]: 'date',
  [T.Title]: 'title',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.AccDescription]: 'accDescription',
  [T.Section]: 'section',
  [T.TaskText]: 'taskTxt',
  [T.TaskData]: 'taskData',
  [T.Colon]: ':',
  [T.ClickId]: 'click',
  [T.Href]: 'href',
  [T.CallbackName]: 'callbackname',
  [T.CallbackArgs]: 'callbackargs',
  [T.OpenDirective]: 'open_directive',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NL',
  [Kind.Error]: 'LEXICAL_ERROR',
};
