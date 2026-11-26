// cspell:words preorder
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import {
  detectTreeView,
  resolveIcon,
  treeView,
  type TreeViewIconOptions,
  type TreeViewModel,
} from '@mermaid-js/diagram-treeview';
import {
  MermaidError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { treeViewGateCorpus } from './corpus.ts';
import { treeViewApi } from './render-api.ts';

/**
 * Render properties of the treeView renderer (spec #518 T4, DESIGN §13.2, §13.4) over the
 * treeView gate corpus (e2e fixtures, v12 spec strings, the hand-written and recovery cases, the
 * line separators, each also with CRLF and comment lines), through the public `render()` and
 * `renderSync()` with `deterministic: true`: in a classic, a redux and an `auto` theme, and with
 * `showIcons` (every row draws an icon): well-formed XML, the allow-list, determinism across
 * fresh API objects, no NaN/Infinity/undefined, no `foreignObject` or `clipPath`, a `<style>`
 * only for `auto`, no empty `<g>`, ids only on the title and description, every drawn
 * coordinate inside the viewBox, and the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule for treeView's AST (D487): every `Node` maps to exactly one `data-ast`
 * element, its row's `g`; its highlight box, icon, label, description and connectors carry its
 * `data-id` only. The header, the title (not drawn, D484) and the accessibility statements have
 * no element; nor has v12's root row `/` (D482), which is not an AST node.
 */
const VARIANTS: readonly { name: string; config: MermaidConfig }[] = [
  { name: 'default', config: { theme: 'default' } },
  { name: 'redux-color', config: { theme: 'redux-color' } },
  { name: 'auto', config: { theme: 'auto' } },
  { name: 'icons', config: { theme: 'dark', treeView: { showIcons: true } } },
];

/** The glyphs treeView draws itself (D485); `mermaid-treeview:react` is not one. */
const BUILTIN = new Set(['mermaid-treeview:file', 'mermaid-treeview:folder']);

/** The AST node types that are drawn. */
const DRAWN = new Set(['Node']);

interface Case {
  id: string;
  variant: string;
  source: string;
  result: RenderResult;
  tree: SvgView;
  prepared: Prepared;
}

const cases: Case[] = [];
const skipped: { id: string; reason: string }[] = [];

beforeAll(async () => {
  const corpus = await treeViewGateCorpus();
  for (const { name, config } of VARIANTS) {
    const api = await treeViewApi(config);
    for (const item of corpus) {
      if (!detectTreeView(item.source)) continue;
      try {
        const prepared = await api.prepare(item.source, { id: 'mermaid-0' });
        const result = api.renderSync(item.source, { id: 'mermaid-0' });
        const c = { id: `${name} ${item.id}`, variant: name, source: item.source, result };
        cases.push({ ...c, tree: parseSvg(result.svg), prepared });
      } catch (e) {
        if (!(e instanceof MermaidError)) throw new Error(`${item.id}: ${String(e)}`, { cause: e });
        skipped.push({ id: item.id, reason: `${e.code}: ${e.message.split('\n')[0]}` });
      }
    }
  }
}, 600_000);

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

/**
 * Every point a row and a connector draw at, in root user units: a rect's corners with half its
 * stroke, a line's ends with half its width across it, a text's point, an icon path's points
 * inside its group's `translate()`.
 */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  // A point (x, y) inside `node` is drawn at (dx + k·x, dy + k·y), its transforms applied.
  const walk = (node: SvgElement, dx0: number, dy0: number, k0: number): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    let [dx, dy, k] = [dx0, dy0, k0];
    for (const [, op, args] of (tree.getAttr(node, 'transform') ?? '').matchAll(
      /(translate|scale)\(([^)]*)\)/g
    )) {
      const [a = 0, b = 0] = args!.split(/[\s,]+/).map(Number);
      if (op === 'translate') [dx, dy] = [dx + k * a, dy + k * b];
      else k *= a;
    }
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const put = (x: number, y: number): void =>
      void out.push({ x: dx + k * x, y: dy + k * y, tag: tag! });
    if (tag === 'rect') {
      const half = tree.getAttr(node, 'stroke') === undefined ? 0 : at('stroke-width') / 2;
      put(at('x') - half, at('y') - half);
      put(at('x') + at('width') + half, at('y') + at('height') + half);
    } else if (tag === 'line') {
      const half = at('stroke-width') / 2;
      const across = at('y1') === at('y2') ? [0, half] : [half, 0];
      for (const [x, y] of [
        [at('x1'), at('y1')],
        [at('x2'), at('y2')],
      ]) {
        put(x! - across[0]!, y! - across[1]!);
        put(x! + across[0]!, y! + across[1]!);
      }
    } else if (tag === 'text') put(at('x'), at('y'));
    else if (tag === 'path') {
      const d = tree.getAttr(node, 'd') ?? '';
      for (const seg of d.match(/[MLAZ][^MLAZ]*/g) ?? []) {
        const p = (seg.slice(1).match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        if (seg.startsWith('A')) put(p[5]!, p[6]!);
        else if (p.length >= 2) put(p[0]!, p[1]!);
      }
    }
    for (const c of tree.children(node)) walk(c, dx, dy, k);
  };
  walk(tree.root, 0, 0, 1);
  return out;
}

