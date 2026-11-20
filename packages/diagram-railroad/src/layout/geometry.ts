/**
 * What the layout and its invariants both need: a path builder in v12's argument order, the
 * box around a path, and a walk over a rule's drawn parts in diagram coordinates.
 */
import { RectUnion } from '@mermaid-js/shared/layout';
import type {
  Point,
  RailroadExpressionLayout,
  RailroadRuleLayout,
  Rect,
  TrackPath,
  TrackSegment,
} from './types.ts';

/** Builds a {@link TrackPath} as v12's `PathBuilder` did (`railroadRenderer.ts:17-56`). */
export class Track {
  private readonly segments: TrackSegment[] = [];
  private constructor(private readonly start: Point) {}
  static from(x: number, y: number): Track {
    return new Track({ x, y });
  }
  lineTo(x: number, y: number): this {
    this.segments.push({ kind: 'line', x, y });
    return this;
  }
  arcTo(radius: number, sweep: boolean, x: number, y: number): this {
    this.segments.push({ kind: 'arc', radius, sweep, x, y });
    return this;
  }
  done(): TrackPath {
    return { start: this.start, segments: this.segments };
  }
}

/** Every point a path passes through: its start and each segment's end. */
export function pathPoints(path: TrackPath): Point[] {
  return [path.start, ...path.segments];
}

/** `r` moved by (`dx`, `dy`) and grown by `grow` on every side. */
export function shifted(r: Rect, dx: number, dy: number, grow = 0): Rect {
  return {
    x: r.x + dx - grow,
    y: r.y + dy - grow,
    width: r.width + 2 * grow,
    height: r.height + 2 * grow,
  };
}

/**
 * The box around a path: every corner is a quarter circle between its end points, so it lies in
 * the box of the points.
 */
export function pathBox(path: TrackPath): Rect {
  const box = new RectUnion();
  for (const p of pathPoints(path)) box.add({ x: p.x, y: p.y, width: 0, height: 0 });
  return box.rect();
}

/** What {@link visitRule} hands its callback for each drawn part, in diagram coordinates. */
export interface Drawn {
  readonly part: 'label' | 'marker' | 'path' | 'box' | 'text';
  /** The part's extent, without stroke. */
  readonly rect: Rect;
  /** Whether the part is stroked (paths and boxes). */
  readonly stroked: boolean;
}

/** Each expression of a rule, with its offset in diagram coordinates, parents first. */
export function visitExpressions(
  rule: RailroadRuleLayout,
  fn: (e: RailroadExpressionLayout, dx: number, dy: number) => void
): void {
  const stack: [RailroadExpressionLayout, number, number][] = [
    [rule.definition, rule.origin.x + rule.definition.x, rule.origin.y + rule.definition.y],
  ];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [e, dx, dy] = next;
    fn(e, dx, dy);
    for (let i = e.children.length - 1; i >= 0; i--) {
      const c = e.children[i]!;
      stack.push([c, dx + c.x, dy + c.y]);
    }
  }
}

/** Each drawn part of a rule, in diagram coordinates. */
export function visitRule(rule: RailroadRuleLayout, fn: (d: Drawn) => void): void {
  const { x: ox, y: oy } = rule.origin;
  fn({ part: 'label', rect: shifted(rule.label.box, ox, oy), stroked: false });
  for (const m of [rule.start, rule.end]) {
    const rect = { x: m.cx - m.r, y: m.cy - m.r, width: 2 * m.r, height: 2 * m.r };
    fn({ part: 'marker', rect: shifted(rect, ox, oy), stroked: false });
  }
  for (const p of [rule.leadIn, rule.leadOut]) {
    fn({ part: 'path', rect: shifted(pathBox(p), ox, oy), stroked: true });
  }
  visitExpressions(rule, (e, dx, dy) => {
    for (const p of e.paths) fn({ part: 'path', rect: shifted(pathBox(p), dx, dy), stroked: true });
    if (e.box) fn({ part: 'box', rect: shifted(e.box, dx, dy), stroked: true });
    if (e.text) fn({ part: 'text', rect: shifted(e.text.box, dx, dy), stroked: false });
  });
}
