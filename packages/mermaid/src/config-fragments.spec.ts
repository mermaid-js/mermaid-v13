/**
 * Plugin config fragments (D153, D177) through `createMermaid().render()`: a fixture plugin's
 * own keys, defaults, legacy aliases and theme variables, known to the validator only while
 * the plugin is registered.
 */
import { describe, expect, it } from 'vitest';
import type { ConfigFragment } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import { addDiscovered } from './discovery.ts';
import { createMermaid, type ExtensionPlugin, type LayoutLoader, type Warning } from './index.ts';

const FLOW = 'flowchart LR\n  A[Start] --> B(End)\n';

/** The fixture fragment: one `fixture` section with two keys, an alias and a theme variable. */
const fragment: ConfigFragment = {
  id: 'fixture',
  keys: { fixture: { mode: 0, size: 0 } },
  defaults: { fixture: { mode: 'plain', size: 3 } },
  aliases: [{ from: 'look', when: 'sketchy', to: 'fixture.mode', value: 'sketch' }],
  themeVariables: { fixtureInk: 'primaryTextColor' },
};

/** The fixture extension: reports the `fixture` section it gets at render time. */
const fixture = (config: ConfigFragment = fragment): ExtensionPlugin => ({
  id: 'fixture',
  config,
  postRender(_tree, ctx) {
    const section = (ctx.config as Record<string, unknown>).fixture;
    ctx.warn({ code: 'FIXTURE', message: JSON.stringify(section ?? null) });
    const ink = [ctx.theme.value('fixtureInk'), ctx.theme.value('primaryTextColor')];
    ctx.warn({ code: 'FIXTURE_INK', message: ink.join(' ') });
  },
});

const codes = (ws: readonly Warning[]) => ws.map((w) => w.code);
const seen = (ws: readonly Warning[], code = 'FIXTURE') => ws.find((w) => w.code === code)?.message;

