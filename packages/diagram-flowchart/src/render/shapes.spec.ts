import { describe, expect, it } from 'vitest';
import { checkColor, streamWriter, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import { cloudOutline, outlineBox } from '@mermaid-js/shared/shapes/outline';
import { shapeNames } from '../parser/shapes.ts';
import {
  canonicalShape,
  drawShape,
  isDrawnShape,
  shapeInset,
  shapeSize,
  shapeSpan,
  framed,
  type Pads,
} from './shapes.ts';
import type { Frame } from '@mermaid-js/shared/shapes/kit';

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
function outlines(kind: string, W: number, H: number, frame?: Frame): Pt[][] {
  const w = streamWriter();
  drawShape({ kind, w, width: W, height: H, attrs: {}, lines: {}, pads: PADS, frame });
  const svg = w.finish();
  const shift: Pt[] = [[0, 0]];
  const polygons: Pt[][] = [];
  for (const m of svg.matchAll(/<(\/?)(g|polygon|rect|path|circle)\b([^>]*)>/g)) {
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
        const r = Math.min(Number(attr('rx') || 0), rw! / 2, rh! / 2);
        // Each corner's quarter arc, clockwise from the top left.
        const corners: [number, number, number][] = [
          [x! + r, y! + r, Math.PI],
          [x! + rw! - r, y! + r, -Math.PI / 2],
          [x! + rw! - r, y! + rh! - r, 0],
          [x! + r, y! + rh! - r, Math.PI / 2],
        ];
        polygons.push(
          corners.flatMap(([cx, cy, a]) =>
            Array.from({ length: 11 }, (_, i) => {
              const b = a + (i * Math.PI) / 20;
              return at([cx + r * Math.cos(b), cy + r * Math.sin(b)]);
            })
          )
        );
      } else if (tag === 'circle') {
        const [cx, cy, r] = ['cx', 'cy', 'r'].map((k) => Number(attr(k) || 0));
        polygons.push(
          Array.from({ length: 80 }, (_, i) => {
            const a = (i * Math.PI) / 40;
            return at([cx! + r! * Math.cos(a), cy! + r! * Math.sin(a)]);
          })
        );
      } else polygons.push(flatten(attr('d')).map(at));
    }
  }
  return polygons;
}

/** The points of an SVG arc (no rotation) from `from`, in 40 steps. */
function arc(from: Pt, [rx0, ry0, , large, sweep, x, y]: number[]): Pt[] {
  const [hx, hy] = [(from[0] - x!) / 2, (from[1] - y!) / 2];
  const grow = Math.sqrt(Math.max(1, (hx / rx0!) ** 2 + (hy / ry0!) ** 2));
  const [rx, ry] = [rx0! * grow, ry0! * grow];
  const den = rx * rx * hy * hy + ry * ry * hx * hx;
  const k =
    (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - den) / (den || 1)));
  const [cx, cy] = [(k * rx * hy) / ry, (-k * ry * hx) / rx];
  const a0 = Math.atan2((hy - cy) / ry, (hx - cx) / rx);
  let da = Math.atan2((-hy - cy) / ry, (-hx - cx) / rx) - a0;
  if (sweep && da < 0) da += 2 * Math.PI;
  if (!sweep && da > 0) da -= 2 * Math.PI;
  const [mx, my] = [(from[0] + x!) / 2, (from[1] + y!) / 2];
  return Array.from({ length: 40 }, (_, i): Pt => {
    const a = a0 + (da * (i + 1)) / 40;
    return [mx + cx + rx * Math.cos(a), my + cy + ry * Math.sin(a)];
  });
}

