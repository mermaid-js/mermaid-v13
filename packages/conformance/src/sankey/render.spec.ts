import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert, styleScope } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { SankeyLinkNode, SankeyNodeNode } from '@mermaid-js/diagram-sankey';
import { renderSankeyForTest, type RenderedSankey } from '@mermaid-js/diagram-sankey/testing';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { sankeyCases, sankeyCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of sankey (spec #427 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8, D224) over the parsed corpus: the e2e fixtures, the v12 spec and syntax-page
 * strings and the cases, each in every theme and `theme: 'auto'` set as `initialize()` would,
 * and in the default theme under each `linkColor` mode and both label styles (a source's own
 * front matter and directives still win). Sources go through the plugin's own seam, parse →
 * layout → render, with core's render context (`renderSankeyForTest`); sources the parser
 * rejects (cycles, D393; syntax errors) stay out.
 *
 * Properties: well-formed XML, `assertInert` (with the render's style scope, so the user-space
 * gradients are checked as D391's), deterministic, no NaN/Infinity/undefined (D394), no
 * `foreignObject`, no id but `<prefix>-title` and the writer's gradients, every drawn point,
 * link stroke and label box inside the viewBox, every alias declared, and no render warning
 * (the parse's warnings reach `render()` once, through `analyse`, not again here) but the one
 * `SANKEY_COLOR_INVALID` for the colour a config plants. Round-trip:
 * each `Node` and `Link` of the AST has exactly one `data-ast` element, its `g.node` or
 * `g.link`, and its range holds its text.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const CONFIGS: readonly Record<string, unknown>[] = [
  { linkColor: 'source', labelStyle: 'outlined' },
  { linkColor: 'target', showValues: false },
  { linkColor: '#636465', labelStyle: 'outlined', showValues: false },
  {
    linkColor: 'gradient',
    labelStyle: 'outlined',
    nodeColors: { a: '#123456', Coal: 'red', b: 'url(x)' },
  },
];
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly config: Record<string, unknown>;
  readonly source: string;
  readonly r: RenderedSankey;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

async function add(item: CorpusItem, config: Record<string, unknown>, label: string) {
  if (rejected.has(item.id)) return;
  let r: RenderedSankey;
  try {
    r = await renderSankeyForTest(item.source, { config });
  } catch (e) {
    if (!(e as Error).message.startsWith('sankey parse error')) throw e;
    rejected.add(item.id);
    return;
  }
  cases.push({ id: `${item.id} ${label}`, config, source: item.source, r, tree: parseSvg(r.svg) });
}

beforeAll(async () => {
  corpus = [...(await sankeyCorpus()), ...sankeyCases()];
  for (const theme of THEMES) for (const item of corpus) await add(item, { theme }, theme);
  for (const sankey of CONFIGS)
    for (const item of corpus) await add(item, { sankey }, JSON.stringify(sankey));
}, 300_000);

describe('sankey render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, every linkColor mode and both label styles', () => {
    // The 18 restored fixtures and the 9 baselines (#503).
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(27);
    expect([...rejected].filter((id) => id.startsWith('e2e/'))).toEqual([]);
    expect(rejected.size).toBeLessThan(corpus.length / 2);
    expect(cases.length).toBeGreaterThan(80 * (THEMES.length + CONFIGS.length));
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      '<linearGradient',
      'class="sankey-label-bg"',
      'class="sankey-label-fg"',
      'stroke="#636465"',
      'style="mix-blend-mode:multiply"',
      '<title id=',
    ])
      expect(all, part).toContain(part);
    // Source and target strokes: some link drawn in its source's fill, some in its target's.
    const strokes = (c: Case) =>
      [...c.tree.find({ tag: 'path' })].map((p) => c.tree.getAttr(p, 'stroke'));
    const fills = (c: Case) =>
      [...c.tree.find({ tag: 'rect' })].map((p) => c.tree.getAttr(p, 'fill'));
    for (const mode of ['source', 'target'] as const) {
      const of = cases.filter(
        (c) => (c.config.sankey as { linkColor?: string } | undefined)?.linkColor === mode
      );
      expect(
        of.some((c) => {
          const f = fills(c);
          return c.r.layout.links.some(
            (l, i) => strokes(c)[i] === f[mode === 'source' ? l.source : l.target]
          );
        }),
        mode
      ).toBe(true);
    }
    expect(cases.some((c) => c.r.layout.nodes.length >= 40)).toBe(true);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined or foreignObject', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () =>
          assertInert(c.r.svg, {
            gradient: c.r.gradient,
            themeStyle: c.r.themeStyle,
            scope: styleScope('mermaid-0'),
          }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('is deterministic: a second render, and the tree backing, give the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 3 === 0)) {
      expect((await renderSankeyForTest(c.source, { config: c.config })).svg, c.id).toBe(c.r.svg);
      if (cases.indexOf(c) % 9 === 0)
        expect(
          (await renderSankeyForTest(c.source, { config: c.config, tree: true })).svg,
          c.id
        ).toBe(c.r.svg);
    }
  });

  it('writes no id but the title and the gradients, and raises no render warning but the planted colour', () => {
    for (const c of cases) {
      const ids = c.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => `${c.tree.tag(n)}#${c.tree.getAttr(n, 'id')}`);
      const allowed = (s: string) =>
        s === 'title#mermaid-0-title' || /^linearGradient#mermaid-0-g-[0-9a-z]+$/.test(s);
      expect(
        ids.filter((s) => !allowed(s)),
        c.id
      ).toEqual([]);
      expect(ids.includes('title#mermaid-0-title'), c.id).toBe(!!c.r.model.title?.trim());
      // The one colour the configs plant that fails the colour check: one warning (#503).
      const planted = (c.r.config.sankey?.nodeColors as Record<string, unknown> | undefined)?.b;
      expect(
        c.r.warnings.filter((w) => w.code.startsWith('SANKEY_')).map((w) => w.code),
        c.id
      ).toEqual(planted === 'url(x)' ? ['SANKEY_COLOR_INVALID'] : []);
    }
  });

  it('gives two diagrams on one page no shared id', async () => {
    const energy = corpus.find((i) => i.source.includes('Biomass'))!;
    const a = await renderSankeyForTest(energy.source, { idPrefix: 'd1' });
    const b = await renderSankeyForTest(energy.source, { idPrefix: 'd2' });
    const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids(a.svg).length).toBeGreaterThan(10);
    expect(ids(a.svg).filter((id) => ids(b.svg).includes(id))).toEqual([]);
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(extents(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
      const { nodes, links } = c.r.layout;
      const drawn = [
        ...nodes.flatMap(({ label: { box: b } }) => [
          { x: b.x, y: b.y },
          { x: b.x + b.width, y: b.y + b.height },
        ]),
        ...links.flatMap((l) =>
          [l.path.from, l.path.to].flatMap((p) => [
            { x: p.x, y: p.y - l.strokeWidth / 2 },
            { x: p.x, y: p.y + l.strokeWidth / 2 },
          ])
        ),
      ];
      expect(drawn.filter(off).slice(0, 2), c.id).toEqual([]);
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

describe('sankey AST round-trip over the parsed corpus (R-PARSE-8, D397)', () => {
  it('maps each Node to one g.node and each Link to one g.link, and nothing else has data-ast', () => {
    for (const c of cases) {
      const ast = c.r.ast!;
      const index = astIndex(ast);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        const node = index.get(id);
        const cls = c.tree.getAttr(el, 'class');
        expect([node?.type, cls], `${c.id}: data-ast ${id}`).toEqual(
          node?.type === 'Node' ? ['Node', 'node'] : ['Link', 'link']
        );
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
        const text = c.source.slice(start, end);
        if (node!.type === 'Node') {
          // Compared without blanks and punctuation, and as a subsequence: v12's preprocessing
          // collapses blank lines, removes `%%` comments and turns attribute quotes into `'`
          // before the name is read.
          const bare = (t: string): string => t.replace(/\W+/g, '');
          const name = bare((node as SankeyNodeNode).name);
          let k = 0;
          for (const ch of bare(text)) if (ch === name[k]) k++;
          expect(k, `${c.id}: ${id} holds ${JSON.stringify(name)}`).toBe(name.length);
        } else {
          const row = node as SankeyLinkNode;
          expect(
            text.startsWith(c.source.slice(row.source.range.start, row.source.range.end)),
            id
          ).toBe(true);
          expect(
            text.endsWith(c.source.slice(row.value.range.start, row.value.range.end)),
            id
          ).toBe(true);
        }
      }
      for (const link of ast.children) {
        expect(seen.get(link.id), `${c.id}: ${link.id}`).toBe(1);
        for (const n of link.children ?? []) expect(seen.get(n.id), `${c.id}: ${n.id}`).toBe(1);
      }
      expect(seen.size, c.id).toBe(c.r.model.nodes.length + c.r.model.links.length);
    }
  });
});