describe('config fragments (D153)', () => {
  it('knows the fragment keys only while the plugin is registered', async () => {
    const text = `---\nconfig:\n  fixture:\n    mode: bold\n---\n${FLOW}`;
    const m = createMermaid();
    const before = await m.render('a', text);
    expect(before.warnings).toContainEqual(
      expect.objectContaining({ code: 'CONFIG_UNKNOWN_KEY', path: 'fixture' })
    );

    // The same API object and text: registering resolves the config again.
    await m.registerExternalDiagrams([fixture()]);
    const r = await m.render('a', text);
    expect(codes(r.warnings)).not.toContain('CONFIG_UNKNOWN_KEY');
    expect(seen(r.warnings)).toBe('{"mode":"bold","size":3}');
  });

  it('maps a legacy alias to the plugin key, in every source', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([fixture()]);
    const front = await m.render('a', `---\nconfig:\n  look: sketchy\n---\n${FLOW}`);
    expect(seen(front.warnings)).toBe('{"mode":"sketch","size":3}');
    expect(codes(front.warnings)).not.toContain('LOOK_REMOVED');
    const directive = await m.render('a', `%%{init: {"look": "sketchy"}}%%\n${FLOW}`);
    expect(seen(directive.warnings)).toBe('{"mode":"sketch","size":3}');

    // Another value is not aliased: `look` stays removed (D153).
    const other = await m.render('a', `---\nconfig:\n  look: classic\n---\n${FLOW}`);
    expect(seen(other.warnings)).toBe('{"mode":"plain","size":3}');
    expect(codes(other.warnings)).toContain('LOOK_REMOVED');

    // The plugin's own key, set in the same source, wins over the alias.
    const both = `---\nconfig:\n  look: sketchy\n  fixture:\n    mode: bold\n---\n${FLOW}`;
    expect(seen((await m.render('a', both)).warnings)).toBe('{"mode":"bold","size":3}');

    m.initialize({ look: 'sketchy' } as never);
    const site = await m.render('a', FLOW);
    expect(seen(site.warnings)).toBe('{"mode":"sketch","size":3}');
    expect(codes(site.warnings)).not.toContain('LOOK_REMOVED');

    // Without the plugin, the alias does not exist (and `fixture` is unknown).
    const bare = await createMermaid().render('a', `---\nconfig:\n  look: sketchy\n---\n${FLOW}`);
    expect(codes(bare.warnings)).toContain('LOOK_REMOVED');
  });

  it('hints at the hand-drawn plugin in LOOK_REMOVED until a fragment declares `handDrawn`', async () => {
    const text = `---\nconfig:\n  look: classic\n---\n${FLOW}`;
    const removed = (ws: readonly Warning[]) => ws.find((w) => w.code === 'LOOK_REMOVED')?.message;
    const hint = 'For handDrawn, register @mermaid-js/plugin-hand-drawn.';
    expect(removed((await createMermaid().render('a', text)).warnings)).toContain(hint);
    const other = createMermaid();
    await other.registerExternalDiagrams([fixture()]);
    expect(removed((await other.render('a', text)).warnings)).toContain(hint);

    const m = createMermaid();
    await m.registerExternalDiagrams([fixture({ id: 'sketch', keys: { handDrawn: 0 } })]);
    const r = removed((await m.render('a', text)).warnings);
    expect(r).toMatch(/removed/);
    expect(r).not.toContain(hint);
  });

  it('hints at the HTML labels plugin for a removed `htmlLabels` key until a fragment declares `html` (D700)', async () => {
    const hint = 'For HTML labels, register @mermaid-js/plugin-html-labels.';
    const removed = (ws: readonly Warning[]) =>
      ws.filter((w) => w.code === 'CONFIG_REMOVED_KEY').map((w) => [w.path, w.message]);
    // In diagram text and in initialize(), at the root and in the two sections v12 had it in.
    const front = `---\nconfig:\n  htmlLabels: true\n  class:\n    htmlLabels: false\n---\n${FLOW}`;
    const bare = createMermaid();
    bare.initialize({ flowchart: { htmlLabels: true } } as never);
    const warned = removed((await bare.render('a', front)).warnings);
    expect(warned.map(([path]) => path).sort()).toEqual([
      'class.htmlLabels',
      'flowchart.htmlLabels',
      'htmlLabels',
    ]);
    for (const [, message] of warned) {
      expect(message).toMatch(/removed/);
      expect(message!.endsWith(hint)).toBe(true);
    }

    // Another removed key gets no hint.
    const other = await createMermaid().render('a', `---\nconfig:\n  themeCSS: x\n---\n${FLOW}`);
    expect(removed(other.warnings)).toHaveLength(1);
    expect(removed(other.warnings)[0]![1]).not.toContain('@mermaid-js');

    // A fragment that declares `html` but aliases nothing: the key still warns, without the hint.
    const m = createMermaid();
    await m.registerExternalDiagrams([fixture({ id: 'labels', keys: { html: { labels: 0 } } })]);
    const mine = removed((await m.render('a', front)).warnings);
    expect(mine).toHaveLength(2);
    for (const [, message] of mine) expect(message).not.toContain(hint);
  });

  it('gives the plugin its own theme variables, with defaults an author can override', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([fixture()]);
    const [ink, text] = seen((await m.render('a', FLOW)).warnings, 'FIXTURE_INK')!.split(' ');
    expect(ink).toBe(text);
    const set = `---\nconfig:\n  themeVariables:\n    fixtureInk: '#ff0000'\n---\n${FLOW}`;
    expect(seen((await m.render('a', set)).warnings, 'FIXTURE_INK')).toMatch(/^#ff0000 /);

    const taken = { ...fragment, themeVariables: { primaryColor: 'red' } };
    await expect(createMermaid().registerExternalDiagrams([fixture(taken)])).rejects.toThrow(
      /theme variable "primaryColor" is core's/
    );
  });

  it('refuses a malformed fragment at registration', async () => {
    const reg = (config: unknown) =>
      createMermaid().registerExternalDiagrams([fixture(config as ConfigFragment)]);
    await expect(reg({ keys: {} })).rejects.toThrow(/needs a non-empty string id/);
    await expect(reg({ id: 'f', keys: { a: 1 } })).rejects.toThrow(/bad key tree at "a"/);
    const proto = { id: 'f', keys: {}, aliases: [{ from: 'look', to: '__proto__.x' }] };
    await expect(reg(proto)).rejects.toThrow(/alias "to" must be a dotted key path/);
    // A secure or integrator-only key is never aliased, from or to.
    for (const [from, to] of [
      ['fixtureLevel', 'securityLevel'],
      ['securityLevel', 'fixture.level'],
      ['secure.x', 'fixture.level'],
    ])
      await expect(reg({ id: 'f', keys: {}, aliases: [{ from, to }] })).rejects.toThrow(
        /alias of "securityLevel"|alias of "secure"/
      );
    // Core's own keys and defaults stay core's.
    await expect(reg({ id: 'f', keys: { flowchart: 'open' } })).rejects.toThrow(
      /"flowchart" is a core config key/
    );
    await expect(
      reg({ id: 'f', keys: { mine: 0 }, defaults: { securityLevel: 'loose' } })
    ).rejects.toThrow(/default "securityLevel" is not one of its keys/);
  });

  it('reaches a layout engine through its ctx; a loader brings its fragment', async () => {
    const grid: ConfigFragment = {
      id: 'fixture-grid',
      keys: { grid: { gap: 0 } },
      defaults: { grid: { gap: 5 } },
    };
    const gaps: unknown[] = [];
    const engine: LayoutEngine = (graph, ctx) => {
      gaps.push((ctx?.config as Record<string, { gap?: number }> | undefined)?.grid?.gap);
      return layered(graph, ctx);
    };
    const loaders: LayoutLoader[] = ['grid', 'grid.wide'].map((name) => ({
      name,
      config: grid,
      loader: () => Promise.resolve(engine),
    }));
    const m = createMermaid();
    const text = `---\nconfig:\n  layout: grid\n  grid:\n    gap: 9\n---\n${FLOW}`;
    await m.prepare(text);
    m.registerLayoutLoaders(loaders);
    const r = await m.render('a', text);
    expect(codes(r.warnings)).toEqual([]);
    await m.render('a', `---\nconfig:\n  layout: grid.wide\n---\n${FLOW}`);
    expect(gaps).toEqual([9, 5]);
  });
});

