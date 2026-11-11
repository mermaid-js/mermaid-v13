/**
 * The five C4 shapes' drawers: flowchart's `person`, `rounded`, `cyl`, `h-cyl` and `fr-rect`
 * (`@mermaid-js/shared/shapes`, whose cylinder, queue and frame-line paths these write; ported
 * from Pele's src/svg/shapes.ts at 3a2f075, https://github.com/obsidianmd/pele, MIT,
 * (c) 2026 kepano), with v12 C4's corners (`rx` 12 on `rounded` and the person's body,
 * `c4ShapeAdapter.ts`). Each draws an element's laid-out box, in the canvas frame, exactly as
 * the layout's outline (`../layout/shapes.ts` `piecesOf`) that relations were clipped at.
 *
 * Outlines go through `w.outline` (D301, D302): the shape as `node`, the cylinder's and the
 * queue's rim and `fr-rect`'s frame lines as `divider`, so the hand-drawn extension sketches
 * them as v12 did.
 */
// cspell:ignore kepano
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import {
  capRy,
  cylinderPath,
  cylinderRim,
  queuePath,
  queueRim,
  queueRx,
  segments,
  type Barrel,
} from '@mermaid-js/shared/shapes';
import { C4_METRICS as M } from '../layout/metrics.ts';
import type { C4ShapeId, Rect } from '../layout/types.ts';

/** The main outline's class (v12's shapes write `label-container`; its `g.label` is a sibling). */
const CONTAINER = 'label-container';

/** What a shape is drawn from. */
export interface ShapeParts {
  readonly shape: C4ShapeId;
  /** The element's laid-out box, which the outline fills. */
  readonly box: Rect;
  /** The outline's paint: fill, stroke and width. */
  readonly paint: Attrs;
  /** Inner lines' stroke and width. */
  readonly line: Attrs;
}

/** Draws `shape` filling `box`: the outline painted `paint`, inner lines stroked as `line`. */
export function drawShape(w: SvgWriter, { shape, box, paint, line }: ShapeParts): void {
  const { x, y, width: W, height: H } = box;
  const outline: Attrs = { class: CONTAINER, ...paint };
  const inner: Attrs = { ...line, fill: 'none' };
  switch (shape) {
    case 'rounded':
      w.outline('node', 'rect', { ...outline, x, y, width: W, height: H, rx: M.shapeRadius });
      return;
    case 'person': {
      const head = M.personHead;
      w.outline('node', 'rect', {
        ...outline,
        x,
        y: y + head,
        width: W,
        height: H - head,
        rx: M.shapeRadius,
      });
      w.outline('node', 'circle', {
        ...outline,
        cx: x + W / 2,
        cy: y + M.personHeadCentre,
        r: M.personHeadRadius,
      });
      return;
    }
    case 'cyl': {
      const rx = W / 2;
      const ry = Math.min(capRy(W), H / 2);
      const barrel: Barrel = { left: x, right: x + W, top: y + ry, bottom: y + H - ry, rx, ry };
      w.outline('node', 'path', { ...outline, d: cylinderPath(w, barrel) });
      w.outline('divider', 'path', { ...inner, d: cylinderRim(w, barrel) });
      return;
    }
    case 'h-cyl': {
      const ry = H / 2;
      const rx = Math.min(queueRx(H), W / 2);
      const barrel: Barrel = { left: x + rx, right: x + W - rx, top: y, bottom: y + H, rx, ry };
      w.outline('node', 'path', { ...outline, d: queuePath(w, barrel) });
      w.outline('divider', 'path', { ...inner, d: queueRim(w, barrel) });
      return;
    }
    case 'fr-rect': {
      // v12's subroutine: a square box (its `rx` style does not round a polygon), and a frame
      // line `frameInset` inside each side.
      w.outline('node', 'rect', { ...outline, x, y, width: W, height: H });
      const left = x + M.frameInset;
      const right = x + W - M.frameInset;
      const d = segments(w, [left, y, left, y + H, right, y, right, y + H]);
      w.outline('divider', 'path', { ...inner, d });
    }
  }
}
