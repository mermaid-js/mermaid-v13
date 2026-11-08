import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutVenn } from '@mermaid-js/diagram-venn';
import {
  parsedVenn,
  vennLayoutViolations,
  vennTestContext,
  vennTestTheme,
} from '@mermaid-js/diagram-venn/testing';
import type { CorpusItem } from '../types.ts';
import { vennGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, spec #429 T3): every source of the
 * venn gate corpus (e2e fixtures, v12 spec and syntax-page strings, the cases, each in the
 * gate's variants) parsed by the v13 parser, rejected sources included (the model of what
 * parsed), laid out with its front-matter config and four `venn` configs over it, gives no
 * `vennLayoutViolations`, and the same layout on a second run (R-ARCH-6, D413).
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { width: 500, height: 600, padding: 40 },
  { width: 300, height: 300, padding: 0, useDebugLayout: true },
  { width: 1600, height: 200 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await vennTestTheme();
  corpus = await vennGateCorpus();
});

describe('venn layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus and every config, and a second run gives the same layout', () => {
    const failures: string[] = [];
    let sets = 0;
    let wide = 0;
    let texts = 0;
    for (const item of corpus) {
      const { model, config: own } = parsedVenn(item.source);
      sets += model.subsets.length;
      if (new Set(model.subsets.flatMap((s) => s.sets)).size >= 4) wide++;
      texts += model.textNodes.length;
      for (const venn of CONFIGS) {
        const config = { ...own, ...venn };
        const layout = layoutVenn(model, vennTestContext(theme, config));
        const v = vennLayoutViolations(model, layout);
        if (v.length > 0) failures.push(`${item.id} ${JSON.stringify(venn)}: ${v.join('; ')}`);
        const again = layoutVenn(model, vennTestContext(theme, config));
        if (JSON.stringify(again) !== JSON.stringify(layout)) {
          failures.push(`${item.id} ${JSON.stringify(venn)}: a second run differs`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(58);
    expect(sets).toBeGreaterThan(3000);
    expect(wide).toBeGreaterThan(20);
    expect(texts).toBeGreaterThan(500);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
