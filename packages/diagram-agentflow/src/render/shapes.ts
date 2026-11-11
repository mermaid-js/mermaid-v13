/**
 * Draws agentflow's seven shapes through the SvgWriter: the shared drawers
 * (`@mermaid-js/shared/shapes/*`) for tool `fr-rect`, input `lean-r`, decision `diam` and action
 * `hex`, and its own for task `rounded`, refdoc `lin-doc` and v12's collapsed-flow card, on the
 * geometry the layout sized and outlined them with (`layout/shapes.ts`, `layout/metrics.ts`), so
 * every edge end the layout put on an outline is on the drawn one. Every element goes through
 * `w.outline` (D301, D302): the outline as `node`, inner lines as `divider`, the card's dots as
 * `mark`; a flow's frame as `group` (`render.ts`).
 *
 * The shared drawers are ported from Pele's `src/svg/shapes.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), as the three here are. Changed:
 * the task box's radius is the layout's, the refdoc's rule runs down to its wave, and the card
 * is v12's `flow` style, its trimmings drawn apart.
 * cspell:ignore kepano
 */
import type { Attrs, SafeValue, SvgWriter } from '@mermaid-js/core/svg';
import { lines, RULE, wave, WAVE } from '@mermaid-js/shared/shapes/kit';
import {
  cornerRadius,
  sharedShape,
  type LayoutShape,
  type ShapeGeometry,
} from '../layout/index.ts';

/** v12's card trimmings' paint (`collapsedGroup.ts`, `styles.ts`); their geometry is the layout's. */
const CARD_PAINT = {
  dash: '3, 3' as SafeValue,
  lineWidth: 0.75,
  dotOpacity: 0.5,
} as const;

/**
 * Draws a `W` × `H` shape centred on the origin: `outline` paints its outline (fill, stroke,
 * width, shadow, then the author's style), `line` its inner lines (the tool's rails, the
 * refdoc's rule). A card's trimmings are {@link drawCardTrim}'s.
 */
type Drawer = (
  w: SvgWriter,
  W: number,
  H: number,
  outline: Attrs,
  line: Attrs,
  geometry: ShapeGeometry
) => void;

/** The shared shape's own drawer. */
const shared =
  (shape: LayoutShape): Drawer =>
  (w, W, H, outline, line, g) =>
    sharedShape(shape).draw(w, W, H, outline, line, g.pads);

function box(w: SvgWriter, W: number, H: number, a: Attrs, rx: number): void {
  w.outline('node', 'rect', {
    x: -W / 2,
    y: -H / 2,
    width: W,
    height: H,
    rx: rx > 0 ? rx : undefined,
    ...a,
  });
}

const DRAW: Readonly<Record<LayoutShape, Drawer>> = {
  rounded: (w, W, H, outline, _line, g) => box(w, W, H, outline, cornerRadius('rounded', W, H, g)),
  'fr-rect': shared('fr-rect'),
  'lean-r': shared('lean-r'),
  diam: shared('diam'),
  // The shared wave is the outline's two quadratic halves: control points `control` off the base.
  'lin-doc': (w, W, H, outline, line) => {
    const x = W / 2;
    const base = H / 2 - WAVE.depth;
    const k = WAVE.control;
    wave(w, W, H, outline);
    // The rule runs down to the wave: on the left half it is at `t` = (x − rule) / x.
    const rx = -x + RULE;
    const t = x > 0 ? Math.max(0, x - RULE) / x : 0;
    lines(w, [rx, -H / 2, rx, base + 2 * k * t * (1 - t)], line);
  },
  hex: shared('hex'),
  // v12 collapsedGroup's `flow` style: a rounded card (its trimmings: `drawCardTrim`).
  collapsedGroup: (w, W, H, outline, _line, g) =>
    w.outline('node', 'rect', {
      class: 'flow-collapsed',
      x: -W / 2,
      y: -H / 2,
      width: W,
      height: H,
      rx: cornerRadius('collapsedGroup', W, H, g),
      ...outline,
    }),
};

/**
 * A `W` × `H` card's trimmings (v12 collapsedGroup): the dashed separator under the label,
 * painted `separator` (`flowContainerStroke`), and three dots in the indicator row, `dots`.
 */
export function drawCardTrim(
  w: SvgWriter,
  W: number,
  H: number,
  separator: Attrs,
  dots: Attrs,
  g: ShapeGeometry
): void {
  const m = g.metrics.card;
  const sy = H / 2 - m.pad - m.row;
  w.outline('divider', 'line', {
    class: 'collapsed-separator',
    x1: -W / 2 + m.inset,
    y1: sy,
    x2: W / 2 - m.inset,
    y2: sy,
    'stroke-width': CARD_PAINT.lineWidth,
    'stroke-dasharray': CARD_PAINT.dash,
    ...separator,
  });
  for (let i = -1; i <= 1; i++)
    w.outline('mark', 'circle', {
      class: 'collapsed-indicator',
      cx: i * m.dotGap,
      cy: sy + m.row / 2,
      r: m.dot,
      opacity: CARD_PAINT.dotOpacity,
      ...dots,
    });
}

/** The drawer of `shape`: it draws it `W` × `H` and centred on the origin. */
export const shapeDrawer = (shape: LayoutShape): Drawer => DRAW[shape];

/**
 * Whether the shape's inner line is one segment, whose zero-width box a bounding-box gradient
 * can't paint (D185): it is drawn in `nodeBorder` as a colour when the outline is the gradient
 * (the shared shape's `plain`: `lin-doc`).
 */
export const usesPlain = (shape: LayoutShape): boolean => sharedShape(shape).plain === true;
