/**
 * The agentflow facet's completion and hover tables (DESIGN §4.5, D95): what each expected token
 * kind is offered as. Keyword docs are not here: they come from the grammar file
 * (`generated/docs.ts`); the tables agentflow shares with flowchart are the flow family's
 * (`@mermaid-js/shared/parser/flow-facet`).
 */
import { code } from '@mermaid-js/shared/parser/facet';
import { FLOW_EDGE_DATA, flowKeywordItems } from '@mermaid-js/shared/parser/flow-facet';
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

/** Statement and clause keywords, in the order they are offered. */
export const KEYWORDS = /* @__PURE__ */ flowKeywordItems(T, [
  { kind: T.Graph, label: 'agentflow-beta' },
  { kind: T.Flow, label: 'flow' },
  { kind: T.Connector, label: 'connector' },
  { kind: T.Global, label: 'global' },
]);

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

/** Keys of a node's `@{ … }` metadata that the model reads, with the values it knows. */
const NODE_DATA: Readonly<Record<string, readonly string[]>> = {
  shape: SHAPE_VALUES.map((s) => s.name),
  label: [],
  labelType: ['text', 'string', 'markdown'],
};

/** Keys of a flow's metadata that the model reads. */
const FLOW_DATA: Readonly<Record<string, readonly string[]>> = { view: VIEWS };

/** What a `@{ … }` block gives its keys to. */
export type DataOwner = 'node' | 'flow' | 'connector' | 'edge';

/** The keys an owner's block reads, with their known values. */
export const DATA_KEYS: Readonly<Record<DataOwner, Readonly<Record<string, readonly string[]>>>> = {
  node: NODE_DATA,
  flow: FLOW_DATA,
  // A connector keeps its metadata as written; its kind is `connector` whatever the shape.
  connector: {},
  edge: FLOW_EDGE_DATA,
};
