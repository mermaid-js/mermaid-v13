/**
 * A resolved icon as drawable nodes: its box, its converted body and the transform for its
 * rotation and flips, folded into one `<g transform>` (D295).
 */
import type { Transform } from '@mermaid-js/core/svg';
import type { SvgFragment } from '@mermaid-js/core/text';
import { convertBody } from './body.ts';
import { iconBox, type IconData } from './resolve.ts';

/** An icon ready to place: draw `nodes` in an SVG box of `viewBox`. */
export interface BuiltIcon {
  readonly viewBox: readonly [number, number, number, number];
  readonly nodes: readonly SvgFragment[];
  /** Converting the body changed how it draws: warn `ICON_SIMPLIFIED` naming the icon. */
  readonly simplified: boolean;
}

/** The icon's box and allow-listed nodes. */
export function buildIcon(icon: IconData): BuiltIcon {
  const { viewBox, transform } = iconBox(icon);
  const { nodes, simplified } = convertBody(icon.body);
  return {
    viewBox,
    nodes:
      transform === undefined || nodes.length === 0
        ? nodes
        : [{ tag: 'g', attrs: { transform: transform as Transform }, children: nodes }],
    simplified,
  };
}
