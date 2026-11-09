import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutIshikawa } from '@mermaid-js/diagram-ishikawa';
import {
  ishikawaLabelOverlaps,
  ishikawaLayoutViolations,
  ishikawaTestConfig,
  ishikawaTestContext,
  ishikawaTestTheme,
  parsedIshikawa,
} from '@mermaid-js/diagram-ishikawa/testing';
import type { CorpusItem } from '../types.ts';
import { ishikawaGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, spec #519 T3): every source of the
 * ishikawa gate corpus (e2e fixtures, v12 spec and syntax-page strings, the cases, each in the
 * gate's variants) parsed by the v13 parser, rejected sources included (the model of what
 * parsed), laid out with its front-matter config in a classic (16 px) and two 14 px themes and
 * with two `diagramPadding`s over it, gives no `ishikawaLayoutViolations`, and the same layout
 * on a second run (R-ARCH-6). Label overlaps are reported, not asserted: v12's geometry allows
 * them (spec #519 §Testing).
 */
const THEMES = ['default', 'neo', 'redux-dark'];
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { diagramPadding: 0 },
  { diagramPadding: 50 },
];

const themes = new Map<string, Theme>();
let corpus: CorpusItem[];
beforeAll(async () => {
  for (const t of THEMES) {
    themes.set(t, await ishikawaTestTheme(ishikawaTestConfig(undefined, { theme: t })));
  }
  corpus = await ishikawaGateCorpus();
});

describe('ishikawa layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, every theme and config, and a second run gives the same layout', async ({
    annotate,
  }) => {
    const failures: string[] = [];
    const overlapping = new Set<string>();
    let causes = 0;
    let deep = 0;
    for (const item of corpus) {
      const { model, config: own } = parsedIshikawa(item.source);
      const walk = (cs: typeof model.causes, depth: number): void => {
        for (const c of cs) {
          causes++;
          if (depth >= 3) deep++;
          walk(c.causes, depth + 1);
        }
      };
      walk(model.causes, 1);
      for (const [name, theme] of themes) {
        for (const extra of CONFIGS) {
          const config = { ...own, ...extra };
          const layout = layoutIshikawa(model, ishikawaTestContext(theme, config));
          const v = ishikawaLayoutViolations(model, layout);
          const where = `${item.id} ${name} ${JSON.stringify(extra)}`;
          if (v.length > 0) failures.push(`${where}: ${v.join('; ')}`);
          if (ishikawaLabelOverlaps(layout).length > 0) overlapping.add(item.id);
          const again = layoutIshikawa(model, ishikawaTestContext(theme, config));
          if (JSON.stringify(again) !== JSON.stringify(layout)) {
            failures.push(`${where}: a second run differs`);
          }
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(35);
    expect(causes).toBeGreaterThan(3000);
    expect(deep).toBeGreaterThan(200);
    expect(failures.slice(0, 10)).toEqual([]);
    await annotate(
      `label overlaps (reported, not asserted) in ${overlapping.size} of ${corpus.length} sources`
    );
  }, 300_000);
});
