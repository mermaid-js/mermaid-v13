import { describe, expect, it } from 'vitest';
import { streamWriter, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import { drawShape, shapeInset, shapeSize, type Pads } from './shapes.ts';

const xy = { x: 16, y: 8 };
const PADS: Pads = {
  node: xy,
  r: 5,
  pad: 15,
  stadium: xy,
  hexagon: xy,
  hexagonSlant: 4,
  subroutine: xy,
  cylinder: xy,
  lean: xy,
  odd: xy,
  ringGap: 5,
  ringPad: 5,
  circlePad: 10,
  circleMin: 30,
};

/** The outlines `shape` draws for a label `tw` × `th`, and the label's shift from the centre. */
function person(tw: number, th: number) {
  const size = shapeSize('person', tw, th, PADS);
  const drawn: { tag: string; attrs: Attrs }[] = [];
  const w = {
    outline: (_role: string, tag: string, attrs: Attrs) => void drawn.push({ tag, attrs }),
  } as unknown as SvgWriter;
  drawShape({
    kind: 'person',
    w,
    width: size.w,
    height: size.h,
    attrs: {},
    lines: {},
    pads: PADS,
  });
  const n = (tag: string, key: string) =>
    Number((drawn.find((d) => d.tag === tag)?.attrs as Record<string, unknown> | undefined)?.[key]);
  const body = { top: n('rect', 'y'), width: n('rect', 'width'), height: n('rect', 'height') };
  const head = { cy: n('circle', 'cy'), r: n('circle', 'r') };
  const labelTop = size.dy - th / 2;
  return { size, body, head, labelTop, labelBottom: labelTop + th };
}

/**
 * The person shape keeps c4model.com's proportions (#683, as v12's fix mermaid-js/mermaid#8322):
 * 12.2.0's head was a fixed 13 px over a body as tall as its label, so a one-line label drew a
 * small head on a wide flat bar (body 152 × 40).
 */
describe('the person shape (#683)', () => {
  it('keeps the body at least 0.6 times as tall as it is wide for a one-line label', () => {
    const { body, head } = person(120, 24);
    expect(body.width).toBe(152);
    expect(body.height).toBeGreaterThanOrEqual(body.width * 0.6 - 1e-9);
    expect(head.r).toBeCloseTo(152 * 0.23, 9);
  });

  it('grows the body to fit a tall label below the head', () => {
    const { body, head, labelTop, labelBottom } = person(100, 300);
    expect(labelTop).toBeGreaterThanOrEqual(head.cy + head.r - 1e-9);
    expect(labelBottom).toBeLessThanOrEqual(body.top + body.height + 1e-9);
  });

  it('centres the label on the part of the body the head does not cover', () => {
    const { body, head, labelTop, labelBottom } = person(200, 20);
    expect(labelTop - (head.cy + head.r)).toBeCloseTo(body.top + body.height - labelBottom, 9);
  });

  it.each([
    [8, 16],
    [248, 64.4],
    [1000, 80],
  ])('scales the head with the body, from 16 up to 80, for a %s px label', (tw, r) => {
    expect(person(tw, 20).head.r).toBeCloseTo(r, 9);
  });

  it('fills its box: the head at the top, the body to the bottom, overlapping', () => {
    const { size, body, head } = person(120, 24);
    expect(head.cy - head.r).toBeCloseTo(-size.h / 2, 9);
    expect(body.top + body.height).toBeCloseTo(size.h / 2, 9);
    expect(body.top).toBeLessThan(head.cy + head.r);
  });
});

type Pt = readonly [number, number];

/** The closed outlines a shape's markup draws, every layer as one polygon (waves flattened). */
function outlines(kind: string, W: number, H: number): Pt[][] {
  const w = streamWriter();
  drawShape({ kind, w, width: W, height: H, attrs: {}, lines: {}, pads: PADS });
  const svg = w.finish();
  const shift: Pt[] = [[0, 0]];
  const polygons: Pt[][] = [];
  for (const m of svg.matchAll(/<(\/?)(g|polygon|rect|path)\b([^>]*)>/g)) {
    const [, closing, tag, attrs] = m;
    const [dx, dy] = shift.at(-1)!;
    const attr = (k: string): string => new RegExp(`\\b${k}="([^"]*)"`).exec(attrs!)?.[1] ?? '';
    if (tag === 'g') {
      if (closing) shift.pop();
      else {
        const t = /translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/.exec(attr('transform'));
        shift.push(t ? [dx + Number(t[1]), dy + Number(t[2])] : [dx, dy]);
      }
    } else if (!closing) {
      const at = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
      if (tag === 'polygon') {
        const n = attr('points').split(/[ ,]+/).map(Number);
        polygons.push(
          Array.from({ length: n.length / 2 }, (_, i) => at([n[2 * i]!, n[2 * i + 1]!]))
        );
      } else if (tag === 'rect') {
        const [x, y, rw, rh] = ['x', 'y', 'width', 'height'].map((k) => Number(attr(k)));
        polygons.push([
          at([x!, y!]),
          at([x! + rw!, y!]),
          at([x! + rw!, y! + rh!]),
          at([x!, y! + rh!]),
        ]);
      } else polygons.push(flatten(attr('d')).map(at));
    }
  }
  return polygons;
}

/** A path of M, L, Q and Z commands as points, each curve in 40 steps. */
function flatten(d: string): Pt[] {
  const out: Pt[] = [];
  const nums = (s: string) => s.trim().split(/[ ,]+/).map(Number);
  for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQZ]*)/g)) {
    const n = nums(args!);
    const last = out.at(-1)!;
    if (cmd === 'Q') {
      for (let k = 1; k <= 40; k++) {
        const u = k / 40;
        const b = (i: number) =>
          (1 - u) ** 2 * last[i]! + 2 * (1 - u) * u * n[i]! + u ** 2 * n[i + 2]!;
        out.push([b(0), b(1)]);
      }
    } else out.push([n[0]!, n[1]!]);
  }
  return out;
}

