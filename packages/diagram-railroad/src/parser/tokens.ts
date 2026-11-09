/**
 * Railroad token kinds, one set shared by the four notations (D511): IR, EBNF, ABNF and PEG.
 * They mirror the terminals and keywords of v12's four Langium grammars
 * (`packages/parser/src/language/railroad{,-ebnf,-abnf,-peg}/`), so each notation's lexer can
 * be checked token by token against its Chevrotain lexer (parser-method §1, D213). A kind that
 * two notations share (`=`, `;`, an identifier, a string) is one kind here, even where the
 * Chevrotain names differ (`RR_ID`, `EBNF_ID`, `PEG_ID`): `langium-names.ts` maps each kind per
 * notation. Kinds are plain numbers (TS enums are banned).
 */
// cspell:words numval rulename
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

/** The four notations, by the v12 diagram type that reads each one (D511). */
export type RailroadNotation = 'railroad' | 'railroadEbnf' | 'railroadAbnf' | 'railroadPeg';

export const T = {
  /**
   * The notation's header keyword (`railroad-beta`, `railroad-ebnf-beta`, …), followed by `%%`,
   * a `\s` or the end. Case-sensitive, where v12's detection is not (D513).
   */
  Header: F,
  /** `title`, then a blank and the line to `%%` or its end; or `title` alone (`titleCase`). */
  Title: F + 1,
  /** `accTitle`, blanks, `:` and the line to `%%` or its end. */
  AccTitle: F + 2,
  /** `accDescr` with `:` and the line to `%%` or its end, or `accDescr {…}`. */
  AccDescr: F + 3,
  /**
   * A name: `[A-Z_a-z][\w-]*` (IR, EBNF, PEG) or `[A-Za-z][A-Za-z0-9-]*` (ABNF `rulename`).
   * Also an IR keyword followed by a name character (`sequenceX`).
   */
  Id: F + 4,
  /** `"…"` or `'…'` with `\` escapes (IR, EBNF, PEG), or `"[^"]*"` (ABNF). */
  String: F + 5,
  Equals: F + 6,
  Semi: F + 7,
  LParen: F + 8,
  RParen: F + 9,
  Comma: F + 10,
  // IR keywords, with no boundary before a non-name character (`choice(`).
  KwNonterminal: F + 11,
  KwZeroOrMore: F + 12,
  KwOneOrMore: F + 13,
  KwSequence: F + 14,
  KwOptional: F + 15,
  KwTerminal: F + 16,
  KwSpecial: F + 17,
  KwChoice: F + 18,
  // EBNF.
  /** `::=`. */
  Define: F + 19,
  Pipe: F + 20,
  LBracket: F + 21,
  RBracket: F + 22,
  LBrace: F + 23,
  RBrace: F + 24,
  /** `?` (EBNF and PEG), when no special sequence starts there (EBNF). */
  Question: F + 25,
  Star: F + 26,
  Plus: F + 27,
  /** `-` (EBNF), when no YAML block starts there. */
  Minus: F + 28,
  /** `? … ?` (EBNF): no `;` or `?` inside, and at least one non-blank. May span lines. */
  Special: F + 29,
  // ABNF (and `/` in PEG).
  Slash: F + 30,
  /** `%x41`, `%d65-90`, `%b1.0.1`: `%[xXdDbB]` and hex digits, `-` ranges and `.` lists. */
  NumVal: F + 31,
  /** `[0-9]*\*[0-9]*`: `*`, `1*`, `*3`, `2*5`. */
  Repeat: F + 32,
  /** `[0-9]+` not followed by `*`. */
  ExactRepeat: F + 33,
  // PEG.
  /** `<-`. */
  Arrow: F + 34,
  Amp: F + 35,
  Bang: F + 36,
  /** `.` (PEG's any character). */
  Dot: F + 37,
  // Hidden in v12: trivia here.
  /** A `---` … `---` block in the body. */
  Yaml: F + 38,
  /** `/* … *\/` (IR, EBNF). */
  BlockComment: F + 39,
  /** `(* … *)` (EBNF). */
  IsoComment: F + 40,
  /** `;` and at least one more character to the line end (ABNF): a comment, not a rule end. */
  SemiComment: F + 41,
  /** `#` to the line end (PEG). */
  HashComment: F + 42,
} as const;

