/**
 * The mindmap layout's metrics table (D108, pitfall 13): every length the builder uses, in px,
 * as v12 wrote them. With the cloud and bang outlines (`outline.ts`), it is the only file in
 * `layout/` that holds a length literal; the builder converts each through the render's unit
 * profile. Mindmap has no text output (D216), so there is one set.
 */

/**
 * How a shape grows round its label (v12's shape files, with the per-shape paddings
 * `mindmapRenderer.ts` forces). `pad` is the shape's padding: fixed px when set, else
 * `mindmap.padding` times `padScale` (`mindmapDb.ts` doubles it for hexagons). The frame is the
 * label plus `grow` paddings across and down, both sides together.
 */
export interface ShapeMetrics {
  readonly pad?: number;
  readonly padScale: number;
  readonly grow: { readonly x: number; readonly y: number };
  /** The least growth over the label, px, both sides together (`bang.ts`: `bbox + 20`). */
  readonly minGrow?: number;
  /**
   * The theme's padding variables (D152) for this shape, across and down, read with `pad` as
   * the diagram padding they multiply (`theme.padding`): v12 `look: neo` px in the redux
   * family, v12 classic's multiples of `pad` in the classic themes. `grow` multiplies them.
   */
  readonly themed?: { readonly x: string; readonly y: string };
  /**
   * The label wraps at `MindmapMetrics.narrowWrap` while `mindmap.maxNodeWidth` is unset: v12's
   * renderer gave these shapes no width, so their labels wrapped at `flowchart.wrappingWidth`
   * (D744).
   */
  readonly narrow?: boolean;
  /**
   * A hexagon's point is `height / slant` deep (`hexagon.ts` `f`): the theme's `hexagonSlant`
   * (3.5 / 4), or this when the theme's is not above 0.
   */
  readonly slant?: number;
}

export interface MindmapMetrics {
  /** Schema defaults of the config keys the layout reads: `mindmap.padding`, `maxNodeWidth`. */
  readonly padding: number;
  readonly maxNodeWidth: number;
  /**
   * Where the labels of the `narrow` shapes wrap while `mindmap.maxNodeWidth` is unset: v12's
   * `flowchart.wrappingWidth` default (D744).
   */
  readonly narrowWrap: number;
  /** The least width a label wraps to (core's `layoutLabel` takes a positive width). */
  readonly minWrap: number;
  /** The weight labels are measured and drawn at (bold comes from markdown only). */
  readonly fontWeight: number;
  readonly shapes: {
    /** `defaultMindmapNode.ts`: `bbox.w + 8 · padding/2`, `bbox.h + 2 · padding/2`. */
    readonly default: ShapeMetrics;
    /** `roundedRect.ts` with the renderer's `padding: 15`: 15 on each side. */
    readonly rounded: ShapeMetrics;
    /**
     * `squareRect.ts` with the renderer's `padding: 10`: `nodePaddingX` / `nodePaddingY` per
     * side (classic `2 · 10` and 10, neo 16 and 12).
     */
    readonly rect: ShapeMetrics;
    /** `circle.ts`: radius = half the label's diagonal + `circlePadding` (classic `padding`, neo 16). */
    readonly circle: ShapeMetrics;
    /** `cloud.ts`: `bbox + 2 · padding/2`. */
    readonly cloud: ShapeMetrics;
    /** `bang.ts`: `bbox.w + 10 · padding/2`, `bbox.h + 8 · padding/2`, at least `bbox + 20`. */
    readonly bang: ShapeMetrics;
    /**
     * `hexagon.ts` at padding `2p`: `w = bbox.w + 2h/f + hexagonPaddingX`,
     * `h = bbox.h + hexagonPaddingY` (classic `2p` both and `f` 4; neo 70, 32 and 3.5, with v12's swapped
     * axes corrected as the flowchart's are, D151).
     */
    readonly hexagon: ShapeMetrics;
  };
  /**
   * The `::icon()` slot (D297, v12 `svgDraw.ts`): a circle grows `slot` both ways with the icon
   * row above the label; other shapes grow `slot` across and are at least `minHeight` high,
   * the icon on the left. The glyph is `glyph` px square, centred in its `slot` square.
   */
  readonly icon: { readonly slot: number; readonly minHeight: number; readonly glyph: number };
  /**
   * The engine's gaps: v12 tidy-tree's `gap` between siblings and `bottomPadding` between
   * levels (`mermaid-layout-tidy-tree/src/layout.ts`).
   */
  readonly spacing: { readonly node: number; readonly rank: number };
}

export const MINDMAP_METRICS: MindmapMetrics = {
  padding: 10,
  maxNodeWidth: 200,
  narrowWrap: 120,
  minWrap: 1,
  fontWeight: 400,
  shapes: {
    default: { padScale: 1, grow: { x: 4, y: 1 } },
    rounded: { pad: 15, padScale: 1, grow: { x: 2, y: 2 }, narrow: true },
    rect: {
      pad: 10,
      padScale: 1,
      grow: { x: 2, y: 2 },
      themed: { x: 'nodePaddingX', y: 'nodePaddingY' },
      narrow: true,
    },
    circle: {
      padScale: 1,
      grow: { x: 0, y: 0 },
      themed: { x: 'circlePadding', y: 'circlePadding' },
    },
    cloud: { padScale: 1, grow: { x: 1, y: 1 } },
    bang: { padScale: 1, grow: { x: 5, y: 4 }, minGrow: 20 },
    hexagon: {
      padScale: 2,
      grow: { x: 1, y: 1 },
      themed: { x: 'hexagonPaddingX', y: 'hexagonPaddingY' },
      slant: 4,
      narrow: true,
    },
  },
  icon: { slot: 50, minHeight: 60, glyph: 40 },
  spacing: { node: 20, rank: 40 },
};
