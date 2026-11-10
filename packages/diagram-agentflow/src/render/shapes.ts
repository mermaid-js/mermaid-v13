/**
 * Draws agentflow's seven shapes through the SvgWriter: a local copy of v13 flowchart's drawers
 * for task `rounded`, tool `fr-rect`, input `lean-r`, decision `diam`, refdoc `lin-doc`, action
 * `hex` and v12's collapsed-flow card (D446), on the geometry the layout sized and outlined them
 * with (`layout/shapes.ts`, `layout/metrics.ts`), so every edge end the layout put on an outline
 * is on the drawn one. Every element goes through `w.outline` (D301, D302): the outline as
 * `node`, inner lines as `divider`, the card's dots as `mark`; a flow's frame as `group`
 * (`render.ts`).
 */
import type { Attrs, SafeValue, SvgWriter } from '@mermaid-js/core/svg';
import { cornerRadius, type LayoutShape, type ShapeGeometry } from '../layout/index.ts';

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

const poly = (w: SvgWriter, points: number[], a: Attrs): void =>
  w.outline('node', 'polygon', { points, ...a });

/** Line segments [x0, y0, x1, y1, …] as one path, each pair of points a separate stroke. */
function lines(w: SvgWriter, coords: number[], a: Attrs): void {
  const b = w.path();
  for (let i = 0; i + 3 < coords.length; i += 4)
    b.moveTo(coords[i]!, coords[i + 1]!).lineTo(coords[i + 2]!, coords[i + 3]!);
  w.outline('divider', 'path', { d: b.done(), ...a, fill: 'none' });
}

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
  'fr-rect': (w, W, H, outline, line, g) => {
    box(w, W, H, outline, 0);
    const x = W / 2 - g.metrics.frame;
    lines(w, [-x, -H / 2, -x, H / 2, x, -H / 2, x, H / 2], line);
  },
  'lean-r': (w, W, H, outline, _line, g) => {
    const c = g.metrics.leanCut * H;
    poly(w, [-W / 2 + c, -H / 2, W / 2, -H / 2, W / 2 - c, H / 2, -W / 2, H / 2], outline);
  },
  diam: (w, W, H, outline) => poly(w, [0, -H / 2, W / 2, 0, 0, H / 2, -W / 2, 0], outline),
  // The wave is the outline's two quadratic halves: control points `control` off the base.
  'lin-doc': (w, W, H, outline, line, g) => {
    const x = W / 2;
    const base = H / 2 - g.metrics.wave.depth;
    const k = g.metrics.wave.control;
    const d = w
      .path()
      .moveTo(-x, -H / 2)
      .lineTo(x, -H / 2)
      .lineTo(x, base)
      .quadTo(x / 2, base - k, 0, base)
      .quadTo(-x / 2, base + k, -x, base)
      .close()
      .done();
    w.outline('node', 'path', { d, ...outline });
    // The rule runs down to the wave: on the left half it is at `t` = (x − rule) / x.
    const rx = -x + g.metrics.docRule;
    const t = x > 0 ? Math.max(0, x - g.metrics.docRule) / x : 0;
    lines(w, [rx, -H / 2, rx, base + 2 * k * t * (1 - t)], line);
  },
  hex: (w, W, H, outline, _line, g) => {
    const c = H / g.pads.hexagonSlant;
    const x = W / 2;
    const y = H / 2;
    poly(w, [-x + c, -y, x - c, -y, x, 0, x - c, y, -x + c, y, -x, 0], outline);
  },
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
 * can't paint (D185): it is drawn in `nodeBorder` as a colour when the outline is the gradient,
 * as flowchart's `usesPlain` does for `lin-doc`.
 */
export const usesPlain = (shape: LayoutShape): boolean => shape === 'lin-doc';
