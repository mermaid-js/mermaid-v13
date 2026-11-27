import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderVennForTest, type RenderedVenn } from '@mermaid-js/diagram-venn/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { vennCases, vennCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of venn (spec #429 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings and the cases, each in every theme and `theme: 'auto'` set as `initialize()` would (a
 * source's own front matter still wins). Sources go through the plugin's own seam, parse →
 * layout → render, with core's render context (`renderVennForTest`), not `createMermaid()`: the
 * checks read the layout beside the SVG (each circle's extent for the viewBox, since a circle is
 * drawn as arcs; which areas and text nodes were drawn, for the round-trip), and the public API
 * returns no layout. `packages/mermaid/src/venn.spec.ts` renders through the registry row.
 * Sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` and no `<style>` but `theme: 'auto'`'s, no element id but `<id>-title`, every
 * drawn coordinate inside the viewBox, every alias declared. Round-trip: each `Set`, `Union` and
 * `Text` node of the AST has at most one `data-ast` element (a `g.venn-area` with its sets in
 * `data-venn-sets`, or a `text.venn-text-node` with its id in `data-id`), every `data-ast` names
 * an AST node, and a node has none exactly when the layout did not draw it: a set laid out at
 * size 0 (D417), an area off the chart (venn.js `disjoint`), a text node whose area is not drawn.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedVenn;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await vennCorpus()), ...vennCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedVenn;
      try {
        r = await renderVennForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('venn parse error')) throw e;
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

describe('venn render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with titles, overlaps, text nodes and styles', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(85);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(cases.length).toBeGreaterThan(100 * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="venn-title"',
      'class="venn-area venn-intersection"',
      'venn-set-2',
      'class="venn-text-node"',
      'class="venn-text-debug-cell"',
    ])
      expect(all, part).toContain(part);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or style sheet', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject/);
      expect(c.r.svg.includes('<style'), c.id).toBe(c.r.themeStyle);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6, D413)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderVennForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
        c.r.svg
      );
  });

  it('writes no element id but <id>-title, and that only with a title (D133)', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      expect(ids, c.id).toEqual(c.r.model.title?.trim() ? ['title#mermaid-0-title'] : []);
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
      const { offset } = c.r.layout;
      const circles = c.r.layout.areas.flatMap((a) =>
        a.circle
          ? [
              {
                x: a.circle.x - a.circle.radius + offset.x,
                y: a.circle.y - a.circle.radius + offset.y,
              },
              {
                x: a.circle.x + a.circle.radius + offset.x,
                y: a.circle.y + a.circle.radius + offset.y,
              },
            ]
          : []
      );
      expect(circles.filter(off).slice(0, 2), c.id).toEqual([]);
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
});

describe('venn AST round-trip (R-PARSE-8)', () => {
  it('maps each drawn Set, Union and Text node to one element, and only those', () => {
    let drawn = 0;
    const undrawn = { Set: 0, Union: 0, Text: 0 };
    for (const c of cases.filter((k) => k.theme === 'default')) {
      const index = astIndex(c.r.ast!);
      const byAst = new Map<string, string[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        expect(index.has(id), `${c.id}: ${id}`).toBe(true);
        const what =
          c.tree.tag(el) === 'g'
            ? `g ${c.tree.getAttr(el, 'data-venn-sets')}`
            : `${c.tree.tag(el)} ${c.tree.getAttr(el, 'class')} ${c.tree.getAttr(el, 'data-id')}`;
        byAst.set(id, [...(byAst.get(id) ?? []), what]);
      }
      const expected = new Map<string, string>();
      for (const a of c.r.layout.areas)
        if (a.ast !== undefined && a.path) expected.set(a.ast, `g ${a.sets.join('_')}`);
      for (const t of c.r.layout.textAreas)
        for (const n of t.nodes) expected.set(n.ast, `text venn-text-node ${n.id}`);
      for (const [id, node] of index) {
        if (!['Set', 'Union', 'Text'].includes(node.type)) {
          expect(byAst.get(id), `${c.id}: ${id}`).toBeUndefined();
          continue;
        }
        const want = expected.get(id);
        expect(byAst.get(id), `${c.id}: ${id}`).toEqual(want === undefined ? undefined : [want]);
        if (want) drawn++;
        else undrawn[node.type as keyof typeof undrawn]++;
      }
    }
    expect(drawn).toBeGreaterThan(500);
    // The corpus holds every kind of node that is not drawn: zero-size sets, overlaps off the
    // chart or of an undrawn set, text in an area that is not drawn.
    expect(undrawn.Set).toBeGreaterThan(0);
    expect(undrawn.Union).toBeGreaterThan(0);
    expect(undrawn.Text).toBeGreaterThan(0);
  });

  it('leaves out a set only when it is laid out at size 0 (D417)', () => {
    for (const c of cases.filter((k) => k.theme === 'default')) {
      const drawnSets = new Set(c.r.layout.areas.filter((a) => a.kind === 'set').map((a) => a.ast));
      for (const s of c.r.model.subsets.filter((t) => t.sets.length === 1))
        if (!drawnSets.has(s.ast))
          expect(!(s.size > 0) || !Number.isFinite(s.size * s.size), `${c.id}: ${s.ast}`).toBe(
            true
          );
    }
  });
});
