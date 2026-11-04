import { SaxesParser } from 'saxes';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import type { SequenceModel } from '@mermaid-js/diagram-sequence';
import { MermaidError, type Mermaid, type Prepared, type RenderResult } from 'mermaid';
import { parseSvg, type SvgElement as SvgNode, type SvgView as SvgTree } from '../svg-tree.ts';
import { sequenceCorpus } from './corpus.ts';
import { asTest, sequenceApi } from './render-api.ts';

/**
 * Render properties of the sequence renderer (spec #125 T4, DESIGN §13.2, §13.4) over the
 * sequence corpus (e2e fixtures and v12 spec strings), through the public `render()` with
 * `deterministic: true`: well-formed XML, the allow-list, render-twice determinism, no
 * NaN/Infinity/undefined, every drawn coordinate inside the viewBox, no `foreignObject` and no
 * `<marker>`, and every participant, message, note, fragment, rect and box mapped to exactly
 * one `data-ast` element whose id resolves to an AST range (R-PARSE-8).
 */

interface Case {
  id: string;
  source: string;
  result: RenderResult & { tree: SvgTree };
  prepared: Prepared;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];
let api: Mermaid;

beforeAll(async () => {
  api = await sequenceApi();
  for (const item of await sequenceCorpus()) {
    const source = asTest(item.source);
    if (source === item.source) continue;
    try {
      const prepared = await api.prepare(source, { id: 'mermaid-0' });
      const result = api.renderSync(source, { id: 'mermaid-0' });
      cases.push({
        id: item.id,
        source,
        result: { ...result, tree: parseSvg(result.svg) },
        prepared,
      });
    } catch (e) {
      if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
      skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
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
    } else if (tag === 'polygon' || tag === 'polyline') {
      const p = nums(tree.getAttr(node, 'points'));
      for (let i = 0; i + 1 < p.length; i += 2) put(p[i]!, p[i + 1]!);
    } else if (tag === 'path') {
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

describe('sequence render properties over the corpus', () => {
  it('renders the corpus', () => {
    expect(cases.length).toBeGreaterThan(300);
    // Inputs v13 rejects are the parser's business (#139 parity); none fail to render.
    expect(skipped.filter((s) => !s.reason.startsWith('SYNTAX'))).toEqual([]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.prepared.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic: a fresh API object renders the same bytes (R-ARCH-6)', async () => {
    const m = await sequenceApi();
    for (const c of cases) {
      const again = await m.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, no foreignObject and no marker', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
    }
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - 0.5 || p.y < y! - 0.5 || p.x > x! + w! + 0.5 || p.y > y! + h! + 0.5
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every participant, message, note, frame, rect and box to one data-ast element', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const parse = c.prepared.parse;
      const model = parse.model as SequenceModel;
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
      const hidden = c.prepared.config.sequence?.hideUnusedParticipants === true;
      if (!hidden)
        for (const p of model.participants)
          expect(seen.get(p.ast), `${c.id}: participant ${p.id}`).toBe(1);
      const walk = (statements: SequenceModel['statements']): void => {
        for (const s of statements) {
          const known = (ids: readonly string[]) =>
            ids.every((id) => model.participants.some((p) => p.id === id));
          if (s.kind === 'message' && known([s.from, s.to]))
            expect(seen.get(s.ast), `${c.id}: message ${s.ast}`).toBe(1);
          if (s.kind === 'note' && known(s.participants))
            expect(seen.get(s.ast), `${c.id}: note ${s.ast}`).toBe(1);
          if (s.kind === 'fragment') {
            expect(seen.get(s.ast), `${c.id}: fragment ${s.ast}`).toBe(1);
            for (const section of s.sections) walk(section.statements);
          }
          if (s.kind === 'rect') {
            expect(seen.get(s.ast), `${c.id}: rect ${s.ast}`).toBe(1);
            walk(s.statements);
          }
        }
      };
      walk(model.statements);
    }
  });
});

describe('sequence render: security and ids', () => {
  it('renders hostile labels, colours and titles inert', async () => {
    const hostile = [
      'sequenceDiagram\nA->>B: <script>alert(1)</script>\nNote over A: <img src=x onerror=alert(1)>',
      'sequenceDiagram\nparticipant A as <svg onload=alert(1)>\nA->>B: x',
      'sequenceDiagram\nrect url(javascript:alert(1))\nA->>B: x\nend',
      'sequenceDiagram\nrect rgb(0,0,0);fill:url(#x)\nA->>B: x\nend',
      'sequenceDiagram\nbox red;stroke:url(#x) Group\nparticipant A\nend\nA->>B: x',
      'sequenceDiagram\ntitle </text><script>alert(1)</script>\nloop <b onclick=alert(1)>x</b>\nA->>B: x\nend',
      'sequenceDiagram\naccTitle: <script>x</script>\naccDescr: ]]><x\nA->>B: "&<>\'',
    ];
    let rendered = 0;
    for (const source of hostile) {
      let result: RenderResult;
      try {
        result = await api.render('x', asTest(source));
      } catch (e) {
        if (e instanceof MermaidError && e.code === 'SYNTAX') continue;
        throw e;
      }
      rendered++;
      expect(() => assertInert(result.svg), source).not.toThrow();
      expect(wellFormed(result.svg), source).toBeUndefined();
      // Hostile text stays text: no element, and no attribute value, carries it.
      expect(result.svg, source).not.toMatch(
        /<script|<img|<svg [^>]*onload|="[^"]*(javascript:|url\()/
      );
    }
    expect(rendered).toBeGreaterThan(4);
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = asTest('sequenceDiagram\n  accTitle: T\n  accDescr: D\n  A->>B: hi');
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });
});
