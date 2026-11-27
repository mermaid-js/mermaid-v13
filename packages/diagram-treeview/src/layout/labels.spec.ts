import { beforeAll, describe, expect, it } from 'vitest';
import { Style } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { treeViewTestTheme } from '../test-context.ts';
import { context, tree } from './fixtures.ts';
import { layoutTreeView, type TreeViewLayoutContext } from './index.ts';

// Node labels follow the label rule (#1368, T23): markdown only in a quoted markdown string, tags
// draw, a written `\n` breaks the line; any other label is drawn as written, its blank runs kept.
// The half-em measurer: a character is 8 px wide at 16 px, a line 16 px high, a row 26 px.
let theme: Theme;
beforeAll(async () => {
  theme = await treeViewTestTheme();
});

/** The default mode, and the compatibility mode, which no treeView label kind reads. */
const MODES: readonly [string, (t: Theme) => TreeViewLayoutContext][] = [
  ['default', (t) => context(t)],
  [
    'legacyMarkdown',
    (t) => {
      const c = context(t);
      return { ...c, config: { ...c.config, legacyMarkdown: true } };
    },
  ],
];

/** The lines of runs of the first node's label: each run's text and style. */
function runs(ctx: TreeViewLayoutContext, ...lines: string[]): [string, number][][] | undefined {
  const label = layoutTreeView(tree(...lines), ctx).rows[1]!.label;
  return label.runs?.lines.map((l) => l.map((r): [string, number] => [r.text, r.style]));
}

/** The first node's label text, when it is drawn as written (no runs). */
function written(ctx: TreeViewLayoutContext, line: string): string | undefined {
  const label = layoutTreeView(tree(line), ctx).rows[1]!.label;
  return label.runs === undefined ? label.text : undefined;
}

describe.each(MODES)('node labels, %s mode', (_mode, make) => {
  it('reads a quoted markdown string as markdown, in either quote', () => {
    const ctx = make(theme);
    const md: [string, number][][] = [
      [
        ['x', Style.Bold],
        [' ', 0],
        ['y', Style.Italic],
      ],
    ];
    expect(runs(ctx, '"`**x** _y_`"')).toEqual(md);
    expect(runs(ctx, "'`**x** _y_`'")).toEqual(md);
  });

  it('draws plain markdown, bare backticks and a code span as written', () => {
    const ctx = make(theme);
    expect(written(ctx, '**x** _y_')).toBe('**x** _y_');
    expect(written(ctx, '`**x** _y_`')).toBe('`**x** _y_`');
    expect(written(ctx, '"a `code` b"')).toBe('a `code` b');
  });

  it('leaves file names with underscores, stars and dots untouched', () => {
    const ctx = make(theme);
    for (const name of ['my_file_name.spec.ts', '__init__.py', '*.test.ts', '_private_', 'a__b__c'])
      expect(written(ctx, name)).toBe(name);
  });

  it('keeps a plain name’s blank runs, as v12 drew it', () => {
    const l = layoutTreeView(tree('"a   b"'), make(theme));
    expect([l.rows[1]!.label.text, l.rows[1]!.label.width, l.rows[1]!.label.runs]).toEqual([
      'a   b',
      40,
      undefined,
    ]);
  });

  it('draws the tags', () => {
    expect(runs(make(theme), 'a <b>b</b> H<sub>2</sub>O')).toEqual([
      [
        ['a ', 0],
        ['b', Style.Bold],
        [' H', 0],
        ['2', Style.Sub],
        ['O', 0],
      ],
    ]);
  });

  it('breaks the line at a written \\n and at <br>, in a markdown string too', () => {
    const ctx = make(theme);
    expect(runs(ctx, 'one\\ntwo')).toEqual([[['one', 0]], [['two', 0]]]);
    expect(runs(ctx, 'one<br>two')).toEqual([[['one', 0]], [['two', 0]]]);
    expect(runs(ctx, '"`**one**\\ntwo`"')).toEqual([[['one', Style.Bold]], [['two', 0]]]);
  });

  it('starts a directory’s runs bold', () => {
    expect(runs(make(theme), 'a<i>b</i>/')).toEqual([
      [
        ['a', Style.Bold],
        ['b', Style.Bold | Style.Italic],
      ],
    ]);
    expect(runs(make(theme), '"`_src_`/"')).toEqual([[['src', Style.Bold | Style.Italic]]]);
  });

  it('grows a row by a line for each line after the first, and shifts the rows below', () => {
    const l = layoutTreeView(tree('  one\\ntwo\\nthree', '  next'), make(theme));
    const [, multi, next] = l.rows;
    // Three lines: 16 + 2 × 16 high, the row 10 more; the label centred on the row.
    expect([multi!.label.height, multi!.box, multi!.label.y]).toEqual([
      48,
      { x: 15, y: 26, width: 50, height: 58 },
      55,
    ]);
    expect(next!.box.y).toBe(84);
    // The connector into the row meets its centre; the stem reaches the last row's centre.
    expect(l.lines.find((x) => x.kind === 'branch' && x.row === 1)).toMatchObject({ y1: 55 });
    expect(l.lines.find((x) => x.kind === 'stem')).toMatchObject({ y2: 97.5 });
  });

  it('keeps a one-line label with a tag as high as a plain one', () => {
    const l = layoutTreeView(tree('  <b>a</b>', '  b'), make(theme));
    expect(l.rows.map((r) => r.box.height)).toEqual([26, 26, 26]);
  });
});
