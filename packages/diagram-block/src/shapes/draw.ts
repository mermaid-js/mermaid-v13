/**
 * Block's shape drawers: each draws a block's laid-out `Outline` (`outline.ts`) in the block's
 * own frame, about its centre, so what is drawn is exactly what edges were clipped at. The
 * leaves' paths and inner lines are the shared shapes' (`@mermaid-js/shared/shapes`); the
 * composite and the block arrow are block's own. {@link drawShape} is the one table from a
 * block's shape to its drawer.
 *
 * Leaves go through `w.outline` (D301, D302, D447): the outline as `node`, the subroutine's
 * frame lines, the cylinder's rim and the double circle's inner ring as `divider`, so the
 * hand-drawn extension sketches them as v12 did. The composite and the block arrow are plain
 * leaves (v12 never sketched them).
 */
import type { Attrs, OutlineTag, SvgWriter } from '@mermaid-js/core/svg';
import {
  cylinderPath,
  cylinderRim,
  frameLines,
  ring,
  type Barrel,
} from '@mermaid-js/shared/shapes';
import type { BlockShape } from '../layout/types.ts';
import type { Outline, Point } from './outline.ts';

/** The leaf's main outline, v12's `label-container` (its `g.label` is its sibling). */
const CONTAINER = 'label-container';
/** The block arrow's: v12's, and its own, so it is told from a leaf's polygon. */
const BLOCK_ARROW = 'label-container block-arrow';
/** v12 `composite.ts`'s classes. */
const COMPOSITE = 'basic cluster composite label-container';

/** What a block's shape is drawn with. */
export interface ShapePaint {
  /** The outline's fill, stroke, width and shadow, the author's style over them. */
  readonly outline: Attrs;
  /** Inner lines: the outline's stroke and width. */
  readonly line: Attrs;
  /** `doubleCircleGap`: how far inside the outer ring the double circle's inner ring is. */
  readonly ringGap: number;
}

/** Points as the flat `[x0, y0, x1, y1, …]` a `points` attribute takes. */
function flat(points: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** The element an outline is written as, about the centre, and its geometry. */
function outlineElement(w: SvgWriter, o: Outline): [OutlineTag, Attrs] {
  switch (o.kind) {
    case 'rect':
      return [
        'rect',
        {
          x: -o.width / 2,
          y: -o.height / 2,
          width: o.width,
          height: o.height,
          rx: o.rx > 0 ? o.rx : undefined,
        },
      ];
    case 'polygon':
      return ['polygon', { points: flat(o.points) }];
    case 'ellipse':
      return ['circle', { r: o.rx }];
    case 'cylinder':
      return ['path', { d: cylinderPath(w, barrelOf(o)) }];
  }
}

/** The cylinder's body between its caps, the caps no deeper than half its height. */
function barrelOf(o: Extract<Outline, { kind: 'cylinder' }>): Barrel {
  const rx = o.width / 2;
  const ry = Math.min(o.ry, o.height / 2);
  return { left: -rx, right: rx, top: -o.height / 2 + ry, bottom: o.height / 2 - ry, rx, ry };
}

/** A leaf's outline, through the hook as `node`. */
function leafOutline(w: SvgWriter, o: Outline, paint: ShapePaint): void {
  const [tag, geometry] = outlineElement(w, o);
  w.outline('node', tag, { class: CONTAINER, ...geometry, ...paint.outline });
}

/** A plain outline (v12 never sketched it), with its classes. */
const plain =
  (cls: string): Drawer =>
  (w, o, paint) => {
    const [tag, geometry] = outlineElement(w, o);
    w.leaf(tag, { class: cls, ...geometry, ...paint.outline });
  };

type Drawer = (w: SvgWriter, o: Outline, paint: ShapePaint) => void;

/** The subroutine: its box and its two frame lines, one frame in from each side. */
const subroutine: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind === 'rect') frameLines(w, o.width, o.height, paint.line);
};

/** The cylinder: its body, then the front of the top cap as a rim. */
const cylinder: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind !== 'cylinder') return;
  w.outline('divider', 'path', { d: cylinderRim(w, barrelOf(o)), ...paint.line, fill: 'none' });
};

/** The double circle: its outer ring, then the inner ring `ringGap` inside it. */
const doubleCircle: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind === 'ellipse') ring(w, Math.max(0, o.rx - paint.ringGap), paint.line);
};

const DRAWERS: Readonly<Record<Exclude<BlockShape, 'space'>, Drawer>> = {
  rect: leafOutline,
  stadium: leafOutline,
  'fr-rect': subroutine,
  cyl: cylinder,
  circle: leafOutline,
  'dbl-circ': doubleCircle,
  diam: leafOutline,
  hex: leafOutline,
  odd: leafOutline,
  'lean-r': leafOutline,
  'lean-l': leafOutline,
  'trap-b': leafOutline,
  'trap-t': leafOutline,
  // v12 `composite.ts` and `blockArrow.ts`, plain (D447).
  composite: plain(COMPOSITE),
  'block-arrow': plain(BLOCK_ARROW),
};

/** Draws a block's shape from its laid-out outline. */
export function drawShape(
  w: SvgWriter,
  shape: Exclude<BlockShape, 'space'>,
  o: Outline,
  paint: ShapePaint
): void {
  DRAWERS[shape](w, o, paint);
}
