// The swimlane engine's hops (`swimlane.lineHops`, default `arc`) need nothing but the engine:
// the hop step is part of core (D672). A flowchart drawn with it also needs flowchart's lane
// drawing, a part of its own (`flowchartLanes`, #601, R-PERF-1).
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const TEXT = '---\nconfig:\n  layout: swimlane\n---\nflowchart LR\n  A --> B\n';

describe('preload and line hops (D537, D672)', () => {
  it('preloading the swimlane layout is enough for its hops', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], layouts: ['swimlane', 'flowchartLanes'] });
    const r = m.renderSync(TEXT, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe((await createMermaid().render('d', TEXT)).svg);
  });
});
