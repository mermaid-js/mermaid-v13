/**
 * Block's shape drawers (D446): the drawing half of the local copy of flowchart's shapes
 * (`diagram-flowchart/src/render/shapes.ts`, itself ported from Pele's src/svg/shapes.ts at
 * 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), plus the composite and
 * block-arrow drawers v13 did not have. Each draws a block's laid-out `Outline` (`outline.ts`)
 * in the block's own frame, about its centre, so what is drawn is exactly what edges were
 * clipped at. {@link drawShape} is the one table from a block's shape to its drawer.
 *
 * Leaves go through `w.outline` (D301, D302, D447): the outline as `node`, the subroutine's
 * frame lines, the cylinder's rim and the double circle's inner ring as `divider`, so the
 * hand-drawn extension sketches them as v12 did. The composite and the block arrow are plain
 * leaves (v12 never sketched them).
 */
// cspell:ignore kepano
import type { Attrs, OutlineTag, SvgWriter } from '@mermaid-js/core/svg';
import type { BlockShape } from '../layout/types.ts';
import { FRAME_INSET } from './leaf.ts';
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
    case 'cylinder': {
      // Flowchart's cylinder: the body with both caps.
      const { rx, ry, top, bottom } = cylinderParts(o);
      const d = w
        .path()
        .moveTo(-rx, top)
        .arcTo(rx, ry, 0, false, true, rx, top)
        .lineTo(rx, bottom)
        .arcTo(rx, ry, 0, false, true, -rx, bottom)
        .close()
        .done();
      return ['path', { d }];
    }
  }
}

function cylinderParts(o: Extract<Outline, { kind: 'cylinder' }>) {
  const ry = Math.min(o.ry, o.height / 2);
  return { rx: o.width / 2, ry, top: -o.height / 2 + ry, bottom: o.height / 2 - ry };
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

/** Line segments `[x0, y0, x1, y1, …]` as one `divider` path, each pair a separate stroke. */
function lines(w: SvgWriter, coords: readonly number[], line: Attrs): void {
  const b = w.path();
  for (let i = 0; i + 3 < coords.length; i += 4)
    b.moveTo(coords[i]!, coords[i + 1]!).lineTo(coords[i + 2]!, coords[i + 3]!);
  w.outline('divider', 'path', { d: b.done(), ...line, fill: 'none' });
}

type Drawer = (w: SvgWriter, o: Outline, paint: ShapePaint) => void;

/** The subroutine: its box and its two frame lines, one frame in from each side. */
const subroutine: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind !== 'rect') return;
  const x = o.width / 2 - FRAME_INSET;
  const y = o.height / 2;
  lines(w, [-x, -y, -x, y, x, -y, x, y], paint.line);
};

/** The cylinder: its body, then the front of the top cap as a rim. */
const cylinder: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind !== 'cylinder') return;
  const { rx, ry, top } = cylinderParts(o);
  const rim = w.path().moveTo(-rx, top).arcTo(rx, ry, 0, false, false, rx, top).done();
  w.outline('divider', 'path', { d: rim, ...paint.line, fill: 'none' });
};

/** The double circle: its outer ring, then the inner ring `ringGap` inside it. */
const doubleCircle: Drawer = (w, o, paint) => {
  leafOutline(w, o, paint);
  if (o.kind !== 'ellipse') return;
  w.outline('divider', 'circle', {
    r: Math.max(0, o.rx - paint.ringGap),
    ...paint.line,
    fill: 'none',
  });
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
