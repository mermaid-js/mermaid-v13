import {
  ExpectedTable,
  isSpace,
  Kind,
  kindSet,
  Stop,
  STOP,
  TRIVIA,
} from '@mermaid-js/core/parser-kit';
import type { KindSet, ParseState, Range } from '@mermaid-js/core/parser-kit';
import type { ClassNamespaceStmt } from './ast.ts';
import type { ClassLex } from './lexer.ts';
import type { RelationType } from './model.ts';
import { T } from './tokens.ts';

/** jison `alphaNumToken`. */
export const ALPHANUM = kindSet(T.UnicodeText, T.Num, T.Alpha, T.Minus);
/** What a `className` / `namespaceName` starts with. */
export const NAME_START = [T.Alpha, T.Num, T.Minus, T.UnicodeText, T.BquoteStr];
export const NAME_PART = kindSet(...NAME_START);
export const NAME_NEXT = [T.Dot, T.GenericType, ...NAME_START];
export const NS_NEXT = [T.Dot, ...NAME_START];
export const GENERIC = [T.GenericType];
export const ALPHANUM_KINDS = [T.Alpha, T.Num, T.Minus, T.UnicodeText];
export const RELATION_TYPES: Readonly<Record<number, RelationType>> = {
  [T.Aggregation]: 'aggregation',
  [T.Extension]: 'extension',
  [T.Composition]: 'composition',
  [T.Dependency]: 'dependency',
  [T.Lollipop]: 'lollipop',
};
export const RELATION_TYPE_KINDS = [
  T.Aggregation,
  T.Extension,
  T.Composition,
  T.Dependency,
  T.Lollipop,
];
export const LINE_KINDS = [T.Line, T.DottedLine];
export const RELATION_START = [...RELATION_TYPE_KINDS, ...LINE_KINDS];
export const RELATION_START_SET = kindSet(...RELATION_START);
export const AFTER_NAME = [T.Str, ...RELATION_START, T.Label];
export const STR = [T.Str];
export const SQE = [T.SQE];
export const LABEL = [T.Label];
export const AFTER_CLASS = [T.SQS, T.StyleSeparator, T.StructStart, T.AnnotationStart];
export const AFTER_LABEL = [T.StyleSeparator, T.StructStart, T.AnnotationStart];
export const STRUCT_START = [T.StructStart];
export const BODY = [T.Member, T.StructStop];
export const ANNOTATION_END = [T.AnnotationEnd];
export const AFTER_NS_NAME = [T.SQS, T.StructStart];
export const STYLE_PART_KINDS = [T.Alpha, T.Num, T.Colon, T.Space, T.Brkt, T.Style, T.Pct, T.Label];
export const STYLE_PART = kindSet(...STYLE_PART_KINDS);
export const COMMA = [T.Comma];
export const ALPHA = [T.Alpha];
export const CLICK_ACTION = [T.CallbackName, T.Href];
export const CALLBACK_ARGS = [T.CallbackArgs];
export const LINK_TARGET = [T.LinkTarget];
export const AFTER_URL = [T.Str, T.LinkTarget];
export const CLASS_DIAGRAM = [T.ClassDiagram];
export const NEWLINE = [Kind.Newline];
export const SEPARATOR = [Kind.Newline, T.Eof];
export const NS_SEPARATOR = [Kind.Newline, T.StructStop];
export const ACC_TITLE_VALUE = [T.AccTitleValue];
export const ACC_DESCR_VALUE = [T.AccDescrValue];

export const STATEMENT_KEYWORDS = [
  T.Class,
  T.Namespace,
  T.AnnotationStart,
  T.NoteFor,
  T.Note,
  T.Style,
  T.CssClass,
  T.ClassDef,
  T.Callback,
  T.Link,
  T.Click,
  T.DirectionTB,
  T.DirectionBT,
  T.DirectionRL,
  T.DirectionLR,
  T.AccTitle,
  T.AccDescr,
  T.AccDescrMultilineValue,
];
/** What a statement starts with (jison `statement`). */
export const STATEMENT_KINDS = [...NAME_START, ...STATEMENT_KEYWORDS, T.Member];
export const DOC_KINDS = [...STATEMENT_KINDS, T.Eof];
/** jison `classStatements`: what a namespace body holds. */
export const NS_ITEM_KINDS = [T.Class, T.NoteFor, T.Note, T.Namespace];
export const NS_BODY_KINDS = [...NS_ITEM_KINDS, T.StructStop];
export const NS_FIRST_KINDS = [...NS_BODY_KINDS, Kind.Newline];

