import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { PAYLOADS } from '@mermaid-js/core/svg/testing';
import type { ErModel } from '@mermaid-js/diagram-er';
import { createMermaid, MermaidError, type Prepared, type RenderResult } from 'mermaid';
import { REPO_ROOT, corpusFromDir } from './index.ts';
import { astIndex, extents, wellFormed } from './svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from './svg-tree.ts';

/**
 * ER render properties (DESIGN §13.2, §13.4, #133) over the e2e ER fixtures, through the public
 * `render()` with `deterministic: true`: well-formed XML, the allow-list, render-twice
 * determinism, no NaN/Infinity/undefined, the viewBox holds every drawn coordinate, and every
 * entity, attribute row, relationship and subgraph maps to exactly one `data-ast` element
 * whose id resolves to an AST range. Each fixture renders in a redux and a classic theme.
 */

/** A fresh API object with `deterministic: true` (table measurer); ER comes from the registry. */
function erMermaid(): ReturnType<typeof createMermaid> {
  const m = createMermaid();
  m.initialize({ deterministic: true });
  return m;
}

interface Case {
  id: string;
  source: string;
  result: RenderResult & { tree: SvgView };
  prepared: Prepared;
}

const THEMES = ['redux-color', 'default'] as const;
const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

const render = async (source: string, theme?: (typeof THEMES)[number] | 'redux') => {
  const m = erMermaid();
  const result = await m.render('mermaid-0', source, theme ? { config: { theme } } : {});
  return { ...result, tree: parseSvg(result.svg) };
};

beforeAll(async () => {
  const m = erMermaid();
  for await (const item of corpusFromDir(join(REPO_ROOT, 'e2e/diagrams/er-diagram'), 'er')) {
    for (const theme of THEMES) {
      const id = `${item.id} [${theme}]`;
      try {
        const opts = { id: 'mermaid-0', config: { theme } };
        const prepared = await m.prepare(item.source, opts);
        const result = m.renderSync(item.source, opts);
        cases.push({
          id,
          source: item.source,
          result: { ...result, tree: parseSvg(result.svg) },
          prepared,
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${id}: ${String(e)}`, { cause: e });
        skipped.push({ id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 120_000);

/** The character data inside an element (its text and tspans). */
function textIn(tree: SvgView, n: SvgElement): string {
  const own = tree.textOf(n);
  if (own !== undefined) return own;
  return tree
    .children(n)
    .map((c) => textIn(tree, c))
    .join('');
}

const astElements = (tree: SvgView): SvgElement[] =>
  tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined);

describe('ER render properties over the e2e corpus', () => {
  it('renders the corpus', () => {
    expect(cases.length).toBeGreaterThan(2 * 190);
    // Inputs v13 rejects are the parser's business (#131 parity); only syntax errors may skip.
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
    const m = erMermaid();
    for (const c of cases) {
      const theme = c.id.endsWith('[default]') ? 'default' : 'redux-color';
      const again = await m.render('mermaid-0', c.source, { config: { theme } });
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

  it('maps every entity, attribute, relationship and subgraph to one data-ast element and back', () => {
    for (const c of cases) {
      const { tree } = c.result;
      const parse = c.prepared.parse;
      const model = parse.model as ErModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of astElements(tree)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.range.end, `${c.id}: ${id}`).toBeGreaterThanOrEqual(node!.range.start);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id} has no data-id`).toBeDefined();
      }
      for (const [id, n] of seen) expect(n, `${c.id}: ${id} appears ${n} times`).toBe(1);
      for (const e of model.entities) {
        expect(seen.get(e.id), `${c.id}: entity ${e.name}`).toBe(1);
        for (const a of e.attributes) expect(seen.get(a.id), `${c.id}: attribute ${a.id}`).toBe(1);
      }
      for (const s of model.subgraphs) expect(seen.get(s.id), `${c.id}: subgraph ${s.id}`).toBe(1);
      for (const r of model.relationships) {
        // A relationship whose end names nothing drawable (v12 draws no edge) has no element.
        const drawable = [r.from.name, r.to.name].every(
          (n) =>
            model.entities.some((e) => e.name === n) || model.subgraphs.some((s) => s.name === n)
        );
        if (drawable) expect(seen.get(r.id), `${c.id}: relationship ${r.id}`).toBe(1);
      }
    }
  });
});

