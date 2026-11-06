import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderMindmapForTest, type RenderedMindmap } from '@mermaid-js/diagram-mindmap/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { EDGE_CASES, LINE_SEPARATORS, mindmapCases, mindmapCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the mindmap (spec #294 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings, the parser cases and the lexer gate's edge cases, each in every theme and
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
  corpus = [...(await mindmapCorpus()), ...mindmapCases(), ...EDGE_CASES, ...LINE_SEPARATORS];
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
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(33);
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
