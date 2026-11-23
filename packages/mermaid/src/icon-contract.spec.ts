// The core contract icons build on (D293, T0 #314): pattern providers, the icon feature's
// warning, the glyph slot (`RenderContext.icon`) and `DiagramPlugin.icons`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { InlinePatternProvider } from '@mermaid-js/core/text';
import type { DiagramIcon } from '@mermaid-js/core';
import { createMermaid, MermaidError, type ExtensionPlugin } from './index.ts';

function api(...extensions: ExtensionPlugin[]) {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return { m, ready: m.registerExternalDiagrams(extensions) };
}

const codes = (warnings: readonly { code: string }[]): string[] => warnings.map((w) => w.code);

const FLOW = 'flowchart LR\n  A["fa:fa-car Car"] --> B("fab:fa-github and fa:fa-x")';

describe('label icons without a provider (D291, D296)', () => {
  it('shows them as written, with one ICON_NOT_RENDERED per render', async () => {
    const { m } = api();
    for (let i = 0; i < 2; i++) {
      const r = await m.render('x', FLOW);
      expect(codes(r.warnings)).toEqual(['ICON_NOT_RENDERED']);
      expect(r.svg).toContain('fa:fa-car Car');
    }
    expect(codes(m.renderSync(FLOW).warnings)).toEqual(['ICON_NOT_RENDERED']);
  });

  it('takes the D296 prefixes, with no left boundary, and nothing else', async () => {
    const { m } = api();
    for (const label of ['fad:fa-x', 'fak:fa-x', 'sofa:fa-x', 'fas:fa-a-b_c'])
      expect(codes((await m.render('x', `flowchart LR\n  A["${label}"]`)).warnings), label).toEqual(
        ['ICON_NOT_RENDERED']
      );
    for (const label of ['note:item', 'mdi:fire', 'fa:car', 'fax:fa-x', 'fa: fa-x'])
      expect(codes((await m.render('x', `flowchart LR\n  A["${label}"]`)).warnings), label).toEqual(
        []
      );
  });

  it('names the feature, not a package (D153)', async () => {
    const [w] = (await api().m.render('x', FLOW)).warnings;
    expect(w?.message).toMatch(/icon/i);
    expect(w?.message).not.toMatch(/@mermaid-js|plugin/);
  });

  it('warns ASCII_DROPPED for icons in text output (D299)', async () => {
    const r = await api().m.render('x', FLOW, { format: 'ascii' });
    expect(r.warnings.map((w) => `${w.code}:${w.feature ?? ''}`)).toEqual(['ASCII_DROPPED:icon']);
  });
});

/**
 * The fixture pattern provider: D296's pattern, a box 1em tall and 10 px wide per character of the
 * icon name, baseline at 0.875em (v12's `.label-icon`), drawn as a frame.
 */
const icon: InlinePatternProvider = {
  pattern: /(fa[bdklrs]?):fa-([\w-]+)/,
  box: (source, { font }) => {
    const name = /fa-([\w-]+)$/.exec(source)![1]!;
    const width = 10 * name.length;
    return {
      width,
      height: font.size,
      baseline: 0.875 * font.size,
      node: { tag: 'rect', attrs: { class: 'fixture-icon', width, height: font.size } },
    };
  },
};
const icons: ExtensionPlugin = { id: 'fixture-icons', inline: [icon] };

const RE_BOX =
  /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"><rect class="fixture-icon" width="([\d.]+)"/g;
/** Each drawn box: its top-left corner and width. */
const boxes = (svg: string): { x: number; y: number; width: number }[] =>
  [...svg.matchAll(RE_BOX)].map((m) => ({ x: +m[1]!, y: +m[2]!, width: +m[3]! }));
/** The baselines (`y`) of every positioned tspan. */
const baselines = (svg: string): number[] =>
  [...svg.matchAll(/<tspan x="-?[\d.]+" y="(-?[\d.]+)"/g)].map((m) => +m[1]!);
/** How many lines these baselines make (equal within 0.01 px). */
const lines = (ys: number[]): number =>
  ys.sort((a, b) => a - b).filter((y, i, all) => i === 0 || y - all[i - 1]! > 0.01).length;

