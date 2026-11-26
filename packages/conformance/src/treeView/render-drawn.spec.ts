// cspell:words preorder onerror
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { decodeEntities } from '@mermaid-js/core/text';
import { treeView, type TreeViewModel } from '@mermaid-js/diagram-treeview';
import type { ExtensionPlugin, Mermaid, MermaidConfig } from 'mermaid';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { treeViewCases } from './corpus.ts';
import { treeViewApi } from './render-api.ts';

/**
 * What the treeView renderer draws (spec #518 T4), through `createMermaid().render()`: v12's
 * structure and class names, the drawing order, plain text (D484), icon precedence and the
 * glyph slot (D485, D486, D299), the theme's paints and sizes (D483, D540) and `useMaxWidth`.
 * The sources are the `render-*` cases of `corpus/treeView-cases.json` (also in the gate corpus
 * that `render.spec.ts` checks).
 */
const CASES = new Map(treeViewCases().map((c) => [c.id.replace('treeView-cases/', ''), c.source]));
function probe(name: string): string {
  const source = CASES.get(`render-${name}`);
  if (source === undefined) throw new Error(`no treeView-cases/render-${name}`);
  return source;
}

/** Literal colours, so paints compare with v12's values. */
const LITERAL = { output: { cssVariables: false } } as const;

const classOf = (tree: SvgView, n: SvgElement): string => tree.getAttr(n, 'class') ?? '';
const byClass = (tree: SvgView, cls: string): SvgElement[] =>
  tree.find((n, t) => classOf(t, n).split(' ').includes(cls));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const attr = (tree: SvgView, n: SvgElement, name: string): string | undefined =>
  tree.getAttr(n, name);
const codes = (r: { warnings: readonly { code: string }[] }) => r.warnings.map((w) => w.code);

async function render(source: string, config: MermaidConfig = {}, api?: Mermaid) {
  const m = api ?? (await treeViewApi());
  const result = await m.render('x', source, { config: { ...LITERAL, ...config } as never });
  return { ...result, tree: parseSvg(result.svg) };
}

/** The `g.tree-view`'s children as `g <label>` or `line <data-id>`. */
function drawingOrder(tree: SvgView): string[] {
  const view = byClass(tree, 'tree-view')[0]!;
  return tree.children(view).map((n) => {
    if (tree.tag(n) === 'line') return `line ${attr(tree, n, 'data-id') ?? '-'}`;
    const label = tree.children(n).find((k) => classOf(tree, k).startsWith('treeView-node-label'));
    return `g ${textOf(tree, label!)}`;
  });
}

/** The row `g` whose label is `name`. */
function row(tree: SvgView, name: string): SvgElement {
  const g = tree
    .find({ tag: 'g' })
    .find((n) =>
      tree
        .children(n)
        .some((k) => classOf(tree, k).startsWith('treeView-node-label') && textOf(tree, k) === name)
    );
  if (!g) throw new Error(`no row ${name}`);
  return g;
}
const partsOf = (tree: SvgView, g: SvgElement): string[] =>
  tree.children(g).map((k) => classOf(tree, k));

