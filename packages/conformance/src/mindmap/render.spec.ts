import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { mindmapIconName } from '@mermaid-js/diagram-mindmap';
import { renderMindmapForTest, type RenderedMindmap } from '@mermaid-js/diagram-mindmap/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { mindmapCases, mindmapCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the mindmap (spec #294 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings and the parser and lexer cases, each in every theme and
 * `theme: 'auto'` set as `initialize()` would (a source's own front matter and directives still
 * win). The plugin is T5's (#390), so sources go through the renderer's own seam, parse →
 * layout (`tree`) → render, with core's render context (`renderMindmapForTest`); sources the
 * parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, no element id but the gradient's, every drawn coordinate and
 * every node box inside the viewBox, every alias declared. Round-trip: each `Node` of the AST
 * has exactly one `data-ast` element, a `g.mindmap-node` whose `data-id` is the same id, and
 * its range holds its text.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedMindmap;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await mindmapCorpus()), ...mindmapCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedMindmap;
      try {
        r = await renderMindmapForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('mindmap parse error')) throw e;
        rejected.add(item.id);
        continue;
      }
      cases.push({
        id: `${item.id} ${theme}`,
        theme,
        source: item.source,
        r,
        tree: parseSvg(r.svg),
      });
    }
}, 300_000);

/** Polygon corners and line ends, which `extents` leaves out. */
function corners(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const el of tree.find({ tag: 'polygon' })) {
    const n = (tree.getAttr(el, 'points') ?? '').split(/[\s,]+/).map(Number);
    for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i]!, y: n[i + 1]! });
  }
  for (const el of tree.find({ tag: 'line' })) {
    const a = (k: string): number => Number(tree.getAttr(el, k));
    out.push({ x: a('x1'), y: a('y1') }, { x: a('x2'), y: a('y2') });
  }
  return out;
}

describe('mindmap render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every shape and icon references', () => {
    // 85 fixtures, #328's 4 icon baselines, the corpus cleanup's 14, #649's long word and
    // #781's 2 label-mode baselines, #783's icon text, #836's emphasis beside a code span and
    // #837's attribute quotes, and #1391's label syntax pair.
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(111);
    expect(cases.length).toBeGreaterThan(100 * THEMES.length);
    const shapes = new Set(cases.flatMap((c) => c.r.layout.mindmap.nodes.map((n) => n.shape)));
    expect([...shapes].sort()).toEqual(
      ['bang', 'circle', 'cloud', 'default', 'hexagon', 'rect', 'rounded'].sort()
    );
    expect(cases.some((c) => c.r.svg.includes('class="mindmap-icon"'))).toBe(true);
    expect(rejected.size).toBeLessThan(corpus.length / 4);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderMindmapForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
        c.r.svg
      );
  });

  it('writes no element id but the gradient', () => {
    for (const c of cases)
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined))
        expect(`${c.tree.tag(el)}#${c.tree.getAttr(el, 'id')}`, c.id).toBe(
          `linearGradient#${c.r.gradient}`
        );
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect([...extents(c.tree), ...corners(c.tree)].filter(off).slice(0, 3), c.id).toEqual([]);
      // A cloud's or a bang's arcs bulge past their end points: their node box covers them.
      const boxes = [...c.r.layout.nodes.values()].flatMap((n) => [
        { x: n.x - n.width / 2, y: n.y - n.height / 2 },
        { x: n.x + n.width / 2, y: n.y + n.height / 2 },
      ]);
      expect(boxes.filter(off).slice(0, 2), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.r.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.r.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });

  it('warns ICON_NOT_RENDERED once where a node has an icon, and never otherwise (D291)', () => {
    for (const c of cases) {
      const icons = c.r.model.nodes.filter((n) => n.icon).length;
      expect(c.r.warnings.filter((w) => w.code === 'ICON_NOT_RENDERED').length, c.id).toBe(
        icons > 0 ? 1 : 0
      );
      expect(c.tree.find({ class: 'mindmap-icon' }).length, c.id).toBe(icons);
    }
  });
});

/** The e2e fixture whose `::icon()` is no glyph name (D566). */
const WRITTEN_ICON = 'nightly-check/html-dropped-icon-text.mmd';

