/**
 * The renderer's constants (pitfall 13): every number it draws with that is neither the layout's
 * nor the theme's. They are flowchart v13's, so a block edge and a flowchart edge look alike
 * (spec #521: block reads as one family with flowchart).
 */
import type { SafeValue } from '@mermaid-js/core/svg';

export const BLOCK_RENDER = {
  /** A thick edge's width (v12's `edge-thickness-thick`, flowchart's `THICK`). */
  thickEdge: 3.5,
  /** A dotted edge's dashes (v12's `edge-pattern-dotted`). */
  dottedEdge: '2' as SafeValue,
  /** The room each side of an edge label's text on its background. */
  edgeLabelPad: 4,
  /** The corner radius of an edge label's background. */
  edgeLabelRadius: 3,
  /** A composite's `clusterBkg` opacity without a palette (v12 `fade(clusterBkg, 0.5)`). */
  compositeFillOpacity: 0.5,
  /** A composite's `clusterBorder` opacity (v12 `fade(clusterBorder, 0.2)`). */
  compositeStrokeOpacity: 0.2,
} as const;