export const DIRECTIONS: Readonly<Record<number, string>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionRL]: 'RL',
  [T.DirectionLR]: 'LR',
};

/** Tokens a lexer mode makes from text that may run to the end: reported at their opener. */
export const MODE_KINDS = kindSet(
  T.Str,
  T.GenericType,
  T.CallbackName,
  T.CallbackArgs,
  T.AccDescrMultilineValue
);
export const UNCLOSED: Readonly<Record<number, [what: string, closer: string, code: string]>> = {
  [T.Str]: ['string', 'quote `"`', 'UNCLOSED_STRING'],
  [T.GenericType]: ['generic type', '`~`', 'UNCLOSED_GENERIC'],
  [T.CallbackName]: ['callback', '`(`', 'UNCLOSED_CALLBACK'],
  [T.CallbackArgs]: ['callback arguments', '`)`', 'UNCLOSED_CALLBACK_ARGS'],
  [T.AccDescrMultilineValue]: ['accessible description', '`}`', 'UNCLOSED_ACC_DESCR'],
};

/**
 * Kinds a probe's cursor follows rather than extends when the token ends at the offset:
 * relationship arrows, separators and brackets. Name kinds are absent, so `Fo` is a word.
 */
export const PROBE_FOLLOWS = kindSet(
  ...RELATION_START,
  T.StyleSeparator,
  T.StructStart,
  T.StructStop,
  T.SQS,
  T.SQE,
  T.AnnotationStart,
  T.AnnotationEnd,
  T.Comma,
  T.Dot,
  T.Colon
);

/** Human names for what the parser expects (R-ERR-2, R-ERR-5). */
export const EXPECTED = new ExpectedTable([
  ['`classDiagram`', [T.ClassDiagram]],
  ['a class name', NAME_START],
  ['a relationship such as `<|--` or `-->`', RELATION_START],
  ['a quoted string', [T.Str]],
  ['a member such as `: +name`', [T.Label]],
  ['`.`', [T.Dot]],
  ['a generic type such as `~T~`', [T.GenericType]],
  ['a label such as `["text"]`', [T.SQS]],
  ['`]`', [T.SQE]],
  ['`:::`', [T.StyleSeparator]],
  ['`{`', [T.StructStart]],
  ['`}`', [T.StructStop]],
  ['a member line', [T.Member]],
  ['an annotation such as `<<interface>>`', [T.AnnotationStart]],
  ['`>>`', [T.AnnotationEnd]],
  ['a callback such as `call fn()`', [T.CallbackName]],
  ['callback arguments', [T.CallbackArgs]],
  ['`href`', [T.Href]],
  ['a link target such as `_blank`', [T.LinkTarget]],
  ['`,`', [T.Comma]],
  ['text', [T.AccTitleValue, T.AccDescrValue]],
  ['a statement such as `class`, `namespace`, `note` or a relationship', STATEMENT_KEYWORDS],
  ['a line break', [Kind.Newline]],
  ['the end of the text', [Kind.EOF, T.Eof, T.EofInStruct]],
]);
/** The same for styles, whose parts are words, colons and labels. */
/** The same inside a namespace body, which holds classes, notes and namespaces only. */
export const NS_EXPECTED = new ExpectedTable([
  ['a class such as `class A`', [T.Class]],
  ['a note', [T.Note, T.NoteFor]],
  ['a namespace', [T.Namespace]],
  ['`}`', [T.StructStop]],
  ['a line break', [Kind.Newline]],
]);
export const STYLE_EXPECTED = new ExpectedTable([
  ['a style such as `fill:#f9f`', STYLE_PART_KINDS],
  ['`,`', [T.Comma]],
  ['a line break', [Kind.Newline]],
]);