describe('pattern providers (D293)', () => {
  it('box every match, each handed the whole match, and silence the feature warning', async () => {
    const seen: string[] = [];
    const spy: ExtensionPlugin = {
      id: 'spy',
      inline: [{ pattern: icon.pattern, box: (s, r) => (seen.push(s), icon.box(s, r)) }],
    };
    const { m, ready } = api(spy);
    await ready;
    const r = await m.render('x', FLOW);
    expect(codes(r.warnings)).toEqual([]);
    expect(seen).toEqual(['fa:fa-car', 'fab:fa-github', 'fa:fa-x']);
    expect(boxes(r.svg).map((b) => b.width)).toEqual([30, 60, 10]);
    expect(r.svg).not.toContain('fa-');
  });

  it('wraps a box as one piece at several widths', async () => {
    const label = 'flowchart LR\n  A["aaaa fa:fa-wxyz aaaa"]';
    const rows: number[] = [];
    for (const wrappingWidth of [200, 60, 30, 5]) {
      const m = createMermaid();
      m.initialize({ deterministic: true, flowchart: { wrappingWidth } });
      await m.registerExternalDiagrams([icons]);
      const { svg } = await m.render('x', label);
      expect(
        boxes(svg).map((b) => b.width),
        String(wrappingWidth)
      ).toEqual([40]);
      // The label font is 14 px, so a box's baseline is 12.25 px below its top.
      rows.push(lines([...baselines(svg), ...boxes(svg).map((b) => b.y + 12.25)]));
    }
    // The 40 px box: one line at 200; at 60 it fits beside neither 'aaaa' (about 35 px), so it
    // takes a line of its own; at 30 each 'aaaa' splits in two and the box keeps its line; at 5
    // every character takes a line and the box one more, whole.
    expect(rows).toEqual([1, 3, 5, 9]);
  });

  it('lets the span that starts first win, pairs and patterns alike', async () => {
    const seen: string[] = [];
    const pair: ExtensionPlugin = {
      id: 'pair',
      inline: [
        {
          open: '[[',
          close: ']]',
          box: (s, r) => (seen.push(`pair ${s}`), icon.box('fa:fa-p', r)),
        },
      ],
    };
    const pattern: ExtensionPlugin = {
      id: 'pattern',
      inline: [
        { pattern: icon.pattern, box: (s, r) => (seen.push(`pattern ${s}`), icon.box(s, r)) },
      ],
    };
    const { m, ready } = api(pair, pattern);
    await ready;
    await m.render('x', 'flowchart LR\n  A["[[fa:fa-in]] fa:fa-out [[x]]"]');
    expect(seen).toEqual(['pair fa:fa-in', 'pattern fa:fa-out', 'pair x']);
  });

  it('warns about a match no pattern provider takes whole', async () => {
    const narrow: ExtensionPlugin = {
      id: 'narrow',
      inline: [{ pattern: /fa:fa-x\b/, box: icon.box }],
    };
    const { m, ready } = api(narrow);
    await ready;
    expect(codes((await m.render('x', 'flowchart LR\n  A["fa:fa-x"]')).warnings)).toEqual([]);
    const r = await m.render('x', FLOW);
    expect(codes(r.warnings)).toEqual(['ICON_NOT_RENDERED']);
    expect(boxes(r.svg).map((b) => b.width)).toEqual([10]);
  });

  it('refuses a provider with neither a pair nor a pattern, or without box()', async () => {
    for (const p of [
      { box: icon.box },
      { pattern: 'fa:fa-x', box: icon.box },
      { open: '[[', box: icon.box },
      { open: '', close: ']]', box: icon.box },
      { pattern: icon.pattern },
    ]) {
      const m = createMermaid();
      await expect(
        m.registerExternalDiagrams([{ id: 'bad', inline: [p as never] }]),
        JSON.stringify(p)
      ).rejects.toThrow(/"bad".*or a pattern/);
    }
  });

  it('warns about a match a provider takes in isolation but not in the label (sofa:fa-car)', async () => {
    const bounded: ExtensionPlugin = {
      id: 'bounded',
      inline: [{ pattern: /\bfa:fa-[\w-]+/, box: icon.box }],
    };
    const { m, ready } = api(bounded);
    await ready;
    const r = await m.render('x', 'flowchart LR\n  A["sofa:fa-car"]');
    expect(boxes(r.svg)).toEqual([]);
    expect(codes(r.warnings)).toEqual(['ICON_NOT_RENDERED']);
    const fine = await m.render('x', 'flowchart LR\n  A["so fa:fa-car"]');
    expect(boxes(fine.svg).map((b) => b.width)).toEqual([30]);
    expect(codes(fine.warnings)).toEqual([]);
  });

  it("warns about a match a provider's span covers only in part (fa:fa-car2)", async () => {
    const letters: ExtensionPlugin = {
      id: 'letters',
      inline: [{ pattern: /fa:fa-[a-z]+/, box: icon.box }],
    };
    const { m, ready } = api(letters);
    await ready;
    const r = await m.render('x', 'flowchart LR\n  A["fa:fa-car2"]');
    expect(boxes(r.svg).map((b) => b.width)).toEqual([30]);
    expect(codes(r.warnings)).toEqual(['ICON_NOT_RENDERED']);
  });

  it("is quiet about an icon inside another provider's span", async () => {
    const pair: ExtensionPlugin = {
      id: 'pair',
      inline: [{ open: '[[', close: ']]', box: (_, r) => icon.box('fa:fa-p', r) }],
    };
    const { m, ready } = api(pair);
    await ready;
    expect(codes((await m.render('x', 'flowchart LR\n  A["[[fa:fa-x]]"]')).warnings)).toEqual([]);
  });

  it('steps over an empty match by a code point, also for u and v patterns', async () => {
    // `v` is ES2024 syntax, so built at run time.
    for (const pattern of [/x*/u, new RegExp('x*', 'v'), /x*/]) {
      const seen: string[] = [];
      const { m, ready } = api({
        id: 'empty',
        inline: [{ pattern, box: (s, r) => (seen.push(s), icon.box('fa:fa-x', r)) }],
      });
      await ready;
      await m.render('x', 'flowchart LR\n  A["a😀b x 😀"]');
      expect(seen, String(pattern)).toEqual(['x']);
    }
  });

  it("gives providers the render's icon packs (D294)", async () => {
    const seen: unknown[] = [];
    const { m, ready } = api({
      id: 'packs',
      inline: [
        {
          pattern: icon.pattern,
          box: (s, r) => (seen.push(r.iconPacks?.get('fa')?.prefix), icon.box(s, r)),
        },
      ],
    });
    m.registerIconPacks([{ name: 'fa', icons: { prefix: 'fa6-solid', icons: {} } }]);
    await ready;
    await m.render('x', FLOW);
    expect(seen).toEqual(['fa', 'fa', 'fa']);
  });

  it('blames the extension for a throwing pattern provider', async () => {
    const { m, ready } = api({
      id: 'broken-icons',
      inline: [
        {
          pattern: icon.pattern,
          box: () => {
            throw new Error('boom');
          },
        },
      ],
    });
    await ready;
    const e = await m.render('x', FLOW).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).message).toMatch(/"broken-icons" failed in inline: boom/);
  });
});

