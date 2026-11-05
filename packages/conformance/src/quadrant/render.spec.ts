import { SaxesParser } from 'saxes';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExtensionPlugin, Mermaid } from 'mermaid';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import {
  detectQuadrant,
  parseQuadrant,
  type QuadrantLayout,
  type QuadrantModel,
} from '@mermaid-js/diagram-quadrant';
import { REPO_ROOT, corpusFromDir } from '../index.ts';
import { quadrantApi } from './render-api.ts';

/**
 * Render properties (DESIGN §13.2, §13.4) over the e2e quadrant corpus (#312), through the
 * public `createMermaid().render()` with the deterministic table measurer, in the four theme
 * families (D215, D227): well-formed XML, the allow-list, render-twice determinism, both writer
 * backings byte-identical, no NaN/Infinity/undefined, the viewBox holds every drawn coordinate,
 * and every drawn quadrant label, point, axis label and title maps to exactly one `data-ast`
 * element whose id resolves to an AST range (the AST round-trip).
 */

interface Rendered {
  svg: string;
  tree: SvgTree;
  ast: AstNode;
  model: QuadrantModel;
  layout: QuadrantLayout;
}

interface Seen {
  ast?: AstNode;
  layout?: QuadrantLayout;
  tree?: SvgTree;
}

/** Records what each render's hooks see, passing everything on unchanged. */
function recorder(into: Seen): ExtensionPlugin {
  return {
    id: 'record',
    postParse(ast) {
      into.ast = ast;
      return ast;
    },
    postLayout(l) {
      into.layout = l.layout as QuadrantLayout;
      return l;
    },
    postRender(tree) {
      into.tree = tree;
    },
  };
}

const FAMILIES = ['default', 'redux-color', 'neo', 'neo-dark'] as const;
const hooked: Seen = {};
let recorded: Mermaid;
// No hooks: the pipeline writes through the streaming writer.
let streaming: Mermaid;

async function renderForTest(source: string, idPrefix = 'mermaid-0'): Promise<Rendered> {
  const parsed = parseQuadrant(source);
  const error = parsed.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`parse failed: ${error.message}`);
  const { svg } = await recorded.render(idPrefix, source);
  return {
    svg,
    tree: hooked.tree!,
    ast: hooked.ast!,
    model: parsed.model,
    layout: hooked.layout!,
  };
}

const withTheme = (source: string, theme: string): string =>
  `---\nconfig:\n  theme: ${theme}\n---\n${source.replace(/^---\n[\s\S]*?\n---\n/, '')}`;

interface Case {
  id: string;
  source: string;
  result: Rendered;
}

const cases: Case[] = [];
const families: Case[] = [];

