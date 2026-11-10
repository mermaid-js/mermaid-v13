import type { SafeValue } from '@mermaid-js/core/svg';
import { C4_METRICS } from '../layout/metrics.ts';

/**
 * The C4 renderer's px lengths (pitfall 13): what the drawing adds to the layout. Every other
 * length is the layout's (`../layout/metrics.ts`, the `c4` config).
 */
export const C4_RENDER_METRICS = {
  /** v12 `styles.js`: an element's outline is 2px. */
  elementStroke: 2,
  /** v12 `svgDraw.ts`: a boundary's frame and a relation's line are 1px. */
  boundaryStroke: 1,
  relationStroke: 1,
  /** v12 `svgDraw.ts`: a boundary's dash (a deployment node's frame is solid). */
  boundaryDash: '7 7' as SafeValue,
  /** v12's arrowhead marker: the layout's size (`C4_METRICS.arrow`), the room labels keep off. */
  arrowLength: C4_METRICS.arrow,
  arrowWidth: C4_METRICS.arrow,
} as const;
