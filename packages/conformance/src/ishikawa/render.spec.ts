import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import { renderIshikawaForTest, type RenderedIshikawa } from '@mermaid-js/diagram-ishikawa/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { ishikawaCases, ishikawaCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of ishikawa (spec #519 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page strings
 * and the cases, each in every theme and `theme: 'auto'` set as `initialize()` would (a source's
 * own front matter still wins). Sources go through the plugin's own seam, parse → layout →
 * render, with core's render context (`renderIshikawaForTest`), not `createMermaid()`: the
 * manifest lands with T5, and the checks read the layout beside the SVG (the head's curve, which
 * bones were drawn). Sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject`, `<marker>` or `<defs>` and no `<style>` but `theme: 'auto'`'s, no element id
 * but `<id>-title`, every drawn coordinate (line ends included) inside the viewBox, every alias
 * declared. Round-trip: each `Effect` and `Cause` node of the AST has exactly one `data-ast`
 * element (the head group, a cause's label group, a sub-cause's sub-group), and every `data-ast`
 * names an AST node.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedIshikawa;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await ishikawaCorpus()), ...ishikawaCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedIshikawa;
      try {
        r = await renderIshikawaForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('ishikawa parse error')) throw e;
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

describe('ishikawa render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every kind of bone and label', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(35);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(cases.length).toBeGreaterThan(100 * THEMES.length);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="ishikawa-spine"',
      'class="ishikawa-head"',
      'class="ishikawa-label-box"',
      'class="ishikawa-sub-branch"',
      'class="ishikawa-arrow"',
      'class="ishikawa-label align"',
      'class="ishikawa-label up"',
      'class="ishikawa-label down"',
    ])
      expect(all, part).toContain(part);
    // An empty body draws an empty root.
    expect(cases.some((c) => c.r.layout.head === undefined)).toBe(true);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject, marker or defs', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(() => assertInert(c.r.svg, { themeStyle: c.r.themeStyle }), c.id).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker|<defs/);
      expect(c.r.svg.includes('<style'), c.id).toBe(c.r.themeStyle);
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0))
      expect(
        (await renderIshikawaForTest(c.source, { config: { theme: c.theme } })).svg,
        c.id
      ).toBe(c.r.svg);
  });

  it('writes no element id but <id>-title, the front-matter title or the effect (D492)', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      const named = c.r.model.title?.trim() || c.r.model.effect?.text.trim();
      expect(ids, c.id).toEqual(named ? ['title#mermaid-0-title'] : []);
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      // The head's control point lies outside its curve: the curve reaches half way to it.
      const head = c.r.layout.head;
      const points = extents(c.tree).filter(
        (p) => !head || Math.abs(p.x - head.control.x) > TOL || Math.abs(p.y - head.control.y) > TOL
      );
      if (head) points.push({ x: head.control.x / 2, y: head.control.y });
      for (const l of c.tree.find({ tag: 'line' })) {
        const at = (n: string): number => Number(c.tree.getAttr(l, n));
        points.push({ x: at('x1'), y: at('y1') }, { x: at('x2'), y: at('y2') });
      }
      expect(points.filter(off).slice(0, 3), c.id).toEqual([]);
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

describe('ishikawa AST round-trip (R-PARSE-8)', () => {
  it('maps each Effect and Cause node to one element, and nothing else', () => {
    let marked = 0;
    for (const c of cases.filter((k) => k.theme === 'default')) {
      const index = astIndex(c.r.ast!);
      const byAst = new Map<string, string[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        expect(index.has(id), `${c.id}: ${id}`).toBe(true);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        const what = `${c.tree.tag(el)} ${c.tree.getAttr(el, 'class')}`;
        byAst.set(id, [...(byAst.get(id) ?? []), what]);
      }
      for (const [id, node] of index) {
        const want =
          node.type === 'Effect'
            ? ['g ishikawa-head-group']
            : node.type === 'Cause'
              ? [id.includes('.') ? 'g ishikawa-sub-group' : 'g ishikawa-label-group']
              : undefined;
        expect(byAst.get(id), `${c.id}: ${id}`).toEqual(want);
        if (want) marked++;
      }
    }
    expect(marked).toBeGreaterThan(400);
  });
});
