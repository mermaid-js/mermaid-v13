/**
 * The class facet's completion and hover tables (DESIGN §4.5, D95): what each expected token
 * kind is offered as, and how relationships read. Keyword docs are not here: they come from
 * the grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { RelationType } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';

/** A keyword item: offered when the parser expects `kind`. */
export interface KeywordItem {
  readonly kind: number;
  readonly label: string;
  /** Text inserted, when it is not the label. */
  readonly insert?: string;
}

/** Statement and clause keywords, in the order they are offered. */
export const KEYWORDS: readonly KeywordItem[] = [
  { kind: T.ClassDiagram, label: 'classDiagram' },
  { kind: T.Class, label: 'class' },
  { kind: T.Namespace, label: 'namespace' },
  { kind: T.NoteFor, label: 'note for' },
  { kind: T.Note, label: 'note' },
  { kind: T.Style, label: 'style' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.CssClass, label: 'cssClass' },
  { kind: T.Callback, label: 'callback' },
  { kind: T.Link, label: 'link' },
  { kind: T.Click, label: 'click' },
  { kind: T.CallbackName, label: 'call' },
  { kind: T.Href, label: 'href' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
];

/** `direction` values and what they mean (class diagrams have no `TD`). */
export const DIRECTIONS: readonly (readonly [dir: string, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

/** Direction token kinds and their value. */
export const DIRECTION_OF: Readonly<Record<number, string>> = {
  [T.DirectionTB]: 'TB',
  [T.DirectionBT]: 'BT',
  [T.DirectionLR]: 'LR',
  [T.DirectionRL]: 'RL',
};

/** `link … "url"` and `click … href "url"` targets. */
export const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'];

/** Annotations the class diagram documentation names (`<<interface>>`); any word is accepted. */
export const ANNOTATIONS: readonly (readonly [name: string, meaning: string])[] = [
  ['interface', 'an interface'],
  ['abstract', 'an abstract class'],
  ['service', 'a service class'],
  ['enumeration', 'an enum'],
];

/** One relationship arrow: its text and how the parser reads it. */
export interface Arrow {
  readonly text: string;
  readonly start: RelationType;
  readonly line: 'solid' | 'dotted';
  readonly end: RelationType;
}

const arrow = (text: string, start: RelationType, line: 'solid' | 'dotted', end: RelationType) =>
  ({ text, start, line, end }) as const;

/** Arrows offered where a relationship may start: the documented ones, then their mirrors. */
export const ARROWS: readonly Arrow[] = [
  arrow('<|--', 'extension', 'solid', 'none'),
  arrow('*--', 'composition', 'solid', 'none'),
  arrow('o--', 'aggregation', 'solid', 'none'),
  arrow('-->', 'none', 'solid', 'dependency'),
  arrow('--', 'none', 'solid', 'none'),
  arrow('..>', 'none', 'dotted', 'dependency'),
  arrow('..|>', 'none', 'dotted', 'extension'),
  arrow('..', 'none', 'dotted', 'none'),
  arrow('--|>', 'none', 'solid', 'extension'),
  arrow('--*', 'none', 'solid', 'composition'),
  arrow('--o', 'none', 'solid', 'aggregation'),
  arrow('<--', 'dependency', 'solid', 'none'),
  arrow('<..', 'dependency', 'dotted', 'none'),
  arrow('<|..', 'extension', 'dotted', 'none'),
  arrow('<|--|>', 'extension', 'solid', 'extension'),
  arrow('<-->', 'dependency', 'solid', 'dependency'),
  arrow('()--', 'lollipop', 'solid', 'none'),
  arrow('--()', 'none', 'solid', 'lollipop'),
];

/** Token kinds an arrow is lexed into. */
export const ARROW_PARTS = new Set<number>([
  T.Extension,
  T.Dependency,
  T.Composition,
  T.Aggregation,
  T.Lollipop,
  T.Line,
  T.DottedLine,
]);

/** What a relationship is called, by the marker at one end and the line. */
const NAMES: Readonly<Record<RelationType, readonly [solid: string, dotted: string]>> = {
  extension: ['inheritance', 'realization'],
  composition: ['composition', 'composition'],
  aggregation: ['aggregation', 'aggregation'],
  dependency: ['association', 'dependency'],
  lollipop: ['lollipop interface', 'lollipop interface'],
  none: ['link', 'dashed link'],
};

/** The marker each end type draws. */
const MARKERS: Readonly<Record<RelationType, string>> = {
  extension: 'a triangle',
  composition: 'a filled diamond',
  aggregation: 'a hollow diamond',
  dependency: 'an arrow head',
  lollipop: 'a lollipop',
  none: 'nothing',
};

/** What a relationship draws, from its end types and line as the model records them. */
export function describeRelation(
  start: RelationType,
  line: 'solid' | 'dotted',
  end: RelationType
): string {
  const dotted = line === 'dotted' ? 1 : 0;
  const names = [...new Set([start, end].filter((t) => t !== 'none').map((t) => NAMES[t][dotted]))];
  const what = names.length === 0 ? NAMES.none[dotted] : names.join(' and ');
  const ends: string[] = [];
  if (start !== 'none') ends.push(`${MARKERS[start]} at the start`);
  if (end !== 'none') ends.push(`${MARKERS[end]} at the end`);
  const drawn = `${dotted ? 'dashed' : 'solid'} line${ends.length > 0 ? ` with ${ends.join(' and ')}` : ''}`;
  return `${what}: ${drawn}`;
}

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** `n` and the noun, plural when `n` is not 1. */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
