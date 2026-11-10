import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import {
  renderAgentflowForTest,
  type RenderedAgentflow,
} from '@mermaid-js/diagram-agentflow/testing';
import { math } from '@mermaid-js/plugin-math';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { agentflowCases, agentflowCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the agentflow (spec #523 T4, #548; DESIGN §13.2,
 * §13.4, R-ARCH-6, R-PARSE-8, R-SEC-2, D224, D468) over the parsed corpus: the e2e fixtures,
 * the harvested v12 spec and syntax-page strings and the cases, each in every theme and
 * `theme: 'auto'`, set as `initialize()` would (a source's own front matter still wins). The
 * manifest is #550's, so sources go through the plugin's own seam, parse → layout → render,
 * with core's render context (`renderAgentflowForTest`); sources the parser rejects stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, no element id but the accessible title's and description's,
 * every drawn coordinate inside the viewBox, every alias declared. Round-trip: every drawn
 * vertex, card, frame and edge has exactly one `data-ast` element, a `g.node`, a flow
 * `g.cluster` or an edge `path`, whose id resolves to an AST node whose range is in the source.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedAgentflow;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await agentflowCorpus()), ...agentflowCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedAgentflow;
      try {
        r = await renderAgentflowForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('agentflow parse error')) throw e;
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

/** Line ends, which `extents` leaves out, moved by their group's `translate`. */
function lineEnds(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const walk = (node: ReturnType<SvgView['find']>[number], dx: number, dy: number): void => {
    const t = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(tree.getAttr(node, 'transform') ?? '');
    const x = dx + (t ? Number(t[1]) : 0);
    const y = dy + (t ? Number(t[2]) : 0);
    if (tree.tag(node) === 'line') {
      const a = (k: string): number => Number(tree.getAttr(node, k));
      out.push({ x: x + a('x1'), y: y + a('y1') }, { x: x + a('x2'), y: y + a('y2') });
    }
    for (const c of tree.children(node)) walk(c, x, y);
  };
  walk(tree.root, 0, 0);
  return out;
}

describe('agentflow render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every shape, card, frame and edge kind', () => {
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBeGreaterThan(50);
    expect(cases.length).toBeGreaterThan(300 * THEMES.length);
    expect(rejected.size).toBeLessThan(corpus.length / 3);
    const all = cases
      .filter((c) => c.theme === 'redux-color')
      .map((c) => c.r.svg)
      .join('');
    for (const kind of ['tool', 'task', 'decision', 'input', 'refdoc', 'action', 'connector'])
      expect(all, kind).toContain(`af-kind-${kind}`);
    for (const part of [
      'class="cluster flow-cluster',
      'class="flow-collapsed"',
      'class="collapsed-separator"',
      'edge-pattern-dotted',
      'class="edgeLabel"',
      'class="agentflowTitleText"',
      'data-color-id="color-7"',
    ])
      expect(all, part).toContain(part);
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker element', () => {
    for (const c of cases) {
      expect(wellFormed(c.r.svg), c.id).toBeUndefined();
      expect(
        () => assertInert(c.r.svg, { gradient: c.r.gradient, themeStyle: c.r.themeStyle }),
        c.id
      ).not.toThrow();
      expect(c.r.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|<marker|<defs>(?!<linearGradient)/
      );
    }
  });

  it('is deterministic: a second render gives the same bytes (R-ARCH-6)', async () => {
    for (const c of cases.filter((_, i) => i % 5 === 0))
      expect(
        (await renderAgentflowForTest(c.source, { config: { theme: c.theme } })).svg,
        c.id
      ).toBe(c.r.svg);
  });

  it('writes no element id but the accessible title and description (R-A11Y-1)', () => {
    for (const c of cases) {
      const ids = c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined);
      for (const n of ids) {
        expect(['title', 'desc', 'linearGradient'], c.id).toContain(c.tree.tag(n));
      }
    }
  });

  it('keeps everything drawn inside the viewBox (D224)', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect([...extents(c.tree), ...lineEnds(c.tree)].filter(off).slice(0, 3), c.id).toEqual([]);
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

describe('agentflow AST round-trip over the parsed corpus (R-PARSE-8, D468)', () => {
  it('maps every drawn vertex, card, frame and edge to exactly one data-ast element and back', () => {
    for (const c of cases.filter((x) => x.theme === 'redux-color')) {
      const index = astIndex(c.r.ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const tag = c.tree.tag(el);
        const cls = (c.tree.getAttr(el, 'class') ?? '').split(' ');
        const kind =
          tag === 'path'
            ? cls.includes('flowchart-link')
            : tag === 'g' && (cls.includes('node') || cls.includes('flow-cluster'));
        expect(kind, `${c.id}: ${tag}.${cls.join('.')} has data-ast ${id}`).toBe(true);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBeDefined();
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        const { start, end } = node!.range;
        expect(start >= 0 && end >= start && end <= c.source.length, `${c.id}: ${id}`).toBe(true);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      const p = c.r.layout.agentflow;
      const drawn = [...p.nodes.map((v) => v.ast), ...p.groups.map((g) => g.ast)];
      for (const ast of drawn) expect(seen.get(ast), `${c.id}: ${ast}`).toBe(1);
      for (const e of p.edges)
        if (c.r.layout.edges.get(e.id)!.points.length > 1)
          expect(seen.get(e.edge.ast), `${c.id}: edge ${e.id}`).toBe(1);
    }
  });
});

describe('agentflow math with the math extension (D176)', () => {
  it('typesets $$…$$ in vertex, edge and flow labels, with no MATH_NOT_RENDERED', async () => {
    const src = 'agentflow-beta TB\n  flow f["$$z$$"]\n    a["$$x^2$$"] -->|"$$y$$"| b\n  end\n';
    const without = await renderAgentflowForTest(src);
    expect(without.warnings.map((w) => w.code)).toContain('MATH_NOT_RENDERED');
    await math.resources!.load({} as never);
    const r = await renderAgentflowForTest(src, { inline: math.inline });
    expect(r.warnings.map((w) => w.code)).not.toContain('MATH_NOT_RENDERED');
    expect(r.svg).not.toContain('$$');
    expect(() => assertInert(r.svg, { gradient: r.gradient })).not.toThrow();
  }, 60_000);
});
