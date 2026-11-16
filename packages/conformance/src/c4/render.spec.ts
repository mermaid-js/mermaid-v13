import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderC4ForTest, type RenderedC4 } from '@mermaid-js/diagram-c4/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { c4Cases, c4Corpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of C4 (spec #522 T4, DESIGN §13.2, §13.4, R-PARSE-8,
 * D224, D458) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page strings and
 * the cases, each in every theme and `theme: 'auto'` set as `initialize()` would (a source's own
 * front matter and directives still win). Sources go through the plugin's own seam, parse →
 * layout → render (`renderC4ForTest`), not `createMermaid()`: C4 has no registry row until its
 * manifest (#542), and the checks read the layout beside the SVG. Sources the parser rejects
 * stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject`, `<marker>`, `<symbol>`, `<filter>` or gradient, no `<style>` but
 * `theme: 'auto'`'s, no element id but `<prefix>-title`/`-desc`, every drawn coordinate inside
 * the viewBox, every alias declared. Round-trip: every `data-ast` names an AST node, and each
 * drawn element, boundary and relation has exactly one: an element's `g.node`, a boundary's
 * `g.c4-boundary`, a relation's `path.c4-rel`, each with the user's id as `data-id`; a later
 * statement of a merged item and an `Update…` statement have none.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedC4;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await c4Corpus()), ...c4Cases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      const r = await renderC4ForTest(item.source, { config: { theme } });
      if (r.rejected) {
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
}, 600_000);

describe('c4 render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every shape, boundaries and relations', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(70);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(cases.length).toBeGreaterThan(150 * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="node c4-shape c4-person"',
      'class="node c4-shape c4-external_system c4-external"',
      'class="c4-boundary"',
      'class="c4-boundary c4-deployment-node"',
      '<rect class="label-container"',
      '<circle class="label-container"',
      '<path class="label-container"',
      'class="c4-rel c4-rel-birel"',
      'class="c4-rel c4-rel-rel_b"',
      '<path class="marker"',
      'class="c4-rel-techn"',
      'class="c4-title"',
      '<title>',
    ])
      expect(all, part).toContain(part);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject, marker, symbol, filter or gradient', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|<marker|<symbol|<filter|filter=|url\(#/
      );
      expect(c.r.svg.includes('<style'), c.id).toBe(c.r.themeStyle);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect((await renderC4ForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
        c.r.svg
      );
  });

  it('writes no element id but the accessible title’s and description’s', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      const want = [];
      if (c.r.model.accTitle.trim()) want.push('title#mermaid-0-title');
      if (c.r.model.accDescr.trim()) want.push('desc#mermaid-0-desc');
      expect(ids, c.id).toEqual(want);
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
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

describe('c4 AST round-trip (R-PARSE-8, D458)', () => {
  it('maps each drawn element, boundary and relation to one element, and only those', () => {
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
      for (const e of c.r.layout.elements) {
        const external = e.kind.startsWith('external_') ? ' c4-external' : '';
        expected.set(e.ast, `g node c4-shape c4-${e.kind}${external} ${e.alias}`);
      }
      for (const b of c.r.layout.boundaries)
        expected.set(b.ast, `g c4-boundary${b.nodeKind ? ' c4-deployment-node' : ''} ${b.alias}`);
      for (const r of c.r.layout.relations)
        expected.set(
          r.ast,
          `path c4-rel c4-rel-${/^[a-z_]+$/.test(r.kind) ? r.kind : 'rel'} ${r.from}->${r.to}`
        );
      for (const [id, node] of index) {
        const want = expected.get(id);
        expect(byAst.get(id), `${c.id}: ${id}`).toEqual(want === undefined ? undefined : [want]);
        if (want) drawn++;
        else if (node.type !== 'Document') {
          // Not drawn: a later statement of a merged item, an `Update…` statement, or a
          // relation the layout left out (none here: a rejected source is not drawn).
          undrawn++;
          expect(id.includes('@') || node.type === 'Style', `${c.id}: ${id}`).toBe(true);
        }
      }
    }
    expect(drawn).toBeGreaterThan(800);
    expect(undrawn).toBeGreaterThan(0);
  });
});
