import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import { THEME_NAMES } from '@mermaid-js/core/theme';
import type { GitGraphDocument, GitModel } from '@mermaid-js/diagram-gitgraph';
import { MermaidError, type Mermaid, type MermaidConfig } from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import type { CorpusItem } from '../types.ts';
import { gitGraphGateCorpus } from './corpus.ts';
import { gitApi } from './render-api.ts';

/**
 * Render properties and the AST round-trip of gitGraph (spec #292 T4, DESIGN §13.2, §13.4,
 * R-PARSE-8) over the gate corpus (e2e fixtures, v12 spec strings, quirks and parser cases, each
 * also CRLF and commented), through the public `render()` with `deterministic: true`, in every
 * theme and `theme: 'auto'` set by `initialize()` (a source's own front matter and directives
 * still win). Sources v12 rejects are rejected (#370's parity), so they are not drawn.
 *
 * Properties: well-formed XML, `assertInert`, deterministic (D260), no NaN/Infinity/undefined,
 * no `foreignObject` or `<marker>`, a `<style>` only for `auto`, ids only `<prefix>-title` and
 * `-desc` (and the gradient), every drawn coordinate in the viewBox with its transform, every
 * alias declared. Round-trip: each commit (merge, cherry-pick) of the model maps to exactly one
 * `data-ast` element, its bullet group, and each `branch` statement to its lane group; no other
 * AST node has one, and a `Commit`, `Merge`, `CherryPick` or `Branch` node with no element is
 * one a later commit with the same id replaced (D264).
 */
const THEMES = [...THEME_NAMES, 'auto'] as const;
const PREFIX = 'mermaid-0';
const TOL = 0.01;

interface Case {
  readonly id: string;
  readonly theme: string;
  readonly source: string;
  readonly model: GitModel;
  readonly ast: GitGraphDocument;
  readonly diagnostics: readonly { code: string; related?: readonly { range: Range }[] }[];
  readonly svg: string;
  readonly auto: boolean;
  readonly tree: SvgView;
}
interface Range {
  readonly start: number;
  readonly end: number;
}

const cases: Case[] = [];
const rejected = new Set<string>();
let corpus: CorpusItem[];

