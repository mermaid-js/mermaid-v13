/**
 * Relationships and note connectors, then their labels (v12's `edgePaths` and `edgeLabels`). A
 * relationship is a `g.relationship.relationship-<type>` with the line through
 * `w.outline('edge', …)` (D302) and its markers as paths; include, extend and note lines are
 * dashed 3 (`styles.ts`), include and extend in their own colours. An author's `classDef` /
 * `style` on a relationship wins, and its markers take its stroke. An animated relationship moves
 * as in the flowchart (`animateEdge`, D606).
 */
import { ANIMATED_DASH, animateEdge } from '@mermaid-js/shared/svg/document';
import { edgeLabel } from '@mermaid-js/shared/svg/graph';
import { routePath } from '@mermaid-js/shared/svg/route';
import { pxProfile } from '@mermaid-js/core/layout';
import type { Attrs, Paint, SafeValue } from '@mermaid-js/core/svg';
import { noteEdgeId, type RelationEdgeView, type UsecaseEdgeView } from '../layout/prepare.ts';
import type { UsecaseRelationship } from '../model.ts';
import { marker, markerTrim } from './markers.ts';
import { DRAW } from './metrics.ts';
import { relationName } from './accessible-names.ts';
import { need } from './paint.ts';
import { cls, type Scene } from './scene.ts';

export function drawEdges(scene: Scene): void {
  const { w, p, paint } = scene;
  if (p.edges.length === 0) return;
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: need(paint.edges, 'edge').line,
    'stroke-width': need(paint.edges, 'edge').width,
  });
  for (const e of p.edges) drawEdge(scene, e);
  w.close();
}

/** The classes v12 gave the line (`getData`): its kind, the author's, the animation's. */
function edgeClass(e: UsecaseEdgeView): string {
  if (e.kind === 'note') return 'relationship relationship-note';
  const r = e.relationship;
  const animation = r.animate || r.animation ? ` edge-animation-${r.animation ?? 'fast'}` : '';
  return `relationship relationship-${r.type}${cls(r.classes)}${animation}`;
}

function lineColour(scene: Scene, r: UsecaseRelationship): Paint | undefined {
  const edges = need(scene.paint.edges, 'edge');
  if (r.type === 'include') return edges.include;
  if (r.type === 'extend') return edges.extend;
  return undefined;
}

/** A relationship's own attributes: colour, caps, accessible name; a note connector's are hidden. */
function lineAttrs(scene: Scene, e: UsecaseEdgeView): Attrs {
  if (e.kind === 'note') return { 'aria-hidden': 'true' };
  const r = e.relationship;
  const source = scene.spokenOf.get(r.source) ?? r.source;
  const target = scene.spokenOf.get(r.target) ?? r.target;
  return {
    stroke: lineColour(scene, r),
    // v12's `.relationship.edge-animation-*` rounded the caps; other lines keep butt caps.
    'stroke-linecap': r.animate || r.animation ? 'round' : undefined,
    role: 'img',
    'aria-label': relationName(scene.speak, e, source, target),
  };
}

function drawEdge(scene: Scene, e: UsecaseEdgeView): void {
  const { w, layout } = scene;
  const edges = need(scene.paint.edges, 'edge');
  const route = layout.edges.get(e.id);
  w.open('g', {
    class: edgeClass(e),
    // v12's ids: the relationship's, `<note id>-edge` for a note's connector.
    'data-id': e.kind === 'relation' ? e.relationship.id : noteEdgeId(e.note.id),
    // A note's AST node is drawn by its box; a relationship's by its line.
    'data-ast': e.kind === 'relation' ? e.relationship.astId : undefined,
  });
  if (route && route.points.length > 1) {
    const ends = e.markers;
    const path = routePath(
      w,
      route.points,
      // A self-loop keeps its rounded path whatever the curve (D733).
      e.source === e.target ? 'rounded' : scene.p.curve,
      markerTrim(ends.start),
      markerTrim(ends.end)
    );
    const animated = e.kind === 'relation' && animateEdge(w, e.relationship);
    w.outline('edge', 'path', {
      d: path.d,
      'stroke-dasharray': e.dotted ? DASH : undefined,
      ...lineAttrs(scene, e),
      ...e.style.shape,
      // The moving dashes replace the line's own pattern and an author's, as in v12.
      ...(animated && { 'stroke-dasharray': ANIMATED_DASH, 'stroke-dashoffset': undefined }),
      fill: 'none',
    });
    const head = {
      line: e.style.shape.stroke ?? edges.line,
      hollow: edges.hollow,
      opacity: e.style.shape.opacity,
    };
    marker(w, ends.start, { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy }, head);
    marker(w, ends.end, { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy }, head);
  }
  w.close();
}

const DASH = String(DRAW.dash) as SafeValue;

export function drawEdgeLabels(scene: Scene): void {
  const { w, p, paint } = scene;
  if (!paint.edgeLabel) return;
  w.open('g', { class: 'edgeLabels' });
  for (const e of p.edges) if (e.kind === 'relation') drawEdgeLabel(scene, e);
  w.close();
}

/**
 * A relationship's label as the shared tag (D626–D628): bordered in the line's own colour (an
 * author's stroke, else include's or extend's, else the edge line) and as large as the room the
 * layout gave it (`labelPatch`, D629).
 */
function drawEdgeLabel(scene: Scene, e: RelationEdgeView): void {
  const { w, layout, paint, fontOf, ctx } = scene;
  const at = layout.edges.get(e.id)?.label;
  const label = e.label;
  if (!at || !label || label.width === 0) return;
  const bg = need(paint.edgeLabel, 'edge label');
  const r = e.relationship;
  edgeLabel(w, label, at, r.id, {
    fill: bg.fill,
    stroke: e.style.shape.stroke ?? lineColour(scene, r) ?? need(paint.edges, 'edge').line,
    text: {
      class: 'relationship-label',
      'data-id': r.id,
      fill: bg.text,
      ...fontOf(e.font),
      ...e.style.text,
    },
    patch: (ctx.units ?? pxProfile).builder.labelPatch,
  });
}
