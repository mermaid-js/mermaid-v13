import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMermaid, NotLoadedError, type ExtensionPlugin, type IconifyJSON } from './index.ts';

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
        if (format !== 'svg') return [];
        return named(JSON.stringify(parse.model), iconPacks.names())
          .filter((name) => iconPacks.state(name) !== 'ready')
          .map((name) => ({ kind: 'iconPack', name }) as const);
      },
      load: () => Promise.reject(new Error('the host loads icon packs')),
    },
    postParse(ast, ctx) {
      const packs = ctx.iconPacks;
      for (const n of named(JSON.stringify(ast), packs?.names() ?? [])) {
        const pack = packs!.get(n);
        if (packs!.state(n) === 'failed') log.push(`${n}: failed (${packs!.error(n)})`);
        else
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

  it('a rejecting loader leaves prepare() resolved and the pack failed, retried next time', async () => {
    const log: string[] = [];
    let calls = 0;
    const m = await api(log);
    m.registerIconPacks([
      {
        name: 'logos',
        loader: () => (++calls === 1 ? Promise.reject(new Error('offline')) : LOGOS),
      },
    ]);
    // `mermaid` does not warn: the icons extension does, naming the pack (D299).
    expect((await m.render('a', WITH)).warnings).toEqual([]);
    expect(log).toEqual(['logos: failed (offline)']);
    // renderSync draws without it until a prepare() retries.
    expect(m.renderSync(WITH).warnings).toEqual([]);
    expect(calls).toBe(1);
    await m.prepare(WITH);
    expect(calls).toBe(2);
    expect(m.renderSync(WITH).warnings).toEqual([]);
    expect(log.at(-1)).toBe('logos: logos aws');
  });

  it("does not check a loader's result: the extension reads what it gets", async () => {
    let seen: unknown;
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'reads',
        claims: ['icons'],
        postParse: (ast, ctx) => (
          (seen = [ctx.iconPacks?.state('logos'), ctx.iconPacks?.get('logos')]),
          ast
        ),
      },
    ]);
    m.registerIconPacks([{ name: 'logos', loader: () => Promise.resolve(7) as never }]);
    await m.preload({ iconPacks: ['logos'] });
    await m.render('a', WITH);
    expect(seen).toEqual(['ready', { prefix: 'logos' }]);
  });

  it('loads the pack registered again while its first loader runs (prepare never leaves it pending)', async () => {
    const log: string[] = [];
    const m = await api(log);
    let release!: (pack: typeof LOGOS) => void;
    m.registerIconPacks([
      { name: 'logos', loader: () => new Promise<typeof LOGOS>((r) => (release = r)) },
    ]);
    const prepared = m.prepare(WITH);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    m.registerIconPacks([{ name: 'logos', loader: () => Promise.resolve(MDI) }]);
    release(LOGOS);
    await prepared;
    expect(m.renderSync(WITH).warnings).toEqual([]);
    expect(log.at(-1)).toBe('logos: logos fire');
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
    const refused = new TypeError(
      'registerIconPacks() takes [{ name, icons } or { name, loader }]'
    );
    expect(bad([{ icons: LOGOS }])).toThrow(refused);
    expect(bad([{ name: '', icons: LOGOS }])).toThrow(refused);
    expect(bad([{ name: 'x' }])).toThrow(refused);
    expect(bad([{ name: 'x', loader: LOGOS }])).toThrow(refused);
    expect(bad([{ name: 'x', icons: LOGOS, loader: () => LOGOS }])).toThrow(refused);
    expect(bad([null])).toThrow(refused);
    expect(bad({ name: 'x', icons: LOGOS })).toThrow(refused);
  });

  it('keeps the packs of a refused call out', async () => {
    const log: string[] = [];
    const m = await api(log);
    expect(() =>
      m.registerIconPacks([{ name: 'logos', icons: LOGOS }, { name: '' } as never])
    ).toThrow(TypeError);
    await m.render('a', WITH);
    expect(log).toEqual([]);
  });

  it('ignores an unregistered pack an extension reports: its icons are unresolved (D291)', async () => {
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'odd',
        resources: {
          provides: [],
          missing: () => [{ kind: 'iconPack', name: 'nope' }],
          load: () => Promise.reject(new Error("not the extension's to load")),
        },
      },
    ]);
    expect((await m.render('a', PLAIN)).warnings).toEqual([]);
    expect(m.renderSync(PLAIN).warnings).toEqual([]);
  });

  it('gives resource requests and render contexts the packs read-only, with no register', async () => {
    const seen: string[][] = [];
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'keys',
        claims: ['icons'],
        resources: {
          provides: [],
          missing: (_, { iconPacks }) => (seen.push(Object.keys(iconPacks).sort()), []),
          load: async () => {},
        },
        postParse: (ast, ctx) => (seen.push(Object.keys(ctx.iconPacks ?? {}).sort()), ast),
      },
    ]);
    await m.render('a', PLAIN);
    expect(seen[0]).toEqual(['error', 'get', 'load', 'names', 'state']);
    expect(seen.at(-1)).not.toContain('register');
  });

  it('gives the draw the packs without their loader, so a draw cannot start one (R-ARCH-6)', async () => {
    const seen: string[][] = [];
    const keys = (packs: object | undefined) => void seen.push(Object.keys(packs ?? {}).sort());
    const m = createMermaid();
    await m.registerExternalDiagrams([
      {
        id: 'views',
        claims: ['icons'],
        inline: [{ pattern: /fa:fa-car/, box: (_, r) => keys(r.iconPacks) }],
        glyphs: { glyph: (_, r) => keys(r.iconPacks) },
        postRender: (_, ctx) => keys(ctx.iconPacks),
      },
    ]);
    m.registerIconPacks([
      { name: 'fa', loader: () => Promise.resolve({ prefix: 'fa', icons: {} }) },
    ]);
    await m.render('a', 'flowchart LR\n  A["fa:fa-car"] --> B@{ icon: "fa:car" }');
    expect(seen).toEqual(Array(3).fill(['error', 'get', 'names', 'state']));
  });
});
