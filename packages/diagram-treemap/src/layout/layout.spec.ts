import { beforeAll, describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { context, leaf, model, section } from './fixtures.ts';
import { layoutTreemap } from './index.ts';

// Positions worked by hand from v12's renderer.ts and d3-hierarchy's squarify (the oracle
// comparison over the corpus is packages/conformance/src/treemap/layout-d3.spec.ts).
let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

describe('layoutTreemap', () => {
  it('fills the padded canvas with one leaf', () => {
    const l = layoutTreemap(model([leaf('a', 1)]), context(theme));
    expect([l.width, l.height, l.titleBand]).toEqual([1000, 400, 0]);
    expect(l.sections).toEqual([]);
    expect(l.leaves.map((x) => x.box)).toEqual([{ x: 10, y: 35, width: 980, height: 355 }]);
  });

  it('squarifies two leaves, rounding each edge', () => {
    // Row [3] sliced to x = 5 + 990·3/4 = 747.5, then [1]; each inset by 5 and rounded.
    const l = layoutTreemap(model([leaf('b', 1), leaf('a', 3)]), context(theme));
    expect(l.leaves.map((x) => [x.node.name, x.box])).toEqual([
      ['a', { x: 10, y: 35, width: 733, height: 355 }],
      ['b', { x: 753, y: 35, width: 237, height: 355 }],
    ]);
  });

  it('moves everything down by the title band, and uses v12 960 × 500 for a 0 size', () => {
    const l = layoutTreemap(
      model([leaf('a', 1)], { title: 'T' }),
      context(theme, { nodeWidth: 0, nodeHeight: 0 })
    );
    expect([l.width, l.height, l.titleBand]).toEqual([960, 500, 30]);
    expect(l.leaves[0]!.box).toEqual({ x: 10, y: 65, width: 940, height: 455 });
    expect(l.title).toMatchObject({ text: 'T', x: 480, y: 15, anchor: 'middle' });
    expect(l.title!.font.size).toBe(14);
  });

  it('places a section header label and its value', () => {
    const l = layoutTreemap(model([section('Section name', leaf('x', 1))]), context(theme));
    const s = l.sections[0]!;
    expect([s.index, s.depth, s.value, s.box]).toEqual([
      1,
      1,
      1,
      { x: 10, y: 35, width: 980, height: 355 },
    ]);
    expect(s.header).toEqual({ x: 10, y: 35, width: 980, height: 25 });
    expect(s.label).toMatchObject({ text: 'Section name', x: 16, y: 47.5, anchor: 'start' });
    expect(s.label!.font).toMatchObject({ size: 12, weight: 700 });
    expect(s.label!.box).toEqual({ x: 16, y: 41.5, width: 72, height: 12 });
    expect(s.valueText).toMatchObject({ text: '1', x: 980, anchor: 'end' });
    expect(s.valueText!.box).toEqual({ x: 975, y: 42.5, width: 5, height: 10 });
    // The leaf: inside the section's margins, label 38 px, value round(38·0.6) = 23 px below it.
    const x = l.leaves[0]!;
    expect(x.box).toEqual({ x: 20, y: 70, width: 960, height: 310 });
    expect(x.label).toMatchObject({ text: 'x', x: 500, y: 225 });
    expect(x.label!.font.size).toBe(38);
    expect(x.valueText).toMatchObject({ text: '1', y: 70 + 155 + 19 + 2, baseline: 'hanging' });
    expect(x.valueText!.font.size).toBe(23);
  });

  it('truncates a header label with ..., or hides it', () => {
    const one = (config: Record<string, unknown>) =>
      layoutTreemap(model([section('Section name', leaf('x', 1))]), context(theme, config))
        .sections[0]!;
    // 40 px wide, no value: room for 28 px, so one character and ... (4 × 6 px).
    expect(one({ nodeWidth: 6, showValues: false }).label?.text).toBe('S...');
    // With a value v12 leaves at least 15 px: not even ... (18 px) fits.
    expect(one({ nodeWidth: 6 }).label).toBeUndefined();
  });

  it('shrinks a leaf label 1 px at a time to its width, and hides it in a small box', () => {
    // 80 px wide, 72 px available: 10 characters fit at 14 px (70 px).
    const fit = layoutTreemap(model([leaf('abcdefghij', 1)]), context(theme, { nodeWidth: 10 }));
    expect(fit.leaves[0]!.label!.font.size).toBe(14);
    expect(fit.leaves[0]!.valueText!.font.size).toBe(8);
    const tiny = layoutTreemap(model([leaf('abcdefghij', 1)]), context(theme, { nodeWidth: 3 }));
    expect(tiny.leaves[0]!.label).toBeUndefined();
    expect(tiny.leaves[0]!.valueText).toBeUndefined();
  });

  it('takes a class font-size as the label start', () => {
    const l = layoutTreemap(
      model([leaf('a', 1, 'big')], {
        classes: [
          { name: 'big', styles: ['font-size:20.7px'], textStyles: [], astId: 'classDef:big' },
        ],
      }),
      context(theme)
    );
    expect(l.leaves[0]!.label!.font.size).toBe(20);
  });

  it('gives v12 colour slots: the hidden root first, leaves by parent, labels by name', () => {
    const l = layoutTreemap(
      model([leaf('z', 1), section('s', leaf('a', 5)), section('t', leaf('a', 2))]),
      context(theme)
    );
    expect(l.sections.map((s) => [s.node.name, s.index, s.fill, s.labelColor])).toEqual([
      ['s', 1, 1, 0],
      ['t', 2, 2, 1],
    ]);
    expect(l.leaves.map((x) => [x.colorKey, x.index, x.fill, x.labelColor])).toEqual([
      ['s', 0, 1, 2],
      ['t', 1, 2, 2],
      ['', 2, 0, 3],
    ]);
  });

  it('formats values with valueFormat, and hides them under showValues: false', () => {
    const m = model([section('s', leaf('a', 1234.5))]);
    expect(layoutTreemap(m, context(theme)).sections[0]!.valueText!.text).toBe('1,234.5');
    expect(
      layoutTreemap(m, context(theme, { valueFormat: '$0,0' })).sections[0]!.valueText!.text
    ).toBe('$1,234.5');
    const off = layoutTreemap(m, context(theme, { showValues: false }));
    expect(off.sections[0]!.valueText).toBeUndefined();
    expect(off.leaves[0]!.valueText).toBeUndefined();
  });

  it('gives a NaN leaf no area and no value (D402)', () => {
    const l = layoutTreemap(model([leaf('a', Number.NaN), leaf('b', 2)]), context(theme));
    const a = l.leaves.find((x) => x.node.name === 'a')!;
    expect(a.value).toBe(0);
    expect(a.box.width * a.box.height).toBe(0);
    expect(a.valueText).toBeUndefined();
  });

  it('decodes entities and prints tags (D405)', () => {
    const l = layoutTreemap(model([leaf('a &amp; &#9829; <b>', 1)]), context(theme));
    expect(l.leaves[0]!.label!.text).toBe('a & ♥ <b>');
  });

  it('bounds what is drawn, padded by diagramPadding; with no rows, the canvas', () => {
    const l = layoutTreemap(model([leaf('a', 1)]), context(theme));
    // The leaf and half its 3 px stroke, then 8 px.
    expect(l.bounds).toEqual({ x: 0.5, y: 25.5, width: 999, height: 374 });
    const empty = layoutTreemap(model([], { title: 'T' }), context(theme, { diagramPadding: 0 }));
    expect(empty.bounds).toEqual({ x: 0, y: 0, width: 1000, height: 430 });
  });
});
