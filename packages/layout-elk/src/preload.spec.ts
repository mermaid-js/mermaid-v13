// D537: `elk.lineHops` defaults on, so preloading an ELK layout loads core's line-hop chunk too, and
// `renderSync` after `preload({ layouts: ['elk'] })` draws ELK's hops as before. Its own file: the
// chunk, once loaded, is shared by every API object.
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
