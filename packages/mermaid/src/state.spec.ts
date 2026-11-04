import { describe, expect, it } from 'vitest';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { assertInert } from '@mermaid-js/core/svg';
import { state } from '@mermaid-js/diagram-state';
import { createMermaid, MermaidError, UnsupportedFormatError } from './index.ts';
import { createMermaid as createSlim } from './slim.ts';

// State is a first-party type (#148): both v12 keywords go to `@mermaid-js/diagram-state`
// through the generated registry, in v12's detector order (D101).
const V1 = 'stateDiagram\n  [*] --> Still\n  Still --> Moving : push\n  Moving --> [*]\n';
const V2 = 'stateDiagram-v2\n  [*] --> Still\n  Still --> Moving : push\n  Moving --> [*]\n';

const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    (x: unknown) => x
  );

describe('state diagrams through the public API (#148)', () => {
  it.each([
    ['stateDiagram', V1],
    ['stateDiagram-v2', V2],
  ])('renders the %s keyword', async (_keyword, text) => {
    const m = createMermaid();
    const result = await m.render('s1', text);
    expect(result.diagramType).toBe('stateDiagram');
    expect(result.svg).toContain('aria-roledescription="stateDiagram"');
    expect(result.svg).toContain('class="mermaid mermaid-state statediagram"');
    expect(result.svg).toContain('push');
    expect(result.warnings).toEqual([]);
    expect(result.width).toBeGreaterThan(0);
    assertInert(result.svg);
  });

  it('draws both keywords alike (one renderer, D101)', async () => {
    const m = createMermaid();
    const v1 = await m.render('s', V1);
    const v2 = await m.render('s', V2.replace('stateDiagram-v2', 'stateDiagram'));
    expect(v1.svg).toBe(v2.svg);
    expect((await m.render('s', V2)).svg).toBe(v1.svg);
  });

  it('defaults to layered even with an ELK plugin registered (D127, R-LAYOUT-7)', async () => {
    let calls = 0;
    const elk: LayoutEngine = (graph, ctx) => {
      calls++;
      return layered(graph, ctx);
    };
    const m = createMermaid();
    m.registerLayoutLoaders([{ name: 'elk', loader: () => Promise.resolve(elk) }]);
    await m.render('s', V2);
    expect(calls).toBe(0);
    await m.render('s', `---\nconfig:\n  layout: elk\n---\n${V2}`);
    expect(calls).toBe(1);
    expect(state.configDefaults.layout).toBe('layered');
  });

  it('renders synchronously once prepared', async () => {
    const m = createMermaid();
    await m.prepare(V2);
    expect(m.renderSync(V2).svg).toContain('mermaid-state');
  });

  it('reports a syntax error as a positioned MermaidError', async () => {
    const e = await rejection(createMermaid().render('s', 'stateDiagram-v2\n  A --> \n  -->'));
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('SYNTAX');
    expect((e as MermaidError).line).toBeGreaterThan(1);
  });

  it('supports svg only: ascii is refused with UnsupportedFormatError (D100)', async () => {
    const m = createMermaid();
    expect(m.supportsFormat('stateDiagram', 'svg')).toBe(true);
    expect(m.supportsFormat('state', 'svg')).toBe(true);
    expect(m.supportsFormat('state', 'ascii')).toBe(false);
    expect(m.supportsFormat('stateDiagram', 'ascii')).toBe(false);
    const e = await rejection(m.render('s', V2, { format: 'ascii' }));
    expect(e).toBeInstanceOf(UnsupportedFormatError);
    expect((e as UnsupportedFormatError).diagramType).toBe('stateDiagram');
    await m.prepare(V2);
    expect(() => m.renderSync(V2, { format: 'ascii' })).toThrow(UnsupportedFormatError);
  });

  it('reads the state config section (useMaxWidth, nodeSpacing)', async () => {
    const m = createMermaid();
    const wide = await m.render('s', V2);
    expect(wide.svg).toMatch(/<svg[^>]* width="100%"/);
    const fixed = await m.render('s', '---\nconfig:\n  state:\n    useMaxWidth: false\n---\n' + V2);
    expect(fixed.svg).toMatch(/<svg[^>]* width="\d+"/);
    const roomy = await m.render('s', '---\nconfig:\n  state:\n    rankSpacing: 200\n---\n' + V2);
    expect(roomy.height).toBeGreaterThan(wide.height);
  });

  it('renders through mermaid/slim with the state plugin passed in, alike', async () => {
    const slim = createSlim({ diagrams: [state] });
    expect((await slim.render('s', V2)).svg).toBe((await createMermaid().render('s', V2)).svg);
  });
});
