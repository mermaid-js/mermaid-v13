import { describe, expect, it } from 'vitest';
import { checkColor, streamWriter, type LabelBox, type OutlineRole } from '@mermaid-js/core/svg';
import { edgeLabel } from './graph.ts';

// A one-line label 40 px wide and 18 px high, and the px profile's room around it (D622).
const ONE: LabelBox & { width: number } = {
  lines: [[{ text: 'A3' }]],
  lineHeight: 18,
  height: 18,
  baseline: 14,
  width: 40,
};
const PATCH = { x: 16, y: 8 };
const c = (hex: string) => checkColor(hex)!;
const paint = {
  fill: c('#ffffff'),
  stroke: c('#ff0000'),
  text: { fill: c('#333333') },
  patch: PATCH,
};

function draw(
  label: LabelBox & { width: number },
  over: Partial<typeof paint> = {},
  outline?: (role: OutlineRole) => void
): string {
  const w = streamWriter(
    outline
      ? {
          outline: (role) => {
            outline(role);
            return false;
          },
        }
      : undefined
  );
  w.open('g');
  edgeLabel(w, label, { x: 100, y: 50 }, 'L1', { ...paint, ...over });
  w.close();
  return w.finish();
}

const rects = (svg: string): string[] => svg.match(/<rect [^>]*\/>/g) ?? [];
const attr = (el: string, name: string): string | undefined =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(el)?.[1];

describe('edgeLabel draws an edge label as a tag (D619–D623)', () => {
  it('borders the box in the stroke the caller passes, 1 px and solid', () => {
    const [box] = rects(draw(ONE, { stroke: c('#123456') }));
    expect(attr(box!, 'stroke')).toBe('#123456');
    expect(attr(box!, 'stroke-width')).toBe('1');
    expect(attr(box!, 'stroke-dasharray')).toBeUndefined();
  });

  it('rounds the corners with radius 6', () => {
    expect(attr(rects(draw(ONE))[0]!, 'rx')).toBe('6');
  });

  it('sizes the box as the label plus the patch, centred on the point', () => {
    const [box] = rects(draw(ONE));
    expect(attr(box!, 'width')).toBe('56');
    expect(attr(box!, 'height')).toBe('26');
    expect(attr(box!, 'x')).toBe('72');
    expect(attr(box!, 'y')).toBe('37');
  });

  it('fills the box with the caller fill, under the text', () => {
    const svg = draw(ONE, { fill: c('#abcdef') });
    expect(attr(rects(svg)[0]!, 'fill')).toBe('#abcdef');
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('<text'));
  });

  it('draws nothing for an empty or whitespace-only label', () => {
    const empty = { ...ONE, lines: [[{ text: '' }]], width: 0 };
    const spaces = { ...ONE, lines: [[{ text: '   ' }], [{ text: ' ' }]], width: 8 };
    expect(draw(empty)).toBe('<g/>');
    expect(draw(spaces)).toBe('<g/>');
  });

  it('draws one box around a label of several lines', () => {
    const two = {
      ...ONE,
      lines: [[{ text: 'first' }], [{ text: 'second' }]],
      height: 36,
    };
    const svg = draw(two);
    expect(rects(svg)).toHaveLength(1);
    expect(attr(rects(svg)[0]!, 'height')).toBe('44');
  });

  it('draws the box through the label outline role', () => {
    const roles: OutlineRole[] = [];
    draw(ONE, {}, (role) => roles.push(role));
    expect(roles).toEqual(['label']);
  });
});
