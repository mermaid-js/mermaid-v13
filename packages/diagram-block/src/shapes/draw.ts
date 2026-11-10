/**
 * Block's shape drawers (D446): the drawing half of the local copy of flowchart's shapes
 * (`diagram-flowchart/src/render/shapes.ts`, itself ported from Pele's src/svg/shapes.ts at
 * 3a2f075, https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), plus the composite and
 * block-arrow drawers v13 did not have. Each draws a block's laid-out `Outline` (`outline.ts`) in the block's own frame,
 * about its centre, so what is drawn is exactly what edges were clipped at.
 *
 * Leaves go through `w.outline` (D301, D302, D447): the outline as `node`, the subroutine's
 * frame lines, the cylinder's rim and the double circle's inner ring as `divider`, so the
 * hand-drawn extension sketches them as v12 did. The composite and the block arrow are plain
 * leaves (v12 never sketched them).
 */
// cspell:ignore kepano
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import { FRAME_INSET, type LeafShape } from './leaf.ts';
import type { Outline, Point } from './outline.ts';

/** The leaf's main outline, v12's `label-container` (its `g.label` is its sibling). */
const CONTAINER = 'label-container';
/** The block arrow's: v12's, and its own. */
const BLOCK_ARROW = 'label-container block-arrow';
/** v12 `composite.ts`'s classes. */
const COMPOSITE = 'basic cluster composite label-container';

/** Points as the flat `[x0, y0, x1, y1, …]` a `points` attribute takes. */
function flat(points: readonly Point[]): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** A box about the centre, with corners rounded by `rx` when it has any. */
const box = (width: number, height: number, rx: number): Attrs => ({
  x: -width / 2,
  y: -height / 2,
  width,
  height,
  rx: rx > 0 ? rx : undefined,
});

/** Line segments `[x0, y0, x1, y1, …]` as one path, each pair of points a separate stroke. */
function lines(w: SvgWriter, coords: readonly number[], line: Attrs): void {
  const b = w.path();
  for (let i = 0; i + 3 < coords.length; i += 4)
    b.moveTo(coords[i]!, coords[i + 1]!).lineTo(coords[i + 2]!, coords[i + 3]!);
  w.outline('divider', 'path', { d: b.done(), ...line, fill: 'none' });
}

/** Flowchart's cylinder: the body with both caps, then the front of the top cap as a rim. */
function cylinder(
  w: SvgWriter,
  o: Extract<Outline, { kind: 'cylinder' }>,
  a: Attrs,
  line: Attrs
): void {
  const rx = o.width / 2;
  const ry = Math.min(o.ry, o.height / 2);
  const top = -o.height / 2 + ry;
  const bottom = o.height / 2 - ry;
  const d = w
    .path()
    .moveTo(-rx, top)
    .arcTo(rx, ry, 0, false, true, rx, top)
    .lineTo(rx, bottom)
    .arcTo(rx, ry, 0, false, true, -rx, bottom)
    .close()
    .done();
  w.outline('node', 'path', { class: CONTAINER, d, ...a });
  const rim = w.path().moveTo(-rx, top).arcTo(rx, ry, 0, false, false, rx, top).done();
  w.outline('divider', 'path', { d: rim, ...line, fill: 'none' });
}

/** What a leaf is drawn from besides its outline. */
export interface LeafPaint {
  /** The outline's paint: fill, stroke, width, shadow, and the author's style over them. */
  readonly shape: Attrs;
  /** Inner lines: the outline's stroke and width. */
  readonly line: Attrs;
  /** `doubleCircleGap`: how far inside the outer ring the double circle's inner ring is. */
  readonly ringGap: number;
}

/**
 * Draws a leaf block's shape from its laid-out outline: flowchart's `rect` (square, round with
 * its radius, stadium with half its height), the subroutine's `fr-rect` and its frames, the
 * polygons (diamond, hexagon, odd, lean, trapezoids), the circles and the cylinder.
 */
export function drawLeaf(w: SvgWriter, shape: LeafShape, o: Outline, paint: LeafPaint): void {
  const { shape: a, line } = paint;
  switch (o.kind) {
    case 'rect': {
      w.outline('node', 'rect', { class: CONTAINER, ...box(o.width, o.height, o.rx), ...a });
      if (shape === 'fr-rect') {
        const x = o.width / 2 - FRAME_INSET;
        const y = o.height / 2;
        lines(w, [-x, -y, -x, y, x, -y, x, y], line);
      }
      return;
    }
    case 'polygon':
      w.outline('node', 'polygon', { class: CONTAINER, points: flat(o.points), ...a });
      return;
    case 'ellipse': {
      w.outline('node', 'circle', { class: CONTAINER, r: o.rx, ...a });
      if (shape === 'dbl-circ')
        w.outline('divider', 'circle', {
          r: Math.max(0, o.rx - paint.ringGap),
          ...line,
          fill: 'none',
        });
      return;
    }
    case 'cylinder':
      cylinder(w, o, a, line);
  }
}

/** v12 `composite.ts`: the composite's box, a plain `rect` (D447). */
export function drawComposite(w: SvgWriter, o: Outline, a: Attrs): void {
  if (o.kind !== 'rect') return;
  w.leaf('rect', { class: COMPOSITE, ...box(o.width, o.height, o.rx), ...a });
}

/**
 * v12 `blockArrow.ts`: the arrow's polygon, plain (D447). `block-arrow` beside v12's class tells
 * it from a leaf's polygon, which the hand-drawn hook sketches.
 */
export function drawBlockArrow(w: SvgWriter, o: Outline, a: Attrs): void {
  if (o.kind !== 'polygon') return;
  w.leaf('polygon', { class: BLOCK_ARROW, points: flat(o.points), ...a });
}
