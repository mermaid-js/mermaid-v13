/**
 * A C4 relation drawn (spec #522 §Renderer, D455): its routed line as one `path` (the layout's
 * `c4RelationPath`, stopped short under the arrowheads), the arrowheads inline after it as
 * triangles (no `<marker>`, DESIGN §7.1), then its label and the italic `[techn]` below it on a
 * box of the page's `background`, as Pele draws them: the layout places a label on its line
 * where it covers least, so the box keeps the line from running through the text. The
 * relation's `descr` is the group's SVG `<title>`. Relations are not sketched (D301).
 */
import type { Paint, PathData, SvgWriter } from '@mermaid-js/core/svg';
import { C4_METRICS as M } from '../layout/metrics.ts';
import { c4RelationPath } from '../layout/path.ts';
import type { C4RelationEnd, C4RelationLayout } from '../layout/types.ts';
import type { Scene } from './render.ts';
import { drawText } from './text.ts';
import { C4_RENDER_METRICS as R } from './metrics.ts';

/** One relation: `g.c4-relation` holding its title, line, arrowheads and text. */
export function drawRelation(scene: Scene, rel: C4RelationLayout): void {
  const { w, model, paint } = scene;
  const m = model.relations[rel.index]!;
  const p = paint.relations.get(rel.index)!;
  w.open('g', { class: 'c4-relation', 'data-id': dataId(rel) });
  const descr = m.descr?.trim();
  if (descr) {
    w.open('title');
    w.text(descr);
    w.close();
  }
  w.leaf('path', {
    class: `c4-rel c4-rel-${kindClass(rel.kind)}`,
    'data-id': dataId(rel),
    'data-ast': rel.ast,
    d: linePath(w, rel),
    fill: 'none',
    stroke: p.stroke,
    'stroke-width': R.relationStroke,
  });
  if (rel.startArrow) arrowhead(w, rel.start, p.stroke);
  if (rel.endArrow) arrowhead(w, rel.end, p.stroke);
  if (p.text && p.labelBkg) {
    labelBox(w, rel, p.labelBkg);
    if (rel.label) drawText(scene, rel.label, 'c4-rel-label', p.text, dataId(rel));
    if (rel.techn) drawText(scene, rel.techn, 'c4-rel-techn', p.text, dataId(rel));
  }
  w.close();
}

/** The user's id of a relation: its ends, as v12's DB keyed it. */
const dataId = (rel: C4RelationLayout): string => `${rel.from}->${rel.to}`;

/** A class for the relation's kind: v12's `rel`, `birel`, `rel_b`, …; any other text as `rel`. */
const kindClass = (kind: string): string => (/^[a-z_]+$/.test(kind) ? kind : 'rel');

/** The line, from outline to outline, stopped under the arrowheads at its ends. */
function linePath(w: SvgWriter, rel: C4RelationLayout): PathData {
  const b = w.path();
  const trim = (arrow: boolean): number => (arrow ? R.arrowLength : 0);
  for (const c of c4RelationPath(rel, trim(rel.startArrow), trim(rel.endArrow))) {
    if (c.op === 'Q') b.quadTo(c.x1, c.y1, c.x, c.y);
    else if (c.op === 'C') b.curveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.op === 'M') b.moveTo(c.x, c.y);
    else b.lineTo(c.x, c.y);
  }
  return b.done();
}

/**
 * v12's arrowhead (`M 0 0 L 10 5 L 0 10 z`) inline: its tip on the outline at `end`, pointing
 * the way the end does, filled in the line's colour.
 */
function arrowhead(w: SvgWriter, end: C4RelationEnd, colour: Paint): void {
  const half = R.arrowWidth / 2;
  const bx = end.x - end.dx * R.arrowLength;
  const by = end.y - end.dy * R.arrowLength;
  const d = w
    .path()
    .moveTo(end.x, end.y)
    .lineTo(bx - end.dy * half, by + end.dx * half)
    .lineTo(bx + end.dy * half, by - end.dx * half)
    .close()
    .done();
  w.leaf('path', { class: 'marker', d, fill: colour, stroke: 'none' });
}

/** The label's box: the label and `[techn]` stacked, `labelPad` wider than the wider (the layout's). */
function labelBox(w: SvgWriter, rel: C4RelationLayout, fill: Paint): void {
  const parts = [rel.label, rel.techn].filter((l) => l !== undefined);
  if (parts.length === 0) return;
  const cx = parts[0]!.x + parts[0]!.width / 2;
  const width = Math.max(...parts.map((l) => l.width)) + M.labelPad;
  const top = parts[0]!.y;
  const last = parts[parts.length - 1]!;
  w.leaf('rect', {
    class: 'c4-rel-label-box',
    x: cx - width / 2,
    y: top,
    width,
    height: last.y + last.height - top,
    fill,
    stroke: 'none',
  });
}
