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
import { createMermaid as createSlim } from './slim.ts';

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
    // The displaced package is told, as it would be in one batch.
    expect(warnings.map((w) => [w.code, (w as { package?: string }).package])).toEqual([
      ['PLUGIN_SKIPPED', 'pkg-b'],
    ]);
    expect(warnings[0]!.message).toContain('"pkg-a"');
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
      { kind: 'layout', package: 'pkg-a-elk', names: ['elk', 'dagre'], loader: engine('a') },
      { kind: 'layout', package: 'pkg-layered', names: ['layered'], loader: engine('x') },
    ]);
    // Only the offending names are skipped: pkg-a-elk keeps elk, pkg-z-elk keeps elk.stress.
    expect(warnings.map((w) => [(w as { package?: string }).package, w.message])).toEqual([
      ['pkg-a-elk', expect.stringContaining('"dagre" is a first-party layout')],
      ['pkg-layered', expect.stringContaining('"layered" is a first-party layout')],
      ['pkg-z-elk', expect.stringContaining('layout "elk" belongs to "pkg-a-elk"')],
    ]);
    expect(m.supportsFormat('flowchart', 'svg')).toBe(true);
    expect(loads).toEqual([]);
    await m.render('e', '---\nconfig:\n  layout: elk\n---\n' + FLOW);
    expect(loads).toEqual(['a']);
    m.registerLayoutLoaders([{ name: 'elk', loader: engine('explicit') }]);
    await m.render('e', '---\nconfig:\n  layout: elk\n---\n' + FLOW);
    expect(loads).toEqual(['a', 'explicit']);
    await m.render('e', '---\nconfig:\n  layout: elk.stress\n---\n' + FLOW);
    expect(loads).toEqual(['a', 'explicit', 'z']);
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

