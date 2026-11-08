/**
 * The sankey layout's px constants (spec #427 §Layout, pitfall 13): v12 `sankeyRenderer.ts`'s
 * fixed lengths and d3-sankey 0.12.3's tuning constants. No other file in `layout/` writes a
 * length literal (`packages/conformance/src/sankey-layout-literals.spec.ts`); every other
 * length comes from the `sankey` config. Sankey draws SVG only (D320), so there is no cell set.
 */

/** The sankey layout's fixed lengths. */
export interface SankeyMetrics {
  /** v12 adds this to `nodePadding` when `showValues` is on (`:123`): room for the value. */
  readonly valuePadding: number;
  /** A label sits this far left of `x0` or right of `x1` (`:193-202`). */
  readonly labelGap: number;
  /** `g.node-labels` `font-size` (`:206`): labels are measured and drawn at it. */
  readonly fontSize: number;
  /**
   * v12's `dy="0.35em"` when `showValues` is off (`:215`), in px at {@link fontSize}: 0.35 × 14
   * (v13's `dy` is numeric only). With `showValues` on, `dy` is 0.
   */
  readonly labelShift: number;
  /** v12 draws a link at least this wide: `max(1, width)` (`:278`, D394's zero links). */
  readonly minLinkWidth: number;
}

export const SANKEY_METRICS: SankeyMetrics = {
  valuePadding: 15,
  labelGap: 6,
  fontSize: 14,
  labelShift: 4.9,
  minLinkWidth: 1,
};

/** The `sankey` config's length defaults (v12 `config.schema.yaml` `SankeyDiagramConfig`). */
export const SANKEY_LENGTH_DEFAULTS = {
  width: 600,
  height: 400,
  nodeWidth: 10,
  nodePadding: 12,
} as const;

/** d3-sankey 0.12.3's tuning (`sankey.js`): v12 sets none of these, so d3's defaults hold. */
export const D3_SANKEY = {
  /** Relaxation passes (`iterations`, L64). */
  iterations: 6,
  /** Each pass moves a node `alpha = decay^i` of the way to its ideal place (L238). */
  decay: 0.99,
  /** A collision pushes a node only when it overlaps by more than this, in px (L305, L315). */
  collision: 1e-6,
} as const;

/** The CSS weight sankey text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;

/**
 * d3 `schemeTableau10` (d3-scale-chromatic 3.1.0): v12's `scaleOrdinal` gives each node not
 * named in `nodeColors` the next slot, in node order, mod 10 (D152: a package constant).
 */
export const TABLEAU10 = [
  '#4e79a7',
  '#f28e2c',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc949',
  '#af7aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ab',
] as const;
