/**
 * The five C4 shapes' drawers (D446): the drawing half of a local copy of flowchart's `person`,
 * `rounded`, `cyl`, `h-cyl` and `fr-rect` (`diagram-flowchart/src/render/shapes.ts`, itself
 * ported from Pele's src/svg/shapes.ts at 3a2f075, https://github.com/obsidianmd/pele, MIT,
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
import { C4_METRICS as M } from '../layout/metrics.ts';
import { capRy, personParts, queueRx } from '../layout/shapes.ts';
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
      const { head, body } = personParts(box);
      w.outline('node', 'rect', { ...outline, ...body, rx: M.shapeRadius });
      w.outline('node', 'circle', { ...outline, cx: head.cx, cy: head.cy, r: head.r });
      return;
    }
    case 'cyl': {
      const rx = W / 2;
      const ry = Math.min(capRy(W), H / 2);
      const top = y + ry;
      const bottom = y + H - ry;
      const d = w
        .path()
        .moveTo(x, top)
        .arcTo(rx, ry, 0, false, true, x + W, top)
        .lineTo(x + W, bottom)
        .arcTo(rx, ry, 0, false, true, x, bottom)
        .close()
        .done();
      w.outline('node', 'path', { ...outline, d });
      const rim = w
        .path()
        .moveTo(x, top)
        .arcTo(rx, ry, 0, false, false, x + W, top)
        .done();
      w.outline('divider', 'path', { ...inner, d: rim });
      return;
    }
    case 'h-cyl': {
      const ry = H / 2;
      const rx = Math.min(queueRx(H), W / 2);
      const l = x + rx;
      const r = x + W - rx;
      const d = w
        .path()
        .moveTo(l, y)
        .lineTo(r, y)
        .arcTo(rx, ry, 0, false, true, r, y + H)
        .lineTo(l, y + H)
        .arcTo(rx, ry, 0, false, true, l, y)
        .close()
        .done();
      w.outline('node', 'path', { ...outline, d });
      const rim = w
        .path()
        .moveTo(r, y)
        .arcTo(rx, ry, 0, false, false, r, y + H)
        .done();
      w.outline('divider', 'path', { ...inner, d: rim });
      return;
    }
    case 'fr-rect': {
      // v12's subroutine: a square box (its `rx` style does not round a polygon), and a frame
      // line `frameInset` inside each side.
      w.outline('node', 'rect', { ...outline, x, y, width: W, height: H });
      const left = x + M.frameInset;
      const right = x + W - M.frameInset;
      const d = w
        .path()
        .moveTo(left, y)
        .lineTo(left, y + H)
        .moveTo(right, y)
        .lineTo(right, y + H)
        .done();
      w.outline('divider', 'path', { ...inner, d });
    }
  }
}
