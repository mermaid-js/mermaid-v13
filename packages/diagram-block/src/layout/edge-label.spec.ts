import { describe, expect, it } from 'vitest';
import type { Arrowheads } from '@mermaid-js/shared/svg/arrowheads';
import { clearTags } from './edge-label.ts';
import type { BlockEdgeLayout, BlockNodeLayout, PlacedLabel, Rect } from './types.ts';

/**
 * The tag placement (#1362) on hand-made layouts: rectangles about their centres, edges with no
 * heads, so only the borders decide where a tag goes.
 */
function rect(id: string, cx: number, cy: number, w: number, h: number, parent?: number) {
  return {
    id,
    shape: 'square',
    ...(parent === undefined ? {} : { parent }),
    box: { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
    outline: { kind: 'rect', width: w, height: h, rx: 0 },
    centre: { x: cx, y: cy },
  } as unknown as BlockNodeLayout;
}

const tagAt = (cx: number, cy: number, w = 20, h = 10): PlacedLabel =>
  ({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }) as unknown as PlacedLabel;

function edge(start: string, end: string, from: number, to: number, label: PlacedLabel) {
  return {
    id: `${start}-${end}`,
    start,
    end,
    kind: 'line',
    points: [
      { x: from, y: 0 },
      { x: (from + to) / 2, y: 0 },
      { x: to, y: 0 },
    ],
    arrowTypeStart: '',
    arrowTypeEnd: '',
    label,
  } as unknown as BlockEdgeLayout;
}

const heads = {} as Arrowheads;
const centreX = (r: Rect): number => r.x + r.width / 2;

describe('clearTags (#1362)', () => {
  it('does not slide a tag wholly inside a block that is not one of its ends', () => {
    // `u` starts 2 px left of the midpoint: sliding 10 px right puts the tag wholly inside it,
    // 14 px left puts it clear of it. Inside `u` would cover `u`'s label.
    const blocks = [
      rect('a', -20, 0, 40, 40),
      rect('u', 188, 0, 80, 60),
      rect('b', 320, 0, 40, 40),
    ];
    const [e] = clearTags([edge('a', 'b', 0, 300, tagAt(150, 0))], blocks, heads);
    const tag = e!.label!;
    expect(tag.x + tag.width).toBeLessThanOrEqual(148);
    expect(centreX(tag)).toBeGreaterThan(0);
  });

  it('lets a tag sit wholly inside a composite that holds both ends', () => {
    // `c` holds `a` and `b`; the tag at the midpoint is inside it and crosses no border.
    const blocks = [
      rect('c', 150, 0, 400, 200),
      rect('a', 20, 0, 40, 40, 0),
      rect('b', 280, 0, 40, 40, 0),
    ];
    const label = tagAt(150, 0);
    const [e] = clearTags([edge('a', 'b', 40, 260, label)], blocks, heads);
    expect(e!.label).toBe(label);
  });

  it('reads a rim point at a block’s exact centre as inside it', () => {
    // The tag's left side runs through `c`'s centre (150, 0); the rest of it is inside `c`.
    const blocks = [
      rect('c', 150, 0, 400, 200),
      rect('a', 20, 0, 40, 40, 0),
      rect('b', 280, 0, 40, 40, 0),
    ];
    const label = tagAt(160, 0);
    const [e] = clearTags([edge('a', 'b', 40, 260, label)], blocks, heads);
    expect(e!.label).toBe(label);
  });

  it('still finds the nearest clear spot to 1 px on a long edge', () => {
    // A row of blocks across a 2000 px edge. The tag starts on the left border of the block
    // spanning 1038 to 1188; the nearest spot 2 px clear of every border has its centre at 1026.
    const blocks = [rect('a', -20, 0, 40, 40), rect('b', 2020, 0, 40, 40)];
    for (let i = 0; i < 9; i++) blocks.push(rect(`w${i}`, 113 + i * 200, 0, 150, 60));
    const [e] = clearTags([edge('a', 'b', 0, 2000, tagAt(1040, 0))], blocks, heads);
    expect(centreX(e!.label!)).toBe(1026);
  });
});
