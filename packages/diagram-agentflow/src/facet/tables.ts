/**
 * The agentflow facet's completion and hover tables (DESIGN §4.5, D95), written from a copy of
 * flowchart's (D467): what each expected token kind is offered as. Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { FlowchartDiagramConfig } from '@mermaid-js/core/config';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { EdgeSemantic } from '../parser/model.ts';
import { drawnShape, vertexKind } from '../parser/shapes.ts';
import type { AgentflowShape, VertexKind } from '../parser/shapes.ts';
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
  { kind: T.Graph, label: 'agentflow-beta' },
  { kind: T.Flow, label: 'flow' },
  { kind: T.Connector, label: 'connector' },
  { kind: T.Global, label: 'global' },
  { kind: T.End, label: 'end' },
  { kind: T.Style, label: 'style' },
  { kind: T.ClassDef, label: 'classDef' },
  { kind: T.Class, label: 'class' },
  { kind: T.LinkStyle, label: 'linkStyle' },
  { kind: T.Click, label: 'click' },
  { kind: T.AccTitle, label: 'accTitle', insert: 'accTitle: ' },
  { kind: T.AccDescr, label: 'accDescr', insert: 'accDescr: ' },
  { kind: T.DirectionTB, label: 'direction TB' },
  { kind: T.DirectionTD, label: 'direction TD' },
  { kind: T.DirectionBT, label: 'direction BT' },
  { kind: T.DirectionLR, label: 'direction LR' },
  { kind: T.DirectionRL, label: 'direction RL' },
  { kind: T.Default, label: 'default' },
  { kind: T.Interpolate, label: 'interpolate' },
  { kind: T.Href, label: 'href' },
  { kind: T.CallbackName, label: 'call' },
];

/** Header directions and what they mean (v12 reads `TD` as `TB`). */
export const DIRECTIONS: readonly (readonly [dir: string, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['TD', 'top down (same as TB)'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

/** `click … "url"` targets. */
export const LINK_TARGETS = ['_self', '_blank', '_parent', '_top'];

/** The three links (v12 `agentflow.jison`), in the order they are offered. */
export const ARROWS = ['-->', '--x', '-.-'];

/** The rest of an arrow inside edge text (`-- text -->`): only `--` opens edge text. */
export const CLOSERS: Readonly<Record<string, readonly string[]>> = {
  '--': ['-->', '--x'],
};

/** What each edge semantic means (v12 `computeEdgeSemantic`, D465). */
export const SEMANTICS: Readonly<Record<EdgeSemantic, string>> = {
  sequence: 'the target runs after the source',
  failure: 'the target runs when the source fails',
  reference: 'the source refers to the target; no step follows',
};

/** What an arrow means: its semantic, from its type and stroke as the model records them. */
export function describeLink(semantic: EdgeSemantic | undefined): string {
  return semantic === undefined ? 'no semantic' : `${semantic}: ${SEMANTICS[semantic]}`;
}

/** The six kind aliases v0.8.1 names (§4.3.2), offered first after `shape:`. */
export const KIND_ALIASES: readonly string[] = [
  'task',
  'tool',
  'input',
  'decision',
  'refdoc',
  'action',
];

/**
 * Every other `shape:` value drawn as written (v12's `ALLOWED_SHAPES` and the default's names
 * that `@{ shape }` accepts in lower case): the removed and unsupported names are left out, as
 * they draw as the default with a warning, and so are `roundedRect`, `squareRect` and
 * `lean_right`, which v12 refuses there (`UNKNOWN_SHAPE`).
 */
const OTHER_SHAPES = [
  'rect',
  'round',
  'subroutine',
  'subprocess',
  'subproc',
  'framed-rectangle',
  'lean-right',
  'diamond',
  'lin-doc',
  'lined-document',
  'hexagon',
  'hex',
];

/** A `shape:` value's kind and how it is drawn. */
export interface ShapeValue {
  readonly name: string;
  readonly kind: VertexKind;
  readonly shape: AgentflowShape;
}

/** The `shape:` values completion offers, the six aliases first. */
export const SHAPE_VALUES: readonly ShapeValue[] = [...KIND_ALIASES, ...OTHER_SHAPES].map(
  (name) => ({ name, kind: vertexKind(name), shape: drawnShape(name).shape })
);

/** `view:` values a flow reads (`collapsed` draws it as a card). */
export const VIEWS: readonly string[] = ['collapsed'];

/** A `flowchart.curve` value: the generated config type, from the config schema's enum. */
type Curve = NonNullable<FlowchartDiagramConfig['curve']>;

/**
 * Every curve, in the schema's order. A record over {@link Curve} so typecheck fails when the
 * schema's `flowchart.curve` enum gains or loses a value and this does not follow.
 */
const CURVE_SET: Readonly<Record<Curve, true>> = {
  basis: true,
  bumpX: true,
  bumpY: true,
  cardinal: true,
  catmullRom: true,
  linear: true,
  monotoneX: true,
  monotoneY: true,
  natural: true,
  step: true,
  stepAfter: true,
  stepBefore: true,
  rounded: true,
};

/** Curve names (`linkStyle … interpolate`, edge `curve:`): the config schema's `flowchart.curve`. */
export const CURVES = Object.keys(CURVE_SET) as readonly Curve[];

/** Keys of an edge's `@{ … }` data that the model reads, with the values it accepts. */
export const EDGE_DATA: Readonly<Record<string, readonly string[]>> = {
  animate: ['true', 'false'],
  animation: ['fast', 'slow'],
  curve: CURVES,
};

/** Keys of a node's `@{ … }` metadata that the model reads, with the values it knows. */
export const NODE_DATA: Readonly<Record<string, readonly string[]>> = {
  shape: SHAPE_VALUES.map((s) => s.name),
  label: [],
  labelType: ['text', 'string', 'markdown'],
};

/** Keys of a flow's metadata that the model reads. */
export const FLOW_DATA: Readonly<Record<string, readonly string[]>> = { view: VIEWS };

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

/** The range `[start, end)`. */
export const span = (start: number, end: number): Range => ({ start, end });
