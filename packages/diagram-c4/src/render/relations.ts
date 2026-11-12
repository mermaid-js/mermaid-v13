/**
 * A C4 relation drawn (spec #522 §Renderer, D455): its routed line as one `path` (the layout's
 * `c4RelationPath`, stopped short under the arrowheads), the arrowheads inline after it as
 * v12's triangles (no `<marker>`, DESIGN §7.1), then its label and the italic `[techn]` below
 * it on a box of the page's `background`, as Pele draws them: the layout places a label on its
 * line where it covers least (D455), so the box keeps the line from running through the text
 * (v12 drew no box; its labels sat beside a curve). The relation's `descr` is the group's SVG
 * `<title>`. Relations are not sketched (D301).
 */
import type { Paint, PathData, SvgWriter } from '@mermaid-js/core/svg';
import { c4RelationPath } from '../layout/path.ts';
import type { C4RelationEnd, C4RelationLayout } from '../layout/types.ts';
import { C4_RELATION_KINDS, type C4RelationKind } from '../model.ts';
import type { Scene } from './context.ts';
import { C4_RENDER_METRICS as R } from './metrics.ts';
import { drawText } from './text.ts';

/** v12's relation kinds; any other kind a `$type` set draws as `rel`. */
const RELATION_KINDS: ReadonlySet<string> = new Set(C4_RELATION_KINDS);

/** The relation's kind as its class names it: v12's, else `rel`. */
const kindOf = (kind: string): C4RelationKind =>
  RELATION_KINDS.has(kind) ? (kind as C4RelationKind) : 'rel';

/** One relation: `g.c4-relation` holding its title, line, arrowheads and text. */
export function drawRelation(scene: Scene, rel: C4RelationLayout): void {
  const { w, model, paint } = scene;
  const colours = paint.relations.get(rel.index)!;
  const dataId = `${rel.from}->${rel.to}`;
  w.open('g', { class: 'c4-relation', 'data-id': dataId });
  const descr = model.relations[rel.index]!.descr?.trim();
  if (descr) {
    w.open('title');
    w.text(descr);
    w.close();
  }
  // Plain in every look (D301), and where line hops find it (D537, #655).
  w.plainEdge({
    class: `c4-rel c4-rel-${kindOf(rel.kind)}`,
    'data-id': dataId,
    'data-ast': rel.ast,
    d: linePath(w, rel),
    fill: 'none',
    stroke: colours.stroke,
    'stroke-width': R.relationStroke,
  });
  if (rel.startArrow) arrowhead(w, rel.start, colours.head);
  if (rel.endArrow) arrowhead(w, rel.end, colours.head);
  if (colours.text && colours.labelBkg) {
    labelBox(w, rel, colours.labelBkg);
    const fill = colours.text;
    if (rel.label) drawText(scene, { label: rel.label, cls: 'c4-rel-label', fill, dataId });
    if (rel.techn) drawText(scene, { label: rel.techn, cls: 'c4-rel-techn', fill, dataId });
  }
  w.close();
}

/** The line, from outline to outline, stopped under the arrowheads at its ends. */
function linePath(w: SvgWriter, rel: C4RelationLayout): PathData {
  const path = w.path();
  const trim = (arrow: boolean): number => (arrow ? R.arrowLength : 0);
  for (const c of c4RelationPath(rel, trim(rel.startArrow), trim(rel.endArrow))) {
    if (c.op === 'Q') path.quadTo(c.x1, c.y1, c.x, c.y);
    else if (c.op === 'C') path.curveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.op === 'M') path.moveTo(c.x, c.y);
    else path.lineTo(c.x, c.y);
  }
  return path.done();
}

/**
 * v12's arrowhead (`M 0 0 L 10 5 L 0 10 z`) inline: its tip on the outline at `end` (v12's
 * `refX 9` put it 1 px past), pointing the way the end does.
 */
function arrowhead(w: SvgWriter, end: C4RelationEnd, fill: Paint): void {
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
  w.leaf('path', { class: 'marker', d, fill, stroke: 'none' });
}

/** The label's box, as the layout placed it (`labelBox`). */
function labelBox(w: SvgWriter, rel: C4RelationLayout, fill: Paint): void {
  const box = rel.labelBox;
  if (!box) return;
  w.leaf('rect', {
    class: 'c4-rel-label-box',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill,
    stroke: 'none',
  });
}