/** A path of M, L, Q, A and Z commands as points, each curve in 40 steps. */
function flatten(d: string): Pt[] {
  const out: Pt[] = [];
  const nums = (s: string) => s.trim().split(/[ ,]+/).map(Number);
  for (const [, cmd, args] of d.matchAll(/([MLQA])([^MLQAZ]*)/g)) {
    const n = nums(args!);
    const last = out.at(-1)!;
    if (cmd === 'Q') {
      for (let k = 1; k <= 40; k++) {
        const u = k / 40;
        const b = (i: number) =>
          (1 - u) ** 2 * last[i]! + 2 * (1 - u) * u * n[i]! + u ** 2 * n[i + 2]!;
        out.push([b(0), b(1)]);
      }
    } else if (cmd === 'A') out.push(...arc(last, n));
    else out.push([n[0]!, n[1]!]);
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
function edgeEnd(kind: string, W: number, H: number, side: number, t: number, frame?: Frame): Pt {
  const a = shapeInset(kind, W, H, side, t, framed(PADS, frame));
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

  it.each(LABELS)(
    'ends an edge at or beyond the corner of the bottom of docs on the outline, label %s × %s',
    (tw, th) => {
      const { w: W, h: H } = shapeSize('docs', tw, th, PADS);
      const layers = outlines('docs', W, H);
      for (const t of [-W / 2 - 100, -W / 2 - 1, -W / 2, W / 2, W / 2 + 1, W / 2 + 100]) {
        const a = shapeInset('docs', W, H, 2, t, PADS);
        expect(Number.isFinite(a), `t ${t}`).toBe(true);
        // At the corner itself, the end lies on the outer outline.
        if (Math.abs(t) <= W / 2) expect(onOutline(layers, edgeEnd('docs', W, H, 2, t))).toBe(true);
      }
      // Beyond the corner is the corner.
      expect(shapeInset('docs', W, H, 2, W / 2 + 100, PADS)).toBe(
        shapeInset('docs', W, H, 2, W / 2, PADS)
      );
      expect(shapeInset('docs', W, H, 2, -W / 2 - 100, PADS)).toBe(
        shapeInset('docs', W, H, 2, -W / 2, PADS)
      );
    }
  );

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

/** Kept clear at each end of a flat side (`CORNER` in `shared/src/shapes/kit.ts`). */
const CORNER = 12;
/** The layout's pitches between ends on one side (`portPitch`, `minPitch`, core `units.ts`). */
const PORT_PITCH = 16;
const MIN_PITCH = 8;
/** Drawn shapes whose ends stay at the middle of a side: a point. */
const UNSPREAD = ['anchor'];
/** The shapes #1157 and #1164 give a span, and the slanted family's sideways one (#1149). */
const SPREAD = [
  ...['hourglass', 'bolt', 'tri', 'flip-tri', 'sl-rect', 'h-cyl', 'delay', 'curv-trap'],
  ...['bow-rect', 'doc', 'tag-doc', 'lin-doc', 'docs', 'flag', 'folder', 'bucket', 'person'],
  ...['bang', 'choice', 'brace', 'brace-r', 'braces', 'cloud', 'browser', 'console'],
  ...['lean-r', 'lean-l', 'trap-b', 'trap-t', 'odd'],
];

describe('edge ends spread along every shape (#1149, #1157, #1164)', () => {
  it('gives every drawn shape a span both ways but a point', () => {
    const drawn = [...new Set(shapeNames().map(canonicalShape))].filter(isDrawnShape);
    const none = drawn.filter((kind) => {
      const { w, h } = shapeSize(kind, 80, 20, PADS);
      return shapeSpan(kind, w, h, false) <= 0 || shapeSpan(kind, w, h, true) <= 0;
    });
    expect(none.sort()).toEqual(UNSPREAD);
  });

  it.each(
    SPREAD.flatMap((kind) =>
      [false, true].flatMap((sideways) =>
        LABELS.map(([tw, th]) => [kind, sideways, tw, th] as const)
      )
    )
  )(
    'ends two edges on one side of %s apart and every end on the outline, sideways %s, label %s × %s',
    (kind, sideways, tw, th) => {
      const { w: W, h: H, frame } = shapeSize(kind, tw, th, PADS);
      const span = shapeSpan(kind, W, H, sideways);
      // Two edges on a side get places at least `minPitch` apart, where the side has room for
      // that past its corners (a lean shape 33.6 high gives 9.6, decision 2 of #1163).
      const room = (sideways ? H : W) >= 2 * CORNER + MIN_PITCH;
      if (room) expect(span).toBeGreaterThanOrEqual(MIN_PITCH);
      const pitch = Math.min(PORT_PITCH, span);
      // A bang's ends stop on the polygon through its spikes' tips, not in the notches.
      const drawn = outlines(kind, W, H, frame);
      const layers = kind === 'bang' ? [drawn[0]!.filter((_, i) => i % 2 === 0)] : drawn;
      const bad: string[] = [];
      for (const side of sideways ? [1, 3] : [0, 2]) {
        const [a, b] = [-pitch / 2, pitch / 2].map((t) => edgeEnd(kind, W, H, side, t, frame));
        if (room && Math.hypot(a![0] - b![0], a![1] - b![1]) < MIN_PITCH)
          bad.push(`side ${side} shared`);
        for (let k = -5; k <= 5; k++) {
          const t = (k / 10) * span;
          if (!onOutline(layers, edgeEnd(kind, W, H, side, t, frame)))
            bad.push(`side ${side} t ${t.toFixed(1)}`);
        }
      }
      expect(bad).toEqual([]);
    }
  );

  it.each([0, 1, 2, 3])(
    'ends an edge at the middle of side %s of the bolt on its outline',
    (side) => {
      const { w: W, h: H } = shapeSize('bolt', 0, 0, PADS);
      const [x, y] = edgeEnd('bolt', W, H, side, 0);
      expect(against(outlines('bolt', W, H)[0]!, [x, y]).dist).toBeLessThan(1e-9);
    }
  );
});

const FILL = checkColor('#ffffff')!;
const INK = checkColor('#333333')!;

/** The elements a shape writes, in order, with their attributes and text. */
function elements(kind: string, tw: number, th: number) {
  const size = shapeSize(kind, tw, th, PADS);
  const w = streamWriter();
  drawShape({
    kind,
    w,
    width: size.w,
    height: size.h,
    attrs: { fill: FILL, stroke: INK, 'stroke-width': 2 },
    lines: { stroke: INK, 'stroke-width': 2 },
    pads: PADS,
    frame: size.frame,
  });
  const els = [...w.finish().matchAll(/<(\w+)([^>]*?)\/?>([^<]*)/g)].map(
    ([, tag, attrs, text]) => ({
      tag: tag!,
      text: text!,
      ...Object.fromEntries(
        [...attrs!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!])
      ),
    })
  ) as ({ tag: string; text: string } & Record<string, string>)[];
  return { size, els };
}

/** The box a set of polygons covers. */
function boxOf(polys: Pt[][]) {
  const xs = polys.flat().map((p) => p[0]);
  const ys = polys.flat().map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// v12 at 63333fd8db (`browser.ts`, `console.ts`, `cloud.ts`, `waveRectangle.ts`, `forkJoin.ts`,
// `stateEnd.ts`), with v12's `padding` (15, PADS.pad) round the label; fork and fr-circ hollow,
// as v12 flowcharts showed them (decision 4 of #1163).
describe('the v12 look of browser, cloud, console, flag, fork and fr-circ (#1152, #1167)', () => {
  it('browser: rounded 12, at least 90 wide, an 18 high bar with three dots and an address bar', () => {
    const { size, els } = elements('browser', 40, 20);
    expect(size).toEqual({ w: 90, h: 68, dy: 9 });
    expect(shapeSize('browser', 200, 20, PADS).w).toBe(230);
    const [frame, bar, ...rest] = els;
    expect(frame).toMatchObject({
      tag: 'rect',
      x: '-45',
      y: '-34',
      width: '90',
      height: '68',
      rx: '12',
    });
    expect(bar).toMatchObject({ tag: 'path', d: 'M-45,-16L45,-16', stroke: '#333333' });
    const dots = rest.filter((e) => e.tag === 'circle');
    expect(dots.map((d) => [d.cx, d.cy, d.r, d.fill, d.stroke])).toEqual(
      ['-33', '-24', '-15'].map((cx) => [cx, '-25', '2.5', '#333333', 'none'])
    );
    expect(rest.at(-1)).toMatchObject({
      tag: 'rect',
      x: '-1',
      y: '-30',
      width: '34',
      height: '10',
      rx: '3',
      fill: 'none',
      stroke: '#333333',
      opacity: '0.6',
    });
  });

  it('console: rounded 12, at least 90 wide, a 20 high glyph band, `>_` as monospace text', () => {
    const { size, els } = elements('console', 40, 20);
    expect(size).toEqual({ w: 90, h: 70, dy: 10 });
    expect(els.map((e) => e.tag)).toEqual(['rect', 'text']);
    expect(els[0]).toMatchObject({ x: '-45', y: '-35', width: '90', height: '70', rx: '12' });
    expect(els[1]).toMatchObject({
      x: '-33',
      y: '-19',
      'font-family': 'monospace',
      'font-weight': 'bold',
      'font-size': '14',
      fill: '#333333',
      text: '&gt;_',
    });
  });

  it("cloud: v12's ten arcs round the label and its padding, the node the box they cover", () => {
    const { size, els } = elements('cloud', 40, 20);
    const box = outlineBox(cloudOutline(55, 35));
    expect(size.w).toBeCloseTo(box.x1 - box.x0, 9);
    expect(size.h).toBeCloseTo(box.y1 - box.y0, 9);
    // The label stays at the frame's centre.
    expect(size.dx).toBeCloseTo(-(box.x0 + box.x1) / 2, 9);
    expect(size.dy).toBeCloseTo(-(box.y0 + box.y1) / 2, 9);
    expect(els).toHaveLength(1);
    expect(els[0]!.d!.match(/A/g)).toHaveLength(10);
    const drawn = boxOf(outlines('cloud', size.w, size.h, size.frame));
    for (const [k, v] of Object.entries({
      x0: -size.w / 2,
      x1: size.w / 2,
      y0: -size.h / 2,
      y1: size.h / 2,
    }))
      expect(Math.abs(drawn[k as keyof typeof drawn] - v), k).toBeLessThan(0.5);
  });

  it('flag: one sine cycle top and bottom, amplitude an eighth of the padded height', () => {
    const { size } = elements('flag', 40, 20);
    // 40 + 2 · 15 wide; the waves are h / 8 = 35 / 8 deep about a body 35 · 1.25 high.
    expect(size).toEqual({ w: 70, h: 52.5, dy: 0 });
    const [poly] = outlines('flag', size.w, size.h);
    const a = 35 / 8;
    // v12's 50 steps a side: the point nearest `x` (1.4 apart here).
    const yAt = (pts: Pt[], x: number, top: boolean) =>
      pts.find((p) => Math.abs(p[0] - x) <= 0.7 && p[1] < 0 === top)![1];
    // The top right bulges up to the box, the bottom left down to it.
    expect(yAt(poly!, 17.5, true)).toBeCloseTo(-26.25, 1);
    expect(yAt(poly!, -17.5, true)).toBeCloseTo(-26.25 + 2 * a, 1);
    expect(yAt(poly!, -17.5, false)).toBeCloseTo(26.25, 1);
    expect(yAt(poly!, 35, true)).toBeCloseTo(-26.25 + a, 1);
    expect(shapeInset('flag', size.w, size.h, 0, 17.5, PADS)).toBeCloseTo(0, 9);
    expect(shapeInset('flag', size.w, size.h, 0, -17.5, PADS)).toBeCloseTo(2 * a, 9);
    expect(shapeInset('flag', size.w, size.h, 2, 17.5, PADS)).toBeCloseTo(2 * a, 9);
  });

  it('fork: a 70 × 10 bar with square corners, filled and stroked as the outline', () => {
    const { size, els } = elements('fork', 0, 0);
    expect(size).toEqual({ w: 70, h: 10, dy: 0 });
    expect(els).toHaveLength(1);
    expect(els[0]).toMatchObject({
      tag: 'rect',
      width: '70',
      height: '10',
      fill: '#ffffff',
      stroke: '#333333',
    });
    expect(els[0]!.rx).toBeUndefined();
  });

  it('fr-circ: a circle 14 across round one 5 across, both hollow', () => {
    const { size, els } = elements('fr-circ', 0, 0);
    expect(size).toEqual({ w: 14, h: 14, dy: 0 });
    expect(els.map((e) => [e.tag, e.r, e.fill, e.stroke])).toEqual([
      ['circle', '7', '#ffffff', '#333333'],
      ['circle', '2.5', '#ffffff', '#333333'],
    ]);
  });
});