describe('review fixes', () => {
  it('replace: true fills a first-party type with no package (pie, classDiagram)', async () => {
    const m = createMermaid();
    await expect(m.registerExternalDiagrams([textDiagram('gantt', 'gantt')])).rejects.toThrow(
      /first-party diagram id or type; pass \{ replace: true \}/
    );
    await m.registerExternalDiagrams(
      [
        textDiagram('pie', 'pie', 'community pie'),
        textDiagram('classDiagram', 'classDiagram', 'c'),
      ],
      { replace: true }
    );
    const pie = await m.render('p', 'pie\n "a": 1');
    expect(pie.diagramType).toBe('pie');
    expect(pie.svg).toContain('community pie: pie');
    expect(m.detectType('classDiagram\n A')).toBe('classDiagram');
    expect((await m.render('c', 'classDiagram\n A')).svg).toContain('c: classDiagram');
    expect((await m.render('f', FLOW)).diagramType).toBe('flowchart-v2');
  });

  it('mermaid/slim applies the same first-party names whatever diagrams were passed', async () => {
    const m = createSlim();
    await expect(
      m.registerExternalDiagrams([textDiagram('class', 'classDiagram')])
    ).rejects.toThrow(TypeError);
    const warnings = await addDiscovered(m, [found('fake-sequence', textDiagram('sequence', 's'))]);
    expect(warnings.map((w) => w.code)).toEqual(['PLUGIN_SKIPPED']);
  });

  it('takes several entries from one package, whatever their order', async () => {
    const log: string[] = [];
    const entries: DiscoveredPlugin[] = [
      found('multi', textDiagram('twin-b', 'twin', 'b')),
      found('multi', textDiagram('twin-a', 'twin', 'a')),
      found('multi', { id: 'multi-ext', postRender: () => void log.push('ext') }),
      { kind: 'layout', package: 'multi', names: ['multi-layout'], loader: async () => layered },
    ];
    const svgs: string[] = [];
    for (const list of [entries, [...entries].reverse()]) {
      const m = createMermaid();
      expect(await addDiscovered(m, list)).toEqual([]);
      svgs.push((await m.render('t', 'twin')).svg);
    }
    expect(svgs[0]).toContain('a: twin');
    expect(svgs[1]).toBe(svgs[0]);
    expect(log).toEqual(['ext', 'ext']);
    const m = createMermaid();
    const again = await addDiscovered(m, [entries[0]!, entries[0]!]);
    expect(again.map((w) => w.message)).toEqual([expect.stringContaining('already discovered')]);
  });

  it('tells a displaced extension and layout package, as in one batch', async () => {
    const m = createMermaid();
    await addDiscovered(m, [
      found('pkg-b', { id: 'ext', postRender: () => undefined }),
      { kind: 'layout', package: 'pkg-b', names: ['elk'], loader: async () => layered },
    ]);
    const warnings = await addDiscovered(m, [
      found('pkg-a', { id: 'ext', postRender: () => undefined }),
      { kind: 'layout', package: 'pkg-a', names: ['elk'], loader: async () => layered },
    ]);
    expect(warnings.map((w) => [(w as { package?: string }).package, w.message])).toEqual([
      ['pkg-b', expect.stringContaining('extension "ext" belongs to "pkg-a"')],
      ['pkg-b', expect.stringContaining('layout "elk" belongs to "pkg-a"')],
    ]);
  });

  it('keeps queued warnings when a draw fails, for the next one that succeeds', async () => {
    const m = createMermaid();
    await addDiscovered(m, [found('fake', textDiagram('flowchart', 'flowchart'))]);
    expect(() => m.renderSync(FLOW)).toThrow(/Not loaded/);
    const r = await m.render('f', FLOW);
    expect(r.warnings.map((w) => w.code)).toEqual(['PLUGIN_SKIPPED']);
  });

  it('reports a failing first-use source as PLUGIN_DISCOVERY_FAILED', async () => {
    const m = createMermaid();
    discoverOnFirstUse(m, () => Promise.reject(new Error('scan broke')));
    const r = await m.render('f', FLOW);
    expect(r.warnings.map((w) => w.code)).toEqual(['PLUGIN_DISCOVERY_FAILED']);
    expect(r.warnings[0]!.message).toContain('scan broke');
    expect((await m.render('f', FLOW)).warnings).toEqual([]);
  });

  it('runs extension hooks discovered-first whenever they arrive', async () => {
    const log: string[] = [];
    const ext = (id: string) => ({ id, postRender: () => void log.push(id) });
    const m = createMermaid();
    await m.registerExternalDiagrams([ext('explicit')]);
    discoverOnFirstUse(m, () => [found('pkg-z', ext('z')), found('pkg-a', ext('a'))]);
    await m.render('f', FLOW);
    expect(log).toEqual(['a', 'z', 'explicit']);
  });

  it('drops a layout engine whose loader was replaced while it loaded; loads a name once', async () => {
    const m = createMermaid();
    const used: string[] = [];
    const calls: string[] = [];
    const engine =
      (name: string): LayoutEngine =>
      (graph, ctx) => {
        used.push(name);
        return layered(graph, ctx);
      };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await addDiscovered(m, [
      {
        kind: 'layout',
        package: 'slow-elk',
        names: ['elk'],
        loader: async () => {
          calls.push('slow');
          await gate;
          return engine('stale');
        },
      },
    ]);
    const first = Promise.all([m.preload({ layouts: ['elk'] }), m.preload({ layouts: ['elk'] })]);
    await Promise.resolve();
    expect(calls).toEqual(['slow']);
    m.registerLayoutLoaders([{ name: 'elk', loader: async () => engine('explicit') }]);
    release();
    await first;
    await m.render('e', '---\nconfig:\n  layout: elk\n---\n' + FLOW);
    expect(used).toEqual(['explicit']);
  });

  it('sync calls do not wait for first-use discovery (await preload first)', async () => {
    const m = createMermaid();
    discoverOnFirstUse(m, () => [found('pkg-late', textDiagram('late', 'late'))]);
    expect(() => m.detectType('late')).toThrow(/No diagram type/);
    expect(m.supportsFormat('late', 'svg')).toBe(false);
    await m.preload({});
    expect(m.detectType('late')).toBe('late');
  });
});

