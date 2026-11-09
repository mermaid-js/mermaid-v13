// D537, "Lazy chunk for hops": core's line-hop chunk is loaded as a lazy layout named `lineHops`,
// only for a render whose shared `lineHops` is on (an engine whose own key defaults on carries
// the step itself), and `renderSync` without it behaves as without a lazy layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMermaid, NotLoadedError } from './index.ts';

const fixture = (name: string): string =>
  readFileSync(
    new URL(`../../../e2e/diagrams/flowchart/baseline/edges/${name}.mmd`, import.meta.url),
    'utf8'
  );
const ON = fixture('line-hops-on');
const OFF = fixture('line-hops-off');
const CHUNK = [{ kind: 'layout', name: 'lineHops' }];

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('expected a throw');
}

describe('the lazy line-hop chunk (D537)', () => {
  it('renderSync without it throws NotLoadedError for chunk `lineHops`', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const e = thrown(() => m.renderSync(ON, { id: 'd' }));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual(CHUNK);
    // A render that does not hop needs nothing more.
    expect(m.renderSync(OFF, { id: 'd' }).warnings).toEqual([]);
  });

  it('with placeholders, draws without hops and says so', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'] });
    const r = m.renderSync(ON, { id: 'd', placeholders: true });
    expect(r.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(r.warnings[0]!.message).toContain('layout "lineHops"');
    expect(r.svg).not.toContain('A6,6');
  });

  // (An author's top-level `lineHops: false` under a layout whose own key defaults on loads it,
  // and the chunk then draws no hops: the cheap test in core cannot tell that case apart.)
  it('is not loaded by renders that cannot hop', async () => {
    const m = createMermaid();
    await m.render('d', OFF);
    await m.render('c', 'classDiagram\n  A --> B\n');
    expect(() => m.renderSync(ON, { id: 'd' })).toThrow(NotLoadedError);
  });

  it('is needed by every diagram that draws edges, not only flowchart', async () => {
    for (const text of [
      'classDiagram\n  A --> B\n',
      'stateDiagram-v2\n  A --> B\n',
      'erDiagram\n  A ||--o{ B : has\n',
    ]) {
      const m = createMermaid();
      await m.preload({ types: [m.detectType(text)] });
      const e = thrown(() => m.renderSync(`---\nconfig:\n  lineHops: true\n---\n${text}`));
      expect((e as NotLoadedError).missing).toEqual(CHUNK);
    }
  });

  it('preload({ layouts: ["lineHops"] }) loads it for renderSync', async () => {
    const m = createMermaid();
    await m.preload({ types: ['flowchart'], layouts: ['lineHops'] });
    expect(m.renderSync(ON, { id: 'd' }).svg).toBe((await createMermaid().render('d', ON)).svg);
    // Every diagram that draws edges, now that it is loaded: no crossing, drawn as without hops.
    const text = 'classDiagram\n  A --> B\n';
    await m.preload({ types: ['class'] });
    expect(m.renderSync(`---\nconfig:\n  lineHops: true\n---\n${text}`, { id: 'c' }).svg).toBe(
      (await createMermaid().render('c', text)).svg
    );
  });

  it('is no layout: `layout: lineHops` is LAYOUT_UNKNOWN, and no loader replaces it', async () => {
    const text = OFF.replace('  lineHops: false\n', '  layout: lineHops\n');
    expect((await createMermaid().render('d', text)).warnings.map((w) => w.code)).toEqual([
      'LAYOUT_UNKNOWN',
    ]);
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'lineHops', loader: () => Promise.reject(new Error('no')) }]);
    expect((await m.render('d', ON)).svg).toContain('A6,6');
  });
});
