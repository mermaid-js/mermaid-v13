// D689 (#1191): the shared `lineHops` key is off by default again (D672 had it on), so a render
// that sets no `lineHops` draws plain crossings. The hop step stays part of core (D672), so
// `renderSync` draws hops with nothing to preload when a config layer turns them on.
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

describe('line hops by default (D689)', () => {
  it('draws no hop where two straight runs cross when no config layer sets `lineHops`', async () => {
    const unset = ON.replace('  lineHops: true\n', '');
    expect(unset).not.toBe(ON);
    const m = createMermaid();
    const plain = await m.render('d', unset);
    expect(plain.warnings).toEqual([]);
    expect(plain.svg).not.toContain(HOP);
    expect(plain.svg).toBe((await m.render('d', OFF.replace('  lineHops: false\n', ''))).svg);
    expect((await m.render('d', ON)).svg).toContain(HOP);
  });

  it('hops with `lineHops: true` from initialize() as well as front matter', async () => {
    const unset = ON.replace('  lineHops: true\n', '');
    const m = createMermaid();
    m.initialize({ lineHops: true });
    expect((await m.render('d', unset)).svg).toBe((await createMermaid().render('d', ON)).svg);
  });

  it('renderSync draws hops with only the diagram type loaded (D672)', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const r = m.renderSync(ON, { id: 'd' });
    expect(r.warnings).toEqual([]);
    expect(r.svg).toContain(HOP);
    expect(r.svg).toBe((await createMermaid().render('d', ON)).svg);
  });

  it('is no layout: `layout: lineHops` is LAYOUT_UNKNOWN', async () => {
    const text = OFF.replace('  lineHops: false\n', '  layout: lineHops\n');
    expect((await createMermaid().render('d', text)).warnings.map((w) => w.code)).toEqual([
      'LAYOUT_UNKNOWN',
    ]);
  });
});