/**
 * The fixture glyph: a frame filling the square it is asked for, so where it lands is visible. The
 * provider fits its glyph (D293); core draws the fragment as given.
 */
const GLYPH = (size: number) =>
  ({ tag: 'rect', attrs: { class: 'fixture-glyph', width: size, height: size } }) as const;
const SHAPE = 'flowchart LR\n  A@{ icon: "fa:bell", form: square, h: 64 }';
const RE_GLYPH =
  /<g transform="translate\((-?[\d.]+),(-?[\d.]+)\)"(?: color="[^"]*")?><(?:rect|g) class="fixture-glyph"/g;

describe('the glyph slot (D293)', () => {
  it("reaches flowchart's render context, drawn in the icon's square", async () => {
    const asked: unknown[] = [];
    const { m, ready } = api({
      id: 'fixture-glyphs',
      glyphs: {
        glyph: (name, { size, fallbackPrefix }) => (
          asked.push({ name, size, fallbackPrefix }),
          GLYPH(size)
        ),
      },
    });
    await ready;
    const r = await m.render('x', SHAPE);
    expect(asked).toEqual([{ name: 'fa:bell', size: 64, fallbackPrefix: undefined }]);
    expect(codes(r.warnings)).toEqual([]);
    const drawn = [...r.svg.matchAll(RE_GLYPH)];
    expect(drawn).toHaveLength(1);
    // Centred in the frame, which leaves flowchart.padding (15) around it (#1150).
    const frame = /<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="79" height="79"/.exec(r.svg)!;
    expect(drawn[0]!.slice(1, 3).map(Number)).toEqual([+frame[1]! + 7.5, +frame[2]! + 7.5]);
  });

  it("keeps the provider's fitting exact, as for a 2048-unit pack", async () => {
    // 2048 units in 64 px: scale 0.03125, which rounding to 0.01 would make 0.03 (61 px).
    const { m, ready } = api({
      id: 'fitted',
      glyphs: {
        glyph: (_, { size }) => ({
          tag: 'g',
          // Exact, as the plugin writes it (the path helpers round to 0.01).
          attrs: { class: 'fixture-glyph', transform: `scale(${size / 2048})` as never },
          children: [{ tag: 'rect', attrs: { width: 2048, height: 2048 } }],
        }),
      },
    });
    await ready;
    const { svg } = await m.render('x', SHAPE);
    expect(svg).toContain('<g class="fixture-glyph" transform="scale(0.03125)">');
  });

  it('asks each extension in registration order until one has the glyph', async () => {
    const asked: string[] = [];
    const none = { id: 'none', glyphs: { glyph: () => (asked.push('none'), undefined) } };
    const some = { id: 'some', glyphs: { glyph: () => (asked.push('some'), GLYPH(8)) } };
    const late = { id: 'late', glyphs: { glyph: () => (asked.push('late'), GLYPH(8)) } };
    const { m, ready } = api(none, some, late);
    await ready;
    expect([...(await m.render('x', SHAPE)).svg.matchAll(RE_GLYPH)]).toHaveLength(1);
    expect(asked).toEqual(['none', 'some']);
  });

  it('keeps the frame-only drawing, and says so, when no extension has the glyph', async () => {
    const without = await api().m.render('x', SHAPE);
    const { m, ready } = api({ id: 'none', glyphs: { glyph: () => undefined } });
    await ready;
    const declined = await m.render('x', SHAPE);
    expect(declined.svg).toBe(without.svg);
    // No extension warned about it (they warn only for `null`, D291), so flowchart says
    // ICON_NOT_RENDERED itself, with the deprecated alias (D299), as it does without one.
    expect(codes(declined.warnings)).toEqual(['ICON_NOT_RENDERED', 'ICON_UNAVAILABLE']);
    expect(declined.warnings[0]?.message).toMatch(/no icons extension has/);
    expect(codes(without.warnings)).toEqual(['ICON_NOT_RENDERED', 'ICON_UNAVAILABLE']);
  });

  it('draws the frame alone, quietly, for a placeholder (D299)', async () => {
    const without = await api().m.render('x', SHAPE);
    const { m, ready } = api({ id: 'loading', glyphs: { glyph: () => 'pending' } });
    await ready;
    const pending = await m.render('x', SHAPE);
    expect(pending.svg).toBe(without.svg);
    expect(codes(pending.warnings)).toEqual([]);
  });

  it("gives a provider's warning once per render", async () => {
    const warning = { code: 'FIXTURE_GLYPH', message: 'drawn twice' };
    const { m, ready } = api({
      id: 'warns',
      glyphs: { glyph: (_, { warn }) => (warn(warning), warn(warning), GLYPH(8)) },
    });
    await ready;
    const r = await m.render('x', `${SHAPE}\n  B@{ icon: "fa:car", form: circle }`);
    expect(codes(r.warnings)).toEqual(['FIXTURE_GLYPH']);
  });

  it('gives ICON_NOT_RENDERED once per render across labels, glyphs and core (D291)', async () => {
    const unresolved = (name: string) => ({
      code: 'ICON_NOT_RENDERED',
      message: `Icon "${name}" is not in a registered pack: it is shown as written.`,
    });
    const { m, ready } = api({
      id: 'unresolved',
      inline: [{ pattern: /fa:fa-car/, box: (s, { warn }) => void warn(unresolved(s)) }],
      glyphs: { glyph: (name, { warn }) => void warn(unresolved(name)) },
    });
    await ready;
    // A label icon the provider declines, a shape icon it has no glyph for, and one core warns about.
    const r = await m.render('x', `${SHAPE}\n  B["fa:fa-car fab:fa-x"]`);
    expect(r.warnings.filter((w) => w.code === 'ICON_NOT_RENDERED')).toHaveLength(1);
  });

  it('gives the alias ICON_UNAVAILABLE for the shapes a provider reports unresolved (null), once (D299)', async () => {
    const { m, ready } = api({
      id: 'unresolved',
      glyphs: {
        // null: unresolved, and the extension says ICON_NOT_RENDERED; undefined: declined quietly.
        glyph: (name, { warn }) =>
          name.startsWith('no:')
            ? (warn({ code: 'ICON_NOT_RENDERED', message: 'unresolved' }), null)
            : undefined,
      },
    });
    await ready;
    const source =
      'flowchart LR\n  A@{ icon: "no:a", form: square }\n  B@{ icon: "fa:b" }\n  C@{ icon: "no:c" }';
    const r = await m.render('x', source);
    expect(codes(r.warnings)).toEqual(['ICON_NOT_RENDERED', 'ICON_UNAVAILABLE']);
    // A fixed message, as sequence's SEQUENCE_MATH: the extension's warning names the icons.
    expect(r.warnings[1]!.message).toBe(
      'ICON_UNAVAILABLE is deprecated and goes in the next alpha: read ICON_NOT_RENDERED.'
    );
    // The frame-only drawing, as without an extension.
    expect(r.svg).toBe((await api().m.render('x', source)).svg);
  });

  it('asks a later extension after one reports the glyph unresolved', async () => {
    const { m, ready } = api(
      { id: 'first', glyphs: { glyph: () => null } },
      { id: 'second', glyphs: { glyph: () => GLYPH(8) } }
    );
    await ready;
    const r = await m.render('x', SHAPE);
    expect([...r.svg.matchAll(RE_GLYPH)]).toHaveLength(1);
    expect(codes(r.warnings)).toEqual([]);
  });

  it('gives providers and hooks one scratch object per render (ctx.inline.scratch)', async () => {
    const seen: object[] = [];
    const { m, ready } = api({
      id: 'scratch',
      inline: [{ pattern: /fa:fa-car/, box: (_, r) => void seen.push(r.scratch) }],
      glyphs: { glyph: (_, r) => void seen.push(r.scratch) },
      postRender: (_, ctx) => void seen.push(ctx.inline!.scratch),
    });
    await ready;
    const source = `${SHAPE}\n  B["fa:fa-car"] --> C["fa:fa-car"]`;
    await m.render('x', source);
    await m.render('x', source);
    expect(seen).toHaveLength(8);
    const [first, second] = [new Set(seen.slice(0, 4)), new Set(seen.slice(4))];
    expect([first.size, second.size]).toEqual([1, 1]);
    expect([...first][0]).not.toBe([...second][0]);
    expect([...first][0]).toEqual({});
  });

  it("gives glyph providers the render's icon packs (D294)", async () => {
    const seen: unknown[] = [];
    const { m, ready } = api({
      id: 'packs',
      glyphs: { glyph: (_, { iconPacks }) => void seen.push(iconPacks?.names()) },
    });
    m.registerIconPacks([{ name: 'fa', icons: { prefix: 'fa', icons: {} } }]);
    await ready;
    await m.render('x', SHAPE);
    expect(seen).toEqual([['fa']]);
  });

  it('checks the glyph and blames the extension for a bad one', async () => {
    for (const [glyph, why] of [
      [{ tag: 'script' }, /<script>, not an allowed SVG element/],
      [{ tag: 'path', attrs: { onclick: 'x' } }, /onclick on <path>/],
      [{ tag: 'g', children: [{ tag: 'foreignObject' }] }, /<foreignObject>, not an allowed/],
      [{ width: 16, height: 8, node: GLYPH(8) }, /an element without a tag/],
    ] as const) {
      const { m, ready } = api({ id: 'bad-glyphs', glyphs: { glyph: () => glyph as never } });
      await ready;
      const e = await m.render('x', SHAPE).catch((x: unknown) => x);
      expect(e, String(why)).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).message).toMatch(/"bad-glyphs" failed in glyphs/);
      expect((e as MermaidError).message).toMatch(why);
    }
  });

  it('refuses glyphs without a glyph function', async () => {
    await expect(
      createMermaid().registerExternalDiagrams([{ id: 'bad', glyphs: {} as never }])
    ).rejects.toThrow(/"bad": glyphs needs a glyph\(\) function/);
  });
});

