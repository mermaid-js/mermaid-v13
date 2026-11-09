// D537: preloading a layout whose own `lineHops` defaults on (`swimlane.lineHops: arc`) loads core's
// line-hop chunk too, so `renderSync` works after `preload` as it did before hops were lazy. Its
// own file: the chunk, once loaded, is shared by every API object.
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const TEXT = '---\nconfig:\n  layout: swimlane\n---\nflowchart LR\n  A --> B\n';

describe('preload and the line-hop chunk (D537)', () => {
  it('preloading the swimlane layout loads the chunk its default needs', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], layouts: ['swimlane'] });
    const r = m.renderSync(TEXT, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toBe((await createMermaid().render('d', TEXT)).svg);
  });
});
