/**
 * Event modeling token kinds. They mirror the keywords and terminals of v12's Langium
 * `event-modeling.langium` (which does not import `common.langium`), so the lexer can be checked
 * token by token against its Chevrotain lexer (parser-method §1, D213). Kinds are plain numbers
 * (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `eventmodeling`, before `%%`, a `\s` character or the end (else it is an `Id`). */
  Header: F,
  // The word keywords. Each is a keyword only as a whole `[_a-zA-Z][\w_]*` run (EM_ID is its
  // longer alternative): `tf01` and `evtA` are names.
  Resetframe: F + 1,
  Readmodel: F + 2,
  Processor: F + 3,
  Timeframe: F + 4,
  Command: F + 5,
  Entity: F + 6,
  Event: F + 7,
  Jsobj: F + 8,
  Figma: F + 9,
  Given: F + 10,
  Json: F + 11,
  Salt: F + 12,
  Html: F + 13,
  Text: F + 14,
  Data: F + 15,
  Note: F + 16,
  When: F + 17,
  Then: F + 18,
  Rmo: F + 19,
  Cmd: F + 20,
  Evt: F + 21,
  Pcr: F + 22,
  Uri: F + 23,
  /** `->>`. */
  Arrow: F + 24,
  Gwt: F + 25,
  Ui: F + 26,
  Md: F + 27,
  Tf: F + 28,
  /** `[[`. */
  OpenRef: F + 29,
  /** `]]`. */
  CloseRef: F + 30,
  Rf: F + 31,
  /** The backtick around a data type. */
  Backtick: F + 32,
  /** `.`. */
  Dot: F + 33,
  /** EM_ID: `[_a-zA-Z][\w_]*`, ASCII only. */
  Id: F + 34,
  /** EM_FID: one to three digits (`1234` is `123` then `4`). */
  FrameId: F + 35,
  /**
   * EM_DATA_INLINE: `{` to the last `}` on its line, or `"` or `'` to the last of its kind on
   * its line (regex `.`: LF, CR, U+2028 and U+2029 end a line). Greedy: it takes later frames.
   */
  DataInline: F + 36,
  /**
   * EM_DATA_BLOCK: `{`, blanks, a line break, then up to a `}` that starts a line and ends at a
   * line break (taken), a `\s` character or the end.
   */
  DataBlock: F + 37,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 38,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 39,
  /** `title …` to `%%` or the line end (or `title` alone), with the blanks before it. */
  Title: F + 40,
  /** A `---` … `---` block in the body (EM_YAML). Hidden in v12: trivia. */
  Yaml: F + 41,
  /** `/* … *\/` (EM_ML_COMMENT). Hidden in v12: trivia. */
  BlockComment: F + 42,
  /** `//` to the line end (EM_SL_COMMENT). Hidden in v12: trivia. */
  LineComment: F + 43,
} as const;

/**
 * The word keywords in Chevrotain's order (longest first). A word run that equals one is that
 * keyword; any other run is an `Id` (the keywords' longer alternative), so the order only
 * decides `eventmodeling`, whose lookahead may fail (then `event` matches and the run is an
 * `Id`).
 */
export const KEYWORDS: ReadonlyMap<string, number> = /* @__PURE__ */ new Map([
  ['resetframe', T.Resetframe],
  ['readmodel', T.Readmodel],
  ['processor', T.Processor],
  ['timeframe', T.Timeframe],
  ['command', T.Command],
  ['entity', T.Entity],
  ['event', T.Event],
  ['jsobj', T.Jsobj],
  ['figma', T.Figma],
  ['given', T.Given],
  ['json', T.Json],
  ['salt', T.Salt],
  ['html', T.Html],
  ['text', T.Text],
  ['data', T.Data],
  ['note', T.Note],
  ['when', T.When],
  ['then', T.Then],
  ['rmo', T.Rmo],
  ['cmd', T.Cmd],
  ['evt', T.Evt],
  ['pcr', T.Pcr],
  ['uri', T.Uri],
  ['gwt', T.Gwt],
  ['ui', T.Ui],
  ['md', T.Md],
  ['tf', T.Tf],
  ['rf', T.Rf],
]);

/**
 * Trivia for the event modeling parser: the shared trivia kinds and the hidden YAML and `/* *\/`
 * and `//` comments. In-text `%%` comments are `Kind.Comment` and `%%{…}%%` directives
 * `Kind.Directive`, like the spans v12 removed before lexing. Whitespace (EM_WS, line breaks
 * included) writes no token: v12 skipped it.
 */
export const EVENTMODELING_TRIVIA = /* @__PURE__ */ kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Yaml,
  T.BlockComment,
  T.LineComment
);

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `LEXICAL_ERROR` marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.Header]: 'eventmodeling',
  ...Object.fromEntries([...KEYWORDS].map(([word, kind]) => [kind, word])),
  [T.Arrow]: '->>',
  [T.OpenRef]: '[[',
  [T.CloseRef]: ']]',
  [T.Backtick]: '`',
  [T.Dot]: '.',
  [T.Id]: 'EM_ID',
  [T.FrameId]: 'EM_FID',
  [T.DataInline]: 'EM_DATA_INLINE',
  [T.DataBlock]: 'EM_DATA_BLOCK',
  [T.AccDescr]: 'EM_ACC_DESCR',
  [T.AccTitle]: 'EM_ACC_TITLE',
  [T.Title]: 'EM_TITLE',
  [T.Yaml]: 'EM_YAML',
  [Kind.Directive]: 'EM_DIRECTIVE',
  [Kind.Comment]: 'EM_SINGLE_LINE_COMMENT',
  [T.BlockComment]: 'EM_ML_COMMENT',
  [T.LineComment]: 'EM_SL_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
