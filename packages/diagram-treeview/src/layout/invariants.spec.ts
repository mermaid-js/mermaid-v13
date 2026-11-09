import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { treeViewTestTheme } from '../test-context.ts';
import { context, tree } from './fixtures.ts';
import { layoutTreeView, treeViewLayoutViolations, type TreeViewLayout } from './index.ts';

// The checker passes sound layouts and names each broken invariant (the corpus run is
// packages/conformance/src/treeView/layout-corpus.spec.ts).
let theme: Theme;
beforeAll(async () => {
  theme = await treeViewTestTheme();
});

const model = tree(
  '  src/ ## code',
  '    a.ts :::highlight icon(x)',
  '    lib/',
  '      b.ts ## b',
  '  c :::highlight ## last'
);

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;

/** A deep copy of `value`, sharing the model's nodes. */
function copy(value: unknown, key = ''): unknown {
  if (key === 'node' || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => copy(v));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v, k)]));
}

/** A copy of the layout of `model` to break. */
function broken(): Mutable<TreeViewLayout> {
  return copy(layoutTreeView(model, context(theme))) as Mutable<TreeViewLayout>;
}

describe('treeViewLayoutViolations', () => {
  it('passes sound layouts', () => {
    for (const config of [{}, { showIcons: true, rowIndent: 0, paddingX: 0, lineThickness: 7 }])
      expect(
        treeViewLayoutViolations(model, layoutTreeView(model, context(theme, config)), config)
      ).toEqual([]);
  });

  const cases: [string, (l: Mutable<TreeViewLayout>) => void, RegExp][] = [
    ['a NaN', (l) => void (l.rows[2]!.label.x = Number.NaN), /rows\[2\]\.label\.x is NaN/],
    [
      'a missing row',
      (l) => void l.rows.splice(3, 1),
      /row 3 is node:src\/lib\/b\.ts, not node:src\/lib$/m,
    ],
    ['rows out of order', (l) => void l.rows.reverse(), /row 0 is not the root/],
    ['overlapping rows', (l) => void (l.rows[2]!.box.y -= 1), /row 2 starts at 51, not 52/],
    ['a wrong indent', (l) => void (l.rows[4]!.box.x += 1), /row 4 is at x 46, not 45/],
    [
      'a stem ending short',
      (l) => void (l.lines.find((x) => x.kind === 'stem' && x.row === 1)!.y2 -= 1),
      /the stem of row 1 .* not \(20, 52\)–\(20, 91\.5\)/,
    ],
    [
      'a branch into the root',
      (l) => void l.lines.push({ kind: 'branch', row: 0, x1: -10, y1: 13, x2: 0, y2: 13 }),
      /row 0 has 1 branch/,
    ],
    [
      'a description off the column',
      (l) => void (l.rows[4]!.description!.x += 1),
      /description of row 4 is at x \d+, the column at/,
    ],
    [
      'a description over a label',
      (l) => {
        for (const r of l.rows) if (r.description) r.description.x = 20;
      },
      /description column 20 is not clear of row 1's label/,
    ],
    [
      'a lost highlight',
      (l) => void delete l.rows[2]!.highlight,
      /row 2 is highlighted and has no box/,
    ],
    [
      'something outside the bounds',
      (l) => void (l.bounds.width -= 50),
      /row \d's description .* is outside the bounds/,
    ],
  ];

  it.each(cases)('catches %s', (_name, breakIt, message) => {
    const l = broken();
    breakIt(l);
    const v = treeViewLayoutViolations(model, l);
    expect(v.join('\n')).toMatch(message);
  });
});
