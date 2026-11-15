import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderC4BetaForTest, type RenderedC4Beta } from '@mermaid-js/diagram-c4/testing';
import { REPO_ROOT } from '../corpus.ts';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import { c4betaCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of c4-beta (spec #730), as `../c4/render.spec.ts` runs
 * them for legacy C4, over the accepted sources of the probes, the grammar's documents (each with
 * its generated variants) and `e2e/diagrams/c4beta`, in every theme and `theme: 'auto'`. Sources
 * the parser rejects stay out. Properties: well-formed XML, `assertInert`, deterministic, no
 * NaN/Infinity/undefined, no `foreignObject`, `<marker>`, `<symbol>`, `<filter>` or gradient, no
 * `<style>` but `theme: 'auto'`'s, no element id but the accessible title's and description's,
 * everything drawn inside the viewBox, every alias declared. Round-trip: every `data-ast` names
 * an AST node, and each drawn element, boundary and relation has exactly one.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;
const FIXTURES = join(REPO_ROOT, 'e2e/diagrams/c4beta');

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedC4Beta;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let rejected = 0;

beforeAll(async () => {
  const fixtures = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.mmd'))
    .map((f) => ({ id: `e2e/${f}`, source: readFileSync(join(FIXTURES, f), 'utf8') }));
  const corpus = [...c4betaCorpus(), ...fixtures];
  for (const theme of THEMES)
    for (const item of corpus) {
      const r = await renderC4BetaForTest(item.source, { config: { theme } });
      if (r.rejected) {
        if (theme === 'default') rejected++;
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

describe('c4-beta render properties over the accepted corpus', () => {
  it('renders the accepted sources in every theme, with boundaries, relations and labels', () => {
    expect(rejected).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThan(40 * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="node c4-shape c4-person"',
      'class="node c4-shape c4-external_system c4-external"',
      'class="c4-boundary"',
      '<path class="marker"',
      'class="c4-rel-techn"',
      'class="c4-title"',
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

  it('is deterministic: a second render gives the same bytes', async () => {
    for (const c of cases.filter((_, i) => i % 5 === 0))
      expect((await renderC4BetaForTest(c.source, { config: { theme: c.theme } })).svg, c.id).toBe(
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

  it('keeps everything drawn inside the viewBox', () => {
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

describe('c4-beta AST round-trip (R-PARSE-8)', () => {
  it('maps each drawn element, boundary and relation to one element, and only those', () => {
    let drawn = 0;
    for (const c of cases.filter((k) => k.theme === 'default')) {
      const index = astIndex(c.r.ast);
      const byAst = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        expect(index.has(id), `${c.id}: ${id}`).toBe(true);
        byAst.set(id, (byAst.get(id) ?? 0) + 1);
      }
      const shown = new Set([
        ...c.r.layout.elements.map((e) => e.ast),
        ...c.r.layout.boundaries.map((b) => b.ast),
        ...c.r.layout.relations.map((r) => r.ast),
      ]);
      for (const [id, node] of index) {
        const want = shown.has(id) ? 1 : undefined;
        expect(byAst.get(id), `${c.id}: ${id}`).toBe(want);
        if (want) drawn++;
        else
          expect(['Element', 'Relation'].includes(node.type) && !id.includes('@'), id).toBe(false);
      }
    }
    expect(drawn).toBeGreaterThan(100);
  });
});

describe('c4-beta undirected relation', () => {
  const HEADS = /<path class="marker"/g;
  const heads = async (arrow: string): Promise<number> => {
    const r = await renderC4BetaForTest(`c4-beta\nperson a "A"\nperson b "B"\na${arrow}b : "Uses"`);
    expect(r.rejected, arrow).toBeFalsy();
    return r.svg.match(HEADS)?.length ?? 0;
  };

  it('draws `---` with no arrowhead, and `-->` with one', async () => {
    expect([await heads('---'), await heads(' --> '), await heads(' <--> ')]).toEqual([0, 1, 2]);
  });
});
