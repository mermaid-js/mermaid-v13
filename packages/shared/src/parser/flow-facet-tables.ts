/**
 * The flow family's completion and hover tables (DESIGN §4.5, D95): what the diagrams of the
 * family offer alike. Keyword docs are not here: they come from each diagram's grammar file
 * (`generated/docs.ts`).
 */
import type { FlowchartDiagramConfig } from '@mermaid-js/core/config';
import type { KeywordItem } from './facet.ts';
import type { FlowKinds } from './flow-kinds.ts';

/**
 * A dialect's statement and clause keywords, in the order they are offered: `own` (its header
 * keywords, then its block keywords), then the family's.
 */
export function flowKeywordItems(
  T: FlowKinds,
  own: readonly KeywordItem[]
): readonly KeywordItem[] {
  return [
    ...own,
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
}

/** Header directions and what they mean (v12 reads `TD` as `TB`). */
export const FLOW_DIRECTION_DOCS: readonly (readonly [dir: string, meaning: string])[] =
  /* @__PURE__ */ Object.freeze([
    ['TB', 'top to bottom'],
    ['TD', 'top down (same as TB)'],
    ['BT', 'bottom to top'],
    ['LR', 'left to right'],
    ['RL', 'right to left'],
  ] as const);

/** A `flowchart.curve` value: the generated config type, from the config schema's enum. */
export type FlowCurve = NonNullable<FlowchartDiagramConfig['curve']>;

/**
 * Every curve, in the schema's order. A record over {@link FlowCurve} so typecheck fails when the
 * schema's `flowchart.curve` enum gains or loses a value and this does not follow.
 */
const CURVE_SET = {
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
} as const satisfies Readonly<Record<FlowCurve, true>>;

/** Curve names (`linkStyle … interpolate`, edge `curve:`): the config schema's `flowchart.curve`. */
export const FLOW_CURVES = /* @__PURE__ */ Object.keys(CURVE_SET) as readonly FlowCurve[];

/** Keys of an edge's `@{ … }` data that the model reads, with the values it accepts. */
export const FLOW_EDGE_DATA: Readonly<Record<string, readonly string[]>> =
  /* @__PURE__ */ Object.freeze({
    animate: ['true', 'false'],
    animation: ['fast', 'slow'],
    curve: FLOW_CURVES,
  });
