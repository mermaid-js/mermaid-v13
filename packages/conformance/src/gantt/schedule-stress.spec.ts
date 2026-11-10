import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import { LimitError, MAX_STEPS } from '@mermaid-js/core/limits';
import {
  layoutGantt,
  parseGantt,
  type GanttLayout,
  type GanttModel,
} from '@mermaid-js/diagram-gantt';
import { linearRatio } from '../linear-time.ts';

/**
 * R-SEC-5 stress for the schedule and layout (spec #293 T3): cost grows linearly with the
 * excluded span, the length of an `after` chain, forward references (eleven passes) and the
 * days an exclude walk draws. Shape copied from `conformance/src/gantt/stress.spec.ts`: n and
 * 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x, on this thread's CPU time.
 *
 * Inside v12's caps the day walk is unbounded: a task may span thousands of years (only its
 * start year is capped), and each excluded day of its span is visited once per pass. Core's
 * `maxLayoutWork` limit bounds it (D542).
 */
let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

/** A chart written as gantt text, parsed by the v13 parser. */
class Chart {
  private head = ['gantt', 'dateFormat YYYY-MM-DD'];
  readonly tasks: string[] = [];
  setDateFormat(f: string): this {
    this.head[1] = `dateFormat ${f}`;
    return this;
  }
  setExcludes(e: string): this {
    this.head.push(`excludes ${e}`);
    return this;
  }
  addSection(name: string): this {
    this.tasks.push(`section ${name}`);
    return this;
  }
  setTickInterval(t: string): this {
    this.head.push(`tickInterval ${t}`);
    return this;
  }
  /** `text :data`. */
  addTask(text: string, data: string): this {
    this.tasks.push(`${text} :${data}`);
    return this;
  }
  model(): GanttModel {
    return parseGantt([...this.head, ...this.tasks].join('\n')).model;
  }
}
const fixture = (): Chart => new Chart();

const NOW = new Date(2031, 4, 6).getTime();
function lay(f: Chart | GanttModel): { layout: GanttLayout; warnings: Warning[] } {
  const warnings: Warning[] = [];
  const layout = layoutGantt(f instanceof Chart ? f.model() : f, {
    config: { gantt: {} } as ResolvedConfig,
    measurer: tableMeasurer,
    theme: createTheme(spec),
    warn: (w) => warnings.push(w),
    now: NOW,
  });
  return { layout, warnings };
}

const SHAPES: [string, (n: number) => Chart][] = [
  [
    'a long excluded span',
    (n) =>
      fixture()
        .setExcludes('monday')
        .addTask('a', `a,2000-01-01,${n * 4}d`),
  ],
  [
    'a long span excluded by a dateFormat date',
    (n) =>
      fixture()
        .setDateFormat('DD/MM/YYYY')
        .setExcludes('01/01/1990')
        .addTask('a', `a,01/01/2000,${n * 4}d`),
  ],
  [
    'a long after chain',
    (n) => {
      const f = fixture().addTask('t0', 't0,2020-01-01,1d');
      for (let i = 1; i < n; i++) f.addTask(`t${i}`, `t${i},after t${i - 1},1d`);
      return f;
    },
  ],
  [
    'forward references (eleven passes)',
    (n) => {
      const f = fixture();
      for (let i = n - 1; i >= 1; i--) f.addTask(`t${i}`, `t${i},after t${i - 1},1d`);
      return f.addTask('t0', 't0,2020-01-01,1d');
    },
  ],
  [
    'many sections (one lookup each, no scan)',
    (n) => {
      const f = fixture();
      for (let i = 0; i < n * 2; i++) f.addSection(`s${i}`).addTask(`t${i}`, `t${i},2020-01-01,1d`);
      return f;
    },
  ],
  [
    // A fixed set of tasks over a span that grows with n: only the drawn span scales. Growing
    // the task count and each task's length together makes the work tasks x days, quadratic
    // in n by construction, and the ratio then depends on the CPU (8x-64x).
    'drawn exclude ranges',
    (n) => {
      const f = fixture().setExcludes('weekends');
      for (let i = 0; i < 10; i++) f.addTask(`t${i}`, `t${i},2020-01-01,${n / 4}d`);
      return f;
    },
  ],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

describe('stress: the gantt schedule and layout are linear', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(500).model();
      const large = build(4_000).model();
      expect(
        linearRatio(
          () => lay(small),
          () => lay(large)
        )
      ).toBeLessThan(24);
    },
    60_000
  );

  // D542: inside v12's caps the day walk is unbounded, so `maxLayoutWork` (core's MAX_STEPS)
  // stops it: a source-cap chart of 9000-year tasks over a sparse exclude is refused after
  // MAX_STEPS steps, at about the cost of a chart that takes half of them.
  it('refuses a source-cap chart of 9000-year tasks over a sparse exclude at MAX_STEPS', () => {
    const f = fixture().setExcludes('1999-01-01');
    for (let i = 0; f.tasks.length * 26 < 50_000; i++) f.addTask('t', `t${i},2000-01-01,9000y`);
    const model = f.model();
    let error: unknown;
    const t = cost(() => {
      try {
        lay(model);
      } catch (e) {
        error = e;
      }
    });
    expect(error).toBeInstanceOf(LimitError);
    const e = error as LimitError;
    expect([e.limit, e.max]).toEqual(['maxLayoutWork', MAX_STEPS]);
    // It stops at the limit: no step past the one that crossed it.
    expect(e.found).toBe(MAX_STEPS + 1);
    expect(e.message).toMatch(/gantt chart's schedule needs more than/);
    // Half the steps: one task of (MAX_STEPS / 2) days.
    const half = fixture()
      .setExcludes('1999-01-01')
      .addTask('t', `t,2000-01-01,${MAX_STEPS / 2}d`)
      .model();
    const base = cost(() => lay(half));
    expect(t / Math.max(base, 2)).toBeLessThan(6);
  }, 60_000);

  it('tickInterval 1millisecond over a year falls back to automatic ticks at once', () => {
    const t = cost(() => {
      const { layout, warnings } = lay(
        fixture().setTickInterval('1millisecond').addTask('a', 'a,2020-01-01,365d')
      );
      expect(layout.bottomAxis.ticks.length).toBeLessThanOrEqual(20);
      expect(warnings.map((w) => w.code)).toEqual(['GANTT_TICK_INTERVAL_IGNORED']);
    });
    const base = cost(() => lay(fixture().addTask('a', 'a,2020-01-01,365d')));
    expect(t / Math.max(base, 2)).toBeLessThan(24);
  });

  it('caps interval ticks at 10,000 where v12 estimated fewer', () => {
    // `30hour` ticks fall on midnight only (d3's `every` rule): one a day, ~12,050 over 33
    // years, where v12's estimate (span / 30 h) is ~9,640, under its limit.
    const { layout, warnings } = lay(
      fixture().setTickInterval('30hour').addTask('a', 'a,2000-01-01,33y')
    );
    expect(layout.bottomAxis.ticks.length).toBeLessThanOrEqual(20);
    expect(warnings.map((w) => w.code)).toEqual(['GANTT_TICK_INTERVAL_IGNORED']);
  });
});
