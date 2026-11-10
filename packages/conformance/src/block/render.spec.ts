import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderBlockForTest, type RenderedBlock } from '@mermaid-js/diagram-block/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { blockCases, blockCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of block (spec #521 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page strings
 * and the cases, each in every theme and `theme: 'auto'` set as `initialize()` would (a source's
 * own front matter still wins). Sources go through the plugin's own seam, parse → layout →
 * render (`renderBlockForTest`), not `createMermaid()`: block has no registry row until its
 * manifest (#558), and the checks read the layout beside the SVG. Sources the parser rejects
 * stay out. A source of more than `BIG` blocks (the 100,000-cell spacer) renders in one theme.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject`, `<marker>`, `<filter>` and no `<style>` but `theme: 'auto'`'s, no element id
 * but the gradient's, every drawn coordinate (polygon points included) inside the viewBox,
 * every alias declared. Round-trip: each AST node has at most one `data-ast` element, every
 * `data-ast` names an AST node, a block's is its `g.node` and an edge's its `path`, and a node
 * has one exactly when the layout drew it: every block's first mention but a space's, every
 * edge between two drawn blocks.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;
const BIG = 2000;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedBlock;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await blockCorpus()), ...blockCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      const r = await renderBlockForTest(item.source, { config: { theme } });
      if (r.rejected) {
        rejected.add(item.id);
        continue;
      }
      if (r.layout.blocks.length > BIG && theme !== THEMES[0]) continue;
      cases.push({
        id: `${item.id} ${theme}`,
        theme,
        source: item.source,
        r,
        tree: parseSvg(r.svg),
      });
    }
}, 600_000);

/** Every polygon point, in root user units (translate() only, as `extents` reads them). */
function polygonPoints(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const el of tree.find({ tag: 'polygon' })) {
    let dx = 0;
    let dy = 0;
    for (let n: SvgElement | undefined = el; n; n = n.parent) {
      const m = /^translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(tree.getAttr(n, 'transform') ?? '');
      if (m) {
        dx += Number(m[1]);
        dy += Number(m[2]);
      }
    }
    const nums = (tree.getAttr(el, 'points') ?? '').split(/[\s,]+/).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2)
      out.push({ x: nums[i]! + dx, y: nums[i + 1]! + dy });
  }
  return out;
}

describe('block render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every shape, composites, edges and labels', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(89);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(cases.length).toBeGreaterThan(200 * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      '<g class="block">',
      '<rect class="basic cluster composite label-container"',
      '<polygon class="label-container"',
      '<polygon class="label-container block-arrow"',
      '<circle class="label-container"',
      '<path class="label-container"',
      'class="edge-thickness-thick edge-pattern-solid flowchart-link"',
      'class="edge-thickness-normal edge-pattern-dotted flowchart-link"',
      '<g class="edgeLabel"',
      '<path class="marker"',
      '<circle class="marker"',
      'data-color-id="color-',
    ])
      expect(all, part).toContain(part);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject, marker, filter or style sheet', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker|<filter/);
      expect(c.r.svg.includes('<style'), c.id).toBe(c.r.themeStyle);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderBlockForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
        c.r.svg
      );
  });

  it("writes no element id but the gradient's (D182; block has no accessible title)", () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      expect(ids, c.id).toEqual(
        c.r.gradient && c.r.svg.includes(`url(#${c.r.gradient})`)
          ? [`linearGradient#${c.r.gradient}`]
          : []
      );
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
      expect(polygonPoints(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
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

describe('block AST round-trip (R-PARSE-8)', () => {
  it('maps each drawn block and edge to one element, and only those', () => {
    let drawn = 0;
    let undrawn = 0;
    for (const c of cases.filter((k) => k.theme === 'default')) {
      const index = astIndex(c.r.ast);
      const byAst = new Map<string, string[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        expect(index.has(id), `${c.id}: ${id}`).toBe(true);
        const what = `${c.tree.tag(el)} ${c.tree.getAttr(el, 'class')} ${c.tree.getAttr(el, 'data-id')}`;
        byAst.set(id, [...(byAst.get(id) ?? []), what]);
      }
      const expected = new Map<string, string>();
      for (const b of c.r.layout.blocks)
        if (b.outline) {
          const cls = c.tree
            .find((n, t) => t.getAttr(n, 'data-ast') === b.ast)
            .map((n) => c.tree.getAttr(n, 'class'))[0];
          expect(cls, `${c.id}: ${b.ast}`).toMatch(/^node /);
          expected.set(b.ast, `g ${cls} ${b.id}`);
        }
      for (const e of c.r.layout.edges)
        expected.set(
          e.ast,
          `path edge-thickness-${e.thickness} edge-pattern-${e.pattern} flowchart-link ${e.id}`
        );
      for (const [id, node] of index) {
        const want = expected.get(id);
        expect(byAst.get(id), `${c.id}: ${id}`).toEqual(want === undefined ? undefined : [want]);
        if (want) drawn++;
        else if (node.type === 'Block' || node.type === 'Composite' || node.type === 'Edge') {
          // Not drawn: a later mention, a space, or an edge to a block the layout left out.
          undrawn++;
          if (node.type !== 'Edge')
            expect(
              id.includes('@') || c.r.layout.blocks.some((b) => b.ast === id && !b.outline),
              `${c.id}: ${id}`
            ).toBe(true);
        }
      }
    }
    expect(drawn).toBeGreaterThan(800);
    expect(undrawn).toBeGreaterThan(0);
  });
});
