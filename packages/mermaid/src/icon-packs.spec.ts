import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMermaid,
  MermaidError,
  NotLoadedError,
  type ExtensionPlugin,
  type IconifyJSON,
} from './index.ts';

/** A tiny Iconify pack, as `@iconify-json/logos` exports it (`prefix` is the pack's own). */
const LOGOS: IconifyJSON = {
  prefix: 'logos',
  icons: { aws: { body: '<path d="M0 0h8v8z"/>' } },
  width: 8,
  height: 8,
};
const MDI: IconifyJSON = { prefix: 'mdi', icons: { fire: { body: '<path d="M1 1h6v6z"/>' } } };

const WITH = 'flowchart LR\n  A[logos:aws] --> B\n';
const PLAIN = 'flowchart LR\n  A --> B\n';

/**
 * The fixture icons extension (I2 #322 writes the real one): it names `<pack>:` for every
 * registered pack the diagram's text mentions, asks for each one not yet loaded as an
 * `iconPack` resource, and at render logs what it finds of each through `ctx.iconPacks`.
 */
function icons(log: string[]): ExtensionPlugin {
  const named = (text: string, names: readonly string[]): string[] =>
    names.filter((n) => text.includes(`${n}:`));
  return {
    id: 'icons',
    claims: ['icons'],
    resources: {
      provides: [],
      missing(parse, { iconPacks, format }) {
        if (!iconPacks || format !== 'svg') return [];
        return named(JSON.stringify(parse.ast), iconPacks.names())
          .filter((name) => iconPacks.state(name) !== 'ready')
          .map((name) => ({ kind: 'iconPack', name }) as const);
      },
      load: () => Promise.reject(new Error('the host loads icon packs')),
    },
    postParse(ast, ctx) {
      const packs = ctx.iconPacks;
      for (const n of named(JSON.stringify(ast), packs?.names() ?? [])) {
        const pack = packs!.get(n);
        log.push(pack ? `${n}: ${pack.prefix} ${Object.keys(pack.icons).join(',')}` : `${n}: -`);
      }
      return ast;
    },
  };
}

async function api(log: string[] = []) {
  const m = createMermaid();
  await m.registerExternalDiagrams([icons(log)]);
  await m.preload({ types: ['flowchart'] });
  return m;
}

