// D537: ELK's engine carries core's line-hop step, which `elk.lineHops` (default on) needs, so
// `renderSync` after `preload({ layouts: ['elk'] })` draws ELK's hops as before.
import { describe, expect, it } from 'vitest';
import { createMermaid } from 'mermaid';
import elkLayouts from './index.ts';

const TEXT =
  '---\nconfig:\n  layout: elk\n---\nflowchart TD\n  A --> C\n  A --> D\n  B --> C\n  B --> D\n';

describe('preload and elk.lineHops (D537)', () => {
  it('preload({ layouts: ["elk"] }) is enough for renderSync with hops', async () => {
    const m = createMermaid();
    m.registerLayoutLoaders(elkLayouts);
    await m.preload({ types: ['flowchart'], layouts: ['elk'] });
    const r = m.renderSync(TEXT, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain('A6,6');
  });
});
