// The math plugin through the public API (D175, D178, R-API-2): `$$…$$` in a label renders as
// paths once `prepare` has loaded the engine, which it does only for a diagram with math.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertInert } from '@mermaid-js/core/svg';
import {
  createMermaid,
  MermaidError,
  NotLoadedError,
  type ExtensionPlugin,
  type RenderResult,
} from 'mermaid';
import { describe, expect, it, vi } from 'vitest';

const FLOW = 'flowchart LR\n  A["$$x^2$$"] --> B';
const PLAIN = 'flowchart LR\n  A["costs $5 or $10"] --> B';

/** A fresh copy of the plugin module, so each test starts with the engine not loaded. */
async function freshMath(): Promise<ExtensionPlugin> {
  vi.resetModules();
  return (await import('./index.ts')).default;
}

async function api(plugin: ExtensionPlugin) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([plugin]);
  await m.preload({ types: ['flowchart'] });
  return m;
}

const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('did not throw');
}

describe('@mermaid-js/plugin-math', () => {
  it('renders $$…$$ in a label as paths, with no MATH_NOT_RENDERED', async () => {
    const m = await api(await freshMath());
    const r = await m.render('m', FLOW);
    expect(r.svg).not.toContain('$$');
    expect(r.svg).toMatch(/<g transform="translate\([^"]*\)"[^>]*><g><path d="/);
    expect(codes(r)).toEqual([]);
  });

  it('renderSync before the engine has loaded throws NotLoadedError naming math', async () => {
    const m = await api(await freshMath());
    const e = thrown(() => m.renderSync(FLOW));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'math', name: 'tex' }]);
    expect((e as NotLoadedError).message).toContain('math "tex"');
  });

  it('with placeholders, draws the TeX as written and warns', async () => {
    const m = await api(await freshMath());
    const r = m.renderSync(FLOW, { placeholders: true });
    expect(r.svg).toContain('$$x^2$$');
    expect(codes(r)).toEqual(['PLACEHOLDER']);
    expect(r.warnings[0]?.message).toContain('math "tex"');
  });

  it('warns when it declines a span because the engine has not loaded', async () => {
    // Label text the parse does not hold (so prepare() did not load the engine) reaches the
    // provider directly: the span is shown as written, but not silently.
    const math = await freshMath();
    const warnings: { code: string; message: string }[] = [];
    const request = {
      font: { family: 'sans-serif', size: 16, weight: 400 },
      measurer: {
        id: 'x',
        width: () => 10,
        metrics: () => ({ ascent: 12, descent: 4, lineHeight: 19 }),
      },
      metrics: { ascent: 12, descent: 4, lineHeight: 19 },
      ex: 8,
      warn: (w: { code: string; message: string }) => void warnings.push(w),
    };
    expect(math.inline![0]!.box('x^2', request)).toBeUndefined();
    expect(warnings.map((w) => w.code)).toEqual(['MATH_NOT_RENDERED']);
    expect(warnings[0]?.message).toContain('preload({ math: true })');
  });

  it('does not load the engine for a diagram without a $$…$$ pair', async () => {
    const m = await api(await freshMath());
    const plain = await m.render('m', PLAIN);
    expect(codes(plain)).toEqual([]);
    expect(plain.svg).toContain('costs $5 or $10');
    expect(await m.prepare('flowchart LR\n  A["just $$ once"]')).toBeDefined();
    // Nothing above loaded it, so a diagram with math still needs prepare.
    expect(thrown(() => m.renderSync(FLOW))).toBeInstanceOf(NotLoadedError);
  });

  // The parse has no diagram-agnostic notion of a label (each type's AST and model differ), so
  // any string the parse holds counts. Comments are not in the parse; a tooltip is.
  it.each([
    ['a %% comment', 'flowchart LR\n  %% $$x$$\n  A --> B', false],
    ['a click tooltip', 'flowchart LR\n  A --> B\n  click A "https://example.com" "$$x$$"', true],
  ])('with $$…$$ only in %s, prepare loads the engine: %s', async (_, source, loads) => {
    const m = await api(await freshMath());
    await m.prepare(source);
    if (loads) expect(() => m.renderSync(FLOW)).not.toThrow();
    else expect(() => m.renderSync(FLOW)).toThrow(NotLoadedError);
  });

  it('renderSync after prepare equals render()', async () => {
    const m = await api(await freshMath());
    await m.prepare(FLOW);
    expect(m.renderSync(FLOW, { id: 'm' }).svg).toBe((await m.render('m', FLOW)).svg);
  });

  it('preload({ math: true }) loads the engine for renderSync', async () => {
    const m = await api(await freshMath());
    await m.preload({ math: true });
    expect(m.renderSync(FLOW).svg).not.toContain('$$');
  });

  it('draws TeX that does not parse as written, with one MATH_ERROR', async () => {
    const m = await api(await freshMath());
    const bad = 'flowchart LR\n  A["$$\\frac{a}$$"] --> B["$$\\frac{a}$$"]';
    const r = await m.render('m', bad);
    expect(r.svg).toContain('$$\\frac{a}$$');
    expect(codes(r)).toEqual(['MATH_ERROR']);
    expect(r.warnings[0]?.message).toContain('$$\\frac{a}$$ is not valid TeX (Missing argument');
  });

  it('text output shows the TeX as written and never asks for the engine (D179)', async () => {
    const m = await api(await freshMath());
    const r = await m.render('m', FLOW, { format: 'ascii' });
    expect(r.text).toContain('$$x^2$$');
    expect(thrown(() => m.renderSync(FLOW))).toBeInstanceOf(NotLoadedError);
  });
});

const DIAGRAMS = fileURLToPath(new URL('../../../e2e/diagrams/', import.meta.url));
const corpus = (dir: string) =>
  readdirSync(join(DIAGRAMS, dir), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mmd'))
    .sort()
    .map((f) => [`${dir}/${f}`, readFileSync(join(DIAGRAMS, dir, f), 'utf8')] as const);

describe('with the plugin enabled (R-SEC-2, R-ARCH-6)', () => {
  it('passes the allow-list and is deterministic over the math and flowchart corpus', async () => {
    const math = await freshMath();
    const m = await api(math);
    const again = await api(math);
    // A postRender hook switches the writer to its tree backing, which must agree byte for byte.
    const tree = await api(math);
    await tree.registerExternalDiagrams([math, { id: 'tree', postRender: () => {} }]);
    let drawn = 0;
    for (const [id, source] of [...corpus('katex'), ...corpus('flowchart')]) {
      let first: RenderResult;
      try {
        first = await m.render('m', source);
      } catch (e) {
        if (e instanceof MermaidError) continue; // fixtures of invalid diagrams
        throw e;
      }
      if (first.svg.includes('<path d=') && source.includes('$$')) drawn++;
      expect(
        () => assertInert(first.svg, { themeStyle: first.svg.includes('<style>') }),
        id
      ).not.toThrow();
      expect((await again.render('m', source)).svg, id).toBe(first.svg);
      expect((await tree.render('m', source)).svg, id).toBe(first.svg);
      expect(codes(first), id).not.toContain('MATH_NOT_RENDERED');
    }
    expect(drawn).toBeGreaterThanOrEqual(4);
  }, 120_000);
});
