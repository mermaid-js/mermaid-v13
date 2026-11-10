import { beforeAll, describe, expect, it } from 'vitest';
import { tableMeasurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { ishikawaTestConfig, ishikawaTestContext, ishikawaTestTheme } from '../test-context.ts';
import { ishikawaLabelOverlaps, ishikawaLayoutViolations } from './invariants.ts';
import { layoutIshikawa } from './layout.ts';
import { FIXTURES, fixture, roundMeasurer } from './mmd.fixtures.ts';

const THEMES = ['default', 'neo', 'redux-dark'];
const themes = new Map<string, Theme>();
beforeAll(async () => {
  for (const t of THEMES)
    themes.set(t, await ishikawaTestTheme(ishikawaTestConfig(undefined, { theme: t })));
});

describe('ishikawa layout invariants on the e2e fixtures', () => {
  it.each(FIXTURES)('%s', (path) => {
    const { model, config } = fixture(path);
    for (const [name, theme] of themes) {
      for (const measurer of [tableMeasurer, roundMeasurer]) {
        const layout = layoutIshikawa(model, ishikawaTestContext(theme, config, [], measurer));
        expect(ishikawaLayoutViolations(model, layout), `${name} ${measurer.id}`).toEqual([]);
      }
    }
  });
});

describe('ishikawa label overlaps (reported, not asserted)', () => {
  const overlapsOf = (path: string): string[] => {
    const { model, config } = fixture(path);
    const theme = themes.get('default')!;
    return ishikawaLabelOverlaps(
      layoutIshikawa(model, ishikawaTestContext(theme, config, [], roundMeasurer))
    );
  };

  it("reports v12's overlap of a pair's boxes with the next pair's on the same side", () => {
    // Six leaf causes: each pair starts at the previous pair's leftmost text, so a box (20 px
    // wider than its text) reaches over the next box on its side; the two sides never meet.
    const found = overlapsOf(
      'pr-check/12-should-render-correctly-when-effect-is-indented-more-than-causes'
    );
    expect(found).toEqual(
      expect.arrayContaining(['cause:1 and cause:3', 'cause:2 and cause:4', 'cause:3 and cause:5'])
    );
    const index = (ast: string): number => Number(ast.slice('cause:'.length));
    for (const pair of found) {
      const [a, b] = pair.split(' and ').map(index);
      expect(Math.abs(a! - b!) % 2, pair).toBe(0);
    }
  });

  it('reports none where the labels stand apart', () => {
    expect(overlapsOf('pr-check/1-should-render-a-simple-ishikawa-diagram')).toEqual([]);
  });
});
