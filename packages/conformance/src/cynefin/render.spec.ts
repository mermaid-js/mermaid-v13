import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { detectCynefin, type CynefinModel } from '@mermaid-js/diagram-cynefin';
import {
  MermaidError,
  UnsupportedFormatError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { pathPoints } from '../sequence/path-bounds.ts';
import { wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { cynefinGateCorpus } from './corpus.ts';
import { cynefinApi } from './render-api.ts';

/**
 * Render properties of the cynefin renderer (spec #423 T4, DESIGN §13.2, §13.4) over the
 * cynefin gate corpus (e2e fixtures, v12 spec strings, quirks and parser cases, each also with
 * CRLF and comment lines), through the public `prepare()` + `renderSync()` with
 * `deterministic: true`, in a classic, a redux and an `auto` theme: well-formed XML, the
 * allow-list, render-twice determinism, no NaN/Infinity/undefined, no `foreignObject` or
 * `<marker>`, every drawn coordinate inside the viewBox, ids only on the title and description,
 * and the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule for cynefin's AST: each `Domain` node the model draws (the last block of
 * its name) maps to one `data-ast` element, its quadrant `rect` or the ellipse; each of its
 * `Item` nodes to one item `g`; each model transition's `Transition` node to its line. The
 * listed exclusions map to none: a replaced block and its items (`CYNEFIN_DUPLICATE_DOMAIN`), a
 * self-loop (`CYNEFIN_SELF_LOOP`) and confusion items past the third (the `+N more` badge counts
 * them). The header, title and accessibility statements have no element of their own, as in the
 * other ported types.
 */
const THEMES = [
  'default',
  'redux-color',
  'auto',
] as const satisfies readonly MermaidConfig['theme'][];

interface Case {
  id: string;
  theme: (typeof THEMES)[number];
  source: string;
  result: RenderResult;
  tree: SvgView;
  prepared: Prepared;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];
let api: Mermaid;

beforeAll(async () => {
  api = await cynefinApi();
  const corpus = await cynefinGateCorpus();
  for (const theme of THEMES) {
    const themed = await cynefinApi({ theme });
    for (const item of corpus) {
      if (!detectCynefin(item.source)) continue;
      try {
        const prepared = await themed.prepare(item.source, { id: 'mermaid-0' });
        const result = themed.renderSync(item.source, { id: 'mermaid-0' });
        cases.push({
          id: `${theme} ${item.id}`,
          theme,
          source: item.source,
          result,
          tree: parseSvg(result.svg),
          prepared,
        });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 240_000);

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

/** `translate(x,y)` of a transform, as the renderer writes it. */
function translateOf(t: string | undefined): { dx: number; dy: number } {
  const m = t ? /translate\((-?[\d.]+),(-?[\d.]+)\)/.exec(t) : null;
  return { dx: m ? Number(m[1]) : 0, dy: m ? Number(m[2]) : 0 };
}

/** `d` with each quadratic `Q` raised to the cubic `pathPoints` bounds by its extrema. */
function cubicOnly(d: string): string {
  let at = { x: 0, y: 0 };
  return (d.match(/[MLCQAZ][^MLCQAZ]*/gi) ?? [])
    .map((seg) => {
      const n = (seg.slice(1).match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) ?? []).map(Number);
      const cmd = seg[0]!;
      if (cmd !== 'Q') {
        if (n.length >= 2) at = { x: n[n.length - 2]!, y: n[n.length - 1]! };
        return seg;
      }
      const [qx, qy, x, y] = n as [number, number, number, number];
      const c1 = { x: at.x + (2 / 3) * (qx - at.x), y: at.y + (2 / 3) * (qy - at.y) };
      const c2 = { x: x + (2 / 3) * (qx - x), y: y + (2 / 3) * (qy - y) };
      at = { x, y };
      return `C${c1.x},${c1.y} ${c2.x},${c2.y} ${x},${y}`;
    })
    .join('');
}

/** Every coordinate an element draws at, in root user units; curves count by their extrema. */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const walk = (node: SvgElement, x0: number, y0: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const { dx, dy } = translateOf(tree.getAttr(node, 'transform'));
    const put = (x: number, y: number): void =>
      void out.push({ x: x0 + dx + x, y: y0 + dy + y, tag: tag ?? '' });
    if (tag === 'rect') {
      put(at('x'), at('y'));
      put(at('x') + at('width'), at('y') + at('height'));
    } else if (tag === 'path') {
      for (const p of pathPoints(cubicOnly(tree.getAttr(node, 'd') ?? ''))) put(p.x, p.y);
    } else if ((tag === 'text' || tag === 'tspan') && tree.getAttr(node, 'x') !== undefined)
      put(at('x'), at('y'));
    for (const c of tree.children(node)) walk(c, x0 + dx, y0 + dy);
  };
  walk(tree.root, 0, 0);
  return out;
}

/** Every node of the AST, with its parent. */
function nodes(ast: AstNode): { node: AstNode; parent?: AstNode }[] {
  const out: { node: AstNode; parent?: AstNode }[] = [];
  const visit = (n: AstNode, parent?: AstNode): void => {
    out.push({ node: n, parent });
    for (const c of n.children ?? []) visit(c, n);
  };
  visit(ast);
  return out;
}

const classOf = (tree: SvgView, n: SvgElement): string[] =>
  (tree.getAttr(n, 'class') ?? '').split(' ');
const byClass = (tree: SvgView, name: string): SvgElement[] =>
  tree.find((n, t) => (t.getAttr(n, 'class') ?? '').split(' ').includes(name));
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const elements = (tree: SvgView, n: SvgElement): SvgElement[] =>
  tree.children(n).filter((c) => tree.tag(c) !== undefined);

describe('cynefin render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(300);
    // Inputs v13 rejects are the parser's business (#465 parity); none fail to render.
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
    const fresh = new Map<string, Mermaid>();
    for (const theme of THEMES) fresh.set(theme, await cynefinApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity or undefined, no foreignObject or marker, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no element ids but the title and description, each once', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      expect(new Set(ids).size, c.id).toBe(ids.length);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
      expect(c.tree.find({ tag: 'title' }).length, c.id).toBeLessThanOrEqual(1);
      expect(c.tree.find({ tag: 'desc' }).length, c.id).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every drawn coordinate inside the viewBox', () => {
    for (const c of cases) {
      const { tree } = c;
      const root = tree.find({ tag: 'svg' })[0]!;
      const [x, y, w, h] = tree.getAttr(root, 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('maps every drawn domain, item and transition to one data-ast element; the exclusions to none', () => {
    const excluded = { replaced: 0, selfLoop: 0, overflow: 0 };
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as CynefinModel;
      const all = nodes(parse.ast);
      const index = new Map(all.map((e) => [e.node.id, e.node]));
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(['Domain', 'Item', 'Transition'], `${c.id}: ${id}`).toContain(node!.type);
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
      }
      const drawn = new Set<string>();
      for (const d of model.domains) {
        drawn.add(d.ast);
        const shown = d.name === 'confusion' ? d.items.slice(0, 3) : d.items;
        for (const i of shown) drawn.add(i.ast);
      }
      for (const t of model.transitions) drawn.add(t.ast);
      for (const id of drawn) expect(seen.get(id), `${c.id}: ${id}`).toBe(1);

      const has = (code: string, node: AstNode): boolean =>
        parse.diagnostics.some(
          (d) =>
            d.code === code &&
            (d.message.includes(`line ${lineOf(c.source, node.range.start)}`) ||
              (d.range.start >= node.range.start && d.range.end <= node.range.end))
        );
      const confusion = model.domains.find((d) => d.name === 'confusion');
      for (const { node, parent } of all) {
        if (!['Domain', 'Item', 'Transition'].includes(node.type) || drawn.has(node.id)) continue;
        expect(seen.get(node.id), `${c.id}: ${node.id}`).toBeUndefined();
        const block = node.type === 'Item' ? parent! : node;
        if (node.type === 'Transition') {
          const t = node as AstNode & { from: string; to: string };
          expect(t.from, `${c.id}: ${node.id}`).toBe(t.to);
          expect(has('CYNEFIN_SELF_LOOP', node), `${c.id}: ${node.id}`).toBe(true);
          excluded.selfLoop++;
        } else if (block.id !== confusion?.ast && model.domains.every((d) => d.ast !== block.id)) {
          expect(has('CYNEFIN_DUPLICATE_DOMAIN', block), `${c.id}: ${node.id}`).toBe(true);
          if (node.type === 'Domain') excluded.replaced++;
        } else {
          // A confusion item past the third: the `+N more` badge stands for it.
          expect(block.id, `${c.id}: ${node.id}`).toBe(confusion?.ast);
          const more = textOf(tree, byClass(tree, 'cynefinItemOverflow')[0]!.parent!);
          expect(more, c.id).toBe(`+${confusion!.items.length - 3} more`);
          excluded.overflow++;
        }
      }
    }
    // The corpus has each exclusion.
    expect(excluded.replaced).toBeGreaterThan(0);
    expect(excluded.selfLoop).toBeGreaterThan(0);
    expect(excluded.overflow).toBeGreaterThan(0);
  });
});

/** The 1-based line of `offset`. */
function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r\n|\r|\n/).length;
}

const ALL = [
  'cynefin-beta',
  '  title Response',
  '  complex',
  '    "Probe"',
  '  confusion',
  '    "a"',
  '    "b"',
  '    "c"',
  '    "d"',
  '    "e"',
  '  clear',
  '    "Check"',
  '  complex --> clear : "Stabilise"',
  '  chaotic --> complex',
].join('\n');

describe('cynefin render: what is drawn', () => {
  it("keeps v12's groups and classes, in v12's order", async () => {
    const tree = parseSvg((await api.render('x', ALL)).svg);
    const svg = tree.find({ tag: 'svg' })[0]!;
    expect(classOf(tree, svg)).toEqual(['mermaid', 'mermaid-cynefin']);
    const root = elements(tree, svg).find((n) => tree.tag(n) === 'g');
    expect(tree.getAttr(root!, 'transform')).toBe('translate(40,40)');
    expect(elements(tree, root!).map((n) => `${tree.tag(n)}.${tree.getAttr(n, 'class')}`)).toEqual([
      'g.cynefin-backgrounds',
      'g.cynefin-boundaries',
      'path.cynefinConfusion',
      'g.cynefin-labels',
      'g.cynefin-subtitles',
      'g.cynefin-items',
      'g.cynefin-arrows',
      'text.cynefinTitle',
    ]);
    const [bg, bounds, , labels, subs, items, arrows] = elements(tree, root!);
    expect(elements(tree, bg!).map((n) => tree.getAttr(n, 'data-id'))).toEqual([
      'complex',
      'complicated',
      'chaotic',
      'clear',
    ]);
    expect(elements(tree, bg!).map((n) => tree.getAttr(n, 'class'))).toEqual(
      Array(4).fill('cynefinDomain')
    );
    expect(elements(tree, bounds!).map((n) => tree.getAttr(n, 'class'))).toEqual([
      'cynefinBoundary',
      'cynefinBoundary',
      'cynefinCliff',
    ]);
    expect(elements(tree, labels!).map((n) => textOf(tree, n))).toEqual([
      'Complex',
      'Complicated',
      'Chaotic',
      'Clear',
      'Confusion',
    ]);
    expect(elements(tree, subs!).map((n) => textOf(tree, n))).toEqual([
      'Probe → Sense → Respond',
      'Emergent Practices',
      'Sense → Analyse → Respond',
      'Good Practices',
      'Act → Sense → Respond',
      'Novel Practices',
      'Sense → Categorise → Respond',
      'Best Practices',
      'Disorder',
    ]);
    // Quadrants in drawing order, then confusion's three and its overflow badge.
    const badges = elements(tree, items!);
    expect(badges.map((g) => textOf(tree, g))).toEqual([
      'Probe',
      'Check',
      'a',
      'b',
      'c',
      '+2 more',
    ]);
    for (const g of badges.slice(0, 5)) {
      expect(tree.tag(g)).toBe('g');
      expect(tree.getAttr(g, 'class')).toBeUndefined();
      expect(elements(tree, g).map((n) => `${tree.tag(n)}.${tree.getAttr(n, 'class')}`)).toEqual([
        'rect.cynefinItem',
        'text.cynefinItemText',
      ]);
    }
    expect(classOf(tree, elements(tree, badges[5]!)[0]!)).toEqual(['cynefinItemOverflow']);
    expect(
      elements(tree, arrows!).map((n) => `${tree.tag(n)}.${tree.getAttr(n, 'class')}`)
    ).toEqual([
      'path.cynefinArrowLine',
      'path.cynefinArrowHead',
      'text.cynefinArrowLabel',
      'path.cynefinArrowLine',
      'path.cynefinArrowHead',
    ]);
  });

  it('puts data-ast on the drawn block, items and lines, data-id only on the rest (pitfall 12)', async () => {
    const tree = parseSvg((await api.render('x', ALL)).svg);
    const ast = (cls: string) => byClass(tree, cls).map((n) => tree.getAttr(n, 'data-ast'));
    // Undeclared quadrants have no AST node.
    expect(ast('cynefinDomain')).toEqual(['d:complex', undefined, undefined, 'd:clear']);
    expect(ast('cynefinConfusion')).toEqual(['d:confusion']);
    expect(ast('cynefinArrowLine')).toEqual(['t:complex>clear', 't:chaotic>complex']);
    const items = elements(tree, byClass(tree, 'cynefin-items')[0]!);
    expect(items.map((g) => tree.getAttr(g, 'data-ast'))).toEqual([
      'i:complex/Probe',
      'i:clear/Check',
      'i:confusion/a',
      'i:confusion/b',
      'i:confusion/c',
      undefined,
    ]);
    expect(items.map((g) => tree.getAttr(g, 'data-id'))).toEqual([
      'Probe',
      'Check',
      'a',
      'b',
      'c',
      'confusion',
    ]);
    for (const cls of [
      'cynefinDomainLabel',
      'cynefinSubtitle',
      'cynefinItemText',
      'cynefinArrowHead',
      'cynefinArrowLabel',
      'cynefinTitle',
    ])
      expect(
        ast(cls).filter((x) => x !== undefined),
        cls
      ).toEqual([]);
    expect(byClass(tree, 'cynefinArrowHead').map((n) => tree.getAttr(n, 'data-id'))).toEqual([
      'complex-clear',
      'chaotic-complex',
    ]);
    expect(byClass(tree, 'cynefinDomainLabel').map((n) => tree.getAttr(n, 'data-id'))).toEqual([
      'complex',
      'complicated',
      'chaotic',
      'clear',
      'confusion',
    ]);
  });

  it('draws the replaced block of a domain not at all, and a self-loop not at all', async () => {
    const src = 'cynefin-beta\ncomplex\n  "old"\ncomplex\n  "new"\nclear --> clear';
    const { svg, warnings } = await api.render('x', src);
    const tree = parseSvg(svg);
    expect(byClass(tree, 'cynefinItemText').map((n) => textOf(tree, n))).toEqual(['new']);
    expect(byClass(tree, 'cynefinDomain').map((n) => tree.getAttr(n, 'data-ast'))[0]).toBe(
      'd:complex@2'
    );
    expect(byClass(tree, 'cynefin-arrows')).toEqual([]);
    expect(warnings.map((w) => w.code).sort()).toEqual([
      'CYNEFIN_DUPLICATE_DOMAIN',
      'CYNEFIN_SELF_LOOP',
    ]);
  });

  it('draws every paint as an attribute, with v12 constants (D152)', async () => {
    const tree = parseSvg((await api.render('x', ALL)).svg);
    const attrs = (n: SvgElement, ...names: string[]) => names.map((a) => tree.getAttr(n, a));
    const [quad] = byClass(tree, 'cynefinDomain');
    expect(attrs(quad!, 'fill', 'fill-opacity', 'stroke')).toEqual(['var(--_cnx)', '0.4', 'none']);
    const [fold, horizon] = byClass(tree, 'cynefinBoundary');
    for (const b of [fold!, horizon!])
      expect(attrs(b, 'fill', 'stroke', 'stroke-width', 'stroke-dasharray')).toEqual([
        'none',
        'var(--_cnb)',
        '2',
        '6 3',
      ]);
    const [cliff] = byClass(tree, 'cynefinCliff');
    expect(attrs(cliff!, 'fill', 'stroke', 'stroke-width')).toEqual(['none', 'var(--_cnl)', '4']);
    const [ellipse] = byClass(tree, 'cynefinConfusion');
    expect(
      attrs(ellipse!, 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray')
    ).toEqual(['var(--_cnf)', '0.5', 'var(--_cnb)', '1.5', '4 2']);
    const [item] = byClass(tree, 'cynefinItem');
    expect(
      attrs(item!, 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'rx', 'ry', 'height')
    ).toEqual(['var(--_cnx)', '0.95', 'var(--_cnb)', '1', '4', '4', '26']);
    const [more] = byClass(tree, 'cynefinItemOverflow');
    expect(attrs(more!, 'fill', 'fill-opacity', 'stroke-dasharray')).toEqual([
      'var(--_cnf)',
      '0.6',
      '3 2',
    ]);
    const [line] = byClass(tree, 'cynefinArrowLine');
    expect(attrs(line!, 'fill', 'stroke', 'stroke-width')).toEqual(['none', 'var(--_cna)', '2']);
    const [head] = byClass(tree, 'cynefinArrowHead');
    expect(attrs(head!, 'fill', 'stroke')).toEqual(['var(--_cna)', 'none']);
    const [label] = byClass(tree, 'cynefinDomainLabel');
    expect(attrs(label!, 'fill', 'font-size', 'font-weight')).toEqual([
      'var(--_cnn)',
      '16',
      'bold',
    ]);
    const [sub] = byClass(tree, 'cynefinSubtitle');
    expect(attrs(sub!, 'fill', 'font-size', 'font-style')).toEqual(['var(--_cnt)', '11', 'italic']);
    const [text] = byClass(tree, 'cynefinItemText');
    expect(attrs(text!, 'fill', 'font-size', 'font-weight')).toEqual([
      'var(--_cnt)',
      '12',
      undefined,
    ]);
    const [arrowLabel] = byClass(tree, 'cynefinArrowLabel');
    expect(attrs(arrowLabel!, 'fill', 'font-size')).toEqual(['var(--_cnt)', '11']);
    const [title] = byClass(tree, 'cynefinTitle');
    expect(attrs(title!, 'fill', 'font-size', 'font-weight')).toEqual([
      'var(--_cnn)',
      '18',
      'bold',
    ]);
  });

  it("resolves the theme table: v12 default's colours, derived from lineColor and the text colours", async () => {
    const root = /<svg[^>]*style="([^"]*)"/.exec((await api.render('x', ALL)).svg)![1]!;
    expect(root).toContain('--_cnx:var(--mermaid-cynefinComplexBg,#E8F5E9)');
    expect(root).toContain('--_cnl:var(--mermaid-cynefinCliffColor,#8B0000)');
    expect(root).toContain('--_cnb:var(--mermaid-cynefinBoundaryColor,var(--_l))');
    expect(root).toContain('--_cna:var(--mermaid-cynefinArrowColor,var(--_l))');
    expect(root).toContain('--_cnt:var(--mermaid-cynefinTextColor,var(--_tx))');
    expect(root).toContain('--_cnn:var(--mermaid-cynefinLabelColor,var(--_pt))');
  });

  it("takes v12 dark's literals in every dark theme, the light ones in the others (R-THEME-11)", async () => {
    const style = async (theme: MermaidConfig['theme']) =>
      /<svg[^>]*style="([^"]*)"/.exec(
        (await (await cynefinApi({ theme })).render('x', ALL)).svg
      )![1]!;
    for (const theme of ['dark', 'redux-dark', 'neo-dark'] as const) {
      const s = await style(theme);
      expect(s, theme).toContain('--_cnx:var(--mermaid-cynefinComplexBg,#1B5E20)');
      expect(s, theme).toContain('--_cnl:var(--mermaid-cynefinCliffColor,#FF6B6B)');
    }
    for (const theme of ['neutral', 'base', 'redux', 'neo'] as const) {
      const s = await style(theme);
      expect(s, theme).toContain('--_cnx:var(--mermaid-cynefinComplexBg,#E8F5E9)');
      expect(s, theme).toContain('--_cnb:var(--mermaid-cynefinBoundaryColor,var(--_l))');
    }
    // The author's darkMode is not a dark theme: v12 kept default's literals under it.
    const dm = await cynefinApi({ themeVariables: { darkMode: true } });
    expect((await dm.render('x', ALL)).svg).toContain(
      '--_cnx:var(--mermaid-cynefinComplexBg,#E8F5E9)'
    );
  });

  it('honours themeVariables.cynefin.* and the flat names, the flat name winning (D335, D540)', async () => {
    const m = await cynefinApi({
      themeVariables: {
        cynefinClearBg: '#010203',
        cynefin: { complexBg: '#abcdef', clearBg: '#ffffff', boundaryWidth: 0, itemFontSize: 20 },
      },
    });
    const { svg } = await m.render('x', ALL);
    expect(svg).toContain('var(--mermaid-cynefinComplexBg,#abcdef)');
    expect(svg).toContain('var(--mermaid-cynefinClearBg,#010203)');
    const tree = parseSvg(svg);
    // An author 0 stays 0, as v12 reapplied the override after its `||` defaults.
    expect(tree.getAttr(byClass(tree, 'cynefinBoundary')[0]!, 'stroke-width')).toBe('0');
    expect(tree.getAttr(byClass(tree, 'cynefinItemText')[0]!, 'font-size')).toBe('20');
    expect(tree.getAttr(byClass(tree, 'cynefinSubtitle')[0]!, 'font-size')).toBe('19');
  });

  it('draws no subtitles group without descriptions, and no arrows group without transitions', async () => {
    const src = '%%{init: {"cynefin": {"showDomainDescriptions": false}}}%%\ncynefin-beta\ncomplex';
    const tree = parseSvg((await api.render('x', src)).svg);
    expect(byClass(tree, 'cynefin-subtitles')).toEqual([]);
    expect(byClass(tree, 'cynefin-arrows')).toEqual([]);
    expect(byClass(tree, 'cynefin-items')).toHaveLength(1);
    expect(byClass(tree, 'cynefinTitle')).toEqual([]);
  });

  it('draws each arrowhead as a closed triangle whose tip is past the line end (no marker)', async () => {
    const tree = parseSvg((await api.render('x', 'cynefin-beta\ncomplex --> complicated')).svg);
    const line = tree.getAttr(byClass(tree, 'cynefinArrowLine')[0]!, 'd')!;
    const head = tree.getAttr(byClass(tree, 'cynefinArrowHead')[0]!, 'd')!;
    expect(line).toMatch(/^M[\d.,\s-]+Q/);
    expect(head).toMatch(/^M[^LZ]+L[^LZ]+L[^LZ]+Z$/);
    // v12's marker: 6 × arrowWidth (12 px) long, refX 9 of 10, so the tip is 1.2 px past the end.
    const end = line
      .match(/-?[\d.]+/g)!
      .map(Number)
      .slice(-2);
    const tip = head
      .match(/-?[\d.]+/g)!
      .map(Number)
      .slice(2, 4);
    expect(Math.hypot(tip[0]! - end[0]!, tip[1]! - end[1]!)).toBeCloseTo(1.2, 1);
  });

  it('breaks lines at <br> in items, transition labels and the title (D363)', async () => {
    const src =
      'cynefin-beta\ntitle A<br>B\ncomplex\n  "one<br>two"\ncomplex --> clear : "x<br/>y"';
    const tree = parseSvg((await api.render('x', src)).svg);
    for (const cls of ['cynefinTitle', 'cynefinItemText', 'cynefinArrowLabel'])
      expect(
        tree.children(byClass(tree, cls)[0]!).filter((n) => tree.tag(n) === 'tspan'),
        cls
      ).toHaveLength(2);
    // The badge grows with its label's lines.
    expect(Number(tree.getAttr(byClass(tree, 'cynefinItem')[0]!, 'height'))).toBeGreaterThan(26);
  });

  it('sizes the root as v12 with and without useMaxWidth', async () => {
    const wide = parseSvg((await api.render('x', 'cynefin-beta\ncomplex')).svg);
    const root = wide.find({ tag: 'svg' })[0]!;
    expect(wide.getAttr(root, 'viewBox')).toBe('0 0 880 680');
    expect(wide.getAttr(root, 'width')).toBe('100%');
    expect(wide.getAttr(root, 'style')).toMatch(/max-width:880px/);
    const src = '%%{init: {"cynefin": {"useMaxWidth": false}}}%%\ncynefin-beta\ncomplex';
    const fixed = parseSvg((await api.render('x', src)).svg);
    const r = fixed.find({ tag: 'svg' })[0]!;
    expect([fixed.getAttr(r, 'width'), fixed.getAttr(r, 'height')]).toEqual(['880', '680']);
  });

  it("seeds the waves with the render's idPrefix, or with seed (D362)", async () => {
    const fold = async (id: string, src: string) =>
      parseSvg((await api.render(id, src)).svg).getAttr(
        byClass(parseSvg((await api.render(id, src)).svg), 'cynefinBoundary')[0]!,
        'd'
      );
    const src = 'cynefin-beta\ncomplex';
    expect(await fold('a', src)).toBe(await fold('a', src));
    expect(await fold('a', src)).not.toBe(await fold('b', src));
    const seeded = `%%{init: {"cynefin": {"seed": 42}}}%%\n${src}`;
    expect(await fold('a', seeded)).toBe(await fold('b', seeded));
  });
});

