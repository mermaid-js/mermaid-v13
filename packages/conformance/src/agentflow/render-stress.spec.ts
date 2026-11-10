import { beforeAll, describe, expect, it } from 'vitest';
import { pxProfile } from '@mermaid-js/core/layout';
import { streamWriter } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import {
  agentflow,
  renderAgentflow,
  type AgentflowRenderContext,
} from '@mermaid-js/diagram-agentflow';
import {
  renderAgentflowForTest,
  type RenderedAgentflow,
} from '@mermaid-js/diagram-agentflow/testing';

/**
 * Pitfall 19: the agentflow renderer is linear in what it draws (no per-node lookups of other
 * nodes, one walk for the palette order). Each shape is laid out once at n and 8n units; only
 * `renderAgentflow` is timed, so the engine's own cost stays out. Linear is ~8x, quadratic ~64x,
 * and the bar is 24x. Times are this thread's CPU time (#531's pattern), best of five, small
 * and large renders alternating; the small render repeats until it takes at least
 * {@link MIN_MS}, the large one an eighth as often. Not measured on a steady machine.
 */
const H = 'agentflow-beta TB\n';
const SHAPES: [string, (n: number) => string][] = [
  [
    'a chain of every shape',
    (n) => {
      const kinds = ['tool', 'task', 'decision', 'input', 'refdoc', 'action'];
      let s = H;
      for (let i = 0; i < n; i++) s += `  v${i}@{ shape: ${kinds[i % 6]} }\n`;
      for (let i = 1; i < n; i++) s += `  v${i - 1} --> v${i}\n`;
      return s;
    },
  ],
  [
    'flows side by side',
    (n) => {
      let s = H;
      for (let i = 0; i < n / 2; i++) s += `  flow f${i}["F${i}"]\n    a${i} --> b${i}\n  end\n`;
      return s;
    },
  ],
  [
    'flows nested in a few towers',
    (n) => {
      let s = H;
      for (let t = 0; t < n / 10; t++) {
        for (let d = 0; d < 5; d++) s += `${'  '.repeat(d + 1)}flow f${t}_${d}\n`;
        s += `      x${t}\n`;
        for (let d = 4; d >= 0; d--) s += `${'  '.repeat(d + 1)}end\n`;
      }
      return s;
    },
  ],
  [
    'collapsed flows with edges in',
    (n) => {
      let s = H;
      for (let i = 0; i < n / 2; i++)
        s += `  flow c${i}\n    m${i}\n  end\n  c${i}@{ view: "collapsed" }\n  h${i % 7} --> m${i}\n`;
      return s;
    },
  ],
  [
    'labelled edges and tooltips',
    (n) => {
      let s = H;
      for (let i = 0; i < n; i++)
        s += `  p${i} -->|"l ${i}"| q${i}\n  click p${i} "https://e.x/${i}" "tip"\n`;
      return s;
    },
  ],
];

const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};
const clockStepMs = (): number => {
  const steps: number[] = [];
  let last = cpuMs();
  while (steps.length < 20) {
    const now = cpuMs();
    if (now !== last) steps.push(now - last);
    last = now;
  }
  return steps.sort((a, b) => a - b)[10]!;
};
/** The shortest small measurement: 8 ms, or ten clock steps where the clock is coarser. */
const MIN_MS = Math.max(8, 10 * clockStepMs());
const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (![0, 1, 2].every(() => cost(run, reps) >= MIN_MS)) reps *= 2;
  return reps;
};

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('redux-color'), { diagram: agentflow.theme });
});

/** A render of the laid-out `r` into a fresh writer, with a context like the harness's. */
function drawer(r: RenderedAgentflow): () => string {
  const ctx: AgentflowRenderContext = {
    config: r.config,
    measurer: tableMeasurer,
    units: pxProfile,
    theme,
    warn: () => {},
  };
  return () => {
    const w = streamWriter();
    renderAgentflow(r.model, r.layout, ctx, w);
    return w.finish();
  };
}

describe('stress: the agentflow renderer is linear in what it draws', () => {
  it.each(SHAPES)(
    '%s',
    async (_name, build) => {
      const small = drawer(
        await renderAgentflowForTest(build(250), { config: { theme: 'redux-color' } })
      );
      const large = drawer(
        await renderAgentflowForTest(build(2000), { config: { theme: 'redux-color' } })
      );
      large(); // warm up
      const reps = repeatsFor(small);
      const repsLarge = Math.max(1, reps / 8);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(tSmall, cost(small, reps));
        tLarge = Math.min(tLarge, cost(large, repsLarge));
      }
      expect(tSmall, `${reps} small runs read 0 ms (MIN_MS ${MIN_MS})`).toBeGreaterThan(0);
      expect(tLarge / repsLarge / (tSmall / reps)).toBeLessThan(24);
    },
    120_000
  );
});