/** How each statement is written, for errors inside it. */
export const STATEMENT_HINTS: Readonly<Record<number, string>> = {
  [T.Class]:
    'write it as `class Name`, with an optional `["label"]`, `:::style`, `<<annotation>>` or `{ members }`',
  [T.Namespace]: 'write it as `namespace Name {` with classes and notes inside, then `}`',
  [T.NoteFor]: 'write it as `note for Class "text"`',
  [T.Note]: 'write it as `note "text"`',
  [T.AnnotationStart]: 'write it as `<<annotation>> Class`, e.g. `<<interface>> Shape`',
  [T.Style]: 'write it as `style Class styles`, e.g. `style Shape fill:#f9f`',
  [T.CssClass]: 'write it as `cssClass "Class1,Class2" name`',
  [T.ClassDef]: 'write it as `classDef name styles`, e.g. `classDef hot fill:#f96`',
  [T.Callback]: 'write it as `callback Class "function"`',
  [T.Link]: 'write it as `link Class "url"`',
  [T.Click]:
    'write it as `click Class call fn()` or `click Class href "url"`, e.g. `click Shape href "https://example.com"`',
};

export { STOP, Stop };

/** One open namespace body. */
export interface Frame {
  /** Qualified id. */
  id: string;
  /** Whether it makes a namespace (false when the header had no name). */
  real: boolean;
  node: ClassNamespaceStmt;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  /** Class names (as written) and note ids placed directly in it (jison `classStatements`). */
  classes: string[];
  notes: string[];
  items: number;
  /** A statement was just read: a line break or `}` comes next. */
  needSeparator: boolean;
  /** The line break straight after `{` was read. */
  leadingBreak: boolean;
}

/** A class name as `className` read it. */
export interface Name {
  /** As written, generic type in `~…~` (jison's value). */
  raw: string;
  /** Without the generic type. */
  id: string;
  range: Range;
}

/** `: text` → `text` (v12 `cleanupLabel`). */
export const cleanupLabel = (label: string): string =>
  (label.startsWith(':') ? label.substring(1) : label).trim();

/** Where recovery resumes at the top level and inside a namespace (R-PARSE-4). */
export const BOUNDARY: KindSet = kindSet(Kind.EOF, T.Eof, Kind.Newline);
export const NS_BOUNDARY: KindSet = kindSet(
  Kind.EOF,
  T.Eof,
  Kind.Newline,
  T.StructStop,
  T.EofInStruct
);

/** Index into the lex of each significant token (the tokens {@link significantTokens} keeps). */
export function significantIndex(l: ClassLex): Int32Array {
  const { kind, length } = l.tokens;
  const out = new Int32Array(length);
  let o = 0;
  for (let j = 0; j < length; j++) if (TRIVIA[kind[j] ?? Kind.EOF] !== 1) out[o++] = j;
  return out.subarray(0, o);
}

/** `r` without the blanks at its ends; with `skip`, also without its first `skip` characters. */
export function trimmed(src: string, r: Range, skip = 0): Range {
  let s = Math.min(r.start + skip, r.end);
  let e = r.end;
  while (s < e && isSpace(src.charCodeAt(s))) s++;
  while (e > s && isSpace(src.charCodeAt(e - 1))) e--;
  return { start: s, end: e };
}

/** Statement keywords a member line can start with (`accTitle` and `accDescr` take a `:`). */
export const STATEMENT_WORDS = new Set([
  'class',
  'namespace',
  'note',
  'style',
  'classDef',
  'cssClass',
  'click',
  'link',
  'callback',
  'direction',
  'accTitle',
  'accDescr',
]);

/** Whether a member line reads as a statement: a keyword, or a name then `--` or `..`. */
export function looksLikeStatement(line: string): boolean {
  const t = line.trim();
  let w = 0;
  while (w < t.length && /[A-Za-z]/.test(t[w] ?? '')) w++;
  if (
    w > 0 &&
    STATEMENT_WORDS.has(t.slice(0, w)) &&
    (w === t.length || /[\s:{]/.test(t[w] ?? ''))
  ) {
    return true;
  }
  return /^[\w`]/.test(t) && (t.includes('--') || t.includes('..'));
}

export const NS_HINT =
  'only classes, notes and namespaces go inside a namespace; put relationships and members after its `}`';