describe('cynefin render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const titled = parseSvg((await api.render('m', 'cynefin-beta\ntitle Visible\ncomplex')).svg);
    const root = titled.find({ tag: 'svg' })[0]!;
    expect(titled.getAttr(root, 'aria-labelledby')).toBeUndefined();
    expect(titled.getAttr(root, 'aria-roledescription')).toBe('cynefin');
    expect(titled.getAttr(root, 'role')).toBe('img');
    const src = 'cynefin-beta\naccTitle: Sense-making\naccDescr {\n  Five domains\n}\ncomplex';
    const named = parseSvg((await api.render('m', src)).svg);
    const r = named.find({ tag: 'svg' })[0]!;
    expect(named.getAttr(r, 'aria-labelledby')).toBe('m-title');
    expect(named.getAttr(r, 'aria-describedby')).toBe('m-desc');
    expect(named.find({ tag: 'title' }).map((n) => textOf(named, n))).toEqual(['Sense-making']);
    expect(named.find({ tag: 'desc' }).map((n) => textOf(named, n))).toEqual(['Five domains']);
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'cynefin-beta\n  accTitle: T\n  accDescr: D\n  complex';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile labels and titles inert', async () => {
    const hostile = [
      'cynefin-beta\ntitle </text><script>alert(1)</script>\ncomplex',
      'cynefin-beta\ncomplex\n  "<img src=x onerror=alert(1)>"\n  "<svg onload=alert(1)>"',
      'cynefin-beta\naccTitle: <script>x</script>\naccDescr: ]]><x\nclear\n  "&<>\'"',
      'cynefin-beta\ncomplex --> clear : "<a href=\\"javascript:alert(1)\\">x</a>"',
      'cynefin-beta\nconfusion\n  "\\u0000\\0\\b"',
    ];
    for (const source of hostile) {
      const { svg } = await api.render('x', source);
      expect(() => assertInert(svg), source).not.toThrow();
      expect(wellFormed(svg), source).toBeUndefined();
      expect(svg, source).not.toMatch(/<script|<img|<svg [^>]*onload|="[^"]*(javascript:|url\()/);
    }
  });

  it('draws SVG only: ascii throws UnsupportedFormatError (D320)', async () => {
    await expect(
      api.render('x', 'cynefin-beta\ncomplex', { format: 'ascii' })
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
