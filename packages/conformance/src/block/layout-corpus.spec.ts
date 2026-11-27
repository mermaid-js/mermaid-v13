import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutBlock } from '@mermaid-js/diagram-block';
import {
  blockLayoutViolations,
  blockTestContext,
  blockTestTheme,
  parsedBlock,
} from '@mermaid-js/diagram-block/testing';
import type { CorpusItem } from '../types.ts';
import { blockGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, spec #521 T3): every source of the
 * block gate corpus (e2e fixtures, v12 spec and syntax-page strings, the cases, each in the
 * gate's variants) parsed by the v13 parser, rejected sources included (the model of what
 * parsed), laid out in its own theme with its front-matter config and three `block.padding`
 * values over it, gives no `blockLayoutViolations`, and the same layout on a second run
 * (R-ARCH-6).
 */
const CONFIGS: readonly Record<string, unknown>[] = [{}, { padding: 0 }, { padding: 30 }];

let corpus: CorpusItem[];
const themes = new Map<string, Theme>();
beforeAll(async () => {
  corpus = await blockGateCorpus();
});

describe('block layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus and every padding, and a second run gives the same layout', async () => {
    const failures: string[] = [];
    let blocks = 0;
    let edges = 0;
    let loops = 0;
    for (const item of corpus) {
      const { model, config: sourceConfig, resolved } = parsedBlock(item.source);
      const name = String(resolved.theme);
      let theme = themes.get(name);
      if (!theme) themes.set(name, (theme = await blockTestTheme(resolved)));
      for (const block of CONFIGS) {
        const config = { ...sourceConfig, ...block };
        const layout = layoutBlock(model, blockTestContext(theme, config));
        blocks += layout.blocks.length;
        edges += layout.edges.length;
        loops += layout.edges.filter((e) => e.kind === 'loop').length;
        const v = blockLayoutViolations(layout);
        if (v.length > 0) failures.push(`${item.id} ${JSON.stringify(block)}: ${v.join('; ')}`);
        if (layout.blocks.length > 1000) continue;
        const again = layoutBlock(model, blockTestContext(theme, config));
        if (JSON.stringify(again) !== JSON.stringify(layout)) {
          failures.push(`${item.id} ${JSON.stringify(block)}: a second run differs`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(95);
    expect(blocks).toBeGreaterThan(10_000);
    expect(edges).toBeGreaterThan(300);
    expect(loops).toBeGreaterThan(0);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
