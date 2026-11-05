// The icons extension through the public API (D290–D299): label icons, glyphs, packs, warnings.
import { assertInert, writeFragment } from '@mermaid-js/core/svg';
import {
  createMermaid,
  NotLoadedError,
  type DiagramPlugin,
  type IconLoader,
  type Mermaid,
} from 'mermaid';
import { describe, expect, it, vi } from 'vitest';
import { icons } from './index.ts';

/**
 *  CC-BY-4.0
 *  Copyright (c) Fonticons, Inc. - https://fontawesome.com/license/free
 *  https://fontawesome.com/icons/bell?f=classic&s=regular
 */
const BELL_BODY =
  '<path fill="currentColor" d="M224 0c-17.7 0-32 14.3-32 32v19.2C119 66 64 130.6 64 208v25.4c0 45.4-15.5 89.5-43.8 124.9L5.3 377c-5.8 7.2-6.9 17.1-2.9 25.4S14.8 416 24 416h400c9.2 0 17.6-5.3 21.6-13.6s2.9-18.2-2.9-25.4l-14.9-18.6c-28.3-35.5-43.8-79.6-43.8-125V208c0-77.4-55-142-128-156.8V32c0-17.7-14.3-32-32-32m0 96c61.9 0 112 50.1 112 112v25.4c0 47.9 13.9 94.6 39.7 134.6H72.3c25.8-40 39.7-86.7 39.7-134.6V208c0-61.9 50.1-112 112-112m64 352H160c0 17 6.7 33.3 18.7 45.3S207 512 224 512s33.3-6.7 45.3-18.7S288 465 288 448"/>';
const BELL_D = 'd="M224 0c-17.7 0-32 14.3-32 32v19.2C119';
const staticBellIconPack = {
  prefix: 'fa',
  icons: { bell: { body: BELL_BODY, width: 448 } },
  width: 512,
  height: 512,
};

/** A pack of square icons, each a path whose `d` names it (`M0 0H<n>`), for `names`. */
function pack(prefix: string, names: readonly string[]) {
  return {
    prefix,
    width: 24,
    height: 24,
    icons: Object.fromEntries(
      names.map((n, i) => [
        n,
        { body: `<path fill="currentColor" d="M0 0H${String(i + 1)}V24z"/>` },
      ])
    ),
  };
}

async function api(...packs: IconLoader[]): Promise<Mermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  await m.registerExternalDiagrams([icons]);
  if (packs.length > 0) m.registerIconPacks(packs);
  await m.preload({ types: ['flowchart'] });
  return m;
}

const flow = (label: string) => `flowchart LR\n  A["${label}"]`;
const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);
const message = (r: { warnings: readonly { code: string; message: string }[] }, code: string) =>
  r.warnings.find((w) => w.code === code)?.message;
/** The label text (`<tspan>`s, lines) of a render, with its white space collapsed. */
const text = (svg: string) =>
  [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>|<text[^>]*>([^<]+)<\/text>/g)]
    .map((m) => m[1] ?? m[2])
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
/** The icon boxes drawn: each box's `<g transform="scale(…)">` scale. */
const boxes = (svg: string) =>
  [...svg.matchAll(/<g transform="(?:translate\([^)]*\) )?scale\(([\d.]+)\)">/g)].length;

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error('did not throw');
}

