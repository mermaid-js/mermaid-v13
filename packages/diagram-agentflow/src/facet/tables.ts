/**
 * The agentflow facet's completion and hover tables (DESIGN §4.5, D95), written from a copy of
 * flowchart's (D467): what each expected token kind is offered as. Keyword docs are not here:
 * they come from the grammar file (`generated/docs.ts`).
 */
import type { FlowchartDiagramConfig } from '@mermaid-js/core/config';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import type { EdgeSemantic } from '../parser/model.ts';
import {
  acceptsDataShape,
  ALLOWED,
  drawnShape,
  SHAPE_ALIASES,
  vertexKind,
} from '../parser/shapes.ts';
import type { AgentflowShape, VertexKind } from '../parser/shapes.ts';
import { T } from '../parser/tokens.ts';
import { code } from '@mermaid-js/core/parser-kit';
import type { KeywordItem } from '@mermaid-js/core/parser-kit';
export type { KeywordItem } from '@mermaid-js/core/parser-kit';
export { LINK_TARGETS } from '@mermaid-js/core/parser-kit';
export { tokenBefore } from '@mermaid-js/core/parser-kit';
export { span } from '@mermaid-js/core/parser-kit';
export { code } from '@mermaid-js/core/parser-kit';

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
export const DIRECTION_DOCS: readonly (readonly [dir: string, meaning: string])[] = [
  ['TB', 'top to bottom'],
  ['TD', 'top down (same as TB)'],
  ['BT', 'bottom to top'],
  ['LR', 'left to right'],
  ['RL', 'right to left'],
];

/** The three links (v12 `agentflow.jison`), in the order they are offered. */
export const ARROWS = ['-->', '--x', '-.-'];

/** The rest of an arrow inside edge text (`-- text -->`): only `--` opens edge text. */
export const CLOSERS: Readonly<Record<string, readonly string[]>> = {
  '--': ['-->', '--x'],
};

/** What each edge semantic means (v12 `computeEdgeSemantic`, D465). */
const SEMANTICS: Readonly<Record<EdgeSemantic, string>> = {
  sequence: 'the target runs after the source',
  failure: 'the target runs when the source fails',
  reference: 'the source refers to the target; no step follows',
};

/** What a link means: its semantic (`destructLink`'s), or that it has none. */
export function describeLink(semantic: EdgeSemantic | undefined): string {
  return semantic === undefined ? 'no semantic' : `${semantic}: ${SEMANTICS[semantic]}`;
}

/** A `shape:` value: the kind it gives a node and the shape it is drawn with. */
export interface ShapeValue {
  readonly name: string;
  readonly kind: VertexKind;
  readonly shape: AgentflowShape;
  /** `task, drawn rounded`: the completion detail and the hover line. */
  readonly detail: string;
}

const shapeValue = (name: string): ShapeValue => {
  const kind = vertexKind(name);
  const { shape } = drawnShape(name);
  return { name, kind, shape, detail: `${kind}, drawn ${shape}` };
};

/**
 * The `shape:` values completion offers, from the parser's tables (`parser/shapes.ts`): v0.8.1's
 * aliases first, then the default's names and v12's `ALLOWED_SHAPES`; only names `@{ shape }`
 * takes (`acceptsDataShape`: not `roundedRect` or `lean_right`), and so not the removed and
 * unsupported ones, which draw as the default with a warning.
 */
export const SHAPE_VALUES: readonly ShapeValue[] = [
  ...new Set([...SHAPE_ALIASES.keys(), 'rect', 'squareRect', ...ALLOWED.keys()]),
]
  .filter(acceptsDataShape)
  .map(shapeValue);

/** The six kind aliases (`task`, `tool`, …, `action`): the aliases that set a kind. */
export const KIND_ALIASES: readonly string[] = [...SHAPE_ALIASES]
  .filter(([alias, to]) => to !== 'rect' && acceptsDataShape(alias))
  .map(([alias]) => alias);

/**
 * What a `shape:` name gives a node, for hover: the kind and drawing its completion detail
 * names (`shapeValue`), as code, and the problem when it is not drawn as written.
 */
export function shapeText(name: string): string {
  const { kind, shape } = shapeValue(name);
  const facts = `Kind: ${code(kind)} · drawn as ${code(shape)}`;
  const { problem } = drawnShape(name);
  if (problem === 'removed') return `${facts}: removed in agentflow (\`SHAPE_REMOVED\`)`;
  if (problem === 'unsupported') return `${facts}: not an agentflow shape (\`SHAPE_UNSUPPORTED\`)`;
  return facts;
}

/** `view:` values a flow reads (`collapsed` draws it as a card). */
const VIEWS: readonly string[] = ['collapsed'];

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
