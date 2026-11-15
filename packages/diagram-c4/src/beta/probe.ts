/**
 * What the c4-beta parser accepts where, for the probe (R-LANG-7, D95): the constant lists the
 * parser records at its decision points (a parse without a probe allocates none of them), the
 * kinds a probe's cursor follows, and the probe's mode.
 */
import { APOSTROPHE, DQUOTE, Kind, kindSet } from '@mermaid-js/core/parser-kit';
import type { TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

const END = [Kind.Newline, Kind.EOF];
/** The kinds that open an element. */
export const ELEMENT_LIST = [
  T.Person,
  T.SoftwareSystem,
  T.Container,
  T.Component,
  T.Group,
  T.DeploymentNode,
  T.InfrastructureNode,
];

/** An id: the one kind the parser names, for any word it takes as one. */
export const ID_LIST = [T.Id];
/** The first line: `c4-beta`. */
export const HEADER_LIST = [T.Header];
/** After `c4-beta`: the diagram kind, or the line's end. */
export const KIND_LIST = [T.Context, T.Container, T.Component, T.Dynamic, T.Deployment, ...END];
/** What may start a statement at the top level: the first word picks the statement. */
export const TOP_LIST = [
  ...ELEMENT_LIST,
  T.Title,
  T.AccTitle,
  T.AccDescr,
  T.Direction,
  T.Legend,
  T.Style,
  T.Id,
  T.Step,
];
/** What may start a statement in a body: an element, or the `}` that ends it. */
export const BODY_LIST = [...ELEMENT_LIST, T.Rbrace];
/** After an element's name: its description, `instances`, tags, a body or the line's end. */
export const AFTER_NAME_LIST = [T.String, T.Instances, T.Tag, T.Lbrace, ...END];
/** After its description's technology: `instances`, tags, a body or the line's end. */
export const AFTER_TECHNOLOGY_LIST = [T.Instances, T.Tag, T.Lbrace, ...END];
/** After `instances "n"` or a tag: more tags, a body or the line's end. */
export const AFTER_TAG_LIST = [T.Tag, T.Lbrace, ...END];
/** The four arrows. */
export const ARROW_LIST = [T.ArrowRight, T.ArrowLeft, T.ArrowBoth, T.ArrowUndirected];
/** After a relation's end: its label, tags or the line's end. */
export const AFTER_END_LIST = [T.Colon, T.Tag, ...END];
/** After a relation's label: its technology, tags or the line's end. */
export const AFTER_LABEL_LIST = [T.String, T.Tag, ...END];
/** After a relation's technology: tags or the line's end. */
export const AFTER_RELATION_LIST = [T.Tag, ...END];
export const DIRECTION_LIST = [T.Tb, T.Bt, T.Lr, T.Rl];
export const LEGEND_LIST = [T.On, T.Off];
/** A style entry's value: a colour, or a word. */
export const VALUE_LIST = [T.Hex, T.Id];
/** After a style entry: another one, or the line's end. */
export const AFTER_ENTRY_LIST = [T.Comma, ...END];

/**
 * Kinds a probe's cursor follows rather than extends: punctuation, the arrows and a string,
 * which its closing quote ends (another text may follow it).
 */
export const PROBE_FOLLOWS = /* @__PURE__ */ kindSet(
  T.Colon,
  T.Comma,
  T.Lbrace,
  T.Rbrace,
  T.String,
  ...ARROW_LIST
);

/** The keyword of each statement-value token, also its probe mode. */
export const VALUE_WORDS: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'accTitle',
  [T.AccDescr]: 'accDescr',
};

/** The keyword of a statement-value token `[start, end)` when `o` is past it, else nothing. */
function valueMode(src: string, kind: number, start: number, end: number, o: number) {
  const word = VALUE_WORDS[kind];
  if (word === undefined) return undefined;
  const blanks = /^[\t ]*/.exec(src.slice(start, end))?.[0].length ?? 0;
  const keywordEnd = start + blanks + word.length;
  // A block `accDescr { … }` ends at its `}`; the other values run to the line end.
  const block = kind === T.AccDescr && /^\s*\{/.test(src.slice(keywordEnd, end));
  return o > keywordEnd && (o < end || !block) ? word : undefined;
}

/**
 * The probe's mode at `o`. The lexer has no modes, so the mode names what the offset is in:
 * `title`, `accTitle` or `accDescr` past the keyword of that statement, `string` inside a text
 * in quotes (closed or not), else `INITIAL` (code).
 */
export function probeMode(src: string, tokens: TokenStream, o: number): string {
  // The token holding `o` is the last one that starts before it.
  let j = -1;
  for (let k = 0; k < tokens.length && (tokens.start[k] ?? 0) < o; k++) j = k;
  const start = tokens.start[j] ?? 0;
  const end = tokens.end[j] ?? 0;
  if (j < 0 || end < o) return 'INITIAL';
  const kind = tokens.kind[j] ?? Kind.EOF;
  const quote = src.charCodeAt(start);
  if (kind === T.String && o < end) return 'string';
  // An unclosed text is an error token from its quote to the line end.
  if (kind === Kind.Error && (quote === DQUOTE || quote === APOSTROPHE)) return 'string';
  return valueMode(src, kind, start, end, o) ?? 'INITIAL';
}