// v12 `rendering-util/createText.spec.ts` (`replaceIconSubstring`), as renders. v12 wrote
// `<i class>` for a prefix with no pack (Font Awesome CSS); v13 shows it as written (D291).
describe('v12 createText.spec.ts icon cases, as renders', () => {
  it('converts FontAwesome icon notations: drawn from the packs, else as written', async () => {
    const input = 'This is an icon: fa:fa-user and fab:fa-github';
    const drawn = await api(
      { name: 'fa', icons: pack('fa', ['user']) },
      { name: 'fab', icons: pack('fab', ['github']) }
    );
    const r = await drawn.render('i', flow(input));
    expect(codes(r)).toEqual([]);
    expect(text(r.svg)).toBe('This is an icon: and');
    expect(r.svg).toContain('d="M0 0H1V24z"');
    expect(boxes(r.svg)).toBe(2);

    const bare = await (await api()).render('i', flow(input));
    expect(text(bare.svg)).toBe(input);
    expect(codes(bare)).toEqual(['ICON_NOT_RENDERED']);
    expect(message(bare, 'ICON_NOT_RENDERED')).toBe(
      'Icons not rendered: fa:fa-user (no pack "fa" is registered), fab:fa-github (no pack "fab" is registered). Labels show them as written.'
    );
  });

  it('handles strings without FontAwesome icon notations: no change, no warning, no loader', async () => {
    const loader = vi.fn(() => Promise.resolve(staticBellIconPack));
    const m = await api({ name: 'fa', loader });
    const input = 'This string has no icons';
    const r = await m.render('i', flow(input));
    expect(text(r.svg)).toBe(input);
    expect(codes(r)).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
    // The SVG is the one a render without the extension draws.
    const without = createMermaid();
    without.initialize({ deterministic: true });
    expect(r.svg).toBe((await without.render('i', flow(input))).svg);
  });

  it('correctly processes multiple FontAwesome icon notations in one string', async () => {
    const m = await api(
      { name: 'fa', icons: pack('fa', ['arrow-right']) },
      { name: 'fak', icons: pack('fak', ['truck']) },
      { name: 'fas', icons: pack('fas', ['home']) }
    );
    const r = await m.render(
      'i',
      flow('Icons galore: fa:fa-arrow-right, fak:fa-truck, fas:fa-home')
    );
    expect(codes(r)).toEqual([]);
    expect(text(r.svg)).toBe('Icons galore: , ,');
    expect(boxes(r.svg)).toBe(3);
  });

  it('correctly replaces a very long icon name with the fak prefix', async () => {
    const m = await api({ name: 'fak', icons: pack('fak', ['truck-driving-long-winding-road']) });
    const r = await m.render(
      'i',
      flow('Here is a long icon: fak:fa-truck-driving-long-winding-road in use')
    );
    expect(codes(r)).toEqual([]);
    expect(text(r.svg)).toBe('Here is a long icon: in use');
    expect(r.svg).toContain('d="M0 0H1V24z"');
  });

  it('correctly process the registered icons: the bell from a loader', async () => {
    const m = await api({ name: 'fa', loader: () => Promise.resolve(staticBellIconPack) });
    const r = await m.render('i', flow('Icons galore: fa:fa-bell'));
    expect(r.svg).toContain(BELL_D);
    expect(text(r.svg)).toBe('Icons galore:');
    expect(codes(r)).toEqual([]);
  });
});

/** A ready, read-only packs view holding `packs`, as the API hands it to providers. */
const ready = (packs: Record<string, unknown>) => ({
  names: () => Object.keys(packs),
  state: (n: string) => (n in packs ? ('ready' as const) : undefined),
  get: (n: string) => packs[n] as never,
  error: () => undefined,
});

