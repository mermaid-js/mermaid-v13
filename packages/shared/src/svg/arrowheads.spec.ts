import { describe, expect, it } from 'vitest';
import { streamWriter } from '@mermaid-js/core/svg';
import type { Attrs, SafeColor, SvgWriter } from '@mermaid-js/core/svg';
import {
  marker,
  markerTrim,
  pointTrim,
  type Arrowheads,
  type LineEnd,
  type MarkerPaint,
} from './arrowheads.ts';

const g: Arrowheads = {
  gap: 1,
  length: 8,
  width: 6,
  circleSize: 7,
  circleGap: 1,
  crossSize: 8,
  crossGap: 2,
  crossStrokeWidth: 1.5,
};

const red = 'red' as SafeColor;

/** Every paint shape a caller passes: `fill`, then optionally `opacity` and `fill-opacity`. */
const PAINTS: readonly MarkerPaint[] = [
  { fill: red },
  { fill: 'currentColor' },
  { fill: red, opacity: undefined, 'fill-opacity': undefined },
  { fill: red, opacity: 0.5, 'fill-opacity': undefined },
  { fill: red, opacity: undefined, 'fill-opacity': 0.25 },
  { fill: red, opacity: 0.5, 'fill-opacity': 0.25 },
  { fill: undefined, opacity: 0.5 },
];

const ENDS: readonly LineEnd[] = [
  { x: 10, y: 20, dx: 0, dy: 1 },
  { x: -3.5, y: 7.25, dx: 0.6, dy: -0.8 },
];

/** The point head as it was written before: the paint spread into the attributes. */
function spreadPoint(w: SvgWriter, { x, y, dx, dy }: LineEnd, paint: Attrs): void {
  const tipX = x - dx * g.gap;
  const tipY = y - dy * g.gap;
  const baseX = tipX - dx * g.length;
  const baseY = tipY - dy * g.length;
  const acrossX = -dy * (g.width / 2);
  const acrossY = dx * (g.width / 2);
  const d = w
    .path()
    .moveTo(tipX, tipY)
    .lineTo(baseX + acrossX, baseY + acrossY)
    .lineTo(baseX - acrossX, baseY - acrossY)
    .close()
    .done();
  w.leaf('path', { class: 'marker', d, ...paint, stroke: 'none' });
}

function write(draw: (w: SvgWriter) => void): string {
  const w = streamWriter();
  draw(w);
  return w.finish();
}

describe('marker', () => {
  it('writes the point head as the paint spread in would, for every paint shape', () => {
    for (const end of ENDS)
      for (const paint of PAINTS)
        for (const fade of [false, true]) {
          const got = write((w) => marker(w, 'arrow_point', end, paint, g, fade));
          expect(got, JSON.stringify(paint)).toBe(write((w) => spreadPoint(w, end, paint)));
        }
  });

  it('writes the point head paint as fill, opacity, fill-opacity', () => {
    const got = write((w) =>
      marker(w, 'arrow_point', ENDS[0]!, { fill: red, opacity: 0.5, 'fill-opacity': 0.25 }, g)
    );
    expect(got).toMatch(
      /^<path class="marker" d="[^"]+" fill="red" opacity="0.5" fill-opacity="0.25" stroke="none"\/>$/
    );
  });

  it('takes no attribute but the three it writes', () => {
    // Type checks only: a paint with any other attribute does not compile, so the point head,
    // which writes the three by name, cannot leave one out unnoticed.
    const typeChecks = (w: SvgWriter, end: LineEnd, attrs: Attrs): void => {
      // @ts-expect-error -- stroke is not a marker paint attribute
      marker(w, 'arrow_point', end, { fill: red, stroke: red }, g);
      // @ts-expect-error -- nor is class
      marker(w, 'arrow_point', end, { fill: red, class: 'x' }, g);
      // @ts-expect-error -- any attributes, which may hold others
      marker(w, 'arrow_point', end, attrs, g);
    };
    expect(typeof typeChecks).toBe('function');
  });
});

describe('markerTrim', () => {
  const heads = (over: Partial<Arrowheads> = {}): Arrowheads => ({
    ...g,
    gap: 2,
    length: 9,
    ...over,
  });

  it('trims a point head past its gap and under its length less one', () => {
    expect(markerTrim('arrow_point', heads())).toBe(2 + 8);
  });

  it('a point head of length one or less trims its gap only', () => {
    expect(markerTrim('arrow_point', heads({ length: 1 }))).toBe(2);
    expect(markerTrim('arrow_point', heads({ length: 0 }))).toBe(2);
  });

  it('trims a circle or cross head to its middle; any other type not at all', () => {
    expect(markerTrim('arrow_circle', g)).toBe(1 + 3.5);
    expect(markerTrim('arrow_cross', g)).toBe(2 + 4);
    expect(markerTrim('arrow_open', g)).toBe(0);
  });

  it('pointTrim gives the point head trim from its gap and length alone', () => {
    for (const [gap, length] of [
      [2, 9],
      [0, 0],
      [4, 14],
      [0, 1],
      [1.5, 0.5],
    ] as const) {
      expect(pointTrim(gap, length)).toBe(markerTrim('arrow_point', heads({ gap, length })));
    }
  });
});