/**
 * Trivia for the railroad parsers: the shared trivia kinds and every hidden comment kind. In-text
 * `%%` comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing. No notation has a newline token: line breaks are blanks.
 */
export const RAILROAD_TRIVIA = /* @__PURE__ */ kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Yaml,
  T.BlockComment,
  T.IsoComment,
  T.SemiComment,
  T.HashComment
);

/*
 * Each notation's kinds, named as its grammar file names its tokens (`grammar/<notation>.ebnf`):
 * `gen:grammar` builds each notation's kind → category and doc tables from one of these (D512).
 */

/** The IR notation's kinds (`grammar/railroad.ebnf`). */
export const IrKind = {
  Header: T.Header,
  KwNonterminal: T.KwNonterminal,
  KwZeroOrMore: T.KwZeroOrMore,
  KwOneOrMore: T.KwOneOrMore,
  KwSequence: T.KwSequence,
  KwOptional: T.KwOptional,
  KwTerminal: T.KwTerminal,
  KwSpecial: T.KwSpecial,
  KwChoice: T.KwChoice,
  Equals: T.Equals,
  Semi: T.Semi,
  LParen: T.LParen,
  Comma: T.Comma,
  RParen: T.RParen,
  Title: T.Title,
  AccTitle: T.AccTitle,
  AccDescr: T.AccDescr,
  Id: T.Id,
  String: T.String,
  Yaml: T.Yaml,
  BlockComment: T.BlockComment,
} as const;

/** The EBNF notation's kinds (`grammar/railroad-ebnf.ebnf`). */
export const EbnfKind = {
  Header: T.Header,
  Define: T.Define,
  Equals: T.Equals,
  Semi: T.Semi,
  Pipe: T.Pipe,
  Comma: T.Comma,
  IsoComment: T.IsoComment,
  LParen: T.LParen,
  RParen: T.RParen,
  LBracket: T.LBracket,
  RBracket: T.RBracket,
  LBrace: T.LBrace,
  RBrace: T.RBrace,
  Special: T.Special,
  Question: T.Question,
  Star: T.Star,
  Plus: T.Plus,
  Yaml: T.Yaml,
  Minus: T.Minus,
  Title: T.Title,
  AccTitle: T.AccTitle,
  AccDescr: T.AccDescr,
  Id: T.Id,
  String: T.String,
  BlockComment: T.BlockComment,
} as const;

/** The ABNF notation's kinds (`grammar/railroad-abnf.ebnf`). */
export const AbnfKind = {
  Header: T.Header,
  Equals: T.Equals,
  SemiComment: T.SemiComment,
  Semi: T.Semi,
  Slash: T.Slash,
  LParen: T.LParen,
  RParen: T.RParen,
  LBracket: T.LBracket,
  RBracket: T.RBracket,
  Title: T.Title,
  AccTitle: T.AccTitle,
  AccDescr: T.AccDescr,
  Id: T.Id,
  String: T.String,
  NumVal: T.NumVal,
  Repeat: T.Repeat,
  ExactRepeat: T.ExactRepeat,
  Yaml: T.Yaml,
} as const;

/** The PEG notation's kinds (`grammar/railroad-peg.ebnf`). */
export const PegKind = {
  Header: T.Header,
  Arrow: T.Arrow,
  Semi: T.Semi,
  Slash: T.Slash,
  Amp: T.Amp,
  Bang: T.Bang,
  Question: T.Question,
  Star: T.Star,
  Plus: T.Plus,
  LParen: T.LParen,
  RParen: T.RParen,
  Dot: T.Dot,
  Title: T.Title,
  AccTitle: T.AccTitle,
  AccDescr: T.AccDescr,
  Id: T.Id,
  String: T.String,
  Yaml: T.Yaml,
  HashComment: T.HashComment,
} as const;

/** Each notation's kinds, by notation. */
export const NOTATION_KINDS: Readonly<Record<RailroadNotation, Readonly<Record<string, number>>>> =
  {
    railroad: IrKind,
    railroadEbnf: EbnfKind,
    railroadAbnf: AbnfKind,
    railroadPeg: PegKind,
  };