describe('label icons (D292, D296)', () => {
  it('is 1em tall, 1em × its aspect wide, its bottom 0.125em below the baseline', () => {
    const warn = vi.fn();
    const metrics = { ascent: 16, descent: 4, lineHeight: 24 };
    const box = icons.inline![0]!.box('fa:fa-bell', {
      font: { family: 'sans-serif', size: 20, weight: 400 },
      measurer: { id: 'x', width: () => 10, metrics: () => metrics },
      metrics,
      ex: 10,
      warn,
      iconPacks: ready({ fa: staticBellIconPack }),
      scratch: {},
    });
    // The bell is 448 × 512: 20 px tall, 17.5 px wide, its baseline at 17.5 px.
    expect(box).toMatchObject({ width: 17.5, height: 20, baseline: 17.5 });
    expect(box!.node).toMatchObject({ tag: 'g', attrs: { transform: 'scale(0.039063)' } });
    expect(warn).not.toHaveBeenCalled();
  });

  it('takes the label text colour: currentColor fills inherit the label fill', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    const r = await m.render('i', 'flowchart LR\n  A["fa:fa-bell ring"]\n  style A color:#f00');
    expect(r.svg).toMatch(
      /<g fill="#f00" transform="translate\([^"]*\)"><g transform="scale\([\d.]+\)"><path d="M224 0/
    );
  });

  it('keeps a fill an icon sets itself, and currentColor under it', async () => {
    const body =
      '<g fill="#00f"><path fill="currentColor" d="M0 0H1z"/></g><path fill="currentColor" d="M0 0H2z"/>';
    const m = await api({ name: 'fa', icons: { prefix: 'fa', icons: { two: { body } } } });
    const r = await m.render('i', flow('fa:fa-two'));
    expect(r.svg).toContain(
      '<g fill="#00f"><path fill="currentColor" d="M0 0H1z"/></g><path d="M0 0H2z"/>'
    );
  });

  it('works in an edge label, a subgraph title, class, state, ER and sequence', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    for (const source of [
      'flowchart LR\n  A -- "fa:fa-bell" --> B',
      'flowchart LR\n  subgraph S["fa:fa-bell"]\n    A\n  end',
      'classDiagram\n  class A["fa:fa-bell"]',
      'stateDiagram-v2\n  s1 : fa:fa-bell',
      'erDiagram\n  A ||--o{ B : "fa:fa-bell"',
      'sequenceDiagram\n  A->>B: fa:fa-bell',
    ]) {
      const r = await m.render('i', source);
      expect(r.svg, source).toContain(BELL_D);
      expect(codes(r), source).toEqual([]);
    }
  });

  it('warns once per render, naming every icon that does not resolve and why', async () => {
    const m = await api({ name: 'fa', icons: pack('fa', ['car']) });
    const r = await m.render(
      'i',
      'flowchart LR\n  A["fa:fa-nope"] --> B["fab:fa-github fa:fa-car"] --> C["fa:fa-nope again"]'
    );
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(message(r, 'ICON_NOT_RENDERED')).toBe(
      'Icons not rendered: fa:fa-nope (pack "fa" has no icon "nope"), fab:fa-github (no pack "fab" is registered). Labels show them as written.'
    );
    expect(text(r.svg)).toContain('fa:fa-nope');
    expect(boxes(r.svg)).toBe(1);
  });

  it('matches without a left boundary (sofa:fa-x) and not a generic pack:name (D296)', async () => {
    const m = await api(
      { name: 'fa', icons: pack('fa', ['x']) },
      { name: 'note', icons: pack('note', ['item']) }
    );
    const r = await m.render('i', flow('sofa:fa-x note:item'));
    expect(text(r.svg)).toBe('so note:item');
    expect(boxes(r.svg)).toBe(1);
  });

  it('text output shows icons as written, with ASCII_DROPPED, and runs no loader (D299)', async () => {
    const loader = vi.fn(() => Promise.resolve(staticBellIconPack));
    const m = await api({ name: 'fa', loader });
    const r = await m.render('i', flow('fa:fa-bell'), { format: 'ascii' });
    expect(r.text).toContain('fa:fa-bell');
    expect(r.warnings).toEqual([
      expect.objectContaining({ code: 'ASCII_DROPPED', feature: 'icon' }),
    ]);
    expect(loader).not.toHaveBeenCalled();
  });
});

