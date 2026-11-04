/**
 * The sequence facet's completion and hover tables (DESIGN §4.5, D95): what each expected token
 * kind is offered as, and what each arrow draws. Keyword docs are not here: they come from the
 * grammar file (`generated/docs.ts`).
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { ArrowKind, ParticipantKind } from '../model.ts';
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
  { kind: T.SD, label: 'sequenceDiagram' },
  { kind: T.Participant, label: 'participant' },
  { kind: T.ParticipantActor, label: 'actor' },
  { kind: T.Create, label: 'create' },
  { kind: T.Destroy, label: 'destroy' },
  { kind: T.Box, label: 'box' },
  { kind: T.Note, label: 'note' },
  { kind: T.Activate, label: 'activate' },
  { kind: T.Deactivate, label: 'deactivate' },
  { kind: T.Loop, label: 'loop' },
  { kind: T.Alt, label: 'alt' },
  { kind: T.Else, label: 'else' },
  { kind: T.Opt, label: 'opt' },
  { kind: T.Par, label: 'par' },
  { kind: T.ParOver, label: 'par_over' },
  { kind: T.And, label: 'and' },
  { kind: T.Critical, label: 'critical' },
  { kind: T.Option, label: 'option' },
  { kind: T.Break, label: 'break' },
  { kind: T.Rect, label: 'rect' },
  { kind: T.End, label: 'end' },
  { kind: T.Autonumber, label: 'autonumber' },
  { kind: T.Off, label: 'off' },
  { kind: T.Title, label: 'title' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.Links, label: 'links' },
  { kind: T.Link, label: 'link' },
  { kind: T.Properties, label: 'properties' },
  { kind: T.Details, label: 'details' },
  { kind: T.As, label: 'as' },
];

/** Note positions, offered after `note`. */
export const PLACEMENTS: readonly KeywordItem[] = [
  { kind: T.LeftOf, label: 'left of' },
  { kind: T.RightOf, label: 'right of' },
  { kind: T.Over, label: 'over' },
];

/** One arrow: how it is written, its token kind and model kind, and what it draws. */
export interface Arrow {
  readonly text: string;
  readonly token: number;
  readonly kind: ArrowKind;
  readonly draws: string;
}

/** Every message arrow, the common ones first (v12 `LINETYPE`). */
export const ARROWS: readonly Arrow[] = [
  { text: '->>', token: T.SolidArrow, kind: 'solid', draws: 'solid line, arrowhead' },
  { text: '-->>', token: T.DottedArrow, kind: 'dotted', draws: 'dotted line, arrowhead' },
  { text: '->', token: T.SolidOpenArrow, kind: 'solid_open', draws: 'solid line, no arrowhead' },
  {
    text: '-->',
    token: T.DottedOpenArrow,
    kind: 'dotted_open',
    draws: 'dotted line, no arrowhead',
  },
  { text: '-x', token: T.SolidCross, kind: 'solid_cross', draws: 'solid line, a cross at the end' },
  {
    text: '--x',
    token: T.DottedCross,
    kind: 'dotted_cross',
    draws: 'dotted line, a cross at the end',
  },
  {
    text: '-)',
    token: T.SolidPoint,
    kind: 'solid_point',
    draws: 'solid line, an open arrowhead (async)',
  },
  {
    text: '--)',
    token: T.DottedPoint,
    kind: 'dotted_point',
    draws: 'dotted line, an open arrowhead (async)',
  },
  {
    text: '<<->>',
    token: T.BidirectionalSolidArrow,
    kind: 'bidirectional_solid',
    draws: 'solid line, arrowheads at both ends',
  },
  {
    text: '<<-->>',
    token: T.BidirectionalDottedArrow,
    kind: 'bidirectional_dotted',
    draws: 'dotted line, arrowheads at both ends',
  },
  ...halfArrows(),
];

/** A half arrow: `solid` or `stick` head, on the `top` or `bottom`, maybe reversed or dotted. */
function half(text: string, token: number, kind: ArrowKind): Arrow {
  const line = kind.includes('dotted') ? 'dotted' : 'solid';
  const head = kind.startsWith('solid') ? 'solid' : 'open';
  const side = kind.includes('top') ? 'top' : 'bottom';
  const at = kind.includes('reverse') ? ', at the start' : '';
  return { text, token, kind, draws: `${line} line, ${head} half arrowhead on the ${side}${at}` };
}

/** The 16 half arrows: `-|\`, `-|/`, `-\\`, `-//`, their reverses, and the dotted forms. */
function halfArrows(): Arrow[] {
  return [
    half('-|\\', T.SolidArrowTop, 'solid_top'),
    half('-|/', T.SolidArrowBottom, 'solid_bottom'),
    half('-\\\\', T.StickArrowTop, 'stick_top'),
    half('-//', T.StickArrowBottom, 'stick_bottom'),
    half('/|-', T.SolidArrowTopReverse, 'solid_arrow_top_reverse'),
    half('\\|-', T.SolidArrowBottomReverse, 'solid_arrow_bottom_reverse'),
    half('//-', T.StickArrowTopReverse, 'stick_arrow_top_reverse'),
    half('\\\\-', T.StickArrowBottomReverse, 'stick_arrow_bottom_reverse'),
    half('--|\\', T.SolidArrowTopDotted, 'solid_top_dotted'),
    half('--|/', T.SolidArrowBottomDotted, 'solid_bottom_dotted'),
    half('--\\\\', T.StickArrowTopDotted, 'stick_top_dotted'),
    half('--//', T.StickArrowBottomDotted, 'stick_bottom_dotted'),
    half('/|--', T.SolidArrowTopReverseDotted, 'solid_arrow_top_reverse_dotted'),
    half('\\|--', T.SolidArrowBottomReverseDotted, 'solid_arrow_bottom_reverse_dotted'),
    half('//--', T.StickArrowTopReverseDotted, 'stick_arrow_top_reverse_dotted'),
    half('\\\\--', T.StickArrowBottomReverseDotted, 'stick_arrow_bottom_reverse_dotted'),
  ];
}

/** Participant types of `participant A@{ type: … }` (v12 `PARTICIPANT_TYPE`). */
export const PARTICIPANT_TYPES: readonly (readonly [type: ParticipantKind, shape: string])[] = [
  ['participant', 'a box'],
  ['actor', 'a stick figure'],
  ['boundary', 'a boundary symbol'],
  ['control', 'a control symbol'],
  ['entity', 'an entity symbol'],
  ['database', 'a database cylinder'],
  ['collections', 'a stack of boxes'],
  ['queue', 'a queue'],
];

/** Keys of a participant's `@{ … }` data that the parser reads. */
export const PARTICIPANT_DATA_KEYS = ['type', 'alias'];

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

/** The doc every arrow shows: how a message is written. */
export const MESSAGE_DOC =
  '`A->>B: text`: a message from `A` to `B`. `+` after the arrow activates `B`, `-` deactivates `A`; `()` on either side is a central connection.';