/** The distance from `p` to the polygon's edge, and whether `p` is inside it. */
function against(poly: Pt[], p: Pt): { dist: number; inside: boolean } {
  let dist = Infinity;
  let inside = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
    const k = Math.max(
      0,
      Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey || 1))
    );
    dist = Math.min(dist, Math.hypot(p[0] - a[0] - k * ex, p[1] - a[1] - k * ey));
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * ex)
      inside = !inside;
  }
  return { dist, inside };
}

/** Where an edge meeting `side` of the box at `t` ends once the shape's inset is applied. */
function edgeEnd(kind: string, W: number, H: number, side: number, t: number): Pt {
  const a = shapeInset(kind, W, H, side, t, PADS);
  if (side === 0) return [t, -H / 2 + a];
  if (side === 2) return [t, H / 2 - a];
  return side === 1 ? [W / 2 - a, t] : [-W / 2 + a, t];
}

/** Whether `p` lies on the outer outline of the layers: on one, and not inside another. */
function onOutline(layers: Pt[][], p: Pt): boolean {
  const hits = layers.map((l) => against(l, p));
  return hits.some((h) => h.dist <= 1) && hits.every((h) => !h.inside || h.dist <= 1);
}

const STACKS = ['tri', 'flip-tri', 'st-rect', 'docs'];
const LABELS: [number, number][] = [
  [80, 20],
  [232, 20],
  [60, 60],
];

describe('extended shapes: triangles and stacks (#395, #403, D603)', () => {
  it.each(LABELS)('keeps a %s × %s label inside tri and flip-tri', (tw, th) => {
    for (const [kind, flip] of [
      ['tri', false],
      ['flip-tri', true],
    ] as const) {
      const s = shapeSize(kind, tw, th, PADS);
      const sign = flip ? -1 : 1;
      // The label's corners nearest the slanted sides: the end of its far line from the apex.
      const edgeY = s.dy + (sign * th) / 2;
      const [layer] = outlines(kind, s.w, s.h);
      for (const x of [-tw / 2, tw / 2])
        for (const y of [edgeY, s.dy - (sign * th) / 2]) {
          const { dist, inside } = against(layer!, [x, y]);
          expect(inside || dist < 1e-9).toBe(true);
        }
      // The label clears the sides, and the triangle is not flat.
      const apex = flip ? s.h / 2 : -s.h / 2;
      const across = (Math.abs(edgeY - apex) / s.h) * s.w;
      const clearTop = (Math.abs(s.dy - (sign * th) / 2 - apex) / s.h) * s.w;
      expect(Math.min(across, clearTop) - tw).toBeGreaterThan(0);
      expect(s.h).toBe(s.w);
      expect(s.h).toBeGreaterThan(tw);
    }
  });

  it('sizes the triangle as v12 did: label width, padding and label height', () => {
    expect(shapeSize('tri', 100, 20, PADS)).toEqual({ w: 135, h: 135, dy: 135 / 2 - 10 - 7.5 });
    expect(shapeSize('flip-tri', 100, 20, PADS).dy).toBe(-(135 / 2 - 10 - 7.5));
  });

  it('offsets stacked rectangles by 5 and stacked documents by 10 (D603)', () => {
    const rect = shapeSize('st-rect', 100, 20, PADS);
    const plain = shapeSize('rect', 100, 20, PADS);
    expect(rect.w - plain.w).toBe(10);
    expect(rect.h - plain.h).toBe(10);
    const [back, , front] = outlines('st-rect', rect.w, rect.h);
    expect(back![0]![0] - front![0]![0]).toBe(10);
    expect(front![0]![1] - back![0]![1]).toBe(10);
    const docs = shapeSize('docs', 100, 20, PADS);
    const one = shapeSize('doc', 100, 20, PADS);
    expect(docs.w - one.w).toBe(20);
    expect(docs.h - one.h).toBe(20);
    const [d0, , d2] = outlines('docs', docs.w, docs.h);
    expect(d0![0]![0] - d2![0]![0]).toBe(20);
    expect(d2![0]![1] - d0![0]![1]).toBe(20);
  });

  it.each([
    ['st-rect', 5],
    ['docs', 10],
  ])('centres the label of %s across the front layer, %s px left of the box', (kind, s) => {
    const size = shapeSize(kind, 100, 20, PADS);
    expect(size.dx).toBe(-s);
    const front = outlines(kind, size.w, size.h)[2]!;
    const xs = front.map((p) => p[0]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(size.dx!, 9);
  });

  it.each(STACKS.flatMap((kind) => LABELS.map(([tw, th]) => [kind, tw, th] as const)))(
    'ends every edge off the centre on the outline of %s, label %s × %s',
    (kind, tw, th) => {
      const { w: W, h: H } = shapeSize(kind, tw, th, PADS);
      const layers = outlines(kind, W, H);
      const bad: string[] = [];
      for (let side = 0; side < 4; side++) {
        const half = (side & 1 ? H : W) / 2;
        for (let k = -9; k <= 9; k++) {
          // Edges spread over the middle of a side, as far as the layout's span and corner allow.
          const t = (k / 10) * half * 0.8;
          const end = edgeEnd(kind, W, H, side, t);
          if (!onOutline(layers, end)) bad.push(`side ${side} t ${t.toFixed(1)}`);
        }
      }
      expect(bad).toEqual([]);
    }
  );
});