describe('DiagramPlugin.icons (D293)', () => {
  it("reaches an extension's resource request with flowchart's shape icons", async () => {
    const seen: (readonly DiagramIcon[] | undefined)[] = [];
    const { m, ready } = api({
      id: 'packs',
      resources: {
        provides: [{ kind: 'iconPack', name: 'fa' }],
        missing: (_, request) => (seen.push(request.icons?.()), []),
        load: async () => {},
      },
    });
    await ready;
    await m.prepare(`${SHAPE}\n  B@{ icon: "aws:s3", label: "fa:fa-car" }\n  C["fa:fa-x"] --> A`);
    // Label icons are in labels(), not here.
    expect(seen).toEqual([['fa:bell', 'aws:s3']]);
  });
});

const CORPUS = fileURLToPath(new URL('../../../e2e/diagrams/flowchart/', import.meta.url));
function flowchartCorpus(): { id: string; source: string }[] {
  const out: { id: string; source: string }[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d).sort()) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.mmd'))
        out.push({ id: p.slice(CORPUS.length), source: readFileSync(p, 'utf8') });
    }
  };
  walk(CORPUS);
  return out;
}

/**
 * The limit for each corpus test below, sized for a slow CI runner. Each renders one corpus file
 * twice: at most 1.2 s in 20 runs on a laptop at load average up to 30 (2026-11-17).
 */
