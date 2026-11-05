import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { layoutPie, parsePie } from '@mermaid-js/diagram-pie';
import { pieLayoutViolations } from '@mermaid-js/diagram-pie/testing';
import type { CorpusItem } from '../types.ts';
import { pieGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #335's last criterion): every
 * source of the pie gate corpus (e2e fixtures, v12 spec strings, quirks, parser cases, each
 * also with CRLF and comment lines) parsed by the v13 parser, rejected sources included (the
 * model of what parsed), laid out for every legend position with the default config and with
 * the options changed, gives no `pieLayoutViolations`.
 */
const POSITIONS = ['right', 'left', 'top', 'bottom', 'center'] as const;
const CONFIGS = [
  {},
  { textPosition: 0.9, donutHole: 0.5, highlightSlice: 'Dogs' },
  { textPosition: 0, donutHole: 0.9, highlightSlice: 'hover' },
];

let spec: ThemeSpec;
let corpus: CorpusItem[];
beforeAll(async () => {
  spec = await loadTheme('default');
  corpus = await pieGateCorpus();
});

describe('pie layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, every legend position and option set', () => {
    const theme = createTheme(spec);
    const failures: string[] = [];
    let sections = 0;
    for (const item of corpus) {
      const { model } = parsePie(item.source);
      sections += model.sections.length;
      for (const legendPosition of POSITIONS) {
        for (const pie of CONFIGS) {
          const layout = layoutPie(model, {
            config: { pie: { ...pie, legendPosition } } as unknown as ResolvedConfig,
            measurer: tableMeasurer,
            theme,
          });
          const v = pieLayoutViolations(model, layout);
          if (v.length > 0)
            failures.push(`${item.id} ${legendPosition} ${JSON.stringify(pie)}: ${v.join('; ')}`);
        }
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(47);
    expect(sections).toBeGreaterThan(800);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