describe('mindmap ::icon() glyphs over the parsed corpus (#328, D297)', () => {
  /** An extension's glyph: a `size` square at the origin, as `RenderContext.icon` gives one. */
  const icon = (_: string, size: number) =>
    ({ tag: 'rect', attrs: { class: 'fixture-glyph', width: size, height: size } }) as const;

  it('draws each D297 icon as one 40 px glyph inside its node, and any other as written', async () => {
    // Every parsed source with an icon (v12's 5 e2e fixtures, #783's icon text with a tag and the
    // 4 baselines among them), in the four families. A reference in no D297 form (`bomb`) is never asked for: it is shown
    // as written, with the render's one ICON_NOT_RENDERED.
    const withIcons = cases.filter(
      (c) => c.theme === 'default' && c.r.model.nodes.some((n) => n.icon)
    );
    const e2e = withIcons.filter((c) => c.id.startsWith('e2e/'));
    expect(e2e.filter((c) => !c.id.includes('/baseline/')).length).toBe(6);
    expect(e2e.filter((c) => c.id.includes('/baseline/icons/')).length).toBe(4);
    expect(
      withIcons.some((c) => c.r.model.nodes.some((n) => n.icon && !mindmapIconName(n.icon.text)))
    ).toBe(true);
    for (const theme of ['default', 'redux', 'neo', 'neo-dark'])
      for (const item of withIcons) {
        const id = `${item.id.replace(/ default$/, '')} ${theme}`;
        const r = await renderMindmapForTest(item.source, { config: { theme }, icon });
        assertInert(r.svg, { gradient: r.gradient, themeStyle: r.themeStyle });
        const views = r.layout.mindmap.nodes.filter((v) => v.icon);
        const named = views.filter((v) => mindmapIconName(r.model.nodes[v.index]!.icon!.text));
        const others = views.length - named.length;
        expect(
          r.warnings.filter((w) => w.code.startsWith('ICON')).map((w) => w.code),
          id
        ).toEqual(others > 0 ? ['ICON_NOT_RENDERED'] : []);
        // v12's fixtures name glyphs; #783's holds a tag, so its reference is shown as written.
        if (e2e.includes(item)) expect(others, id).toBe(item.id.includes(WRITTEN_ICON) ? 1 : 0);
        const tree = parseSvg(r.svg);
        expect(tree.find({ tag: 'text', class: 'mindmap-icon' }).length, id).toBe(others);
        const glyphs = tree.find({ tag: 'g', class: 'mindmap-icon' });
        expect(glyphs.length, id).toBe(named.length);
        named.forEach((v, k) => {
          const t = /^translate\((-?[\d.]+),(-?[\d.]+)\)$/.exec(
            tree.getAttr(glyphs[k]!, 'transform')!
          )!;
          const [x, y] = [Number(t[1]), Number(t[2])];
          const box = r.layout.nodes.get(v.id)!;
          expect(v.icon!.glyph, id).toBe(40);
          expect(
            x >= box.x - box.width / 2 - TOL && x + 40 <= box.x + box.width / 2 + TOL,
            id
          ).toBe(true);
          expect(
            y >= box.y - box.height / 2 - TOL && y + 40 <= box.y + box.height / 2 + TOL,
            id
          ).toBe(true);
        });
      }
  });
});

describe('mindmap AST round-trip over the parsed corpus (R-PARSE-8)', () => {
  it('maps each Node to exactly one g.mindmap-node, and nothing else has data-ast', () => {
    for (const c of cases) {
      const ast = c.r.ast!;
      const index = astIndex(ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        expect(c.tree.getAttr(el, 'class')!.split(' '), `${c.id}: ${id}`).toContain('mindmap-node');
        const node = index.get(id);
        expect(node?.type, `${c.id}: data-ast ${id}`).toBe('Node');
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
        // The text, compared without punctuation and as a subsequence: entities are decoded,
        // and comments v12's preprocessing removed may sit inside a shape's text.
        const bare = (t: string): string => t.replace(/\W+/g, '');
        const text = bare((node as AstNode & { label: string }).label);
        const written = bare(c.source.slice(start, end));
        let k = 0;
        for (const ch of written) if (ch === text[k]) k++;
        expect(k, `${c.id}: ${id} holds ${JSON.stringify(text)}`).toBe(text.length);
      }
      for (const n of ast.children) expect(seen.get(n.id), `${c.id}: ${n.id}`).toBe(1);
    }
  });
});