describe('ER render: tables, ends and lines', () => {
  it('draws an entity as a name over attribute rows, odd then even (v12 erBox)', async () => {
    const { tree } = await render(
      'erDiagram\n  CUSTOMER {\n    string name PK "the name"\n    int age\n    List~int~ ids\n  }'
    );
    const entity = tree.find({ 'data-id': 'CUSTOMER' })[0]!;
    expect(tree.getAttr(entity, 'data-ast')).toBe('n:CUSTOMER');
    const rows = tree.find((n, t) => (t.getAttr(n, 'data-ast') ?? '').startsWith('a:'));
    expect(rows.map((r) => [tree.getAttr(r, 'data-ast'), tree.getAttr(r, 'class')])).toEqual([
      ['a:CUSTOMER.name', 'row-rect-odd'],
      ['a:CUSTOMER.age', 'row-rect-even'],
      ['a:CUSTOMER.ids', 'row-rect-odd'],
    ]);
    const texts = (cls: string) => tree.find({ class: cls }).map((t) => textIn(tree, t));
    expect(texts('name')).toEqual(['CUSTOMER']);
    expect(texts('attribute-type')).toEqual(['string', 'int', 'List<int>']);
    expect(texts('attribute-keys')).toEqual(['PK']);
    expect(texts('attribute-comment')).toEqual(['the name']);
    expect(tree.find({ class: 'divider' })).toHaveLength(1);
  });

  it('draws each cardinality at its own end, as inline paths', async () => {
    const { tree, svg } = await render(
      'erDiagram\n  A |o--|{ B : x\n  C ||..o{ D : y\n  E }o--|| F : z'
    );
    expect(svg).not.toMatch(/<marker|<defs|marker-end/);
    const ends = (ast: string) => {
      const edge = tree.find((n, t) => t.getAttr(n, 'data-ast') === ast)[0]!;
      return tree
        .children(edge)
        .filter((c) => tree.tag(c) === 'g')
        .map((g) => tree.getAttr(g, 'class'));
    };
    expect(ends('e:A>B')).toEqual(['marker zeroOrOne', 'marker oneOrMore']);
    expect(ends('e:C>D')).toEqual(['marker onlyOne', 'marker zeroOrMore']);
    expect(ends('e:E>F')).toEqual(['marker zeroOrMore', 'marker onlyOne']);
  });

  it('dashes non-identifying lines only', async () => {
    const { tree } = await render('erDiagram\n  A ||--|| B : x\n  C ||..|| D : y');
    const line = (ast: string) => {
      const edge = tree.find((n, t) => t.getAttr(n, 'data-ast') === ast)[0]!;
      return [
        tree.getAttr(edge, 'class'),
        tree.getAttr(tree.children(edge)[0]!, 'stroke-dasharray'),
      ];
    };
    expect(line('e:A>B')).toEqual([
      'edge relationshipLine edge-thickness-normal edge-pattern-solid',
      undefined,
    ]);
    expect(line('e:C>D')).toEqual([
      'edge relationshipLine edge-thickness-normal edge-pattern-dashed',
      '8,8',
    ]);
  });

  it('puts the relationship label on the line, with data-id only', async () => {
    const { tree } = await render('erDiagram\n  A ||--o{ B : "places order"');
    const label = tree.find({ class: 'edgeLabel' })[0]!;
    expect(tree.getAttr(label, 'data-id')).toBe('id_A_B_0');
    expect(tree.getAttr(label, 'data-ast')).toBeUndefined();
    const text = tree.children(label).find((c) => tree.tag(c) === 'text')!;
    expect(textIn(tree, text)).toBe('places order');
  });

  it("ids a relationship by its entities' names, not v12's entity ids (MIGRATION)", async () => {
    const { tree } = await render('erDiagram\n  CUSTOMER ||--o{ ORDER : places');
    const edge = tree.find({ class: 'relationshipLine' })[0]!;
    expect(tree.getAttr(edge, 'data-id')).toBe('id_CUSTOMER_ORDER_0');
    // MIGRATION.md gives both forms: v12's `getEdgeId` over entity ids, v13's over names.
    const migration = readFileSync(join(REPO_ROOT, 'v13/docs/MIGRATION.md'), 'utf8');
    const row = migration
      .slice(migration.indexOf('## ER SVG structure'))
      .split('\n')
      .find((l) => l.startsWith('| Edge `<path'))!;
    expect(row).toContain('`id_entity-CUSTOMER-0_entity-ORDER-1_0`');
    expect(row).toContain('`id_CUSTOMER_ORDER_0`');
  });

  it('draws subgraphs as clusters with their title', async () => {
    const { tree } = await render('erDiagram\n  subgraph G [Orders]\n    A ||--o{ B : x\n  end');
    const g = tree.find({ class: 'cluster' })[0]!;
    expect(tree.getAttr(g, 'data-ast')).toBe('s:G');
    expect(tree.find({ class: 'cluster-label' }).map((t) => textIn(tree, t))).toEqual(['Orders']);
  });

  it('applies style and classDef to the table, over the palette; a fill fills every row (D117)', async () => {
    const { tree } = await render(
      'erDiagram\n  A {\n    int x\n    int y\n  }\n  classDef hot fill:#ff0000,color:#ffffff\n  class A hot\n  style A stroke:#00ff00',
      'default'
    );
    const a = tree.find({ 'data-id': 'A' })[0]!;
    expect(tree.getAttr(a, 'class')).toBe('node default hot');
    const outer = tree.find({ class: 'outer-path' })[0]!;
    expect(tree.getAttr(outer, 'fill')).toBe('#ff0000');
    expect(tree.getAttr(outer, 'stroke')).toBe('#00ff00');
    for (const cls of ['row-rect-odd', 'row-rect-even']) {
      const row = tree.children(tree.find({ class: cls })[0]!)[0]!;
      expect(tree.getAttr(row, 'fill'), cls).toBe('#ff0000');
    }
    expect(tree.getAttr(tree.find({ class: 'divider' })[0]!, 'stroke')).toBe('#00ff00');
    expect(tree.getAttr(tree.find({ class: 'name' })[0]!, 'fill')).toBe('#ffffff');
  });

  it('strokes outline and rules with the theme strokeWidth: 1 classic, 2 redux (D117)', async () => {
    const src = 'erDiagram\n  A {\n    int x\n  }';
    const width = async (theme: 'default' | 'redux') => {
      const m = createMermaid();
      m.initialize({ deterministic: true, output: { cssVariables: false } });
      const tree = parseSvg((await m.render('mermaid-0', src, { config: { theme } })).svg);
      return ['outer-path', 'divider'].map((cls) =>
        tree.getAttr(tree.find({ class: cls })[0]!, 'stroke-width')
      );
    };
    expect(await width('default')).toEqual(['1', '1']);
    expect(await width('redux')).toEqual(['2', '2']);
  });

  it('colours entities by palette slot only when the theme has a border palette (D152)', async () => {
    const src = 'erDiagram\n  A ||--|| B : x';
    const slots = (tree: SvgView) =>
      tree.find({ class: 'node' }).map((n) => tree.getAttr(n, 'data-color-id'));
    expect(slots((await render(src, 'redux-color')).tree)).toEqual(['color-0', 'color-1']);
    expect(slots((await render(src, 'redux')).tree)).toEqual([undefined, undefined]);
    expect(slots((await render(src, 'default')).tree)).toEqual([undefined, undefined]);
  });

  it('writes only the title and description ids', async () => {
    const source = 'erDiagram\n  accTitle: T\n  accDescr: D\n  A ||--o{ B : x';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const m = erMermaid();
    expect(ids((await m.render('mermaid-1', source)).svg)).toEqual([
      'mermaid-1-title',
      'mermaid-1-desc',
    ]);
  });

  it('renders hostile names, labels and comments inert', async () => {
    for (const p of PAYLOADS) {
      const q = p.replace(/"/g, '');
      const source = `erDiagram\n  A["${q}"] {\n    string x "${q}"\n  }\n  A ||--o{ B : "${q}"`;
      let svg: string;
      try {
        svg = (await erMermaid().render('x', source)).svg;
      } catch (e) {
        if (e instanceof MermaidError && e.code === 'SYNTAX') continue;
        throw e;
      }
      expect(() => assertInert(svg), p).not.toThrow();
      expect(wellFormed(svg), p).toBeUndefined();
    }
  });
});
