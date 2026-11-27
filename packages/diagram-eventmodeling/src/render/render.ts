// Draws a laid-out event model through the SvgWriter (spec #527 "Renderer (T4)", D215, D227,
// DESIGN §7). The layout (`layoutEventModel`) placed everything in the diagram's coordinates;
// this file only paints it, in v12's order (`renderer.ts`): one `g.em-swimlane` per lane (rect,
// bold label), one `g.em-box` per frame (rect in its kind's fill and stroke, the bold name and
// the data through core's label layout), then one `path.em-relation` per relation, each followed
// by its `polygon` head, after the boxes as in v12.
//
// Changed from v12's SVG: no `foreignObject` (the box text is `<text>`), no `<defs>`/`<marker>`
// (each head is an inline polygon), no ids but the title's and description's, text filled with
// `emTextColor` (v12 left it to the page). See GAPS.md "T4" for T5's MIGRATION.md rows.
//
// D528: each `g.em-box` and each explicit relation's path carries `data-ast` (`frame:<id>`, the
// `->>`'s id) and `data-id`; an inferred relation's path, the lanes (`lane:<index>`), the heads,
// rects and texts carry `data-id` only (pitfall 12).
import type { RenderContext } from '@mermaid-js/core';
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { CurveKind } from '@mermaid-js/shared/svg/route';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import { eventModelingUseMaxWidth } from '../config.ts';
import type {
  EventModelBoxLayout,
  EventModelLaneLayout,
  EventModelLayout,
  EventModelRelationLayout,
  PlacedLabel,
} from '../layout/index.ts';
import { headAt } from '../layout/index.ts';
import type { EventModel } from '../model.ts';
import { curvedRelation, keepsItsRoute, relationCurve } from './curve.ts';
import { paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type EventModelRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'idPrefix' | 'version' | 'warn'
>;

/** Writes the whole `<svg>` document for a laid-out event model. */
export function renderEventModel(
  model: EventModel,
  layout: EventModelLayout,
  ctx: EventModelRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme);
  openRoot(model, layout, ctx, w);
  const font: Attrs = { 'font-size': layout.font.size };
  for (const lane of layout.lanes) drawLane(lane, layout.radius, paint, font, w);
  for (const box of layout.boxes) drawBox(box, layout.radius, paint, font, w);
  // Once per render: `undefined` is today's look (no curve key set), not a curve kind.
  const curve = relationCurve(ctx.config, ctx.warn);
  for (const relation of layout.relations) drawRelation(relation, paint, w, curve);
  w.close();
}

/** A placed label, centred on its box, as core's label layout set it. */
function label(w: SvgWriter, p: PlacedLabel, attrs: Attrs): void {
  w.label(p.text, p.x + p.width / 2, p.y + p.height / 2, attrs);
}

/** A lane (`renderD3Swimlane`): the rect from x 0, then the bold label from (30, y + 30). */
function drawLane(
  lane: EventModelLaneLayout,
  radius: number,
  paint: Paints,
  font: Attrs,
  w: SvgWriter
): void {
  const id = lane.id;
  w.open('g', { class: 'em-swimlane', 'data-id': id });
  // A group's frame (D302): sketched under `look: handDrawn`.
  w.outline('group', 'rect', {
    'data-id': id,
    x: lane.x,
    y: lane.y,
    rx: radius,
    width: lane.width,
    height: lane.height,
    fill: paint.laneFill,
    stroke: paint.laneStroke,
  });
  // v12's start-anchored label: its left edge at `labelAt.x`, first baseline at `labelAt.y`.
  const text = lane.label.text;
  w.label(
    { ...text, left: true },
    lane.labelAt.x + text.width / 2,
    lane.label.y + text.height / 2,
    {
      'data-id': id,
      fill: paint.text,
      ...font,
    }
  );
  w.close();
}

/** A box (`renderD3Box`): the rect in its kind's colours, the bold name, then the data. */
function drawBox(
  box: EventModelBoxLayout,
  radius: number,
  paint: Paints,
  font: Attrs,
  w: SvgWriter
): void {
  const id = box.ast;
  const kind = paint.kind[box.kind];
  w.open('g', { class: 'em-box', 'data-id': id, 'data-ast': id });
  // A node's shape (D302): sketched under `look: handDrawn`.
  w.outline('node', 'rect', {
    'data-id': id,
    x: box.x,
    y: box.y,
    rx: radius,
    width: box.width,
    height: box.height,
    fill: kind.fill,
    stroke: kind.stroke,
  });
  const ink = { 'data-id': id, fill: paint.text, ...font };
  label(w, box.name, ink);
  if (box.data) label(w, box.data, ink);
  w.close();
}

/**
 * A relation (`renderD3Relation`): the line, fill `none`, stroke `emRelationStroke` 1 wide, and
 * v12's marker as an inline polygon in `emArrowhead`. With a curve set (D760) the line is drawn
 * by the shared `routePath` and the head follows the end of that path; a self relation, and
 * every relation with no curve set, is drawn from the layout's points and head.
 */
function drawRelation(
  r: EventModelRelationLayout,
  paint: Paints,
  w: SvgWriter,
  curve: CurveKind | undefined
): void {
  const routed = curve !== undefined && !keepsItsRoute(r) ? curvedRelation(w, r, curve) : undefined;
  // The shared edge-path step (D302, D537): sketched under `look: handDrawn`, and where line
  // hops find the relation when `lineHops` is on. The head stays a plain polygon.
  w.outline('edge', 'path', {
    class: 'em-relation',
    'data-id': r.id,
    'data-ast': r.astId,
    d: routed?.d ?? polyline(r, w),
    fill: 'none',
    stroke: paint.relation,
    'stroke-width': 1,
  });
  const head = routed ? headAt({ x: routed.ex, y: routed.ey }, routed.edx, routed.edy) : r.head;
  w.leaf('polygon', {
    'data-id': r.id,
    points: head.flatMap((p) => [p.x, p.y]),
    fill: paint.arrowhead,
  });
}

/** The layout's points as one `M…L…` path, as v12 drew them. */
function polyline(r: EventModelRelationLayout, w: SvgWriter): PathData {
  const d = w.path();
  for (const [i, p] of r.points.entries()) {
    if (i === 0) d.moveTo(p.x, p.y);
    else d.lineTo(p.x, p.y);
  }
  return d.done();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133: `accTitle` only). */
function openRoot(
  model: EventModel,
  layout: EventModelLayout,
  ctx: EventModelRenderContext,
  w: SvgWriter
): void {
  const { theme, config } = ctx;
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'eventmodeling',
    viewBox: layout.bounds,
    maxWidth: eventModelingUseMaxWidth(config.eventmodeling, ctx.warn),
    title: model.accTitle,
    desc: model.accDescr,
    attrs: { 'font-family': font },
  });
}
