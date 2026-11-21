// D672: line hops are part of core and on by default (D537 had the shared `lineHops` off and
// the hop step in a lazy chunk), so `renderSync` draws them with nothing to preload.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid } from './index.ts';

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../e2e/diagrams/flowchart/baseline/edges/${name}.mmd`, import.meta.url),
    'utf8'
  );
const ON = fixture('line-hops-on');
const OFF = fixture('line-hops-off');
const HOP = 'A6,6';

describe('line hops by default (D672)', () => {
  it('renderSync draws hops with only the diagram type loaded', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const r = m.renderSync(ON, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain(HOP);
    expect(r.svg).toBe((await createMermaid().render('d', ON)).svg);
  });

  it('hops with no `lineHops` in any config layer, and not with `lineHops: false`', async () => {
    const unset = ON.replace('  lineHops: true\n', '');
    expect(unset).not.toBe(ON);
    const m = createMermaid();
    expect((await m.render('d', unset)).svg).toBe((await m.render('d', ON)).svg);
    expect((await m.render('d', OFF)).svg).not.toContain(HOP);
    m.initialize({ lineHops: false });
    expect((await m.render('d', unset)).svg).not.toContain(HOP);
  });

  it('is no layout: `layout: lineHops` is LAYOUT_UNKNOWN', async () => {
    const text = OFF.replace('  lineHops: false\n', '  layout: lineHops\n');
    expect((await createMermaid().render('d', text)).warnings.map((w) => w.code)).toEqual([
      'LAYOUT_UNKNOWN',
    ]);
  });
});
