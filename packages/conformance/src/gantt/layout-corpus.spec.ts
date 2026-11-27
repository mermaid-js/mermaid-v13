import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { MAX_STEPS } from '@mermaid-js/core/limits';
import { layoutGantt, parseGantt, schedule } from '@mermaid-js/diagram-gantt';
import { ganttLayoutViolations } from '@mermaid-js/diagram-gantt/testing';
import type { CorpusItem } from '../types.ts';
import { ganttGateCorpus } from './corpus.ts';
import { scheduleFuzz } from './fuzz.ts';
import { GANTT_PARITY_NOW } from './oracle-env.ts';

/**
 * Layout invariants on parser-produced models (spec #293 T3, R-LAYOUT-3): every source of the
 * gantt gate corpus and the schedule fuzz that parses and schedules, laid out classic and redux,
 * with the default config and with compact rows, the top axis and other lengths, gives no
 * `ganttLayoutViolations`: no NaN, bars inside the plot, no overlap in a compact row, ticks
 * ascending. Runs in both gantt zones. Sources whose schedule throws are rejected renders.
 */
const THEMES = ['default', 'redux'] as const;
const CONFIGS = [
  {},
  { displayMode: 'compact', topAxis: true, barHeight: 30, leftPadding: 10, useWidth: 640 },
] as const;
/** `now` inside most charts' domains, and the parity instant. */
const NOWS = [GANTT_PARITY_NOW, new Date(2014, 0, 8).getTime()];

const specs = new Map<string, ThemeSpec>();
let corpus: CorpusItem[];
beforeAll(async () => {
  for (const name of THEMES) specs.set(name, await loadTheme(name));
  corpus = [...(await ganttGateCorpus()), ...scheduleFuzz(500)];
});

describe('gantt layout invariants on parser-produced models', () => {
  it('hold over the corpus, both theme families, both option sets', () => {
    const failures: string[] = [];
    let bars = 0;
    let laid = 0;
    for (const item of corpus) {
      const { model, diagnostics } = parseGantt(item.source);
      if (diagnostics.some((d) => d.severity === 'error')) continue;
      for (const name of THEMES)
        for (const gantt of CONFIGS)
          for (const now of NOWS) {
            const warnings: Warning[] = [];
            let layout;
            try {
              layout = layoutGantt(model, {
                config: { gantt } as unknown as ResolvedConfig,
                measurer: tableMeasurer,
                theme: createTheme(specs.get(name)!),
                warn: (w) => warnings.push(w),
                now,
              });
            } catch (e) {
              const code = (e as { code?: string }).code;
              if (code !== 'SEMANTIC') failures.push(`${item.id}: ${String(e)}`);
              continue;
            }
            laid++;
            bars += layout.bars.length;
            const v = ganttLayoutViolations(layout);
            if (v.length > 0)
              failures.push(`${item.id} ${name} ${JSON.stringify(gantt)}: ${v.join('; ')}`);
            const codes = warnings.map((w) => w.code);
            if (new Set(codes).size !== codes.length)
              failures.push(`${item.id}: repeated warnings ${codes.join(', ')}`);
          }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e') && !i.id.endsWith(')')).length).toBe(99);
    expect(laid).toBeGreaterThan(5000);
    expect(bars).toBeGreaterThan(20000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);
});

describe('the scheduling work of real charts (D542)', () => {
  it('stays far under maxLayoutWork for every corpus file', async () => {
    let max = 0;
    let at = '';
    for (const item of await ganttGateCorpus()) {
      const { model, diagnostics } = parseGantt(item.source);
      if (diagnostics.some((d) => d.severity === 'error')) continue;
      let steps = 0;
      try {
        steps = schedule(model, { now: GANTT_PARITY_NOW }).steps;
      } catch {
        continue;
      }
      if (steps > max) [max, at] = [steps, item.id];
    }
    process.stdout.write(
      `scheduling work: at most ${max} steps (${at}), ${((100 * max) / MAX_STEPS).toFixed(3)}% of MAX_STEPS\n`
    );
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(MAX_STEPS / 100);
  });
});