describe('integration review fixes (#218)', () => {
  const extensionByManifest = (id: string, load: () => Promise<unknown>): ExternalDiagram => ({
    manifest: { plugin: 'extension', id, entry: './index.js' },
    load,
  });
  const warns = (id: string, code: string) => ({
    id,
    postRender: (_t: unknown, ctx: { warn: (w: { code: string; message: string }) => void }) =>
      ctx.warn({ code, message: id }),
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('renders after the limit when a first-use extension entry stalls; it registers when it settles', async () => {
    const m = createMermaid();
    let settle!: (module: unknown) => void;
    const entry = new Promise((r) => (settle = r));
    discoverOnFirstUse(m, () => [found('pkg-stall', extensionByManifest('stall', () => entry))], {
      timeLimitMs: 30,
    });
    const first = await m.render('f', FLOW);
    expect(first.warnings.map((w) => w.code)).toEqual(['PLUGIN_DISCOVERY_FAILED']);
    expect(first.warnings[0]!.message).toMatch(/within 30 ms/);
    settle({ default: warns('stall', 'STALL_RAN') });
    await tick();
    expect((await m.render('g', FLOW)).warnings.map((w) => w.code)).toEqual(['STALL_RAN']);
  });

  it('renders after the limit when a first-use source stalls; what it finds registers later', async () => {
    const m = createMermaid();
    let finish!: (list: DiscoveredPlugin[]) => void;
    discoverOnFirstUse(m, () => new Promise<DiscoveredPlugin[]>((r) => (finish = r)), {
      timeLimitMs: 30,
    });
    const first = await m.render('f', FLOW);
    expect(first.warnings.map((w) => w.code)).toEqual(['PLUGIN_DISCOVERY_FAILED']);
    finish([found('pkg-late', textDiagram('late', 'late'))]);
    await tick();
    const r = await m.render('l', 'late x');
    expect(r.svg).toContain('late: late x');
    expect(r.warnings).toEqual([]);
  });

  it('loads the extension entries of one batch at once, not one after another', async () => {
    const m = createMermaid();
    const started: string[] = [];
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const slow = (id: string) =>
      extensionByManifest(id, async () => {
        started.push(id);
        await gate;
        return { default: warns(id, id.toUpperCase()) };
      });
    const adding = addDiscovered(m, [
      found('pkg-c', slow('c')),
      found('pkg-a', slow('a')),
      found('pkg-b', slow('b')),
    ]);
    await tick();
    expect(started.sort()).toEqual(['a', 'b', 'c']);
    open();
    expect(await adding).toEqual([]);
    // Hook order is still package order (D166).
    expect((await m.render('f', FLOW)).warnings.map((w) => w.code)).toEqual(['A', 'B', 'C']);
  });

  it('lets an explicit id beat a discovered one silently, for every kind, never loading it', async () => {
    const m = createMermaid();
    const loads: string[] = [];
    await m.registerExternalDiagrams([warns('ext', 'EXPLICIT'), textDiagram('box', 'box', 'mine')]);
    m.registerLayoutLoaders([{ name: 'elk', loader: async () => layered }]);
    const warnings = await addDiscovered(m, [
      found(
        'pkg-ext',
        extensionByManifest('ext', async () => {
          loads.push('ext');
          return { default: warns('ext', 'DISCOVERED') };
        })
      ),
      found('pkg-ext2', warns('ext', 'DISCOVERED2')),
      found('pkg-box', {
        ...textDiagram('box', 'box', 'discovered'),
        loader: async () => {
          loads.push('box');
          return (await textDiagram('box', 'box', 'discovered').loader()) as never;
        },
      }),
      {
        kind: 'layout',
        package: 'pkg-elk',
        names: ['elk'],
        loader: async () => {
          loads.push('elk');
          return layered;
        },
      },
    ]);
    expect(warnings).toEqual([]);
    await m.preload({ layouts: ['elk'] });
    const r = await m.render('b', 'box x');
    expect(r.svg).toContain('mine: box x');
    expect(r.warnings.map((w) => w.code)).toEqual(['EXPLICIT']);
    expect(loads).toEqual([]);
  });
});