beforeAll(async () => {
  corpus = await gitGraphGateCorpus();
  for (const theme of THEMES) {
    const m = gitApi({ theme } as MermaidConfig);
    for (const item of corpus) {
      if (rejected.has(item.id)) continue;
      try {
        const prepared = await m.prepare(item.source, { id: PREFIX });
        const { svg } = m.renderSync(item.source, { id: PREFIX });
        expect(prepared.diagramType, item.id).toBe('gitGraph');
        cases.push({
          id: `${item.id} ${theme}`,
          theme,
          source: item.source,
          model: prepared.parse.model as GitModel,
          ast: prepared.parse.ast as GitGraphDocument,
          diagnostics: prepared.parse.diagnostics as Case['diagnostics'],
          svg,
          auto: String(prepared.config.theme) === 'auto',
          tree: parseSvg(svg),
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        rejected.add(item.id);
      }
    }
  }
}, 600_000);

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

/** The renderer's transforms: `translate(x,y)` and `rotate(a,cx,cy)`, in order. */
function matrixOf(t = ''): Matrix {
  let m = IDENTITY;
  for (const [, op, args] of t.matchAll(/(\w+)\(([^)]*)\)/g)) {
    const n = args!.split(/[ ,]+/).map(Number);
    if (op === 'translate') m = times(m, [1, 0, 0, 1, n[0]!, n[1] ?? 0]);
    else if (op === 'rotate') {
      const a = (n[0]! * Math.PI) / 180;
      const [cx, cy] = [n[1] ?? 0, n[2] ?? 0];
      m = times(m, [1, 0, 0, 1, cx, cy]);
      m = times(m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
      m = times(m, [1, 0, 0, 1, -cx, -cy]);
    } else throw new Error(`unexpected transform ${op}`);
  }
  return m;
}

/** The element's transform with its ancestors'. */
function screen(tree: SvgView, node: SvgElement): Matrix {
  const chain: SvgElement[] = [];
  for (let n: SvgElement | undefined = node; n; n = n.parent) chain.unshift(n);
  return chain.reduce((m, n) => times(m, matrixOf(tree.getAttr(n, 'transform'))), IDENTITY);
}

/** Every point an element draws at, on screen. */
function points(tree: SvgView, node: SvgElement): [number, number][] {
  const a = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
  let local: [number, number][] = [];
  switch (tree.tag(node) ?? '') {
    case 'line':
      local = [
        [a('x1'), a('y1')],
        [a('x2'), a('y2')],
      ];
      break;
    case 'rect':
      local = [
        [a('x'), a('y')],
        [a('x') + a('width'), a('y')],
        [a('x'), a('y') + a('height')],
        [a('x') + a('width'), a('y') + a('height')],
      ];
      break;
    case 'circle': {
      const r = a('r');
      local = [
        [a('cx') - r, a('cy') - r],
        [a('cx') + r, a('cy') + r],
      ];
      break;
    }
    case 'path':
    case 'polygon': {
      const raw = tree.getAttr(node, tree.tag(node) === 'path' ? 'd' : 'points') ?? '';
      // Arcs: radius, rotation and flags come before the end point.
      const text = raw.replace(/A[\d.]+,[\d.]+ [\d.]+ [01],[01] /g, 'L');
      const n = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      for (let i = 0; i + 1 < n.length; i += 2) local.push([n[i]!, n[i + 1]!]);
      break;
    }
    case 'text':
    case 'tspan':
      if (tree.getAttr(node, 'x') !== undefined) local = [[a('x'), a('y')]];
      break;
    default:
  }
  const m = screen(tree, node);
  return local.map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
}

describe('gitGraph render properties over the gate corpus', () => {
  it('renders the corpus in every theme', () => {
    expect(corpus.filter((i) => /^e2e\/[^(]*$/.test(i.id)).length).toBe(198);
    const perTheme = cases.length / THEMES.length;
    expect(perTheme).toBeGreaterThan(900);
    // Only sources v12 rejects stay out (#370's accept/reject parity).
    expect(rejected.size).toBeLessThan(corpus.length / 3);
    expect(cases.reduce((n, c) => n + c.model.commits.length, 0)).toBeGreaterThan(
      3000 * THEMES.length
    );
  });

  it('writes well-formed, inert XML with no NaN, Infinity, undefined, foreignObject or marker', () => {
    for (const c of cases) {
      expect(wellFormed(c.svg), c.id).toBeUndefined();
      const gradient = c.svg.includes('<linearGradient') ? `${PREFIX}-gradient` : false;
      expect(() => assertInert(c.svg, { gradient, themeStyle: c.auto }), c.id).not.toThrow();
      expect(c.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      if (!c.auto) expect(c.svg, c.id).not.toContain('<style');
    }
  }, 600_000);

  it('is deterministic: a fresh API object renders the same bytes (D260, R-ARCH-6)', async () => {
    const fresh = new Map<string, Mermaid>();
    for (const theme of THEMES) fresh.set(theme, gitApi({ theme } as MermaidConfig));
    for (const c of cases)
      expect((await fresh.get(c.theme)!.render(PREFIX, c.source)).svg, c.id).toBe(c.svg);
  }, 600_000);

  it('writes no element ids but the title, the description and the gradient', () => {
    for (const c of cases)
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'id') !== undefined)) {
        const id = c.tree.getAttr(el, 'id')!;
        const tag = c.tree.tag(el)!;
        const ok =
          (tag === 'title' && id === `${PREFIX}-title`) ||
          (tag === 'desc' && id === `${PREFIX}-desc`) ||
          (tag === 'linearGradient' && id === `${PREFIX}-gradient`);
        expect(ok, `${c.id}: <${tag} id="${id}">`).toBe(true);
      }
  });

  it('keeps every drawn coordinate inside the viewBox, rotated labels and tags included', () => {
    for (const c of cases) {
      const root = c.tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = c.tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = c.tree
        .find(() => true)
        .flatMap((n) => points(c.tree, n))
        .filter(
          ([px, py]) => px < x! - TOL || py < y! - TOL || px > x! + w! + TOL || py > y! + h! + TOL
        );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('declares every alias it refers to on the root', () => {
    for (const c of cases) {
      const declared = new Set([...c.svg.matchAll(/(--_[\w-]+)\s*:/g)].map((m) => m[1]));
      const used = [...c.svg.matchAll(/var\((--_[\w-]+)\)/g)].map((m) => m[1]);
      expect(
        used.filter((a) => !declared.has(a)),
        c.id
      ).toEqual([]);
    }
  });
});

const DRAWN: Readonly<Record<string, string>> = {
  Commit: 'commit-bullet',
  Merge: 'commit-bullet',
  CherryPick: 'commit-bullet',
  Branch: 'branch-lane',
};

describe('gitGraph AST round-trip over the gate corpus (R-PARSE-8)', () => {
  it('maps each commit and branch statement to exactly one data-ast element, and no other node', () => {
    let replaced = 0;
    for (const c of cases) {
      const index = astIndex(c.ast as AstNode);
      const seen = new Map<string, SvgElement[]>();
      for (const el of c.tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined))
        seen.set(c.tree.getAttr(el, 'data-ast')!, [
          ...(seen.get(c.tree.getAttr(el, 'data-ast')!) ?? []),
          el,
        ]);
      for (const [id, els] of seen) {
        const node = index.get(id);
        expect(node, `${c.id}: data-ast ${id} is not an AST id`).toBeDefined();
        expect(els, `${c.id}: ${id}`).toHaveLength(1);
        const cls = DRAWN[node!.type];
        expect(cls, `${c.id}: ${id} is a ${node!.type}`).toBeDefined();
        expect(c.tree.getAttr(els[0]!, 'class')!.split(' '), `${c.id}: ${id}`).toContain(cls);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      for (const commit of c.model.commits) {
        const els = seen.get(commit.astId) ?? [];
        expect(els, `${c.id}: ${commit.astId}`).toHaveLength(1);
        expect(c.tree.getAttr(els[0]!, 'data-id'), `${c.id}: ${commit.astId}`).toBe(commit.id);
      }
      for (const b of c.model.branches)
        if (b.astId) expect(seen.get(b.astId), `${c.id}: ${b.astId}`).toHaveLength(1);
      // A statement node with no element: a commit a later one with its id replaced (D264).
      const dupes = c.diagnostics
        .filter((d) => d.code === 'GIT_DUPLICATE_ID')
        .flatMap((d) => d.related ?? []);
      for (const node of c.ast.children) {
        if (!(node.type in DRAWN) || seen.has(node.id)) continue;
        const why = dupes.some(
          (r) => r.range.start >= node.range.start && r.range.end <= node.range.end
        );
        expect(why, `${c.id}: ${node.id} (${node.type}) is not drawn`).toBe(true);
        replaced++;
      }
    }
    expect(replaced).toBeGreaterThan(0);
  }, 600_000);

  it('marks the implicit main branch with data-id only', () => {
    for (const c of cases) {
      const main = c.tree.find(
        (n, t) =>
          t.getAttr(n, 'class') === 'branch-lane' && t.getAttr(n, 'data-id') === c.model.mainBranch
      );
      expect(main, c.id).toHaveLength(1);
      expect(c.tree.getAttr(main[0]!, 'data-ast'), c.id).toBeUndefined();
    }
  });
});