describe('registerIconPacks (D294)', () => {
  it("takes v12's { name, icons } (docs/config/icons.md, without lazy loading)", async () => {
    const log: string[] = [];
    const m = await api(log);
    m.registerIconPacks([{ name: LOGOS.prefix, icons: LOGOS }]);
    const r = await m.render('a', WITH);
    expect(r.warnings).toEqual([]);
    expect(log).toEqual(['logos: logos aws']);
  });

  afterEach(() => void vi.unstubAllGlobals());

  it('takes a loader from a CDN (docs/config/icons.md)', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve({ json: () => Promise.resolve(LOGOS) });
    });
    const log: string[] = [];
    const m = await api(log);
    m.registerIconPacks([
      {
        name: 'logos',
        loader: () =>
          fetch('https://unpkg.com/@iconify-json/logos@1/icons.json').then((res) => res.json()),
      },
    ]);
    expect((await m.render('a', WITH)).warnings).toEqual([]);
    expect(urls).toEqual(['https://unpkg.com/@iconify-json/logos@1/icons.json']);
    expect(log).toEqual(['logos: logos aws']);
  });

  it('takes a lazy import of a bundled package (docs/config/icons.md)', async () => {
    const log: string[] = [];
    const m = await api(log);
    const module = Promise.resolve({ icons: LOGOS });
    m.registerIconPacks([{ name: 'logos', loader: () => module.then((mod) => mod.icons) }]);
    await m.render('a', WITH);
    expect(log).toEqual(['logos: logos aws']);
  });

  it("keeps v12's quirks: name overrides prefix, and a loader may return the pack itself", async () => {
    const log: string[] = [];
    const m = await api(log);
    m.registerIconPacks([
      { name: 'l', icons: LOGOS },
      { name: 'm', loader: () => MDI },
    ]);
    await m.render('a', 'flowchart LR\n  A[l:aws] --> B[m:fire]\n');
    expect(log).toEqual(['l: l aws', 'm: m fire']);
    expect(LOGOS.prefix).toBe('logos');
  });

  it('runs a loader only for a diagram that names its pack, once', async () => {
    const calls: string[] = [];
    const m = await api();
    m.registerIconPacks([
      { name: 'logos', loader: () => (calls.push('logos'), Promise.resolve(LOGOS)) },
      { name: 'mdi', loader: () => (calls.push('mdi'), Promise.resolve(MDI)) },
    ]);
    await m.render('a', PLAIN);
    expect(calls).toEqual([]);
    await Promise.all([m.render('a', WITH), m.prepare(WITH)]);
    await m.render('b', WITH);
    expect(calls).toEqual(['logos']);
  });

  it('renderSync before the load throws NotLoadedError naming the pack, or draws placeholders', async () => {
    const log: string[] = [];
    const m = await api(log);
    m.registerIconPacks([{ name: 'logos', loader: () => Promise.resolve(LOGOS) }]);
    let thrown: unknown;
    try {
      m.renderSync(WITH);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(NotLoadedError);
    expect((thrown as NotLoadedError).missing).toEqual([{ kind: 'iconPack', name: 'logos' }]);
    expect((thrown as NotLoadedError).message).toMatch(/^Not loaded: iconPack "logos"\./);
    const drawn = m.renderSync(WITH, { placeholders: true });
    expect(drawn.warnings.map((w) => w.code)).toEqual(['PLACEHOLDER']);
    expect(log).toEqual(['logos: -']);
    await m.prepare(WITH);
    expect(m.renderSync(WITH).warnings).toEqual([]);
    expect(log).toEqual(['logos: -', 'logos: logos aws']);
  });

  it('a rejecting loader leaves prepare() resolved, warns naming the pack, and is retried', async () => {
    const log: string[] = [];
    let calls = 0;
    const m = await api(log);
    m.registerIconPacks([
      {
        name: 'logos',
        loader: () => (++calls === 1 ? Promise.reject(new Error('offline')) : LOGOS),
      },
    ]);
    const r = await m.render('a', WITH);
    expect(r.warnings).toEqual([
      {
        code: 'ICON_NOT_RENDERED',
        message: 'Icon pack "logos" failed to load (offline): its icons are not drawn.',
      },
    ]);
    expect(log).toEqual(['logos: -']);
    // renderSync draws without it until a prepare() retries.
    expect(m.renderSync(WITH).warnings.map((w) => w.code)).toEqual(['ICON_NOT_RENDERED']);
    expect(calls).toBe(1);
    await m.prepare(WITH);
    expect(calls).toBe(2);
    expect(m.renderSync(WITH).warnings).toEqual([]);
    expect(log.at(-1)).toBe('logos: logos aws');
  });

  it('a loader that resolves to no pack fails as a rejection does', async () => {
    const m = await api();
    m.registerIconPacks([{ name: 'logos', loader: () => Promise.resolve({}) as never }]);
    expect((await m.render('a', WITH)).warnings[0]?.message).toBe(
      'Icon pack "logos" failed to load (the loader\'s result: it is not Iconify JSON (no icons object)): its icons are not drawn.'
    );
  });

  it('preload({ iconPacks }) runs the named loaders', async () => {
    const calls: string[] = [];
    const m = await api();
    m.registerIconPacks([
      { name: 'logos', loader: () => (calls.push('logos'), Promise.resolve(LOGOS)) },
      { name: 'mdi', loader: () => (calls.push('mdi'), Promise.reject(new Error('offline'))) },
    ]);
    await m.preload({ iconPacks: ['logos', 'mdi', 'unregistered'] });
    expect(calls).toEqual(['logos', 'mdi']);
    expect(m.renderSync(WITH).warnings).toEqual([]);
  });

  it('warns ICON_PACKS_UNSUPPORTED only while no extension claims icons', async () => {
    const m = createMermaid();
    m.registerIconPacks([{ name: 'logos', icons: LOGOS }]);
    const before = await m.render('a', WITH);
    expect(before.warnings.map((w) => w.code)).toEqual(['ICON_PACKS_UNSUPPORTED']);
    // Packs registered before the extension still count.
    const log: string[] = [];
    await m.registerExternalDiagrams([icons(log)]);
    const after = await m.render('a', WITH);
    expect(after.warnings).toEqual([]);
    expect(log).toEqual(['logos: logos aws']);
    // Without an extension the output is what it was without packs.
    const bare = await createMermaid().render('a', WITH);
    expect(before.svg).toBe(bare.svg);
  });

  it('keeps one registry per createMermaid()', async () => {
    const logA: string[] = [];
    const logB: string[] = [];
    const a = await api(logA);
    const b = await api(logB);
    a.registerIconPacks([{ name: 'logos', icons: LOGOS }]);
    await Promise.all([a.render('a', WITH), b.render('a', WITH)]);
    expect(logA).toEqual(['logos: logos aws']);
    expect(logB).toEqual([]);
  });

  it('replaces a pack registered again under its name', async () => {
    const log: string[] = [];
    const m = await api(log);
    m.registerIconPacks([{ name: 'logos', icons: LOGOS }]);
    m.registerIconPacks([{ name: 'logos', loader: () => MDI }]);
    await m.render('a', WITH);
    expect(log).toEqual(['logos: logos fire']);
  });

  it('refuses a pack without a name, or without exactly one of icons and loader', () => {
    const m = createMermaid();
    const bad = (packs: unknown) => () => m.registerIconPacks(packs as never);
    expect(bad([{ icons: LOGOS }])).toThrow(
      new TypeError('An icon pack needs a "name": a non-empty string')
    );
    expect(bad([{ name: 'x' }])).toThrow(
      new TypeError('Icon pack "x" needs either "icons" or a "loader" function')
    );
    expect(bad([{ name: 'x', icons: LOGOS, loader: () => LOGOS }])).toThrow(TypeError);
    expect(bad([{ name: 'x', icons: {} }])).toThrow(
      new TypeError('Icon pack "x": it is not Iconify JSON (no icons object)')
    );
    expect(bad({ name: 'x', icons: LOGOS })).toThrow(TypeError);
    // A bad entry registers none of the call's packs.
    expect(bad([{ name: 'ok', icons: LOGOS }, { name: '' }])).toThrow(TypeError);
  });

  it("is not the extension's resource: an unregistered pack it reports is its error", async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'odd',
        resources: {
          provides: [],
          missing: () => [{ kind: 'iconPack', name: 'nope' }],
          load: async () => {},
        },
      },
    ]);
    const e = await m.render('a', PLAIN).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toBe(
      'Extension "odd" failed in resources: missing() reported iconPack "nope", which it does not provide'
    );
  });
});
