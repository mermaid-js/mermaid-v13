import { join } from 'node:path';
import { SaxesParser } from 'saxes';
import { beforeAll, describe, expect, it } from 'vitest';
import { createMermaid, type ExtensionPlugin, type MermaidConfig } from 'mermaid';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert, type SvgNode, type SvgTree } from '@mermaid-js/core/svg';
import { V12_XSS_CASES } from '@mermaid-js/core/svg/testing';
import {
  detectState,
  parseState,
  type CompleteStateLayout,
  type StateModel,
} from '@mermaid-js/diagram-state';
import { REPO_ROOT, corpusFromDir } from '../index.ts';

/**
 * Render properties (DESIGN §13.2, §13.4) over both e2e state corpora (#146), through the
 * public `createMermaid().render()` with the deterministic table measurer: well-formed XML, the
 * allow-list, render-twice determinism, both writer backings byte-identical, no
 * NaN/Infinity/undefined, the viewBox holds every drawn coordinate, and every state, composite,
 * region, transition and note maps to exactly one `data-ast` element whose id resolves to an
 * AST range.
 */

interface RenderedForTest {
  svg: string;
  /** The tree the writer built: a `postRender` hook makes the pipeline write into one. */
  tree: SvgTree;
  parse: { ast: AstNode; model: StateModel };
  /** The plugin's layout as the `postLayout` hook saw it (it passes it on unchanged). */
  layout: CompleteStateLayout;
  theme: unknown;
}

interface Seen {
  ast?: AstNode;
  layout?: CompleteStateLayout;
  tree?: SvgTree;
  theme?: unknown;
}

/** Records what each render's hooks see, passing everything on unchanged. */
function recorder(into: Seen): ExtensionPlugin {
  return {
    id: 'record',
    postParse(ast, ctx) {
      // The host's parse comes first; an embedded diagram's (ADR-15) runs the hook after it.
      if (into.ast === undefined) {
        into.ast = ast;
        into.theme = ctx.config.theme;
      }
      return ast;
    },
    postLayout(l) {
      into.layout = l.layout as CompleteStateLayout;
      return l;
    },
    postRender(tree) {
      into.tree = tree;
    },
  };
}

const hooked: Seen = {};
const recorded = createMermaid();
recorded.initialize({ deterministic: true });
await recorded.registerExternalDiagrams([recorder(hooked)]);
// No hooks: the pipeline writes through the streaming writer. The recorder reads the AST, which
// draws an embedded flowchart's `data-ast`: here the integrator asks for it.
const streaming = createMermaid();
streaming.initialize({ deterministic: true, output: { dataAst: true } });

async function renderForTest(
  source: string,
  options: { idPrefix?: string; stream?: boolean } = {}
): Promise<RenderedForTest> {
  const id = options.idPrefix ?? 'mermaid-0';
  if (options.stream) {
    const { svg } = await streaming.render(id, source);
    return { svg } as RenderedForTest;
  }
  const parsed = parseState(source);
  const error = parsed.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`parse failed: ${error.message}`);
  hooked.ast = undefined;
  const { svg } = await recorded.render(id, source);
  return {
    svg,
    tree: hooked.tree!,
    parse: { ast: hooked.ast!, model: parsed.model },
    layout: hooked.layout!,
    theme: hooked.theme,
  };
}

