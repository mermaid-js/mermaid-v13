import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutRadar, parseRadar } from '@mermaid-js/diagram-radar';
import {
  radarLayoutViolations,
  radarTestContext,
  radarTestTheme,
} from '@mermaid-js/diagram-radar/testing';
import type { CorpusItem } from '../types.ts';
import { radarGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #447's last criterion): every
 * source of the radar gate corpus (e2e fixtures, the dev diagram, v12 spec strings, the
 * hand-written cases, each also with CRLF and comment lines) parsed by the v13 parser, rejected
 * sources included (the model of what parsed), laid out with both graticules and four `radar`
 * configs, gives no `radarLayoutViolations`.
 */
const GRATICULES = ['circle', 'polygon'] as const;
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { marginTop: 100, axisScaleFactor: 0.5 },
  { width: 300, height: 800, marginLeft: 0, marginRight: 0, axisLabelFactor: 1.5 },
  { axisScaleFactor: 2, curveTension: 1, marginBottom: 0 },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await radarTestTheme();
  corpus = await radarGateCorpus();
});

describe('radar layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, both graticules and every config', () => {
    const failures: string[] = [];
    let curves = 0;
    for (const item of corpus) {
      const { model } = parseRadar(item.source);
      curves += model.curves.length;
      for (const graticule of GRATICULES) {
        const m = { ...model, options: { ...model.options, graticule } };
        for (const radar of CONFIGS) {
          const layout = layoutRadar(m, radarTestContext(theme, radar));
          const v = radarLayoutViolations(m, layout);
          if (v.length > 0)
            failures.push(`${item.id} ${graticule} ${JSON.stringify(radar)}: ${v.join('; ')}`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(29);
    expect(curves).toBeGreaterThan(300);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
