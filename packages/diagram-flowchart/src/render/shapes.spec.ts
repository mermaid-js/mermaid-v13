import { describe, expect, it } from 'vitest';
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import { drawShape, shapeSize, type Pads } from './shapes.ts';

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
