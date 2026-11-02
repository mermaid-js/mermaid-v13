import { join } from 'node:path';
import { SaxesParser } from 'saxes';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import { detectFlowchart } from '@mermaid-js/diagram-flowchart';
import { renderForTest, type RenderedForTest } from '@mermaid-js/diagram-flowchart/testing';
import { REPO_ROOT, corpusFromDir } from './index.ts';

/**
 * Render properties (DESIGN §13.2, §13.4) over the e2e flowchart fixtures, with the
 * deterministic table measurer: well-formed XML, the allow-list, render-twice determinism,
 * both writer backings byte-identical, no NaN/Infinity/undefined, the viewBox holds every
 * drawn coordinate, and every vertex, edge and subgraph maps to exactly one `data-ast` element
 * whose id resolves to an AST range.
 */

interface Case {
  id: string;
  source: string;
  result: RenderedForTest;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

beforeAll(async () => {
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'flowchart')) {
    if (detectFlowchart(item.source.replace(/^---[\s\S]*?\n---\s*\n/, '')) === undefined) {
      // Detection runs after front matter in the pipeline; a crude strip is enough here.
      skipped.push({ id: item.id, reason: 'not detected as a flowchart' });
      continue;
    }
    try {
      cases.push({ id: item.id, source: item.source, result: await renderForTest(item.source) });
    } catch (e) {
      const message = (e as Error).message;
      if (message.startsWith('parse failed')) skipped.push({ id: item.id, reason: message });
      else throw new Error(`${item.id}: ${message}`, { cause: e });
    }
  }
}, 120_000);

function wellFormed(svg: string): string | undefined {
  const parser = new SaxesParser({ xmlns: true });
  let problem: string | undefined;
  parser.on('error', (e) => (problem ??= e.message));
  parser.write(svg).close();
  return problem;
}

// Every coordinate an element draws at, in root user units (translate() only, as written).
function extents(tree: SvgTree): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const nums = (s: string | undefined): number[] =>
    s === undefined ? [] : (s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);
  const walk = (node: SvgNode, dx: number, dy: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: Parameters<SvgTree['getAttr']>[1]): number =>
      Number(tree.getAttr(node, name) ?? 0);
    const t = tree.getAttr(node, 'transform');
    const m = t ? /^translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(t) : null;
    if (m) {
      dx += Number(m[1]);
      dy += Number(m[2]);
    }
    const put = (x: number, y: number): void => void out.push({ x: x + dx, y: y + dy });
    if (tag === 'rect' || tag === 'image') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle' || tag === 'ellipse') {
      const rx = tag === 'circle' ? at('r') : at('rx');
      const ry = tag === 'circle' ? at('r') : at('ry');
      put(at('cx') - rx, at('cy') - ry);
      put(at('cx') + rx, at('cy') + ry);
    } else if (tag === 'polygon' || tag === 'polyline') {
      const p = nums(tree.getAttr(node, 'points'));
      for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
    } else if (tag === 'path') {
      // Absolute commands only (PathBuilder writes no others); arcs keep their end points.
      const d = tree.getAttr(node, 'd') ?? '';
      for (const seg of d.match(/[MLCQAZ][^MLCQAZ]*/g) ?? []) {
        const p = nums(seg.slice(1));
        if (seg[0] === 'A') put(p[5]!, p[6]!);
        else for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
      }
    } else if (tag === 'text' || tag === 'tspan') {
      if (tree.getAttr(node, 'x') !== undefined) put(at('x'), at('y'));
    }
    for (const c of tree.children(node)) walk(c, dx, dy);
  };
  walk(tree.root, 0, 0);
  return out;
}

function astIndex(ast: AstNode): Map<string, AstNode> {
  const index = new Map<string, AstNode>();
  const visit = (n: AstNode): void => {
    index.set(n.id, n);
    for (const c of n.children ?? []) visit(c);
  };
  visit(ast);
  return index;
}

const astElements = (tree: SvgTree): SvgNode[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined);

describe('flowchart render properties over the e2e corpus', () => {
  it('renders the corpus', () => {
    expect(cases.length).toBeGreaterThan(350);
    // Inputs v13 rejects are the parser's business (#8 parity); list them so the count is seen.
    expect(skipped.filter((s) => !s.reason.startsWith('not detected'))).toEqual([]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.result.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic and byte-identical through both writer backings', async () => {
    for (const c of cases) {
      const again = await renderForTest(c.source, { stream: true });
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined', () => {
    for (const c of cases) expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [, , w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number) as number[];
      const out = extents(tree).filter(
        (p) => p.x < -0.5 || p.y < -0.5 || p.x > w! + 0.5 || p.y > h! + 0.5
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every vertex, edge and subgraph to exactly one data-ast element and back', () => {
    for (const c of cases) {
      const { tree, parse, layout } = c.result;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of astElements(tree)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      // What the model holds is drawn, except what a collapsed subgraph hides.
      const flow = layout.flow!;
      const drawn = new Set([...flow.nodes, ...flow.groups].map((v) => v.ast));
      const subgraphIds = new Set(parse.model.subgraphs.map((s) => s.id));
      for (const v of parse.model.vertices) {
        if (subgraphIds.has(v.id) || !flow.nodes.some((n) => n.id === v.id)) continue;
        expect(seen.get(v.ast), `${c.id}: vertex ${v.id}`).toBe(1);
      }
      for (const s of parse.model.subgraphs)
        if (drawn.has(s.ast)) expect(seen.get(s.ast), `${c.id}: subgraph ${s.id}`).toBe(1);
      for (const e of flow.edges) expect(seen.get(e.edge.ast), `${c.id}: edge ${e.id}`).toBe(1);
    }
  });
});

describe('flowchart render: security and ids', () => {
  it('renders the v12 XSS sources inert', async () => {
    let n = 0;
    for (const x of V12_XSS_CASES) {
      if (!x.source) continue;
      let result: RenderedForTest;
      try {
        result = await renderForTest(x.source);
      } catch (e) {
        if ((e as Error).message.startsWith('parse failed')) continue;
        throw e;
      }
      n++;
      expect(() => assertInert(result.svg), x.id).not.toThrow();
      expect(wellFormed(result.svg), x.id).toBeUndefined();
    }
    expect(n).toBeGreaterThan(5);
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'flowchart TD\n  accTitle: T\n  accDescr: D\n  A --> B';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await renderForTest(source, { idPrefix: 'mermaid-1' })).svg);
    const b = ids((await renderForTest(source, { idPrefix: 'mermaid-2' })).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
