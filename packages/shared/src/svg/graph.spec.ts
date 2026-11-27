import { describe, expect, it } from 'vitest';
import { checkColor, streamWriter, type LabelBox, type OutlineRole } from '@mermaid-js/core/svg';
import { DEFAULT_FONT_FAMILY, tableMeasurer } from '@mermaid-js/core/text';
import { edgeLabel } from './graph.ts';

// A one-line label 40 px wide and 18 px high, and the px profile's room around it (D629).
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

describe('edgeLabel draws an edge label as a tag (D626–D630)', () => {
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

describe('edgeLabel centres the text ink in the tag (#1319)', () => {
  // The default font through the table measurer: trebuchet ms at 14 px.
  const metrics = tableMeasurer.metrics({ family: DEFAULT_FONT_FAMILY, size: 14, weight: 400 });
  const labelOf = (texts: string[]): LabelBox & { width: number } => ({
    lines: texts.map((text) => [{ text }]),
    lineHeight: metrics.lineHeight,
    height: texts.length * metrics.lineHeight,
    baseline: metrics.ascent,
    width: 60,
  });
  const ys = (svg: string): number[] =>
    [...svg.matchAll(/<(?:text|tspan)\b[^>]*\sy="([^"]*)"/g)].map((m) => Number(m[1]));
  // The ink centre sits a tenth of the ascent below the line boxes' centre (graph.ts INK_DROP),
  // so the line boxes go up by that much from the box centre (y 50).
  const lift = metrics.ascent / 10;
  /** The first baseline of a label whose line boxes are centred `lift` above y 50. */
  const firstBaseline = (lines: number): number =>
    50 - lift - (lines * metrics.lineHeight) / 2 + metrics.ascent;

  it('lifts one line so its ink centre is on the box centre, the box unchanged', () => {
    const label = labelOf(['implements']);
    const svg = draw(label);
    const [box] = rects(svg);
    expect(Number(attr(box!, 'height'))).toBeCloseTo(label.height + PATCH.y, 1);
    expect(Number(attr(box!, 'y'))).toBeCloseTo(50 - (label.height + PATCH.y) / 2, 1);
    expect(lift).toBeGreaterThan(1);
    expect(ys(svg)[0]).toBeCloseTo(firstBaseline(1), 1);
  });

  it('lifts a label of three lines as one block', () => {
    const svg = draw(labelOf(['first', 'second', 'third']));
    const lines = ys(svg);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBeCloseTo(firstBaseline(3), 1);
    expect(lines[1]! - lines[0]!).toBeCloseTo(metrics.lineHeight, 1);
    expect(lines[2]! - lines[1]!).toBeCloseTo(metrics.lineHeight, 1);
  });

  it('keeps a label with an inline box centred', () => {
    const box = { kind: 'box', text: '', width: 16, height: 12, baseline: 12, node: { tag: 'g' } };
    const icon: LabelBox & { width: number } = {
      ...labelOf(['x']),
      lines: [[box as LabelBox['lines'][number][number], { text: 'icon' }]],
    };
    expect(ys(draw(icon))[0]).toBeCloseTo(50 - metrics.lineHeight / 2 + metrics.ascent, 1);
  });
});