describe('packs (D290, D294, D299)', () => {
  it('runs only the loaders of the packs a diagram names', async () => {
    const fa = vi.fn(() => Promise.resolve(staticBellIconPack));
    const mdi = vi.fn(() => Promise.resolve(pack('mdi', ['fire'])));
    const m = await api({ name: 'fa', loader: fa }, { name: 'mdi', loader: mdi });
    await m.render('i', 'flowchart LR\n  A --> B');
    expect([fa.mock.calls.length, mdi.mock.calls.length]).toEqual([0, 0]);
    await m.render('i', flow('fa:fa-bell'));
    expect([fa.mock.calls.length, mdi.mock.calls.length]).toEqual([1, 0]);
    await m.render('i', 'flowchart LR\n  A@{ icon: "mdi:fire" }');
    expect([fa.mock.calls.length, mdi.mock.calls.length]).toEqual([1, 1]);
  });

  it('renderSync before the pack has loaded throws NotLoadedError naming it', async () => {
    const m = await api({ name: 'fa', loader: () => Promise.resolve(staticBellIconPack) });
    const e = thrown(() => m.renderSync(flow('fa:fa-bell')));
    expect(e).toBeInstanceOf(NotLoadedError);
    expect((e as NotLoadedError).missing).toEqual([{ kind: 'iconPack', name: 'fa' }]);
    await m.prepare(flow('fa:fa-bell'));
    expect(m.renderSync(flow('fa:fa-bell')).svg).toContain(BELL_D);
  });

  it('with placeholders, draws an empty 1em box in labels and the frame alone in shapes', async () => {
    const m = await api({ name: 'fa', loader: () => Promise.resolve(staticBellIconPack) });
    const r = m.renderSync(
      'flowchart LR\n  A["a fa:fa-bell b"] --> B@{ icon: "fa:bell", form: "square" }',
      {
        placeholders: true,
      }
    );
    // No ICON_UNAVAILABLE: the deprecated alias goes only with ICON_NOT_RENDERED (D299).
    expect(codes(r)).toEqual(['PLACEHOLDER']);
    expect(message(r, 'PLACEHOLDER')).toContain('iconPack "fa"');
    expect(text(r.svg)).toBe('a b');
    expect(r.svg).toMatch(/<g transform="translate\([^"]*\)"><g\/><\/g>/);
    expect(r.svg).not.toContain(BELL_D);
  });

  it('an unregistered pack is unresolved, not missing (D291)', async () => {
    const m = await api({ name: 'fa', loader: () => Promise.resolve(staticBellIconPack) });
    const r = m.renderSync(flow('fab:fa-github'));
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(text(r.svg)).toBe('fab:fa-github');
  });

  it('a pack whose loader rejects: shown as written, the warning names it, prepare() retries', async () => {
    let calls = 0;
    const m = await api({
      name: 'fa',
      loader: () =>
        ++calls === 1
          ? Promise.reject(new Error(`network down ${'x'.repeat(80)}`))
          : Promise.resolve(staticBellIconPack),
    });
    const failed = await m.render('i', flow('fa:fa-bell'));
    expect(codes(failed)).toEqual(['ICON_NOT_RENDERED']);
    expect(message(failed, 'ICON_NOT_RENDERED')).toBe(
      `Icons not rendered: fa:fa-bell (pack "fa" failed to load (network down ${'x'.repeat(47)}…)). Labels show them as written.`
    );
    expect(text(failed.svg)).toBe('fa:fa-bell');
    // renderSync does not throw for it: it is unresolved until the next prepare().
    expect(codes(m.renderSync(flow('fa:fa-bell')))).toEqual(['ICON_NOT_RENDERED']);
    const retried = await m.render('i', flow('fa:fa-bell'));
    expect(codes(retried)).toEqual([]);
    expect(retried.svg).toContain(BELL_D);
  });

  it('checks the pack it gets: a loader that gives no icons object is not Iconify JSON', async () => {
    const m = await api({ name: 'fa', loader: () => Promise.resolve({ icons: 'bell' } as never) });
    const r = await m.render('i', flow('fa:fa-bell'));
    expect(message(r, 'ICON_NOT_RENDERED')).toContain('fa:fa-bell (pack "fa" is not Iconify JSON)');
  });

  it('claims icons: no ICON_PACKS_UNSUPPORTED with the extension (D299)', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    expect(codes(await m.render('i', 'flowchart LR\n  A'))).toEqual([]);
  });

  it('packs registered before the extension count (D294)', async () => {
    const m = createMermaid();
    m.initialize({ deterministic: true });
    m.registerIconPacks([{ name: 'fa', icons: staticBellIconPack }]);
    await m.registerExternalDiagrams([icons]);
    expect((await m.render('i', flow('fa:fa-bell'))).svg).toContain(BELL_D);
  });
});

