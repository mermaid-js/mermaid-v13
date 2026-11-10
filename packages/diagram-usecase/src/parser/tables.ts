/**
 * The usecase parser's tables (#563): the kind sets its rules test, the lookahead sets that
 * reproduce v12's Chevrotain decisions (LL(3), `maxLookahead: 3`), and the human names of what
 * it expects (R-ERR-2, R-ERR-5). Built once at module scope; nothing here changes.
 */
import { ExpectedTable, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import { KEYWORDS, LABEL_TEXT, T, WORD } from './tokens.ts';

export const NAMES = [T.Identifier, T.PlainString, T.MarkdownString];
export const NAME_SET = kindSet(...NAMES);
export const QUOTED = [T.PlainString, T.MarkdownString];
export const LINE_END = [Kind.Newline, Kind.EOF];

/** The first token of each arrow (v12's `arrow` rule). */
export const ARROWS = [
  T.DependencyArrow,
  T.Generalization,
  T.ForwardSolid,
  T.BackwardSolid,
  T.MarkerlessSolid,
  T.ForwardCircle,
  T.BackwardCircle,
  T.ForwardCross,
  T.BackwardCross,
];
export const ARROW_SET = kindSet(...ARROWS);
/** What may close the label of `-- label …`. */
export const AFTER_DASH_LABEL = [
  T.ForwardSolid,
  T.MarkerlessSolid,
  T.ForwardCircle,
  T.ForwardCross,
];
/** What closes the label of `<-- label --`, `o-- label --` and `x-- label --`. */
export const AFTER_BACK_LABEL = [T.MarkerlessSolid];

/** v12's `isLabelToken`: a `LABEL_TEXT` token or a quoted text. */
export const LABEL_PART = kindSet(...KEYWORDS.map(([, k]) => k), ...labelText(), ...QUOTED);
function labelText(): number[] {
  const out: number[] = [];
  for (let k = 0; k < LABEL_TEXT.length; k++) if (LABEL_TEXT[k] === 1) out.push(k);
  return out;
}

/** What may follow a relation's source: an edge id or an arrow. */
export const RELATION_START = kindSet(T.Identifier, ...ARROWS);

/**
 * The statement rule's lookahead for a statement that starts with a name (LL(2)): what may come
 * second in `entityStatement`. Anything else fails at the statement's start, where v12's
 * parser reported it.
 */
const ENTITY_TAIL = [
  T.MetadataStart,
  T.StereotypeStart,
  T.ClassSeparator,
  T.Identifier,
  ...ARROWS,
  ...LINE_END,
];
export const ENTITY_SECOND_ID = kindSet(T.LParen, T.LBracket, ...ENTITY_TAIL);
export const ENTITY_SECOND_QUOTED = kindSet(...ENTITY_TAIL);
/** After `Name@{` (LL(3)): what the metadata starts with. */
export const METADATA_THIRD = kindSet(Kind.Newline, T.Identifier, T.PlainString, T.RBrace);

/** `metadataProperty`'s key and value. */
export const PROPERTY_KEYS = [T.Identifier, T.PlainString];
export const PROPERTY_KEY_SET = kindSet(...PROPERTY_KEYS);
export const PROPERTY_VALUES = [T.Identifier, T.PlainString, T.True, T.False];
export const PROPERTY_VALUE_SET = kindSet(...PROPERTY_VALUES);
/** After a separator's `,` and its line breaks, or after its line breaks: a key (LL(3)). */
export const AFTER_COMMA = kindSet(T.Identifier, T.PlainString);
export const AFTER_NEWLINE = kindSet(T.Comma, T.Identifier, T.PlainString);

export const DIRECTIONS = [T.Td, T.Tb, T.Bt, T.Lr, T.Rl];
export const DIRECTION_SET = kindSet(...DIRECTIONS);

/** `styleValue`'s property (v12's `WORD`, a CSS identifier, or `--` and a word). */
export const STYLE_PROPERTY = [...wordKinds(), T.CssIdentifier, T.MarkerlessSolid];
function wordKinds(): number[] {
  const out: number[] = [];
  for (let k = 0; k < WORD.length; k++) if (WORD[k] === 1) out.push(k);
  return out;
}
export const WORD_KINDS = wordKinds();
/** `styleComponent`: what a CSS value is made of. */
export const STYLE_PART = kindSet(
  ...wordKinds(),
  T.PlainString,
  T.Number,
  T.HashColor,
  T.CssIdentifier,
  T.CssEscapedComma,
  T.Dash,
  T.Dot,
  T.Percent,
  T.CssPunctuation,
  T.Colon,
  T.LParen,
  T.RParen,
  T.LBracket,
  T.RBracket,
  T.LBrace,
  T.RBrace,
  T.At,
  T.MarkerlessSolid
);

/** Statement starts that are keywords (a line that starts with one ends a skipped block). */
const KEYWORD_STARTS = [
  T.Actor,
  T.SystemBoundary,
  T.Note,
  T.JsonDeclarationStart,
  T.ClassDef,
  T.Class,
  T.Style,
  T.Direction,
  T.AccTitleLine,
  T.AccDescrLine,
  T.AccDescrBlock,
];
export const KEYWORD_LINE = kindSet(...KEYWORD_STARTS, T.End);
/** What starts a statement. */
export const STARTS = [...KEYWORD_STARTS, ...NAMES];
/** What a boundary's body holds. */
export const IN_BOUNDARY = [T.Actor, ...NAMES, T.End];

/** The PlantUML statements v12 refuses at a statement's start, in any case. */
export const PLANTUML = new Set(['allowmixing', 'newpage', 'package', 'rectangle', 'skinparam']);

const keyword = (word: string) => `\`${word}\``;

/** Human names of what a rule expects (R-ERR-2); never a token kind or rule name (R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['`usecase-beta`', [T.Usecase]],
  [
    'a statement such as `actor User` or `User --> Login`',
    [T.Actor, T.SystemBoundary, T.Note, T.JsonDeclarationStart, T.ClassDef, T.Class, T.Style],
  ],
  ['`direction`', [T.Direction]],
  ['`accTitle: …` or `accDescr: …`', [T.AccTitleLine, T.AccDescrLine, T.AccDescrBlock]],
  ['a name such as `Login`', [T.Identifier]],
  ['a text in quotes', [T.PlainString]],
  ['a Markdown text such as "`**bold**`"', [T.MarkdownString]],
  ['a label', [T.Number, T.HashColor, T.CssIdentifier, T.Dash, T.Dot, T.Percent]],
  ['an arrow such as `-->`', ARROWS],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF]],
  [keyword('('), [T.LParen]],
  [keyword(')'), [T.RParen]],
  [keyword('['), [T.LBracket]],
  [keyword(']'), [T.RBracket]],
  [keyword('@{'), [T.MetadataStart]],
  [keyword('}'), [T.RBrace]],
  [keyword(':'), [T.Colon]],
  [keyword(','), [T.Comma]],
  [keyword('@'), [T.At]],
  [keyword('<<'), [T.StereotypeStart]],
  ['a stereotype text', [T.StereotypeText]],
  [keyword('>>'), [T.StereotypeEnd]],
  [keyword(':::'), [T.ClassSeparator]],
  [keyword('for'), [T.For]],
  [keyword('end'), [T.End]],
  ['`include` or `extend`', [T.Include, T.Extend]],
  ['`true` or `false`', [T.True, T.False]],
  ['a direction: `TB`, `TD`, `BT`, `LR` or `RL`', DIRECTIONS],
  ['a JSON object such as `{ "key": "value" }`', [T.JsonObjectLiteral]],
]);

export const INCLUDE_EXTEND = [T.Include, T.Extend];
export const INCLUDE_EXTEND_SET = kindSet(...INCLUDE_EXTEND);
export const AFTER_DASH_LABEL_SET = kindSet(...AFTER_DASH_LABEL);
export const WORD_SET = kindSet(...WORD_KINDS);
export const STYLE_PROPERTY_SET = kindSet(...STYLE_PROPERTY);

/**
 * Kinds a completion probe's cursor follows rather than extends (R-LANG-7): the arrows and the
 * punctuation, and a closed quoted text or JSON object, which their closer ends. A word, a
 * number and a lone `-` are extended, so `A -|` is the start of an arrow being typed.
 */
export const PROBE_FOLLOWS = kindSet(
  ...ARROWS,
  T.StereotypeStart,
  T.StereotypeEnd,
  T.ClassSeparator,
  T.MetadataStart,
  T.At,
  T.LBrace,
  T.RBrace,
  T.LBracket,
  T.RBracket,
  T.LParen,
  T.RParen,
  T.Comma,
  T.Colon,
  T.PlainString,
  T.MarkdownString,
  T.JsonObjectLiteral
);

// What each decision point accepts, for the probe (R-LANG-7): the kinds its test reads.
/** A statement's first token, at the top level. */
export const P_STATEMENT = [...STARTS, Kind.Newline, Kind.Comment, Kind.EOF];
/** A line of a boundary's body. */
export const P_IN_BOUNDARY = [...IN_BOUNDARY, Kind.Newline, Kind.Comment, Kind.EOF];
/** After a statement's name (`entityName relationTail?`, a metadata statement). */
export const P_AFTER_NAME = [
  T.LParen,
  T.LBracket,
  T.MetadataStart,
  T.StereotypeStart,
  T.ClassSeparator,
  T.Identifier,
  ...ARROWS,
  ...LINE_END,
];
/** An unquoted or quoted label (`nodeLabel`). */
export const P_LABEL = [...QUOTED, ...labelText()];
/** After `--` / `<--` and the like: a label, or the target's name. */
export const P_AFTER_DASHES = [...NAMES, ...labelText(), ...QUOTED];
/** Inside `@{`, where a property or the `}` goes. */
export const P_PROPERTY_START = [...PROPERTY_KEYS, T.RBrace, Kind.Newline];
/** After a property: a separator, or the `}`. */
export const P_AFTER_PROPERTY = [T.Comma, Kind.Newline, T.RBrace];
