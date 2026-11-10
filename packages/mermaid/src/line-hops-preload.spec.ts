// D537: the swimlane engine carries core's line-hop step, which `swimlane.lineHops` (default `arc`)
// needs, so `preload` of the layout is enough for its hops. A flowchart drawn with it also needs
// flowchart's lane drawing, a part of its own (`flowchartLanes`, #601, R-PERF-1).
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const TEXT = '---\nconfig:\n  layout: swimlane\n---\nflowchart LR\n  A --> B\n';

describe('preload and the line-hop chunk (D537)', () => {
  it('preloading the swimlane layout loads the chunk its default needs', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], layouts: ['swimlane', 'flowchartLanes'] });
    const r = m.renderSync(TEXT, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe((await createMermaid().render('d', TEXT)).svg);
  });
});