const CORPUS_TIMEOUT_MS = 30_000;

// One test per corpus file: the corpus (540 files, each rendered twice) grows with every fixture,
// and as one test it timed out on busy CI runners. The last test counts what the others drew.
describe('the contract over the flowchart corpus', { timeout: CORPUS_TIMEOUT_MS }, () => {
  const glyphs: ExtensionPlugin = {
    id: 'fixture-glyphs',
    glyphs: { glyph: (_, { size }) => GLYPH(size) },
  };
  const { m, ready } = api(icons, glyphs);
  // A postRender hook switches the writer to its tree backing, which must agree byte for byte.
  const { m: tree, ready: treeReady } = api(icons, glyphs, { id: 'tree', postRender: () => {} });
  beforeAll(() => Promise.all([ready, treeReady]));
  const labels = new Set<string>();
  const shapes = new Set<string>();

  it.each(flowchartCorpus())(
    'passes the allow-list and keeps stream and tree output equal with icons drawn: $id (R-SEC-2)',
    async ({ id, source }) => {
      let r;
      try {
        r = await m.render('mermaid-0', source);
      } catch (e) {
        if (e instanceof MermaidError) return;
        throw e;
      }
      if (boxes(r.svg).length > 0) labels.add(id);
      if (r.svg.includes('fixture-glyph')) shapes.add(id);
      expect(codes(r.warnings), id).not.toContain('ICON_NOT_RENDERED');
      expect(() => assertInert(r.svg, { themeStyle: r.svg.includes('<style>') }), id).not.toThrow();
      expect((await tree.render('mermaid-0', source)).svg, id).toBe(r.svg);
    }
  );

  it('draws label icons in at least 50 corpus files and glyphs in at least 4', () => {
    expect(labels.size).toBeGreaterThanOrEqual(50);
    expect(shapes.size).toBeGreaterThanOrEqual(4);
  });
});