describe('treeView render: structure', () => {
  it("draws v12's groups and class names, in v12's order", async () => {
    const { tree, svg } = await render(probe('structure'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(classOf(tree, root)).toBe('mermaid mermaid-treeView');
    expect(attr(tree, root, 'aria-roledescription')).toBe('treeView');
    // Only the title and description, then the tree.
    expect(tree.children(root).map((n) => tree.tag(n))).toEqual(['title', 'desc', 'g']);
    expect(svg).toContain('<title id="x-title">Files</title><desc id="x-desc">A small tree</desc>');
    // The in-text title is kept in the model, not drawn (D484).
    expect(svg).not.toContain('Project');
    // Each row's g, then its branch; a parent's stem once its subtree is drawn (v12 drawTree).
    expect(drawingOrder(tree)).toEqual([
      'g /',
      'g app',
      'line node:app',
      'g index.ts',
      'line node:app/index.ts',
      'g a  b.js',
      'line node:app/a  b.js',
      'g lib',
      'line node:app/lib',
      'g util.ts',
      'line node:app/lib/util.ts',
      'line node:app/lib',
      'line node:app',
      'g README.md',
      'line node:README.md',
      'line -',
    ]);
    expect(partsOf(tree, row(tree, 'app'))).toEqual(['treeView-node-label treeView-node-dir']);
    expect(partsOf(tree, row(tree, 'index.ts'))).toEqual([
      'treeView-node-label',
      'treeView-node-description',
    ]);
    // The highlight box first (v12 inserted it as the first child), the author's class last.
    expect(partsOf(tree, row(tree, 'a  b.js'))).toEqual([
      'treeView-highlight-bg',
      'treeView-node-label highlight',
    ]);
    expect(partsOf(tree, row(tree, 'util.ts'))).toEqual(['treeView-node-label warn']);
    expect(byClass(tree, 'treeView-node-line').every((l) => tree.tag(l) === 'line')).toBe(true);
  });

  it("writes v12's text styles as attributes: bold directories, italic descriptions, one column", async () => {
    const { tree } = await render(probe('structure'));
    const [dir] = byClass(tree, 'treeView-node-dir');
    expect(attr(tree, dir!, 'font-weight')).toBe('bold');
    expect(attr(tree, dir!, 'font-size')).toBe('16');
    expect(attr(tree, dir!, 'dominant-baseline')).toBe('middle');
    const descriptions = byClass(tree, 'treeView-node-description');
    expect(descriptions.map((d) => textOf(tree, d))).toEqual(['entry  point', 'read  me']);
    expect(descriptions.map((d) => attr(tree, d, 'font-style'))).toEqual(['italic', 'italic']);
    expect(new Set(descriptions.map((d) => attr(tree, d, 'x'))).size).toBe(1);
    const file = byClass(tree, 'treeView-node-label').find((n) => textOf(tree, n) === 'util.ts')!;
    expect(attr(tree, file, 'font-weight')).toBeUndefined();
  });

  it('keeps blank runs and prints every name and description as written (D484)', async () => {
    for (const name of ['structure', 'plain-text']) {
      const api = await treeViewApi();
      const source = probe(name);
      const { tree, svg } = await render(source, {}, api);
      assertInert(svg);
      const model = (await api.prepare(source)).parse.model as TreeViewModel;
      const labels = byClass(tree, 'treeView-node-label');
      // Entity codes are drawn as their characters (D563).
      expect(labels.map((l) => textOf(tree, l))).toEqual([
        '/',
        ...model.nodes.map((n) => decodeEntities(n.name)),
      ]);
      for (const l of labels) expect(attr(tree, l, 'xml:space')).toBe('preserve');
      const descriptions = byClass(tree, 'treeView-node-description').map((d) => textOf(tree, d));
      expect(descriptions).toEqual(
        model.nodes.flatMap((n) =>
          n.description === undefined ? [] : decodeEntities(n.description)
        )
      );
      if (name === 'plain-text') {
        expect(svg).not.toMatch(/<script|<img|<br|<tspan/);
        expect(labels.map((l) => textOf(tree, l))).toContain('<br>x');
        expect(descriptions).toContain('$$x^2$$');
        expect(svg).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      }
    }
  });

  it('boxes each highlighted row from its indent, 10 px wider than the one before (v12)', async () => {
    const { tree } = await render(probe('highlights'));
    const boxes = byClass(tree, 'treeView-highlight-bg');
    expect(boxes).toHaveLength(3);
    const right = boxes.map((b) => Number(attr(tree, b, 'x')) + Number(attr(tree, b, 'width')));
    expect(right[1]! - right[0]!).toBeCloseTo(10, 1);
    expect(right[2]! - right[1]!).toBeCloseTo(10, 1);
    for (const b of boxes) {
      expect(attr(tree, b, 'rx')).toBe('3');
      expect(attr(tree, b, 'stroke-width')).toBe('1');
    }
  });

  it('sizes the root to 100% under useMaxWidth (the default), to the viewBox without', async () => {
    const on = await render(probe('structure'));
    expect(on.svg).toMatch(/ width="100%"[^>]* style="max-width:[\d.]+px/);
    const off = await render(probe('structure'), { treeView: { useMaxWidth: false } });
    const [, w, h] = / viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(off.svg)!;
    expect(off.svg).toContain(` width="${w}" height="${h}"`);
    expect(off.svg).not.toContain('max-width');
  });
});

describe('treeView render: theme (D483, D540)', () => {
  const paint = (tree: SvgView, cls: string, name: string): string | undefined => {
    const [first] = byClass(tree, cls);
    return first && attr(tree, first, name);
  };
  const paints = (tree: SvgView) => ({
    label: paint(tree, 'treeView-node-label', 'fill'),
    line: paint(tree, 'treeView-node-line', 'stroke'),
    icon: paint(tree, 'treeView-node-icon', 'color'),
    description: paint(tree, 'treeView-node-description', 'fill'),
    bg: paint(tree, 'treeView-highlight-bg', 'fill'),
    stroke: paint(tree, 'treeView-highlight-bg', 'stroke'),
  });
  const ICONS = { treeView: { showIcons: true } };
  const LIGHT = {
    label: 'black',
    line: 'black',
    icon: '#546e7a',
    description: '#6a9955',
    bg: 'rgba(255, 193, 7, 0.15)',
    stroke: '#ffc107',
  };

  it("paints v12's colours in every light theme, darkMode included", async () => {
    for (const theme of ['default', 'redux-color', 'neo', 'base'] as const) {
      const { tree } = await render(probe('structure'), { theme, ...ICONS });
      expect(paints(tree), theme).toEqual(LIGHT);
    }
    const { tree } = await render(probe('structure'), {
      theme: 'base',
      themeVariables: { darkMode: true },
      ...ICONS,
    });
    expect(paints(tree)).toEqual(LIGHT);
  });

  it("takes the theme's text and line colours and blue grey 300 icons in a dark theme", async () => {
    const expected = {
      dark: { label: '#cccccc', line: '#d3d3d3' },
      'redux-dark': { label: '#cccccc', line: '#cccccc' },
      'neo-dark': { label: '#cccccc', line: '#cccccc' },
    } as const;
    for (const [theme, ink] of Object.entries(expected)) {
      const { tree } = await render(probe('structure'), {
        theme: theme as MermaidConfig['theme'],
        ...ICONS,
      });
      expect(paints(tree), theme).toEqual({ ...LIGHT, ...ink, icon: '#90a4ae' });
    }
  });

  it('takes the author themeVariables, flat or under treeView, the flat name first', async () => {
    const base = await render(probe('structure'));
    const { tree } = await render(probe('structure'), {
      themeVariables: {
        treeView: { lineColor: '#123456', labelColor: '#654321', labelFontSize: '20px' },
        treeViewLabelColor: '#00ff00',
      },
    });
    expect(paints(tree).line).toBe('#123456');
    expect(paints(tree).label).toBe('#00ff00');
    // The layout measures in the theme's size: every text is 20 px, every row taller.
    const sizes = new Set(
      [...byClass(tree, 'treeView-node-label'), ...byClass(tree, 'treeView-node-description')].map(
        (n) => attr(tree, n, 'font-size')
      )
    );
    expect([...sizes]).toEqual(['20']);
    const height = (t: SvgView) =>
      Number(attr(t, t.find({ tag: 'svg' })[0]!, 'viewBox')!.split(' ')[3]);
    expect(height(tree)).toBeGreaterThan(height(base.tree));
    // A size in other units is not a theme length: v12's 16 px stays (GAPS T4).
    const em = await render(probe('structure'), {
      themeVariables: { treeViewLabelFontSize: '1em' },
    });
    expect(attr(em.tree, byClass(em.tree, 'treeView-node-label')[0]!, 'font-size')).toBe('16');
  });

  it('declares only the paints it draws, as CSS variables by default', async () => {
    const api = await treeViewApi();
    const { svg } = await api.render('x', 'treeView-beta\na');
    expect(svg).toContain('--_tvl:var(--mermaid-treeViewLabelColor,black)');
    expect(svg).toContain('stroke="var(--_tvn)"');
    expect(svg).not.toMatch(/--_tv[idhk]:/);
  });
});

/**
 * A stand-in icons extension (D293): `pk:*` names draw a 1-unit rect scaled to the size, except
 * `pk:bad` (unresolved, which it warns about itself), `pk:wait` (its pack still loading, D299).
 * Every other name is none of its business.
 */
function glyphs(asked: { name: string; size: number; paint: unknown }[]): ExtensionPlugin {
  return {
    id: 'stand-in-glyphs',
    glyphs: {
      glyph: (name, { size, paint, warn }) => {
        asked.push({ name, size, paint });
        if (!name.startsWith('pk:')) return undefined;
        if (name === 'pk:bad') {
          warn({ code: 'ICON_NOT_RENDERED', message: `stand-in: ${name}` });
          return null;
        }
        if (name === 'pk:wait') return 'pending';
        return { tag: 'rect', attrs: { class: `glyph ${name}`, width: size, height: size } };
      },
    },
  };
}

describe('treeView render: icons (D485, D486, D299)', () => {
  const MAPS = {
    defaultIconPack: 'pk',
    filenameIcons: { Dockerfile: 'pk:whale', '.env': 'none' },
    extensionIcons: { ts: 'pk:ts', '.css': 'css' },
  };
  let asked: { name: string; size: number; paint: unknown }[];
  let api: (config: MermaidConfig) => Promise<Mermaid>;
  beforeAll(() => {
    api = async (config) => {
      asked = [];
      return treeViewApi(config, [glyphs(asked)]);
    };
  });

  /** Each row's label → what its icon slot holds: `file`, `folder`, a glyph's name, or `-`. */
  function slots(tree: SvgView): Record<string, string> {
    const out: Record<string, string> = {};
    for (const g of tree.find({ tag: 'g' })) {
      const parts = tree.children(g);
      const label = parts.find((k) => classOf(tree, k).startsWith('treeView-node-label'));
      if (!label) continue;
      const icon = parts.find((k) => classOf(tree, k) === 'treeView-node-icon');
      const drawn = icon && tree.children(icon)[0]!;
      out[textOf(tree, label)] = !drawn
        ? '-'
        : tree.tag(drawn) === 'path'
          ? attr(tree, drawn, 'fill-rule') === 'evenodd'
            ? 'file'
            : 'folder'
          : classOf(tree, drawn).replace('glyph ', '');
    }
    return out;
  }

  it("follows v12's precedence under showIcons, by own property only", async () => {
    const m = await api({ treeView: { showIcons: true, ...MAPS } });
    const r = await render(probe('icons'), {}, m);
    expect(codes(r)).toEqual([]);
    expect(slots(r.tree)).toEqual({
      '/': 'folder',
      src: 'folder',
      Dockerfile: 'pk:whale', // the filename map
      'main.TS': 'pk:ts', // the lower-case extension, without its dot
      'style.css': 'pk:css', // with its dot, unprefixed: defaultIconPack
      '.env': '-', // a dotfile has no extension; the filename map hides it
      constructor: 'file', // D486: not Object.prototype's
      toString: 'file',
      'a.constructor': 'file',
      'pinned.ts': 'pk:pin', // an explicit icon() beats the maps
      plain: 'pk:star', // unprefixed: defaultIconPack
      'hidden.ts': '-', // icon(none)
      builtin: 'folder', // a built-in name stays built-in under defaultIconPack
      proto: 'pk:constructor', // only file and folder are built-in (GAPS, D486)
    });
    // Asked of the glyphs in the icon's 14 px square, in the icon colour; the built-ins never.
    expect(asked.map((a) => a.name)).toEqual([
      'pk:whale',
      'pk:ts',
      'pk:css',
      'pk:pin',
      'pk:star',
      'pk:constructor',
    ]);
    expect(new Set(asked.map((a) => `${a.size} ${String(a.paint)}`))).toEqual(
      new Set(['14 #546e7a'])
    );
    // The glyph sits at the icon's box, before the label.
    const icon = byClass(r.tree, 'treeView-node-icon')[2]!;
    expect(attr(r.tree, icon, 'transform')).toMatch(/^translate\([\d.]+,[\d.]+\)$/);
    expect(attr(r.tree, icon, 'color')).toBe('#546e7a');
    assertInert(r.svg);
  });

  it('draws only explicit icons with showIcons off, and keeps their slot', async () => {
    const m = await api({ treeView: MAPS });
    const r = await render(probe('icons'), {}, m);
    const drawn = Object.entries(slots(r.tree)).filter(([, v]) => v !== '-');
    expect(Object.fromEntries(drawn)).toEqual({
      'pinned.ts': 'pk:pin',
      plain: 'pk:star',
      builtin: 'folder',
      proto: 'pk:constructor',
    });
    const x = (name: string) =>
      Number(
        attr(
          r.tree,
          byClass(r.tree, 'treeView-node-label').find((l) => textOf(r.tree, l) === name)!,
          'x'
        )
      );
    // 14 px icon + 4 px gap before an icon's label, none before the others'.
    expect(x('pinned.ts') - x('constructor')).toBe(18);
    expect(x('hidden.ts')).toBe(x('constructor'));
  });

  it('lists the icons the glyphs draw for the icons extension, under the parse config', async () => {
    const m = await api({ treeView: { showIcons: true, ...MAPS } });
    const { parse } = await m.prepare(probe('icons'));
    // Recorded on the model by the plugin's parse, which has the config.
    expect((parse.model as TreeViewModel).glyphIcons).toEqual(
      treeView.icons(parse.model as TreeViewModel)
    );
    expect(treeView.icons(parse.model as TreeViewModel)).toEqual([
      'pk:whale',
      'pk:ts',
      'pk:css',
      'pk:pin',
      'pk:star',
      'pk:constructor',
    ]);
    const plain = await (await api({})).prepare(probe('icons'));
    // Without defaultIconPack an unprefixed name is the built-in pack's, which no pack draws.
    expect(treeView.icons(plain.parse.model as TreeViewModel)).toEqual([
      'pk:pin',
      'mermaid-treeview:star',
      'mermaid-treeview:constructor',
    ]);
  });

  it('leaves the slot empty when a glyph is not drawn (D299), the render warning once', async () => {
    const m = await api({});
    const r = await render(probe('glyphs'), {}, m);
    expect(slots(r.tree)).toEqual({ '/': '-', ok: 'pk:ok', bad: '-', wait: '-', none: '-' });
    // pk:bad is the extension's to warn about, and its warning is the render's one
    // ICON_NOT_RENDERED (core keeps the first); pk:wait loads quietly.
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toBe('stand-in: pk:bad');
    // With no unresolved icon, treeView's own warning names those no extension has.
    const own = await render(probe('icons'), {}, await api({ treeView: { showIcons: true } }));
    expect(codes(own)).toEqual(['ICON_NOT_RENDERED']);
    expect(own.warnings[0]!.message).toMatch(
      /^Icons not rendered: "mermaid-treeview:star", "mermaid-treeview:constructor"\. No icons extension draws them/
    );
  });

  it('draws the built-ins with no icons extension, and names every other icon once', async () => {
    const m = await treeViewApi({ treeView: { showIcons: true } });
    const r = await render(probe('icons'), {}, m);
    const s = slots(r.tree);
    expect(s.constructor).toBe('file');
    expect(s.plain).toBe('-');
    expect(codes(r)).toEqual(['ICON_NOT_RENDERED']);
    expect(r.warnings[0]!.message).toMatch(
      /^Icons are not rendered without an icons extension: "pk:pin", "mermaid-treeview:star", "mermaid-treeview:constructor"\./
    );
  });
});