beforeAll(async () => {
  recorded = await quadrantApi();
  await recorded.registerExternalDiagrams([recorder(hooked)]);
  streaming = await quadrantApi();
  const dir = 'e2e/diagrams/quadrant-chart';
  for await (const item of corpusFromDir(`${REPO_ROOT}/${dir}`, dir)) {
    cases.push({ id: item.id, source: item.source, result: await renderForTest(item.source) });
    for (const theme of FAMILIES) {
      const source = withTheme(item.source, theme);
      families.push({ id: `${item.id} (${theme})`, source, result: await renderForTest(source) });
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

const NUM = String.raw`(-?[\d.]+(?:e[-+]?\d+)?)`;
const PLACEMENT = new RegExp(String.raw`^translate\(${NUM},${NUM}\)(?: rotate\(${NUM}\))?$`);

/** Every coordinate an element draws at, in root user units; a text at its anchor. */
function extents(tree: SvgTree): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const walk = (node: SvgNode, dx: number, dy: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: Parameters<SvgTree['getAttr']>[1]): number =>
      Number(tree.getAttr(node, name) ?? 0);
    const t = tree.getAttr(node, 'transform');
    if (t) {
      const m = PLACEMENT.exec(t);
      expect(m, t).not.toBeNull();
      dx += Number(m![1]);
      dy += Number(m![2]);
    }
    const put = (x: number, y: number): void => void out.push({ x: x + dx, y: y + dy });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') {
      put(at('cx') - at('r'), at('cy') - at('r'));
      put(at('cx') + at('r'), at('cy') + at('r'));
    } else if (tag === 'line') {
      put(at('x1'), at('y1'));
      put(at('x2'), at('y2'));
    } else if (tag === 'text') put(0, 0);
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

describe('quadrant render properties over the e2e corpus', () => {
  it('renders the corpus in four families', () => {
    // v12's 14 e2e fixtures and the 12 baselines (#317).
    expect(cases).toHaveLength(14 + 12);
    expect(families).toHaveLength((14 + 12) * FAMILIES.length);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of [...cases, ...families]) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      expect(() => assertInert(c.result.svg), c.id).not.toThrow();
    }
  });

  it('is deterministic, and both writer backings give the same bytes', async () => {
    for (const c of [...cases, ...families]) {
      const again = await renderForTest(c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
      const streamed = await streaming.render('mermaid-0', c.source);
      expect(streamed.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined', () => {
    for (const c of [...cases, ...families])
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    const outside: string[] = [];
    for (const c of [...cases, ...families]) {
      const { tree } = c.result;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - 0.5 || p.y < y! - 0.5 || p.x > x! + w! + 0.5 || p.y > y! + h! + 0.5
      );
      if (out.length > 0) outside.push(c.id);
    }
    expect(outside).toEqual([]);
  });

  it('maps every drawn quadrant, point, axis label and title to one data-ast element', () => {
    let points = 0;
    for (const c of cases) {
      const { tree, ast, layout } = c.result;
      const { source } = c;
      const index = astIndex(ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(source.length);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      for (const q of layout.quadrants)
        if (q.ast) expect(seen.get(q.ast), `${c.id}: ${q.ast}`).toBe(1);
      for (const p of layout.points) expect(seen.get(p.ast), `${c.id}: ${p.ast}`).toBe(1);
      for (const l of layout.axisLabels) expect(seen.get(l.ast), `${c.id}: ${l.ast}`).toBe(1);
      if (layout.title?.ast) expect(seen.get(layout.title.ast), c.id).toBe(1);
      points += layout.points.length;
      // The model's points all fit the corpus: none is left out (D226).
      expect(layout.points.length, c.id).toBe(c.result.model.points.length);
    }
    expect(points).toBeGreaterThan(40);
  });

  it('draws one data-point group per laid-out point, and data-id is the point name', () => {
    for (const c of cases) {
      const { tree, model } = c.result;
      const groups = tree.find((n, t) => t.getAttr(n, 'class') === 'data-point');
      const names = groups.map((g) => tree.getAttr(g, 'data-id'));
      expect(names, c.id).toEqual(model.points.map((p) => p.label.text).reverse());
    }
  });
});

describe('quadrant render: security and ids', () => {
  const XSS = [
    'quadrantChart\n  title <img src=x onerror=alert(1)>\n  quadrant-1 "<script>alert(1)</script>"',
    'quadrantChart\n  "</text><script>x</script>": [0.5, 0.5]\n  x-axis "<svg onload=alert(1)>" --> b',
    'quadrantChart\n  "a&quot; onmouseover=&quot;alert(1)": [0.1, 0.2]\n  y-axis "<a href=javascript:alert(1)>y</a>"',
    'quadrantChart\n  accTitle: </title><script>x</script>\n  accDescr: <img src=x onerror=alert(1)>',
  ];

  it('renders script-like quadrant sources inert', async () => {
    let n = 0;
    for (const x of [...V12_XSS_CASES.map((c) => c.source ?? ''), ...XSS]) {
      if (!x || !detectQuadrant(x)) continue;
      let result: Rendered;
      try {
        result = await renderForTest(x);
      } catch (e) {
        if ((e as Error).message.startsWith('parse failed')) continue;
        throw e;
      }
      n++;
      expect(() => assertInert(result.svg), x).not.toThrow();
      expect(wellFormed(result.svg), x).toBeUndefined();
      expect(result.svg, x).not.toMatch(/<script|<img|\son\w+="|href="(?:javascript|data):/i);
    }
    expect(n).toBe(XSS.length);
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'quadrantChart\n  accTitle: T\n  accDescr: D\n  A: [0.5, 0.5]';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await renderForTest(source, 'mermaid-1')).svg);
    const b = ids((await renderForTest(source, 'mermaid-2')).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
