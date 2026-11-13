/**
 * What a laid-out c4-beta diagram must satisfy (spec #730 §Testing Decisions), on the scene the
 * layout returns: the geometric rules the engine's own `validateLayout` does not state in C4's
 * terms. Each check returns one message per violation; an empty list means it holds.
 */
import type {
  C4BetaModel,
  C4BetaLayoutContext,
  C4BetaLaidOut,
} from '@mermaid-js/diagram-c4/testing';
import type { C4Layout, PlacedLabel, Point, Rect } from '@mermaid-js/diagram-c4';
import { layoutC4BetaFull } from '@mermaid-js/diagram-c4/testing';
import { validateLayout } from '@mermaid-js/core/layout';

/** How far boxes may overlap, or a line may enter a box, and still count as clear (px). */
export const SLACK = 0.5;

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - SLACK &&
  b.x < a.x + a.width - SLACK &&
  a.y < b.y + b.height - SLACK &&
  b.y < a.y + a.height - SLACK;

const inside = (outer: Rect, inner: Rect, top = outer.y): boolean =>
  inner.x >= outer.x - SLACK &&
  inner.y >= top - SLACK &&
  inner.x + inner.width <= outer.x + outer.width + SLACK &&
  inner.y + inner.height <= outer.y + outer.height + SLACK;

/** Whether the segment p-q passes through the inside of `box` (shrunk by SLACK). */
export function segmentCrosses(p: Point, q: Point, box: Rect): boolean {
  const x0 = box.x + SLACK;
  const x1 = box.x + box.width - SLACK;
  const y0 = box.y + SLACK;
  const y1 = box.y + box.height - SLACK;
  if (x0 >= x1 || y0 >= y1) return false;
  // Liang-Barsky over t in [0, 1].
  let lo = 0;
  let hi = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  for (const [d, dist] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ] as const) {
    if (d === 0) {
      if (dist < 0) return false;
    } else {
      const t = dist / d;
      if (d < 0) lo = Math.max(lo, t);
      else hi = Math.min(hi, t);
    }
  }
  return lo < hi;
}

/** A boundary header's box: its label lines together. */
export function headerBox(b: C4Layout['boundaries'][number]): Rect | undefined {
  const lines = [b.label, b.type, b.descr].filter((l): l is PlacedLabel => l !== undefined);
  if (lines.length === 0) return undefined;
  const x0 = Math.min(...lines.map((l) => l.x));
  const y0 = Math.min(...lines.map((l) => l.y));
  const x1 = Math.max(...lines.map((l) => l.x + l.width));
  const y1 = Math.max(...lines.map((l) => l.y + l.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The engine's own check on its answer for the graph the layout built. */
export const engineViolations = (run: C4BetaLaidOut): string[] =>
  validateLayout(run.prepared.graph, run.laid);

/** A relation that passes through an element other than its ends. */
export function crossingViolations(scene: C4Layout): string[] {
  const out: string[] = [];
  for (const r of scene.relations)
    for (const e of scene.elements) {
      if (e.alias === r.from || e.alias === r.to) continue;
      for (let i = 1; i < r.points.length; i++)
        if (segmentCrosses(r.points[i - 1]!, r.points[i]!, e.box)) {
          out.push(`${r.from} -> ${r.to} passes through ${e.alias}`);
          break;
        }
    }
  return out;
}

/** A relation label that overlaps an element, a boundary header or another label. */
export function labelViolations(scene: C4Layout): string[] {
  const out: string[] = [];
  const labelled = scene.relations.filter((r) => r.labelBox !== undefined);
  for (const r of labelled) {
    const name = `${r.from} -> ${r.to}`;
    for (const e of scene.elements)
      if (overlap(r.labelBox!, e.box)) out.push(`label of ${name} overlaps element ${e.alias}`);
    for (const b of scene.boundaries) {
      const h = headerBox(b);
      if (h && overlap(r.labelBox!, h)) out.push(`label of ${name} overlaps header of ${b.alias}`);
    }
  }
  for (let i = 0; i < labelled.length; i++)
    for (let j = i + 1; j < labelled.length; j++)
      if (overlap(labelled[i]!.labelBox!, labelled[j]!.labelBox!))
        out.push(
          `label of ${labelled[i]!.from} -> ${labelled[i]!.to} overlaps label of ` +
            `${labelled[j]!.from} -> ${labelled[j]!.to}`
        );
  return out;
}

/** A relation that passes through the title text of a boundary. */
export function titleViolations(scene: C4Layout): string[] {
  const out: string[] = [];
  for (const b of scene.boundaries) {
    const h = headerBox(b);
    if (!h) continue;
    for (const r of scene.relations)
      for (let i = 1; i < r.points.length; i++)
        if (segmentCrosses(r.points[i - 1]!, r.points[i]!, h)) {
          out.push(`${r.from} -> ${r.to} crosses the title of ${b.alias}`);
          break;
        }
  }
  return out;
}

/** An element outside its boundary's frame (below its header), or a boundary outside its parent's. */
export function containmentViolations(model: C4BetaModel, scene: C4Layout): string[] {
  const out: string[] = [];
  const frames = new Map(scene.boundaries.map((b) => [b.alias, b]));
  const boxes = new Map<string, Rect>([
    ...scene.elements.map((e) => [e.alias, e.box] as const),
    ...scene.boundaries.map((b) => [b.alias, b.box] as const),
  ]);
  for (const element of model.elements) {
    const box = boxes.get(element.id);
    if (!box) {
      out.push(`${element.id} is not in the scene`);
      continue;
    }
    if (element.parent === undefined) continue;
    const parent = frames.get(element.parent);
    if (!parent) out.push(`${element.id}: parent ${element.parent} is not a frame`);
    else if (!inside(parent.box, box, parent.box.y + parent.head))
      out.push(`${element.id} lies outside ${element.parent}`);
  }
  return out;
}

/** Every number in the scene is finite. */
export function finiteViolations(scene: C4Layout): string[] {
  const bad: string[] = [];
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) bad.push(`${path} is ${value}`);
    } else if (value !== null && typeof value === 'object')
      for (const [k, v] of Object.entries(value)) if (k !== 'text') walk(v, `${path}.${k}`);
  };
  walk(scene, 'scene');
  return bad;
}

/** Everything the invariants say, for one run. */
export function allViolations(model: C4BetaModel, run: C4BetaLaidOut): string[] {
  return [
    ...engineViolations(run),
    ...finiteViolations(run.scene),
    ...crossingViolations(run.scene),
    ...labelViolations(run.scene),
    ...containmentViolations(model, run.scene),
  ];
}

export type { C4BetaLayoutContext };
export { layoutC4BetaFull };
