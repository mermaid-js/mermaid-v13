/**
 * Relationships and note connectors, then their labels (v12's `edgePaths` and `edgeLabels`). A
 * relationship is a `g.relationship.relationship-<type>` with the line through
 * `w.outline('edge', …)` (D302) and its markers as paths; include, extend and note lines are
 * dashed 3 (`styles.ts`), include and extend in their own colours. An author's `classDef` /
 * `style` on a relationship wins, and its markers take its stroke. Animation is a class only, as
 * in the flowchart: the keyframes would need a `<style>` (out of scope, spec #517).
 */
import type { Attrs, Paint, SafeValue } from '@mermaid-js/core/svg';
import type { NoteEdgeView, RelationEdgeView, UsecaseEdgeView } from '../layout/prepare.ts';
import { marker, markersOf, markerTrim } from './markers.ts';
import { DRAW } from './metrics.ts';
import { relationName } from './names.ts';
import { routePath } from './route.ts';
import { cls, type Scene } from './scene.ts';

const NONE = { start: 'none', end: 'none' } as const;

export function drawEdges(scene: Scene): void {
  const { w, p, paint } = scene;
  if (p.edges.length === 0) return;
  w.open('g', {
    class: 'edgePaths',
    fill: 'none',
    stroke: paint.edges!.line,
    'stroke-width': paint.edges!.width,
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

function lineColour(scene: Scene, e: UsecaseEdgeView): Paint | undefined {
  if (e.kind !== 'relation') return undefined;
  const edges = scene.paint.edges!;
  if (e.relationship.type === 'include') return edges.include;
  if (e.relationship.type === 'extend') return edges.extend;
  return undefined;
}

function drawEdge(scene: Scene, e: UsecaseEdgeView): void {
  const { w, layout, paint } = scene;
  const route = layout.edges.get(e.id);
  const relation = e.kind === 'relation' ? e.relationship : undefined;
  w.open('g', {
    class: edgeClass(e),
    // v12's ids: the relationship's, `<note id>-edge` for a note's connector.
    'data-id': relation ? relation.id : `${(e as NoteEdgeView).note.id}-edge`,
    // A note's AST node is drawn by its box; a relationship's by its line.
    'data-ast': relation?.astId,
  });
  if (route && route.points.length > 1) {
    const ends = relation ? markersOf(relation) : NONE;
    const path = routePath(
      w,
      route.points,
      e.source === e.target ? 'rounded' : 'curved',
      markerTrim(ends.start),
      markerTrim(ends.end)
    );
    const animated = relation !== undefined && (relation.animate || relation.animation);
    const line: Attrs = {
      d: path.d,
      stroke: lineColour(scene, e),
      'stroke-dasharray': e.dotted ? DASH : undefined,
      // v12's `.relationship.edge-animation-*` rounded the caps; other lines keep butt caps.
      'stroke-linecap': animated ? 'round' : undefined,
      ...(relation
        ? { role: 'img', 'aria-label': relationName(e as RelationEdgeView, ...endNames(scene, e)) }
        : { 'aria-hidden': 'true' }),
      ...e.style.shape,
      fill: 'none',
    };
    w.outline('edge', 'path', line);
    const head = {
      line: e.style.shape.stroke ?? paint.edges!.line,
      hollow: paint.edges!.hollow,
      opacity: e.style.shape.opacity,
    };
    marker(w, ends.start, { x: path.sx, y: path.sy, dx: path.sdx, dy: path.sdy }, head);
    marker(w, ends.end, { x: path.ex, y: path.ey, dx: path.edx, dy: path.edy }, head);
  }
  w.close();
}

const DASH = String(DRAW.dash) as SafeValue;

/** The spoken labels of a relationship's ends. */
function endNames(scene: Scene, e: UsecaseEdgeView): [string, string] {
  const r = (e as RelationEdgeView).relationship;
  return [scene.spokenOf.get(r.source) ?? r.source, scene.spokenOf.get(r.target) ?? r.target];
}

export function drawEdgeLabels(scene: Scene): void {
  const { w, p, paint } = scene;
  if (!paint.edgeLabel) return;
  w.open('g', { class: 'edgeLabels' });
  for (const e of p.edges) if (e.kind === 'relation') drawEdgeLabel(scene, e);
  w.close();
}

function drawEdgeLabel({ w, layout, paint, fontOf }: Scene, e: RelationEdgeView): void {
  const at = layout.edges.get(e.id)?.label;
  const label = e.label;
  if (!at || !label || label.width === 0) return;
  const bg = paint.edgeLabel!;
  const width = label.width + 2 * DRAW.edgeLabelPad;
  w.open('g', { class: 'edgeLabel', 'data-id': e.relationship.id });
  w.leaf('rect', {
    class: 'labelBkg',
    x: at.x - width / 2,
    y: at.y - label.height / 2,
    width,
    height: label.height,
    fill: bg.fill,
  });
  w.label(label, at.x, at.y, {
    class: 'relationship-label',
    'data-id': e.relationship.id,
    fill: bg.text,
    ...fontOf(e.font),
    ...e.style.text,
  });
  w.close();
}