describe('glyphs (D292, D293)', () => {
  it('draws a flowchart icon shape’s glyph fitted into its frame (xMidYMid meet)', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    const r = await m.render('i', 'flowchart LR\n  A@{ icon: "fa:bell", form: "square" }');
    expect(codes(r)).toEqual([]);
    // 448 × 512 in a 48 px square: scale 48/512, centred across, 3 px in from each side.
    expect(r.svg).toContain(
      '<g transform="translate(3,0) scale(0.09375)"><path fill="currentColor" d="M224 0'
    );
  });

  it('fits by the longer side and folds the box offset in', async () => {
    const m = await api({
      name: 'w',
      icons: {
        prefix: 'w',
        icons: { wide: { body: '<path d="M0 0H1z"/>', left: -10, top: 5, width: 40, height: 20 } },
      },
    });
    const r = await m.render('i', 'flowchart LR\n  A@{ icon: "w:wide", form: "circle" }');
    // s = 48/40 = 1.2; across: −(−10)·1.2 = 12; down: (48 − 24)/2 − 5·1.2 = 6.
    expect(r.svg).toContain('<g transform="translate(12,6) scale(1.2)"><path d="M0 0H1z"/></g>');
  });

  it('names unresolved glyphs in the one ICON_NOT_RENDERED, beside label icons', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    const r = await m.render(
      'i',
      'flowchart LR\n  A["fa:fa-nope"] --> B@{ icon: "fa:nada" }\n  C@{ icon: "user" }'
    );
    // Each glyph's own failure is named after the label icon's, in the order drawn.
    expect(message(r, 'ICON_NOT_RENDERED')).toBe(
      'Icons not rendered: fa:fa-nope (pack "fa" has no icon "nope"), fa:nada (pack "fa" has no icon "nada"), user (not a pack:name icon name). Labels show them as written; their shapes are drawn without them.'
    );
    // Flowchart's deprecated alias names the shapes (D299).
    expect(message(r, 'ICON_UNAVAILABLE')).toMatch(/Icons not drawn: "fa:nada", "user";/);
    expect(codes(r).filter((c) => c === 'ICON_NOT_RENDERED')).toHaveLength(1);
  });

  it('says only what shapes do when only shape icons fail', async () => {
    const m = await api({ name: 'fa', icons: staticBellIconPack });
    const r = await m.render('i', 'flowchart LR\n  A["fa:fa-bell"] --> B@{ icon: "fa:nada" }');
    expect(message(r, 'ICON_NOT_RENDERED')).toBe(
      'Icons not rendered: fa:nada (pack "fa" has no icon "nada"). Their shapes are drawn without them.'
    );
  });

  it('splits a glyph name as v12 did, not as label text (fa:fa-bell is icon fa-bell)', async () => {
    const m = await api({ name: 'fa', icons: pack('fa', ['fa-bell']) });
    const r = await m.render('i', 'flowchart LR\n  A@{ icon: "fa:fa-bell", form: "square" }');
    expect(codes(r)).toEqual([]);
    expect(r.svg).toContain('d="M0 0H1V24z"');
  });

  // A diagram that draws its icons with a fallback pack (as M5's architecture will), listing
  // them with it in `icons()` so `prepare()` loads that pack.
  const fallbackDiagram: DiagramPlugin<readonly string[]> = {
    id: 'glyphs',
    layoutKind: 'custom',
    formats: ['svg'],
    detector: (source) => source.trimStart().startsWith('glyphs'),
    parse: (source) => ({
      model: source.trim().split(/\s+/).slice(1),
      ast: { id: 'x', type: 'T', range: { start: 0, end: source.length } },
      diagnostics: [],
      symbols: [],
      statements: [],
    }),
    icons: (names) => names.map((name) => ({ name, fallbackPrefix: 'arch' })),
    render(names, _layout, ctx, w) {
      w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 24, 24] });
      for (const name of names) {
        const glyph = ctx.icon?.(name, 24, { fallbackPrefix: 'arch' });
        if (glyph) writeFragment(w, glyph);
      }
      w.close();
    },
  };

  it('loads a pack named only through a fallbackPrefix in icons()', async () => {
    const loader = vi.fn(() => Promise.resolve(pack('arch', ['database'])));
    const m = await api({ name: 'arch', loader });
    await m.registerExternalDiagrams([icons, fallbackDiagram]);
    const thrownBefore = thrown(() => m.renderSync('glyphs database'));
    expect((thrownBefore as NotLoadedError).missing).toEqual([{ kind: 'iconPack', name: 'arch' }]);
    const r = await m.render('i', 'glyphs database');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(codes(r)).toEqual([]);
    expect(r.svg).toContain('<g transform="scale(1)"><path fill="currentColor" d="M0 0H1V24z"/>');
    const unknown = await m.render('i', 'glyphs nope');
    expect(message(unknown, 'ICON_NOT_RENDERED')).toBe(
      'Icons not rendered: nope (pack "arch" has no icon "nope"). Their shapes are drawn without them.'
    );
  });
});

describe('ICON_SIMPLIFIED (D295)', () => {
  it('warns once per render, naming the icons whose bodies were simplified', async () => {
    const grad = '<defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0H1z"/>';
    const m = await api({
      name: 'fa',
      icons: {
        prefix: 'fa',
        icons: { a: { body: grad }, b: { body: grad }, c: { body: '<path d="M0 0H1z"/>' } },
      },
    });
    const r = await m.render(
      'i',
      'flowchart LR\n  A["fa:fa-a fa:fa-c"] --> B["fa:fa-b"] --> C@{ icon: "fa:a" }'
    );
    expect(codes(r)).toEqual(['ICON_SIMPLIFIED']);
    expect(message(r, 'ICON_SIMPLIFIED')).toMatch(/: fa:fa-a, fa:fa-b, fa:a\.$/);
    assertInert(r.svg, { themeStyle: r.svg.includes('<style>') });
  });
});
