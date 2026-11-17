import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';

/**
 * The two v12 fixtures made for the speed work on the swimlane engine (the v12 changes
 * mermaid-js/mermaid#8801 to #8803): many labelled edges between two nodes, and random edges
 * across five lanes. v12 never ran them through the DDLT gates, and with v13's sizes they do not
 * pass (see the pull request of #843), so they are not in the gated sweep (`ddlt.spec.ts`).
 * These named tests pin what the speed work needs of them: that the layout draws every edge, and
 * draws the same diagram every time.
 */

const FIXTURES = ['parallel-edges', 'random-edges-across-lanes'] as const;
/** What a fixture holds: its edges, as the `-->` in its text. */
const EDGE_COUNT: Record<(typeof FIXTURES)[number], number> = {
  'parallel-edges': 40,
  'random-edges-across-lanes': 40,
};
/** The longest the layouts of one fixture may take: seconds alone, and CI is about 7x slower. */
const RENDER_TIMEOUT_MS = 120_000;

const source = (name: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(`../../../../e2e/diagrams/swimlanes/nightly-check/${name}.mmd`, import.meta.url)
    ),
    'utf8'
  );

const drawnEdges = (svg: string): number => svg.match(/class="edge flowchart-link/g)?.length ?? 0;

describe('swimlane speed fixtures (the v12 changes #8801 to #8803)', () => {
  it.each(FIXTURES)('%s holds the edges the speed work counts', (name) => {
    expect(source(name).match(/-->/g)?.length).toBe(EDGE_COUNT[name]);
  });

  it.each(FIXTURES)(
    '%s draws every edge',
    async (name) => {
      const mermaid = createMermaid();
      const options = { config: { deterministic: true } };
      const text = source(name);
      await mermaid.prepare(text, options);
      expect(drawnEdges(mermaid.renderSync(text, options).svg)).toBe(EDGE_COUNT[name]);
    },
    RENDER_TIMEOUT_MS
  );

  it.each(FIXTURES)(
    '%s draws the same diagram on every render',
    async (name) => {
      const mermaid = createMermaid();
      const options = { config: { deterministic: true } };
      const text = source(name);
      await mermaid.prepare(text, options);
      expect(mermaid.renderSync(text, options).svg).toBe(mermaid.renderSync(text, options).svg);
    },
    RENDER_TIMEOUT_MS
  );
});
