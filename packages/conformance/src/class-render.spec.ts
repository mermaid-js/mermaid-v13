import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaxesParser } from 'saxes';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { assertInert } from '@mermaid-js/core/svg';
import type { ClassModel } from '@mermaid-js/diagram-class';
import { createMermaid, MermaidError, type Prepared, type RenderResult } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { parseSvg, type SvgElement as SvgNode, type SvgView as SvgTree } from './svg-tree.ts';
import type { CorpusItem } from './types.ts';

/**
 * Render properties (DESIGN §13.2, §13.4, spec #126 T4) over the e2e class fixtures and the
 * harvested v12 spec strings, through the public `render()` with `deterministic: true`:
 * well-formed XML, the allow-list, render-twice determinism, no NaN/Infinity/undefined, the
 * viewBox holds every drawn coordinate, and every class, member, relationship, namespace, note
 * and interface maps to exactly one `data-ast` element whose id resolves to an AST range.
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
  m.initialize({ deterministic: true });
  return m;
}

async function* corpus(): AsyncGenerator<CorpusItem> {
  yield* corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/class-diagram'), 'class');
  const file = join(REPO_ROOT, 'packages/conformance/corpus/class-v12-specs.json');
  yield* JSON.parse(readFileSync(file, 'utf8')) as CorpusItem[];
}

beforeAll(async () => {
  const m = api();
  for await (const item of corpus()) {
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
}, 240_000);

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
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
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

describe('class render properties over the corpus', () => {
  it('renders the corpus', () => {
    expect(cases.length).toBeGreaterThan(590);
    // Inputs v13 rejects are the parser's business (#154 parity).
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
      const out = extents(tree).filter(
        (p) => p.x < x! - 0.5 || p.y < y! - 0.5 || p.x > x! + w! + 0.5 || p.y > y! + h! + 0.5
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('writes no ids but the title, the description (R-A11Y-1) and the neo gradient (D182)', () => {
    for (const c of cases) {
      const ids = c.result.tree
        .find((n, t) => t.getAttr(n, 'id') !== undefined)
        .map((n) => c.result.tree.getAttr(n, 'id'));
      const allowed = ['mermaid-0-title', 'mermaid-0-desc', 'mermaid-0-gradient'];
      for (const id of ids) expect(allowed, c.id).toContain(id);
    }
  });

  it('maps every class, member, relationship, namespace, note and interface to one data-ast element', () => {
    let full = 0;
    for (const c of cases) {
      const { tree } = c.result;
      const parse = c.prepared.parse;
      const model = parse.model as ClassModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id} has no data-id`).toBeDefined();
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      const ends = new Set([
        ...model.classes.map((k) => k.id),
        ...model.interfaces.map((i) => i.id),
      ]);
      for (const k of model.classes) {
        expect(seen.get(k.ast), `${c.id}: class ${k.id}`).toBe(1);
        for (const m of [...k.attributes, ...k.methods])
          expect(seen.get(m.ast), `${c.id}: member ${m.ast}`).toBe(1);
      }
      for (const r of model.relations) {
        const drawn = (end: (typeof r)['start']) => end.type === 'lollipop' || ends.has(end.id);
        if (drawn(r.start) && drawn(r.end))
          expect(seen.get(r.ast), `${c.id}: relation ${r.ast}`).toBe(1);
      }
      for (const n of model.notes) expect(seen.get(n.ast), `${c.id}: ${n.id}`).toBe(1);
      for (const i of model.interfaces) expect(seen.get(i.ast), `${c.id}: ${i.id}`).toBe(1);
      const flat = c.prepared.config.class?.hierarchicalNamespaces === false;
      for (const s of model.namespaces) {
        if (s.ast !== undefined && !flat) expect(seen.get(s.ast), `${c.id}: ${s.id}`).toBe(1);
      }
      full++;
    }
    expect(full).toBe(cases.length);
  });
});
