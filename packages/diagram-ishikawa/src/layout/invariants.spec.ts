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
        void ishikawaLabelOverlaps(layout);
      }
    }
  });
});
