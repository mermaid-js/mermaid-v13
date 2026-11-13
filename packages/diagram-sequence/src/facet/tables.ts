/**
 * The sequence facet's completion and hover tables (DESIGN §4.5, D95): what each expected token
 * kind is offered as, and what each arrow draws. Keyword docs are not here: they come from the
 * grammar file (`generated/docs.ts`).
 */
import { PARTICIPANT_KINDS, type ArrowKind, type ParticipantKind } from '../model.ts';
import { ARROW_KINDS } from '../parser/arrows.ts';
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

/** An arrow as written, before its model kind is looked up. */
type Written = Omit<Arrow, 'kind'>;

const WRITTEN: readonly Written[] = [
  { text: '->>', token: T.SolidArrow, draws: 'solid line, arrowhead' },
  { text: '-->>', token: T.DottedArrow, draws: 'dotted line, arrowhead' },
  { text: '->', token: T.SolidOpenArrow, draws: 'solid line, no arrowhead' },
  {
    text: '-->',
    token: T.DottedOpenArrow,
    draws: 'dotted line, no arrowhead',
  },
  { text: '-x', token: T.SolidCross, draws: 'solid line, a cross at the end' },
  {
    text: '--x',
    token: T.DottedCross,
    draws: 'dotted line, a cross at the end',
  },
  {
    text: '-)',
    token: T.SolidPoint,
    draws: 'solid line, an open arrowhead (async)',
  },
  {
    text: '--)',
    token: T.DottedPoint,
    draws: 'dotted line, an open arrowhead (async)',
  },
  {
    text: '<<->>',
    token: T.BidirectionalSolidArrow,
    draws: 'solid line, arrowheads at both ends',
  },
  {
    text: '<<-->>',
    token: T.BidirectionalDottedArrow,
    draws: 'dotted line, arrowheads at both ends',
  },
  ...halfArrows(),
];

/** Every message arrow, the common ones first (v12 `LINETYPE`); `kind` is the parser's. */
export const ARROWS: readonly Arrow[] = WRITTEN.map((a) => ({ ...a, kind: ARROW_KINDS[a.token]! }));

/** A half arrow: `solid` or `stick` head, on the `top` or `bottom`, maybe reversed or dotted. */
function half(text: string, token: number): Written {
  const kind = ARROW_KINDS[token]!;
  const line = kind.includes('dotted') ? 'dotted' : 'solid';
  const head = kind.startsWith('solid') ? 'solid' : 'open';
  const side = kind.includes('top') ? 'top' : 'bottom';
  const at = kind.includes('reverse') ? ', at the start' : '';
  return { text, token, draws: `${line} line, ${head} half arrowhead on the ${side}${at}` };
}

/** The 16 half arrows: `-|\`, `-|/`, `-\\`, `-//`, their reverses, and the dotted forms. */
function halfArrows(): Written[] {
  return [
    half('-|\\', T.SolidArrowTop),
    half('-|/', T.SolidArrowBottom),
    half('-\\\\', T.StickArrowTop),
    half('-//', T.StickArrowBottom),
    half('/|-', T.SolidArrowTopReverse),
    half('\\|-', T.SolidArrowBottomReverse),
    half('//-', T.StickArrowTopReverse),
    half('\\\\-', T.StickArrowBottomReverse),
    half('--|\\', T.SolidArrowTopDotted),
    half('--|/', T.SolidArrowBottomDotted),
    half('--\\\\', T.StickArrowTopDotted),
    half('--//', T.StickArrowBottomDotted),
    half('/|--', T.SolidArrowTopReverseDotted),
    half('\\|--', T.SolidArrowBottomReverseDotted),
    half('//--', T.StickArrowTopReverseDotted),
    half('\\\\--', T.StickArrowBottomReverseDotted),
  ];
}

/** What each participant type draws. */
const SHAPES: Readonly<Record<ParticipantKind, string>> = {
  participant: 'a box',
  actor: 'a stick figure',
  boundary: 'a boundary symbol',
  control: 'a control symbol',
  entity: 'an entity symbol',
  database: 'a database cylinder',
  collections: 'a stack of boxes',
  queue: 'a queue',
};

/** Participant types of `participant A@{ type: … }` (v12 `PARTICIPANT_TYPE`), in its order. */
export const PARTICIPANT_TYPES: readonly (readonly [type: ParticipantKind, shape: string])[] =
  PARTICIPANT_KINDS.map((k) => [k, SHAPES[k]] as const);

/** Keys of a participant's `@{ … }` data that the parser reads. */
export const PARTICIPANT_DATA_KEYS = ['type', 'alias'];

/** The doc every arrow shows: how a message is written. */
export const MESSAGE_DOC =
  '`A->>B: text`: a message from `A` to `B`. `+` after the arrow activates `B`, `-` deactivates `A`; `()` on either side is a central connection.';
