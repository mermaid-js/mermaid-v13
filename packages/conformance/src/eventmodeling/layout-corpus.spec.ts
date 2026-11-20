import { beforeAll, describe, expect, it } from 'vitest';
import type { Measurer } from '@mermaid-js/core/text';
import { tableMeasurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutEventModel, parseEventModel } from '@mermaid-js/diagram-eventmodeling';
import {
  eventModelLayoutViolations,
  eventModelTestContext,
  eventModelTestTheme,
} from '@mermaid-js/diagram-eventmodeling/testing';
import type { CorpusItem } from '../types.ts';
import { eventModelingGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #604): every source of the event
 * modeling gate corpus (e2e fixtures, the v12 spec strings, the hand-written and recovery cases,
 * each also with CRLF and comment lines) parsed by the v13 parser, rejected sources included
 * (the model of what parsed), laid out with the table measurer, a wide one and v12's stub
 * (0 × 1 px) under several `eventmodeling` configs, gives no `eventModelLayoutViolations`.
 */
const CONFIGS: readonly Record<string, unknown>[] = [{}, { padding: 0 }, { padding: 12.5 }];

/** Every character twice the table's width: long names and data wrap and clip sooner. */
const wide: Measurer = {
  id: 'wide',
  width: (text, font, style) => 2 * tableMeasurer.width(text, font, style),
  metrics: (font) => tableMeasurer.metrics(font),
};
/** v12's stub document: every text 0 wide, one px a line. */
const stub: Measurer = {
  id: 'stub',
  width: () => 0,
  metrics: () => ({ ascent: 0, descent: 1, lineHeight: 1 }),
};

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await eventModelTestTheme();
  corpus = await eventModelingGateCorpus();
});

describe('event modeling layout invariants on parser-produced fixtures', () => {
  it('hold over the gate corpus with every measurer and config', () => {
    const failures: string[] = [];
    let boxes = 0;
    let clipped = 0;
    const routes = new Map<string, number>();
    for (const item of corpus) {
      const { model } = parseEventModel(item.source);
      for (const measurer of [tableMeasurer, wide, stub])
        for (const config of CONFIGS) {
          const layout = layoutEventModel(model, eventModelTestContext(theme, config, measurer));
          boxes += layout.boxes.length;
          clipped += layout.boxes.filter((b) => b.clipped).length;
          for (const r of layout.relations) routes.set(r.route, (routes.get(r.route) ?? 0) + 1);
          const v = eventModelLayoutViolations(model, layout);
          if (v.length > 0)
            failures.push(
              `${item.id} ${measurer.id} ${JSON.stringify(config)}: ${v.slice(0, 3).join('; ')}`
            );
        }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(39);
    expect(boxes).toBeGreaterThan(10_000);
    // Every route and clipping are exercised.
    expect(clipped).toBeGreaterThan(0);
    for (const route of ['down', 'up', 'along', 'under', 'self'])
      expect(routes.get(route)).toBeGreaterThan(0);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
