import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import type { FlowModel } from '@mermaid-js/diagram-flowchart';
import { createMermaid, MermaidError, type Prepared, type RenderResult } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { astIndex, drawnExtents, wellFormed } from './svg-props.ts';
import {
  inEmbedded,
  parseSvg,
  type SvgElement as SvgNode,
  type SvgView as SvgTree,
} from './svg-tree.ts';

/**
 * Render properties (DESIGN §13.2, §13.4) over the e2e flowchart fixtures, through the public
 * `render()` with `deterministic: true`: well-formed XML, the allow-list, render-twice
 * determinism, no NaN/Infinity/undefined, the viewBox holds every drawn coordinate, and every
 * vertex, edge and subgraph maps to exactly one `data-ast` element whose id resolves to an AST
 * range. (Stream/tree writer byte identity is the SvgWriter seam's, in core.)
 */

interface Case {
  id: string;
  source: string;
  result: RenderResult & { tree: SvgTree };
  prepared: Prepared;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

function api() {
  const m = createMermaid();
  // The round trip reads `data-ast`, which a flowchart draws only when asked (R-PARSE-8).
  m.initialize({ deterministic: true, output: { dataAst: true } });
  return m;
}

beforeAll(async () => {
  const m = api();
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/flowchart'), 'flowchart')) {
    try {
      const prepared = await m.prepare(item.source, { id: 'mermaid-0' });
      const result = m.renderSync(item.source, { id: 'mermaid-0' });
      cases.push({
        id: item.id,
        source: item.source,
        result: { ...result, tree: parseSvg(result.svg) },
        prepared,
      });
    } catch (e) {
      if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
      skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
    }
  }
}, 120_000);

// An embedded diagram's elements (ADR-15) carry its own AST ids.
const astElements = (tree: SvgTree): SvgNode[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined && !inEmbedded(n));

describe('flowchart render properties over the e2e corpus', () => {
  it('renders the corpus', () => {
    expect(cases.length).toBeGreaterThan(350);
    // Inputs v13 rejects are the parser's business (#8 parity); list them so the count is seen.
    expect(skipped.filter((s) => !s.reason.startsWith('UNSUPPORTED_DIAGRAM'))).toEqual([]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.prepared.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const m = api();
    for (const c of cases) {
      const again = await m.render('mermaid-0', c.source);
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
      // The viewBox starts above the drawing when it holds a front-matter title (D652).
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = drawnExtents(tree).filter(
        (p) => p.x < x! - 0.5 || p.y < y! - 0.5 || p.x > x! + w! + 0.5 || p.y > y! + h! + 0.5
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every vertex, edge and subgraph to exactly one data-ast element and back', () => {
    let full = 0;
    for (const c of cases) {
      const { tree } = c.result;
      const parse = c.prepared.parse;
      const model = parse.model as FlowModel;
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
      // A collapsed subgraph hides what is inside it; otherwise the whole model is drawn.
      if (model.subgraphs.some((s) => s.metadata?.view === 'collapsed')) continue;
      full++;
      const subgraphIds = new Set(model.subgraphs.map((s) => s.id));
      for (const v of model.vertices) {
        if (!subgraphIds.has(v.id)) expect(seen.get(v.ast), `${c.id}: vertex ${v.id}`).toBe(1);
      }
      for (const s of model.subgraphs) expect(seen.get(s.ast), `${c.id}: subgraph ${s.id}`).toBe(1);
      for (const e of model.edges) expect(seen.get(e.ast), `${c.id}: edge ${e.id}`).toBe(1);
    }
    expect(full).toBeGreaterThan(300);
  });
});

describe('flowchart render: security and ids', () => {
  it('renders the v12 XSS sources inert', async () => {
    let n = 0;
    for (const x of V12_XSS_CASES) {
      if (!x.source) continue;
      let result: RenderResult;
      try {
        result = await api().render('x', x.source);
      } catch (e) {
        if (e instanceof MermaidError && e.code === 'SYNTAX') continue;
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
    const a = ids((await api().render('mermaid-1', source)).svg);
    const b = ids((await api().render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