describe('treeView render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const { name } of VARIANTS)
      expect(cases.filter((c) => c.variant === name).length, name).toBeGreaterThan(800);
    // Inputs v13 rejects are the parser's business (#572 parity); none fail to render.
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
    for (const { name, config } of VARIANTS) fresh.set(name, await treeViewApi(config));
    for (const c of cases) {
      const again = await fresh.get(c.variant)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 300_000);

  it('writes no NaN, Infinity, undefined, foreignObject or clipPath, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|clipPath|clip-path=|overflow|<marker|<svg[^>]*><svg/
      );
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no empty <g>, no drawn title, and no element ids but the title and description', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/<g\b[^>]*\/>|<g\b[^>]*><\/g>/);
      expect(c.result.svg, c.id).not.toMatch(/<text[^>]*class="[^"]*[Tt]itle/);
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox (D224)', () => {
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

  it('draws a row per node and the root row, an icon on each under showIcons', () => {
    for (const c of cases) {
      const model = c.prepared.parse.model as TreeViewModel;
      const labels = (c.result.svg.match(/class="treeView-node-label/g) ?? []).length;
      expect(labels, c.id).toBe(model.nodes.length + 1);
      if (c.variant !== 'icons') continue;
      // Every row with an icon draws one: its built-in glyph, or with no icons extension v12's
      // `?` square for any other (D702).
      const options = { showIcons: true, defaultIconPack: '', ...c.prepared.config.treeView };
      const names = [{ name: '/', directory: true }, ...model.nodes].map((n) =>
        resolveIcon(n, options as TreeViewIconOptions)
      );
      const withIcon = names.filter((n) => n !== undefined);
      const icons = (c.result.svg.match(/class="treeView-node-icon"/g) ?? []).length;
      expect(icons, c.id).toBe(withIcon.length);
      const unknown = (c.result.svg.match(/>\?<\/text>/g) ?? []).length;
      expect(unknown, c.id).toBe(withIcon.filter((n) => !BUILTIN.has(n)).length);
      expect(withIcon.filter((n) => BUILTIN.has(n)).length, c.id).toBeGreaterThan(0);
    }
  });

  it('maps every node to one data-ast element and back (R-PARSE-8)', () => {
    let nodes = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as TreeViewModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(DRAWN.has(node!.type), `${c.id}: ${id} is a ${node!.type}`).toBe(true);
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        expect(tree.tag(el), `${c.id}: ${id}`).toBe('g');
        // Its parts carry its data-id, and no data-ast.
        const parts = tree.find((n, t) => n !== el && within(t, n, el));
        for (const p of parts) {
          expect(tree.getAttr(p, 'data-ast'), `${c.id}: ${id}`).toBeUndefined();
          if (tree.getAttr(p, 'data-id') !== undefined)
            expect(tree.getAttr(p, 'data-id'), `${c.id}: ${id}`).toBe(id);
        }
      }
      for (const n of model.nodes) {
        nodes++;
        expect(seen.get(n.astId), `${c.id}: ${n.astId}`).toBe(1);
      }
      expect(seen.size, c.id).toBe(model.nodes.length);
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-id') !== undefined))
        expect(index.get(tree.getAttr(el, 'data-id')!)?.type, c.id).toBe('Node');
      // The root row `/` comes first, and is no AST node.
      const view = tree.find((n, t) => t.getAttr(n, 'class') === 'tree-view')[0]!;
      const first = tree.children(view)[0]!;
      expect(tree.getAttr(first, 'data-ast'), c.id).toBeUndefined();
      expect(tree.getAttr(first, 'data-id'), c.id).toBeUndefined();
    }
    expect(nodes).toBeGreaterThan(8000);
  });
});

/** Whether `node` is inside `outer`. */
function within(tree: SvgView, node: SvgElement, outer: SvgElement): boolean {
  const stack = [...tree.children(outer)];
  while (stack.length > 0) {
    const n = stack.pop()!;
    if (n === node) return true;
    stack.push(...tree.children(n));
  }
  return false;
}

describe('treeView render: formats', () => {
  // The text output is the `./ascii` entry (#578, `ascii.spec.ts`), which the manifest loads
  // (`ascii: ./dist/ascii.js`, #577); the plugin alone lists it but has no hook.
  it('draws ascii through the registry, and the plugin passed alone lists it', async () => {
    const api = await treeViewApi();
    expect(api.supportsFormat('treeView', 'ascii')).toBe(true);
    await api.prepare('treeView-beta\na', { format: 'ascii' });
    expect(api.renderSync('treeView-beta\na', { format: 'ascii' }).text).toBe('a');
    expect(treeView.formats).toEqual(['svg', 'ascii']);
  });
});
