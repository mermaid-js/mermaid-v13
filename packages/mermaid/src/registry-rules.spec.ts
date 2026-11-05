/**
 * Registry rules (D166, R-PLUG-6, R-ARCH-6): detection order first-party → discovered (sorted by
 * package name) → explicit (call order); first-party types win; `replace: true` is the only way
 * to take over a first-party id.
 */
import { describe, expect, it } from 'vitest';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { addDiscovered, discoverOnFirstUse, type DiscoveredPlugin } from './discovery.ts';
import { createMermaid, type ExternalDiagram, type LazyDiagram } from './index.ts';

const FLOW = 'flowchart LR\n  A --> B\n';

/** A tiny third-party diagram matching text that starts with `keyword`; it draws `label`. */
function textDiagram(id: string, keyword: string, label = id): LazyDiagram {
  return {
    id,
    detector: (text: string) => text.trimStart().startsWith(keyword),
    loader: async () => ({
      id,
      layoutKind: 'custom' as const,
      detector: () => true,
      parse: (text: string) => ({
        model: text.trim(),
        ast: { id, type: 'Text', range: { start: 0, end: text.length } },
        diagnostics: [],
        symbols: [],
        statements: [],
      }),
      render: (model: unknown, _l: unknown, _ctx: unknown, w: SvgWriter) => {
        w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 10, 20] });
        w.open('text');
        w.text(`${label}: ${String(model)}`);
        w.close();
        w.close();
      },
    }),
  };
}

describe('explicit registration of a first-party id', () => {
  it('throws TypeError without replace', async () => {
    const m = createMermaid();
    await expect(
      m.registerExternalDiagrams([textDiagram('flowchart', 'flowchart')])
    ).rejects.toThrow(TypeError);
    await expect(m.registerExternalDiagrams([textDiagram('pie', 'pie')])).rejects.toThrow(
      /first-party/
    );
    expect(m.detectType(FLOW)).toBe('flowchart-v2');
  });
});

const found = (pkg: string, plugin: ExternalDiagram): DiscoveredPlugin => ({
  kind: 'plugin',
  package: pkg,
  plugin,
});

describe('detection order (D166)', () => {
  it('runs first-party, then discovered by package name, then explicit in call order', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([textDiagram('late', 'zeta'), textDiagram('omega', 'omega')]);
    // Matches everything: it still loses to every first-party type.
    await addDiscovered(m, [
      found('zz-catch-all', { ...textDiagram('catchall', ''), detector: () => true }),
      found('b-zeta', textDiagram('bzeta', 'zeta')),
      found('a-zeta', textDiagram('azeta', 'zeta')),
    ]);
    expect(m.detectType(FLOW)).toBe('flowchart-v2');
    expect(m.detectType('sequenceDiagram\n A->>B: hi')).toBe('sequence');
    expect(m.detectType('pie\n "a": 1')).toBe('pie');
    expect(m.detectType('zeta 1')).toBe('azeta');
    expect(m.detectType('omega 1')).toBe('catchall');
    expect((await m.render('z', 'zeta 1')).svg).toContain('azeta: zeta 1');
  });

  it('lets an explicit registration of a discovered id win', async () => {
    const m = createMermaid();
    await addDiscovered(m, [found('pkg-hello', textDiagram('hello', 'hello', 'discovered'))]);
    expect((await m.render('h', 'hello')).svg).toContain('discovered: hello');
    await m.registerExternalDiagrams([textDiagram('hello', 'hello', 'explicit')]);
    expect((await m.render('h', 'hello')).svg).toContain('explicit: hello');
  });

  it('gives a later batch that sorts earlier the id (the CDN queue)', async () => {
    const m = createMermaid();
    await addDiscovered(m, [found('pkg-b', textDiagram('same', 'same', 'b'))]);
    expect((await m.render('s', 'same')).svg).toContain('b: same');
    const warnings = await addDiscovered(m, [found('pkg-a', textDiagram('same', 'same', 'a'))]);
    expect(warnings).toEqual([]);
    expect((await m.render('s', 'same')).svg).toContain('a: same');
  });
});