describe('layout manifests (D177, DESIGN §12.1)', () => {
  const grid: ConfigFragment = { id: 'grid', keys: { grid: { gap: 0 } }, defaults: { grid: {} } };

  /** A fixture layout package: its entry's default export is v12's `LayoutLoader[]`. */
  function gridPackage(names: readonly string[], exp?: string) {
    const log: string[] = [];
    const engineFor =
      (name: string): LayoutEngine =>
      (graph, ctx) => {
        log.push(`${name}:${String((ctx?.config as { grid?: { gap?: number } }).grid?.gap)}`);
        return layered(graph, ctx);
      };
    const loaders = names.map((name) => ({
      name,
      loader: () => Promise.resolve(engineFor(name)),
    }));
    const manifest = {
      plugin: 'layout',
      names,
      entry: './dist/index.js',
      config: './dist/config.js',
      ...(exp ? { export: exp } : {}),
    };
    const def = {
      manifest,
      config: grid,
      load: () => {
        log.push('load');
        return Promise.resolve(exp ? { [exp]: loaders } : { default: loaders });
      },
    };
    return { def, log };
  }

  it('registers each name lazily; the entry loads only when a diagram names one', async () => {
    const { def, log } = gridPackage(['grid', 'grid.wide']);
    const m = createMermaid();
    await m.registerExternalDiagrams([def]);
    expect(log).toEqual([]);
    const plain = await m.render('a', FLOW);
    expect(log).toEqual([]);
    expect(plain.warnings).toEqual([]);

    const text = `---\nconfig:\n  layout: grid.wide\n  grid:\n    gap: 2\n---\n${FLOW}`;
    const r = await m.render('a', text);
    expect(r.warnings).toEqual([]);
    await m.render('a', `---\nconfig:\n  layout: grid\n---\n${FLOW}`);
    expect(log).toEqual(['load', 'grid.wide:2', 'grid:undefined']);
  });

  it('reads a named export, or one engine for every name', async () => {
    const { def, log } = gridPackage(['grid'], 'layouts');
    const m = createMermaid();
    await m.registerExternalDiagrams([def]);
    await m.render('a', `---\nconfig:\n  layout: grid\n---\n${FLOW}`);
    expect(log).toEqual(['load', 'grid:undefined']);

    const names: string[] = [];
    const one: LayoutEngine = (graph, ctx) => (names.push('one'), layered(graph, ctx));
    const n = createMermaid();
    await n.registerExternalDiagrams([
      { manifest: { plugin: 'layout', names: ['a', 'b'], entry: './i.js' }, load: async () => one },
    ]);
    for (const name of ['a', 'b'])
      await n.render('x', `---\nconfig:\n  layout: ${name}\n---\n${FLOW}`);
    expect(names).toEqual(['one', 'one']);
  });

  it('a render while the registration is pending caches nothing the new fragment changes', async () => {
    const { def } = gridPackage(['grid']);
    const text = `---\nconfig:\n  layout: grid\n  grid:\n    gap: 2\n---\n${FLOW}`;
    const m = createMermaid();
    await m.prepare(FLOW);
    const pending = m.registerExternalDiagrams([def]);
    // Before the fragment is in, `grid` is an unknown key.
    expect(codes(m.renderSync(text).warnings)).toContain('CONFIG_UNKNOWN_KEY');
    await pending;
    expect((await m.render('a', text)).warnings).toEqual([]);
  });

  it('refuses a layout manifest that claims a built-in name (D127, D171)', async () => {
    for (const name of ['layered', 'dagre']) {
      const { def } = gridPackage(['grid', name]);
      await expect(createMermaid().registerExternalDiagrams([def])).rejects.toThrow(
        `layout name "${name}" is built in`
      );
    }
  });

  it('rejects a layout manifest without its fragment, or a name the entry lacks', async () => {
    const { def } = gridPackage(['grid']);
    const m = createMermaid();
    const { config: _, ...bare } = def;
    await expect(m.registerExternalDiagrams([bare])).rejects.toThrow(/needs its config fragment/);
    const { def: other } = gridPackage(['grid']);
    await m.registerExternalDiagrams([
      { ...other, manifest: { ...other.manifest, names: ['grid', 'gone'] } },
    ]);
    await expect(m.render('a', `---\nconfig:\n  layout: gone\n---\n${FLOW}`)).rejects.toThrow(
      /no layout "gone"/
    );
  });

  /** A layout extension that says it ran: `MARK` with the layout's name. */
  const marker = (id = 'grid-hooks'): ExtensionPlugin => ({
    id,
    postLayout(laidOut, ctx) {
      ctx.warn({ code: 'MARK', message: `${id} ${String(ctx.config.layout)}` });
      return laidOut;
    },
  });
  const marks = (ws: readonly Warning[]) =>
    ws.filter((w) => w.code === 'MARK').map((w) => w.message);
  const gridText = (name: string) => `---\nconfig:\n  layout: ${name}\n---\n${FLOW}`;

  it('runs the extension its config module brings, only on renders laid out by its names', async () => {
    const { def } = gridPackage(['grid']);
    for (const register of [
      (m: ReturnType<typeof createMermaid>) =>
        m.registerExternalDiagrams([{ ...def, extension: marker() }]),
      (m: ReturnType<typeof createMermaid>) =>
        addDiscovered(m, [
          { kind: 'plugin', package: 'grid-pkg', plugin: { ...def, extension: marker() } },
        ]),
      (m: ReturnType<typeof createMermaid>) =>
        addDiscovered(m, [
          {
            kind: 'layout',
            package: 'grid-pkg',
            names: ['grid'],
            loader: () => Promise.resolve(layered),
            config: grid,
            extension: marker(),
          },
        ]),
    ]) {
      const m = createMermaid();
      await register(m);
      expect(marks((await m.render('a', gridText('grid'))).warnings)).toEqual(['grid-hooks grid']);
      expect(marks((await m.render('a', FLOW)).warnings)).toEqual([]);
    }
  });

  it('lets an explicit loader of the name replace a discovered package’s extension', async () => {
    const { def } = gridPackage(['grid']);
    const m = createMermaid();
    await addDiscovered(m, [
      { kind: 'plugin', package: 'grid-pkg', plugin: { ...def, extension: marker() } },
    ]);
    m.registerLayoutLoaders([{ name: 'grid', loader: () => Promise.resolve(layered) }]);
    expect(marks((await m.render('a', gridText('grid'))).warnings)).toEqual([]);
    m.registerLayoutLoaders([
      { name: 'grid', loader: () => Promise.resolve(layered), extension: marker('own') },
    ]);
    expect(marks((await m.render('a', gridText('grid'))).warnings)).toEqual(['own grid']);
  });

  it('refuses an extension without a config module to carry it', async () => {
    const { def } = gridPackage(['grid']);
    const { config: _c, ...manifest } = def.manifest;
    await expect(
      createMermaid().registerExternalDiagrams([{ manifest, load: def.load, extension: marker() }])
    ).rejects.toThrow(/extension but no "config" module/);
  });

  // DESIGN §12.2: a layout's extension runs only on renders it lays out, so it may not bring
  // what is decided before the layout is known (parse claims, inline boxes, resources).
  it.each(['inline', 'resources', 'claims'])(
    'refuses `%s` on a layout extension, in every registration path',
    async (key) => {
      const ext = { ...marker(), [key]: [] } as ExtensionPlugin;
      const message = new RegExp(`layout extension "grid-hooks" must not have "${key}"`);
      const loader = () => Promise.resolve(layered);
      expect(() =>
        createMermaid().registerLayoutLoaders([{ name: 'grid', loader, extension: ext }])
      ).toThrow(TypeError);
      expect(() =>
        createMermaid().registerLayoutLoaders([{ name: 'grid', loader, extension: ext }])
      ).toThrow(message);
      const { def } = gridPackage(['grid']);
      await expect(
        createMermaid().registerExternalDiagrams([{ ...def, extension: ext }])
      ).rejects.toThrow(message);
    }
  );

  it('adds a layout extension’s config fragment with the layout', async () => {
    const own: ConfigFragment = { id: 'grid-hooks', keys: { hooks: { on: 0 } }, defaults: {} };
    const m = createMermaid();
    m.registerLayoutLoaders([
      {
        name: 'grid',
        loader: () => Promise.resolve(layered),
        extension: { ...marker(), config: own },
      },
    ]);
    const r = await m.render(
      'a',
      `---\nconfig:\n  layout: grid\n  hooks:\n    on: 1\n---\n${FLOW}`
    );
    expect(codes(r.warnings)).not.toContain('CONFIG_UNKNOWN_KEY');
  });
});