interface Case {
  id: string;
  source: string;
  result: RenderedForTest;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

beforeAll(async () => {
  for (const dir of ['e2e/diagrams/state-diagram', 'e2e/diagrams/state-diagram-v2']) {
    for await (const item of corpusFromDir(join(REPO_ROOT, dir), dir)) {
      if (!detectState(item.source)) {
        skipped.push({ id: item.id, reason: 'not detected as a state diagram' });
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
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'circle') {
      put(at('cx') - at('r'), at('cy') - at('r'));
      put(at('cx') + at('r'), at('cy') + at('r'));
    } else if (tag === 'line') {
      put(at('x1'), at('y1'));
      put(at('x2'), at('y2'));
    } else if (tag === 'polygon') {
      const p = nums(tree.getAttr(node, 'points'));
      for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
    } else if (tag === 'path') {
      // Absolute commands only (PathBuilder writes no others); arcs keep their end points.
      const d = tree.getAttr(node, 'd') ?? '';
      for (const seg of d.match(/[MLCQAZ][^MLCQAZ]*/g) ?? []) {
        const p = nums(seg.slice(1));
        if (seg.startsWith('A')) put(p[5]!, p[6]!);
        else for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
      }
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
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

describe('state render properties over both e2e corpora', () => {
  it('renders the corpora', () => {
    expect(cases.length).toBeGreaterThan(140);
    // Inputs v13 rejects are the parser's business (#142 parity); list them so the count is seen.
    expect(skipped).toEqual([
      {
        id: 'e2e/diagrams/state-diagram-v2/nightly-check/v2-should-render-a-simple-info.mmd',
        reason: 'not detected as a state diagram',
      },
    ]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.result.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic, and both writer backings give the same bytes', async () => {
    for (const c of cases) {
      const again = await renderForTest(c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
      const streamed = await renderForTest(c.source, { stream: true });
      expect(streamed.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined', () => {
    for (const c of cases) expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    const outside: string[] = [];
    for (const c of cases) {
      const { tree } = c.result;
      const root = tree.find({ tag: 'svg' })[0]!;
      // The viewBox starts above the drawing when it holds a front-matter title (D652).
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - 0.5 || p.y < y! - 0.5 || p.x > x! + w! + 0.5 || p.y > y! + h! + 0.5
      );
      if (out.length > 0) outside.push(c.id);
    }
    expect(outside).toEqual([]);
  });

  it('maps every state, composite, region, transition and note to one data-ast element', () => {
    let regions = 0;
    for (const c of cases) {
      const { tree, parse, layout } = c.result;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      const model = parse.model;
      for (const s of model.states) expect(seen.get(s.ast), `${c.id}: state ${s.id}`).toBe(1);
      for (const t of model.transitions) expect(seen.get(t.ast), `${c.id}: ${t.id}`).toBe(1);
      const drawn = layout.state;
      for (const n of drawn.nodes) expect(seen.get(n.ast), `${c.id}: node ${n.id}`).toBe(1);
      for (const g of drawn.groups) {
        expect(seen.get(g.ast), `${c.id}: group ${g.id}`).toBe(1);
        if (g.region) regions++;
      }
      expect(drawn.nodes.filter((n) => n.note).length, c.id).toBe(
        model.notes.filter((n) => seen.has(n.ast)).length
      );
    }
    expect(regions).toBeGreaterThan(50);
  });

  it('draws one dashed divider per layout divider', () => {
    for (const c of cases) {
      const { tree, layout } = c.result;
      const lines = tree.find(
        (n, t) =>
          t.tag(n) === 'line' &&
          t.getAttr(n, 'class') === 'divider' &&
          t.getAttr(n, 'stroke-dasharray') !== undefined
      );
      expect(lines.length, c.id).toBe(layout.dividers.length);
    }
  });
});

describe('state render: transition colour under a lineColor override (D668)', () => {
  // v12 sets `transitionColor` once, before an author's overrides in `default` and `dark`, so
  // their transitions keep #333333 and #d3d3d3; `forest` and `base` recompute it from lineColor.
  const source = 'stateDiagram-v2\n  [*] --> A\n  A --> B : go';
  const draw = async (theme: MermaidConfig['theme'], themeVariables: Record<string, string>) => {
    const m = createMermaid();
    m.initialize({ deterministic: true, theme, themeVariables, output: { cssVariables: false } });
    const { svg } = await m.render('x', source);
    return {
      line: /<g class="edgePaths"[^>]* stroke="([^"]+)"/.exec(svg)?.[1],
      label: /<g class="edgeLabel"[^>]*><rect [^>]* stroke="([^"]+)"/.exec(svg)?.[1],
    };
  };

  it.each([
    ['default', '#333333'],
    ['dark', '#d3d3d3'],
    ['forest', '#ffd966'],
    ['base', '#ffd966'],
  ] as const)('%s draws its transitions and their label borders %s', async (theme, want) => {
    expect(await draw(theme, { lineColor: '#ffd966' })).toEqual({ line: want, label: want });
  });
});

describe('state render: security and ids', () => {
  // v12's XSS set has no state source; these put the same payloads where state takes text.
  const XSS = [
    'stateDiagram-v2\n  A : <img src=x onerror=alert(1)>\n  A --> B : <script>alert(1)</script>',
    'stateDiagram-v2\n  state "<svg onload=alert(1)>" as S\n  note right of S : </text><script>x</script>',
    'stateDiagram-v2\n  A --> B\n  click A href "javascript:alert(1)"\n  click B "data:text/html,<script>x</script>" "t"',
    'stateDiagram-v2\n  classDef x fill:url(javascript:alert(1)),stroke:expression(alert(1))\n  A:::x --> B\n  style B fill:red;behavior:url(x.htc)',
    'stateDiagram-v2\n  state "a&quot; onmouseover=&quot;alert(1)" as Q\n  [*] --> Q',
  ];

  it('renders script-like state sources inert', async () => {
    let n = 0;
    for (const x of [...V12_XSS_CASES.map((c) => c.source ?? ''), ...XSS]) {
      if (!x || !detectState(x)) continue;
      let result: RenderedForTest;
      try {
        result = await renderForTest(x);
      } catch (e) {
        if ((e as Error).message.startsWith('parse failed')) continue;
        throw e;
      }
      n++;
      expect(() => assertInert(result.svg), x).not.toThrow();
      expect(wellFormed(result.svg), x).toBeUndefined();
      expect(result.svg, x).not.toMatch(/<script|\son\w+="|href="(?:javascript|data):/i);
    }
    expect(n).toBe(XSS.length);
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'stateDiagram-v2\n  accTitle: T\n  accDescr: D\n  A --> B';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await renderForTest(source, { idPrefix: 'mermaid-1' })).svg);
    const b = ids((await renderForTest(source, { idPrefix: 'mermaid-2' })).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
