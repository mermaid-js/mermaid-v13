import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import {
  renderArchitectureForTest,
  type RenderedArchitecture,
} from '@mermaid-js/diagram-architecture/testing';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { architectureCases, architectureCorpus } from './corpus.ts';

/**
 * Render properties and the AST round-trip of the architecture diagram (spec #525 T4, DESIGN
 * §13.2, §13.4, R-PARSE-8, D508) over the parsed corpus: the e2e fixtures, the v12 spec strings
 * and the hand-written and recovery cases, each in every theme and `theme: 'auto'`, set as
 * `initialize()` would (a source's own front matter and directives still win). The manifest is
 * T5's (#618), so sources go through the package's render entry, parse → layout (`compass`) →
 * render, with core's render context (`renderArchitectureForTest`); sources the parser rejects
 * stay out.
 *
 * Properties: well-formed XML, `assertInert`, deterministic, no NaN/Infinity/undefined, no
 * `foreignObject` or `<marker>`, no element id but `${idPrefix}-title`/`-desc`, every drawn
 * point (transforms applied: the turned edge labels, the scaled icons) and every node and group
 * box inside the viewBox, every alias declared. Round-trip: each service, junction, group and
 * edge of the AST has exactly one `data-ast` element, whose `data-id` is the same, a `g` of its
 * kind or the edge's `path.edge`, and its range holds its id.
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const TOL = 0.01;
const DRAWN = new Set(['Service', 'Junction', 'Group', 'Edge']);

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly r: RenderedArchitecture;
  readonly tree: SvgView;
}

const cases: Case[] = [];
let corpus: CorpusItem[];
const rejected = new Set<string>();

beforeAll(async () => {
  corpus = [...(await architectureCorpus()), ...architectureCases()];
  for (const theme of THEMES)
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      let r: RenderedArchitecture;
      try {
        r = await renderArchitectureForTest(item.source, { config: { theme } });
      } catch (e) {
        if (!(e as Error).message.startsWith('architecture parse error')) throw e;
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

/** A 2-D affine matrix [a, b, c, d, e, f]. */
type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const times = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The matrix of a `transform` list of translate, scale and rotate (the writer writes no other). */
function matrixOf(transform = ''): Matrix {
  let m = IDENTITY;
  for (const [, fn, args] of transform.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = args!.split(/[\s,]+/).map(Number);
    if (fn === 'translate') m = times(m, [1, 0, 0, 1, n[0]!, n[1] ?? 0]);
    else if (fn === 'scale') m = times(m, [n[0]!, 0, 0, n[1] ?? n[0]!, 0, 0]);
    else if (fn === 'rotate') {
      const r = (n[0]! * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      m = times(m, [1, 0, 0, 1, cx, cy]);
      m = times(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
      m = times(m, [1, 0, 0, 1, -cx, -cy]);
    } else throw new Error(`transform ${fn}`);
  }
  return m;
}

/**
 * Every point an element draws at, in root user units, every transform applied: box corners,
 * polygon corners, line ends, absolute path points (relative icon paths stay inside their icon's
 * square, checked with the node box) and text anchors.
 */
function drawnPoints(tree: SvgView): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const walk = (node: SvgElement, m: Matrix): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const here = node === tree.root ? m : times(m, matrixOf(tree.getAttr(node, 'transform')));
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const put = (x: number, y: number): void =>
      void out.push({
        x: here[0] * x + here[2] * y + here[4],
        y: here[1] * x + here[3] * y + here[5],
      });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle' || tag === 'ellipse') {
      const rx = tag === 'circle' ? at('r') : at('rx');
      const ry = tag === 'circle' ? at('r') : at('ry');
      put(at('cx') - rx, at('cy') - ry);
      put(at('cx') + rx, at('cy') + ry);
    } else if (tag === 'line') {
      put(at('x1'), at('y1'));
      put(at('x2'), at('y2'));
    } else if (tag === 'polygon') {
      const n = (tree.getAttr(node, 'points') ?? '').split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) put(n[i]!, n[i + 1]!);
    } else if (tag === 'path') {
      const d = tree.getAttr(node, 'd') ?? '';
      if (!/[a-z]/.test(d))
        for (const seg of d.match(/[MLQZ][^MLQZ]*/g) ?? []) {
          const p = (seg.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
          for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
        }
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c, here);
  };
  walk(tree.root, IDENTITY);
  return out;
}

describe('architecture render properties over the parsed corpus', () => {
  it('renders the corpus in every theme, with every kind of element', () => {
    // v12's 20 fixtures, T1's 8 lexer fixtures and T3's 2 layout fixtures.
    expect(corpus.filter((i) => i.id.startsWith('e2e/')).length).toBe(30);
    expect(cases.length).toBe((corpus.length - rejected.size) * THEMES.length);
    // The 126 parser-clean sources the layout spec lays out (#607); the cases are mostly errors.
    expect(corpus.length - rejected.size).toBe(126);
    const all = cases.map((c) => c.r.svg).join('');
    for (const part of [
      'class="architecture-service"',
      'class="architecture-junction"',
      'class="architecture-group"',
      'class="arrow"',
      'class="node-icon-text"',
      '<path class="node-bkg"',
      'rotate(-90,',
      'rotate(45,',
      'rotate(-45,',
    ])
      expect(all, part).toContain(part);
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
      expect(
        (await renderArchitectureForTest(c.source, { config: { theme: c.theme } })).svg,
        c.id
      ).toBe(c.r.svg);
  });

  it('writes no element id but the accessible title and description', () => {
    for (const c of cases)
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined))
        expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(c.tree.getAttr(el, 'id'));
  });

  it('keeps everything drawn, and every node and group box, inside the viewBox', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const off = (p: { x: number; y: number }): boolean =>
        p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL;
      expect(drawnPoints(c.tree).filter(off).slice(0, 3), c.id).toEqual([]);
      const boxes = [...c.r.layout.nodes.values(), ...c.r.layout.groups.values()].flatMap((n) => [
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

  it('shrinks no arrowhead at the default sizes', () => {
    const defaults = cases.filter((c) => c.r.layout.architecture.sizes.iconSize === 80);
    expect(defaults.length).toBeGreaterThan(0);
    for (const c of defaults)
      expect(
        c.r.warnings.map((w) => w.code),
        c.id
      ).not.toContain('ARCHITECTURE_ARROW_SHRUNK');
  });
});

describe('architecture AST round-trip over the parsed corpus (R-PARSE-8, D508)', () => {
  it('maps each service, junction, group and edge to exactly one element, and nothing else has data-ast', () => {
    for (const c of cases) {
      const index = astIndex(c.r.ast as AstNode);
      const seen = new Map<string, number>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = c.tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        expect(c.tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        const node = index.get(id);
        expect(DRAWN.has(node?.type ?? ''), `${c.id}: data-ast ${id}`).toBe(true);
        const kind =
          node!.type === 'Edge' ? 'path edge' : `g architecture-${node!.type.toLowerCase()}`;
        expect(`${c.tree.tag(el)} ${c.tree.getAttr(el, 'class')}`, `${c.id}: ${id}`).toBe(kind);
        // The range holds the id (`service:a` → `a`; an edge's ends).
        const { start, end } = node!.range;
        const written = c.source.slice(start, end);
        const names = id.replace(/^\w+:/, '').replace(/@\d+$/, '').split('->');
        for (const name of names) expect(written, `${c.id}: ${id}`).toContain(name);
      }
      for (const n of c.r.ast.children)
        if (DRAWN.has(n.type)) expect(seen.get(n.id), `${c.id}: ${n.id}`).toBe(1);
    }
  });
});
