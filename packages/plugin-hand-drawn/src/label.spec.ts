/**
 * An edge label's box under `look: handDrawn` (D623): it reaches the drawer as role `label`, its
 * 1 px border is sketched like a node's outline, and its fill stays plain (no hachure).
 */
import { checkColor, streamWriter, type Attrs } from '@mermaid-js/core/svg';
import { describe, expect, it } from 'vitest';
import { activate, draw } from './drawer.ts';

const BOX: Attrs = {
  x: 10,
  y: 20,
  width: 56,
  height: 26,
  rx: 6,
  fill: checkColor('#ffffff'),
  stroke: checkColor('#ff0000'),
  'stroke-width': 1,
};

function sketchLabel(): string {
  activate({ handDrawn: true, handDrawnSeed: 1 });
  const w = streamWriter();
  w.open('g');
  expect(draw('label', 'rect', BOX, w)).toBe(true);
  w.close();
  return w.finish();
}

describe('the edge-label role (D623)', () => {
  it('sketches the border in the box stroke, 1 px wide', () => {
    const svg = sketchLabel();
    expect(svg).not.toContain('<rect');
    const border = (svg.match(/<path [^>]*\/>/g) ?? []).filter((p) => p.includes('#ff0000'));
    expect(border).toHaveLength(1);
    expect(border[0]).toContain('fill="none"');
    expect(border[0]).toContain('stroke-width="1"');
  });

  it('fills the box plain, not hatched', () => {
    const paths = sketchLabel().match(/<path [^>]*\/>/g) ?? [];
    // A solid fill is one filled path with no stroke; hachure would be stroked fill lines.
    const fills = paths.filter((p) => p.includes('fill="#ffffff"'));
    expect(fills).toHaveLength(1);
    expect(fills[0]).toContain('stroke="none"');
    expect(paths.filter((p) => p.includes('stroke="#ffffff"'))).toEqual([]);
  });
});
