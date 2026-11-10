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
import { linearRatio } from '../linear-time.ts';

/**
 * Pitfall 19: the agentflow renderer is linear in what it draws (no per-node lookups of other
 * nodes, one walk for the palette order). Each shape is laid out once at n and 8n units; only
 * `renderAgentflow` is timed, so the engine's own cost stays out. Linear is ~8x, quadratic ~64x,
 * and the bar is 24x, timed with `linearRatio` (`../linear-time.ts`).
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
      expect(linearRatio(small, large)).toBeLessThan(24);
    },
    120_000
  );
});
