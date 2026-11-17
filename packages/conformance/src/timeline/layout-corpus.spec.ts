import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { DIAGRAM_TABLES } from '../diagram-themes.ts';
import { layoutTimeline, parseTimeline } from '@mermaid-js/diagram-timeline';
import { timelineLayoutViolations } from '@mermaid-js/diagram-timeline/testing';
import type { TimelineModel } from '@mermaid-js/diagram-timeline';
import type { CorpusItem } from '../types.ts';
import { timelineGateCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #337's last criterion): every
 * source of the timeline gate corpus (e2e fixtures, v12 spec strings, parser cases and edge
 * cases, each also commented and CR-cut), rejected sources included (the model of what
 * parsed), laid out in both directions, classic and redux, with the default config and with
 * every option the layout reads changed, gives no `timelineLayoutViolations`.
 */
const THEMES = ['default', 'redux'] as const;
const CONFIGS = [{}, { leftMargin: 10, padding: 0, disableMulticolor: true }] as const;

const specs = new Map<string, ThemeSpec>();
let corpus: CorpusItem[];
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
  corpus = await timelineGateCorpus();
});

const turned = (m: TimelineModel): TimelineModel => ({
  ...m,
  direction: m.direction === 'LR' ? 'TD' : 'LR',
});

describe('timeline layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus, both directions, both theme families and option sets', () => {
    const failures: string[] = [];
    let periods = 0;
    for (const item of corpus) {
      const { model } = parseTimeline(item.source);
      periods += model.periods.length;
      for (const m of [model, turned(model)])
        for (const name of THEMES)
          for (const timeline of CONFIGS) {
            const layout = layoutTimeline(m, {
              config: { timeline } as unknown as ResolvedConfig,
              measurer: tableMeasurer,
              theme: createTheme(specs.get(name)!, { diagram: DIAGRAM_TABLES.timeline }),
            });
            const v = timelineLayoutViolations(m, layout, timeline);
            if (v.length > 0)
              failures.push(
                `${item.id} ${m.direction} ${name} ${JSON.stringify(timeline)}: ${v.join('; ')}`
              );
          }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(59);
    expect(periods).toBeGreaterThan(1000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});