describe('collisions (D166)', () => {
  it('skips a discovered first-party id or type with one warning naming the package', async () => {
    const m = createMermaid();
    const warnings = await addDiscovered(m, [
      found('fake-flowchart', textDiagram('flowchart', 'flowchart', 'fake')),
      found('fake-pie', textDiagram('pie', 'pie', 'fake')),
      found('fake-v2', textDiagram('flowchart-v2', 'graph', 'fake')),
    ]);
    expect(warnings.map((w) => [w.code, (w as { package?: string }).package])).toEqual([
      ['PLUGIN_SKIPPED', 'fake-flowchart'],
      ['PLUGIN_SKIPPED', 'fake-pie'],
      ['PLUGIN_SKIPPED', 'fake-v2'],
    ]);
    expect(warnings[0]!.message).toContain('"fake-flowchart"');
    expect(warnings[0]!.message).toContain('first-party');
    const r = await m.render('f', FLOW);
    expect(r.diagramType).toBe('flowchart-v2');
    expect(r.svg).not.toContain('fake');
    // The warnings reach the next render once.
    expect(r.warnings.filter((w) => w.code === 'PLUGIN_SKIPPED')).toHaveLength(3);
    expect((await m.render('f', FLOW)).warnings).toEqual([]);
  });

  it('skips the later package of two with one id, and a bad entry, never throwing', async () => {
    const m = createMermaid();
    const warnings = await addDiscovered(m, [
      found('pkg-b', textDiagram('dup', 'dup', 'b')),
      found('pkg-a', textDiagram('dup', 'dup', 'a')),
      found('pkg-bad', { manifest: { plugin: 'nope', id: 'bad' }, load: async () => ({}) }),
      found('pkg-throws', {
        manifest: { plugin: 'extension', id: 'boom' },
        load: () => Promise.reject(new Error('entry failed')),
      }),
      { kind: 'plugin', package: '', plugin: textDiagram('anon', 'anon') },
    ]);
    expect(warnings.map((w) => (w as { package?: string }).package)).toEqual([
      '(unnamed)',
      'pkg-b',
      'pkg-bad',
      'pkg-throws',
    ]);
    expect(warnings[1]!.message).toContain('"pkg-a"');
    expect(warnings[3]!.message).toContain('entry failed');
    expect((await m.render('d', 'dup')).svg).toContain('a: dup');
  });

  it('replace: true takes over a first-party id, in its first-party slot', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams(
      [
        {
          ...textDiagram('sequence', 'sequenceDiagram', 'mine'),
          detector: (t: string) => /^\s*sequenceDiagram/.test(t),
        },
      ],
      { replace: true }
    );
    const r = await m.render('s', 'sequenceDiagram\n A->>B: hi');
    expect(r.diagramType).toBe('sequence');
    expect(r.svg).toContain('mine: sequenceDiagram');
    expect(m.detectType(FLOW)).toBe('flowchart-v2');
    expect((await m.render('f', FLOW)).svg).not.toContain('mine');
  });
});

describe('determinism (R-ARCH-6)', () => {
  it('draws the same bytes whatever the order of the discovered list', async () => {
    const one = textDiagram('one', 'both', 'first');
    const two = textDiagram('two', 'both', 'second');
    const svgs: string[] = [];
    for (const list of [
      [found('@x/one', one), found('@x/two', two)],
      [found('@x/two', two), found('@x/one', one)],
    ]) {
      const m = createMermaid();
      m.initialize({ deterministic: true });
      await addDiscovered(m, list);
      svgs.push((await m.render('d', 'both sides')).svg);
    }
    expect(svgs[0]).toContain('first: both sides');
    expect(svgs[1]).toBe(svgs[0]);
  });
});

describe('discovered extensions and layouts', () => {
  it('activates a discovered extension', async () => {
    const m = createMermaid();
    await addDiscovered(m, [
      found('pkg-ext', {
        id: 'marker',
        postRender: (_tree, ctx) => ctx.warn({ code: 'MARKER', message: 'ran' }),
      }),
    ]);
    expect((await m.render('f', FLOW)).warnings.map((w) => w.code)).toEqual(['MARKER']);
  });

  it('registers layout names lazily; elk takes over its alias, layered stays first-party', async () => {
    const m = createMermaid();
    const loads: string[] = [];
    const engine = (name: string) => async (): Promise<LayoutEngine> => {
      loads.push(name);
      return layered;
    };
    const warnings = await addDiscovered(m, [
      { kind: 'layout', package: 'pkg-z-elk', names: ['elk', 'elk.stress'], loader: engine('z') },
      { kind: 'layout', package: 'pkg-a-elk', names: ['elk'], loader: engine('a') },
      { kind: 'layout', package: 'pkg-layered', names: ['layered'], loader: engine('x') },
    ]);
    expect(warnings.map((w) => (w as { package?: string }).package)).toEqual([
      'pkg-layered',
      'pkg-z-elk',
    ]);
    expect(loads).toEqual([]);
    await m.render('e', '---\nconfig:\n  layout: elk\n---\n' + FLOW);
    expect(loads).toEqual(['a']);
    m.registerLayoutLoaders([{ name: 'elk', loader: engine('explicit') }]);
    await m.render('e', '---\nconfig:\n  layout: elk\n---\n' + FLOW);
    expect(loads).toEqual(['a', 'explicit']);
  });
});

describe('discoverOnFirstUse', () => {
  it('runs its source once, with the initialize config, before the first render', async () => {
    const m = createMermaid();
    const seen: unknown[] = [];
    discoverOnFirstUse(m, async (config) => {
      seen.push(config.discovery);
      return [
        found('pkg-late', textDiagram('late', 'late')),
        found('x', textDiagram('pie', 'pie')),
      ];
    });
    m.initialize({ deterministic: true });
    expect(seen).toEqual([]);
    const [a, b] = await Promise.all([m.render('l', 'late'), m.render('l2', 'late 2')]);
    expect(a.svg).toContain('late: late');
    expect(b.svg).toContain('late: late 2');
    expect(seen).toHaveLength(1);
    expect([...a.warnings, ...b.warnings].map((w) => w.code)).toEqual(['PLUGIN_SKIPPED']);
    expect(() => discoverOnFirstUse(m, () => [])).toThrow();
  });
});
