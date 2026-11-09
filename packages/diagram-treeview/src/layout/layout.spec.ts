import { beforeAll, describe, expect, it } from 'vitest';
import { Style, type Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { treeViewTestTheme } from '../test-context.ts';
import { context, halfEm, styled, tree } from './fixtures.ts';
import { layoutTreeView } from './index.ts';

// Positions worked by hand from v12's renderer.ts:130-216 at v12's defaults (rowIndent 10,
// paddingX 5, paddingY 5, lineThickness 1, labels at 16 px), with the half-em measurer: a
// character is 8 px wide at 16 px and a label 16 px high, so a row is 26 px high.
let theme: Theme;
beforeAll(async () => {
  theme = await treeViewTestTheme();
});

describe('layoutTreeView', () => {
  it('stacks the rows in preorder from the root row, each indented by its depth', () => {
    const l = layoutTreeView(tree('  src/', '    a.ts', '  b'), context(theme));
    expect(l.rows.map((r) => [r.text, r.depth, r.box])).toEqual([
      ['/', 0, { x: 0, y: 0, width: 18, height: 26 }],
      ['src', 1, { x: 15, y: 26, width: 34, height: 26 }],
      ['a.ts', 2, { x: 30, y: 52, width: 42, height: 26 }],
      ['b', 1, { x: 15, y: 78, width: 18, height: 26 }],
    ]);
    // The label sits paddingX in, centred on the row (dominant-baseline middle).
    expect(l.rows.map((r) => [r.label.x, r.label.y, r.label.width, r.label.height])).toEqual([
      [5, 13, 8, 16],
      [20, 39, 24, 16],
      [35, 65, 32, 16],
      [20, 91, 8, 16],
    ]);
    expect([l.width, l.height]).toEqual([72, 104]);
  });

  it('draws a connector into each row but the root, and one down each parent', () => {
    const l = layoutTreeView(tree('  src/', '    a.ts', '  b'), context(theme));
    // v12's order: a row's connector as it is drawn, a parent's after its last descendant's.
    expect(l.lines).toEqual([
      { kind: 'branch', row: 1, x1: 5, y1: 39, x2: 15, y2: 39 },
      { kind: 'branch', row: 2, x1: 20, y1: 65, x2: 30, y2: 65 },
      { kind: 'stem', row: 1, x1: 20, y1: 52, x2: 20, y2: 65.5 },
      { kind: 'branch', row: 3, x1: 5, y1: 91, x2: 15, y2: 91 },
      { kind: 'stem', row: 0, x1: 5, y1: 26, x2: 5, y2: 91.5 },
    ]);
    expect(l.lineThickness).toBe(1);
  });

  it('puts the descriptions in one column past the widest label, the root row included', () => {
    const l = layoutTreeView(
      tree('  src/ ## the code', '    a.ts ## entry', '  b'),
      context(theme)
    );
    // The widest label ends at 35 + 32 = 67; the column is 16 past it.
    expect(
      l.rows.map(
        (r) =>
          r.description && [
            r.description.text,
            r.description.x,
            r.description.y,
            r.description.width,
          ]
      )
    ).toEqual([undefined, ['the code', 83, 39, 64], ['entry', 83, 65, 40], undefined]);
    // The diagram is as wide as the longest description plus paddingX.
    expect(l.width).toBe(83 + 64 + 5);
  });

  it('measures directories bold and descriptions italic, in fontFamily at 16 px', () => {
    // Bold is a whole em per character, italic a quarter, the rest half.
    const l = layoutTreeView(tree('  src/ ## d', '  b'), context(theme, {}, styled));
    expect(l.rows.map((r) => [r.text, r.label.width, r.label.font.weight, r.label.style])).toEqual([
      ['/', 16, 700, Style.Bold],
      ['src', 48, 700, Style.Bold],
      ['b', 8, 400, 0],
    ]);
    const d = l.rows[1]!.description!;
    expect([d.x, d.width, d.font.weight, d.font.size, d.style]).toEqual([
      20 + 48 + 16,
      4,
      400,
      16,
      Style.Italic,
    ]);
    expect(d.font.family).toBe(theme.value('fontFamily'));
    expect(l.width).toBe(84 + 4 + 5);
  });

  it('puts an icon paddingX in and paddingY down, and the label 14 + 4 past it', () => {
    const src = tree('  a.ts', '  b icon(fa:bell)', '  c icon(none)');
    const l = layoutTreeView(src, context(theme, { showIcons: true }));
    expect(l.rows.map((r) => [r.text, r.icon, r.label.x, r.box.width])).toEqual([
      [
        '/',
        { name: 'mermaid-treeview:folder', box: { x: 5, y: 5, width: 14, height: 14 } },
        23,
        36,
      ],
      [
        'a.ts',
        { name: 'mermaid-treeview:file', box: { x: 20, y: 31, width: 14, height: 14 } },
        38,
        60,
      ],
      ['b', { name: 'fa:bell', box: { x: 20, y: 57, width: 14, height: 14 } }, 38, 36],
      ['c', undefined, 20, 18],
    ]);
    // Without showIcons only the icon written draws.
    const plain = layoutTreeView(src, context(theme));
    expect(plain.rows.map((r) => [r.icon?.name, r.label.x])).toEqual([
      [undefined, 5],
      [undefined, 20],
      ['fa:bell', 38],
      [undefined, 20],
    ]);
  });

  it('reads the icon options: defaultIconPack and the maps, by own property', () => {
    const l = layoutTreeView(
      tree('  Dockerfile', '  a.TS', '  constructor', '  b icon(bell)'),
      context(theme, {
        showIcons: true,
        defaultIconPack: 'fa',
        filenameIcons: { Dockerfile: 'docker' },
        extensionIcons: { ts: 'logos:ts' },
      })
    );
    expect(l.rows.map((r) => r.icon?.name)).toEqual([
      'mermaid-treeview:folder',
      'fa:docker',
      'logos:ts',
      'mermaid-treeview:file',
      'fa:bell',
    ]);
  });

  it('backs a highlight row from its indent to 8 past the width, which grows by 10 a row', () => {
    // v12's order: the description column first, then each box in preorder, each widening
    // the diagram to its right edge + 2, so the next box is 10 px wider (GAPS T3).
    const l = layoutTreeView(
      tree('  a :::highlight ## d', '  b :::other', '  bb :::highlight'),
      context(theme)
    );
    // Before the boxes: 'bb' ends at 36, so the description 'd' at 52 + 8, plus paddingX.
    expect(l.rows.map((r) => r.highlight)).toEqual([
      undefined,
      { box: { x: 15, y: 27, width: 65 - 15 + 8, height: 24 }, radius: 3 },
      undefined,
      { box: { x: 15, y: 79, width: 75 - 15 + 8, height: 24 }, radius: 3 },
    ]);
    expect(l.width).toBe(85);
  });

  it("bounds what is drawn by v12's viewBox, -lineThickness / 2 to the width", () => {
    const l = layoutTreeView(tree('  src/', '    a.ts', '  b'), context(theme));
    expect(l.bounds).toEqual({ x: -0.5, y: 0, width: 72, height: 104 });
  });

  it('grows the bounds where v12 cut what it drew (D224)', () => {
    // paddingX 0: the label ends at the width, which v12's viewBox cut by lineThickness / 2.
    const cut = layoutTreeView(tree('  a'), context(theme, { paddingX: 0, lineThickness: 4 }));
    expect([cut.width, cut.rows[1]!.label.x + cut.rows[1]!.label.width]).toEqual([18, 18]);
    expect(cut.bounds).toEqual({ x: -2, y: 0, width: 20, height: 52 });
    // A highlight box's stroke past the viewBox's right edge.
    const hl = layoutTreeView(tree('  a :::highlight'), context(theme, { lineThickness: 5 }));
    expect(hl.rows[1]!.highlight!.box).toEqual({ x: 15, y: 27, width: 26, height: 24 });
    expect(hl.bounds).toEqual({ x: -2.5, y: 0, width: 44, height: 52 });
    // An icon taller than its row.
    const short: Measurer = {
      ...halfEm,
      metrics: () => ({ ascent: 4, descent: 1, lineHeight: 5 }),
    };
    const tall = layoutTreeView(tree('  a icon(x)'), context(theme, { paddingY: 0 }, short));
    expect(tall.height).toBe(10);
    expect(tall.bounds).toEqual({ x: -0.5, y: 0, width: 51, height: 19 });
  });

  it('takes a finite length of 0 or more and falls back to the default otherwise', () => {
    // v12 added a string: rowIndent '20' + paddingX 5 was '205'. Not a length here.
    const l = layoutTreeView(
      tree('  a'),
      context(theme, { rowIndent: '20', paddingX: -1, paddingY: Infinity, lineThickness: null })
    );
    expect(l.rows[1]!.box).toEqual({ x: 15, y: 26, width: 18, height: 26 });
    expect(l.lineThickness).toBe(1);
    const zero = layoutTreeView(tree('  a'), context(theme, { rowIndent: 0, paddingY: 0 }));
    expect(zero.rows[1]!.box).toEqual({ x: 5, y: 16, width: 18, height: 16 });
  });

  it('measures every text at treeViewLabelFontSize, set flat or under treeView (#575)', async () => {
    for (const [vars, size] of [
      [{ treeViewLabelFontSize: 20 }, 20],
      [{ treeView: { labelFontSize: '24px' } }, 24],
      // Not a theme length: the theme keeps v12's 16 px (GAPS T4).
      [{ treeViewLabelFontSize: '1em' }, 16],
    ] as const) {
      const t = await treeViewTestTheme('default', vars);
      const l = layoutTreeView(tree('  src/ ## the code', '    a.ts'), context(t));
      const texts = l.rows.flatMap((r) => [r.label, ...(r.description ? [r.description] : [])]);
      expect(new Set(texts.map((x) => x.font.size)), JSON.stringify(vars)).toEqual(new Set([size]));
      // The half-em measurer: a label is one size high, so a row is that plus 2 × paddingY.
      expect(l.rows[0]!.box.height).toBe(size + 10);
    }
  });

  it('draws the root row alone for a tree with no nodes', () => {
    const l = layoutTreeView(tree(), context(theme));
    expect(l.rows.map((r) => r.text)).toEqual(['/']);
    expect(l.lines).toEqual([]);
    expect(l.bounds).toEqual({ x: -0.5, y: 0, width: 18, height: 26 });
  });

  it('gives an empty name no height, as v12 measured it', () => {
    // `/` alone is a directory named ''.
    const l = layoutTreeView(tree('  /', '  a'), context(theme));
    expect(l.rows.map((r) => [r.text, r.directory, r.box])).toEqual([
      ['/', true, { x: 0, y: 0, width: 18, height: 26 }],
      ['', true, { x: 15, y: 26, width: 10, height: 10 }],
      ['a', false, { x: 15, y: 36, width: 18, height: 26 }],
    ]);
  });

  it('lays out a tree 20 000 deep without running out of stack', () => {
    const lines = Array.from({ length: 20_000 }, (_, d) => `${' '.repeat(d + 1)}d/`);
    const l = layoutTreeView(tree(...lines), context(theme));
    expect(l.rows).toHaveLength(20_001);
    expect(l.rows.at(-1)!.box.x).toBe(20_000 * 15);
    expect(l.lines.filter((x) => x.kind === 'stem')).toHaveLength(20_000);
  });
});
