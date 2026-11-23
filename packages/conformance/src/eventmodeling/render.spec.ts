import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { parseColor } from '@mermaid-js/core/theme';
import {
  detectEventModeling,
  eventModelStructure,
  type EventModel,
} from '@mermaid-js/diagram-eventmodeling';
import {
  MermaidError,
  UnsupportedFormatError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import type { AstNode } from '@mermaid-js/core/parser-kit';
import { REPO_ROOT } from '../corpus.ts';
import { astIndex, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { eventModelingGateCorpus } from './corpus.ts';
import { deterministicApi } from '../render-api.ts';

/**
 * Render properties of the event modeling renderer (spec #527 T4, DESIGN §13.2, §13.4) over the
 * gate corpus (e2e fixtures, v12 spec strings, the hand-written and recovery cases, each also
 * with CRLF and comment lines), through the public `render()`/`renderSync()` with
 * `deterministic: true`, in a classic, a dark neo and an `auto` theme: well-formed XML, the
 * allow-list, render-twice determinism, no NaN/Infinity/undefined, no `foreignObject`,
 * `<marker>`, `clipPath` or transform, no empty `<g>`, every drawn coordinate inside the viewBox,
 * ids only on the title and description, and the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule (D528), both ways: every `data-ast` is an AST node, a frame's on its
 * `g.em-box` and a placed `->>`'s on its `path.em-relation`; and every AST node is drawn exactly
 * once except the not-drawn set `notDrawnIds` computes from the model and the structure. An
 * inferred relation's path and the lanes carry `data-id` only (`relation:<s>-><t>`,
 * `lane:<index>`); rects, texts and heads carry their group's or path's `data-id`.
 */
const THEMES = ['default', 'neo-dark', 'auto'] as const satisfies readonly MermaidConfig['theme'][];

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
  api = deterministicApi();
  const corpus = await eventModelingGateCorpus();
  for (const theme of THEMES) {
    const themed = deterministicApi({ theme });
    for (const item of corpus) {
      if (!detectEventModeling(item.source)) continue;
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

/** Every corner a rect draws at (strokes by half their width), path and polygon points, texts. */
function extents(tree: SvgView): { x: number; y: number; tag: string }[] {
  const out: { x: number; y: number; tag: string }[] = [];
  const walk = (node: SvgElement): void => {
    const tag = tree.tag(node);
    if (tag === undefined && node !== tree.root) return;
    const at = (name: string): number => Number(tree.getAttr(node, name) ?? 0);
    const put = (x: number, y: number): void => void out.push({ x, y, tag: tag ?? '' });
    const pairs = (data: string): void => {
      // A line hop's arc (D537) has no point but its end: drop its radii, rotation and flags.
      const s = data.replace(/A[^A-Za-z]*?([-\d.]+,[-\d.]+)(?=[A-Za-z]|$)/g, 'L$1');
      const n = s.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? [];
      for (let i = 0; i + 1 < n.length; i += 2) put(n[i]!, n[i + 1]!);
    };
    if (tag === 'rect') {
      // An unset stroke width is 1.
      const half = tree.getAttr(node, 'stroke') === undefined ? 0 : 0.5;
      put(at('x') - half, at('y') - half);
      put(at('x') + at('width') + half, at('y') + at('height') + half);
    } else if (tag === 'text' || tag === 'tspan') {
      if (tree.getAttr(node, 'x') !== undefined) put(at('x'), at('y'));
    } else if (tag === 'path') pairs(tree.getAttr(node, 'd') ?? '');
    else if (tag === 'polygon') pairs(tree.getAttr(node, 'points') ?? '');
    for (const c of tree.children(node)) walk(c);
  };
  walk(tree.root);
  return out;
}

/**
 * The AST nodes nothing is drawn for (D526, D528), from the model and the structure, not by id
 * pattern: the document and its header; notes, `gwt`s, entities and data blocks (modelled, not
 * drawn, as v12); the `title`, `accTitle` and `accDescr` statements (D218: the title is not
 * drawn; the accessible ones are the root's `<title>`/`<desc>`, with no `data-ast`); and every
 * `->>` source node `eventModelStructure` makes no relation of: a repeated source (the second
 * `->> 01` of a frame, its id suffixed 2) and a forward or undefined one (v12 drew neither). A frame's source nodes are
 * checked against its model sources, so no node is excused that the model does not hold.
 */
function notDrawnIds(
  ast: AstNode,
  model: EventModel,
  structure: ReturnType<typeof eventModelStructure>
): Set<string> {
  const out = new Set<string>([
    ...model.notes.map((n) => n.astId),
    ...model.gwts.map((g) => g.astId),
    ...model.entities.map((e) => e.astId),
    ...model.dataBlocks.map((d) => d.astId),
  ]);
  const placed = new Set(structure.relations.flatMap((r) => (r.astId ? [r.astId] : [])));
  const frames = new Map(model.frames.map((f) => [f.astId, f]));
  for (const node of ast.children ?? []) {
    if (STATEMENTS_NOT_DRAWN.has(node.type)) out.add(node.id);
    const frame = frames.get(node.id);
    if (node.type !== 'Frame' || !frame) continue;
    const sources = (node.children ?? []).filter((k) => k.type === 'Source');
    expect(sources.length, node.id).toBe(frame.sources.length);
    for (const k of sources) if (!placed.has(k.id)) out.add(k.id);
  }
  out.add(ast.id);
  return out;
}

/** Statement kinds with no element: the header and the title and accessibility statements. */
const STATEMENTS_NOT_DRAWN = new Set(['Header', 'Title', 'AccTitle', 'AccDescr']);

describe('event modeling render properties over the corpus', () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(400);
    // Inputs v13 rejects are the parser's business (#602 parity); none fail to render.
    expect(skipped.filter((s) => !s.reason.startsWith('SYNTAX'))).toEqual([]);
  });

  it('writes well-formed XML that passes the allow-list', () => {
    for (const c of cases) {
      expect(wellFormed(c.result.svg), c.id).toBeUndefined();
      const auto = String(c.prepared.config.theme) === 'auto';
      expect(() => assertInert(c.result.svg, { themeStyle: auto }), c.id).not.toThrow();
    }
  });

  it('is deterministic: a fresh API object renders the same bytes, async and sync (R-ARCH-6)', async () => {
    const fresh = new Map<string, Mermaid>();
    for (const theme of THEMES) fresh.set(theme, deterministicApi({ theme }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  }, 120_000);

  it('writes no NaN, Infinity, undefined, foreignObject, marker, clipPath or transform, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(
        /NaN|Infinity|undefined|foreignObject|clipPath|clip-path|transform=|<marker|marker-end|<defs/
      );
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no empty <g> and no element ids but the title and description', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/<g\b[^>]*\/>|<g\b[^>]*><\/g>/);
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

  it('maps every frame and explicit relation to one data-ast element and back (R-PARSE-8, D528)', () => {
    let frames = 0;
    let explicit = 0;
    let inferred = 0;
    let dropped = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as EventModel;
      const structure = eventModelStructure(model);
      const index = astIndex(parse.ast);
      const seen = new Map<string, SvgElement[]>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, [...(seen.get(id) ?? []), el]);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(tree.getAttr(el, 'data-id'), `${c.id}: ${id}`).toBe(id);
        const want = node!.type === 'Frame' ? 'g em-box' : 'path em-relation';
        expect(`${tree.tag(el)} ${tree.getAttr(el, 'class')}`, `${c.id}: ${id}`).toBe(want);
      }
      // AST → elements: every node is drawn exactly once, unless it is in the not-drawn set.
      const drawn = new Set([
        ...model.frames.map((f) => f.astId),
        ...structure.relations.flatMap((r) => (r.astId === undefined ? [] : [r.astId])),
      ]);
      const notDrawn = notDrawnIds(parse.ast, model, structure);
      for (const id of index.keys()) {
        if (drawn.has(id)) expect(seen.get(id)?.length, `${c.id}: ${id}`).toBe(1);
        else {
          expect(notDrawn.has(id), `${c.id}: ${id} is neither drawn nor listed`).toBe(true);
          expect(seen.has(id), `${c.id}: ${id} is not drawn`).toBe(false);
          if (index.get(id)!.type === 'Source') dropped++;
        }
      }
      frames += model.frames.length;
      const paths = tree.find((n, t) => t.getAttr(n, 'class') === 'em-relation');
      expect(paths.length, c.id).toBe(structure.relations.length);
      for (const [i, r] of structure.relations.entries()) {
        const path = paths[i]!;
        expect(tree.getAttr(path, 'data-id'), c.id).toBe(r.id);
        if (r.astId === undefined) {
          inferred++;
          expect(tree.getAttr(path, 'data-ast'), `${c.id}: ${r.id}`).toBeUndefined();
        } else {
          explicit++;
          expect(tree.getAttr(path, 'data-ast'), `${c.id}: ${r.id}`).toBe(r.astId);
        }
      }
      // Every data-id is an AST id, a lane's or an inferred relation's.
      const others = new Set([
        ...structure.lanes.map((l) => `lane:${l.index}`),
        ...structure.relations.map((r) => r.id),
      ]);
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-id') !== undefined)) {
        const id = tree.getAttr(el, 'data-id')!;
        expect(index.has(id) || others.has(id), `${c.id}: ${id}`).toBe(true);
      }
    }
    expect(frames).toBeGreaterThan(1000);
    expect(explicit).toBeGreaterThan(100);
    expect(inferred).toBeGreaterThan(100);
    // Repeated and unplaced `->>` sources: AST nodes v12 draws nothing for.
    expect(dropped).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------- what is drawn

const fixture = (name: string): string =>
  readFileSync(join(REPO_ROOT, 'e2e/diagrams/eventmodeling', name), 'utf8');
const attr = (tree: SvgView, n: SvgElement | undefined, name: string): string | undefined =>
  n && tree.getAttr(n, name as never);
const classOf = (tree: SvgView, n: SvgElement): string => attr(tree, n, 'class') ?? '';
const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
/** A text's weight: on the text, or on its one span (core's label layout). */
const weightOf = (tree: SvgView, n: SvgElement): string | undefined =>
  attr(tree, n, 'font-weight') ?? attr(tree, tree.children(n)[0], 'font-weight');
const render = async (src: string, m: Mermaid = api) => {
  const result = await m.render('x', src);
  return { ...result, tree: parseSvg(result.svg) };
};
/** Paints as literal colours (`output.cssVariables: false`), in `theme`. */
const literal = (theme: MermaidConfig['theme'], themeVariables?: object) =>
  deterministicApi({
    theme,
    output: { cssVariables: false },
    ...(themeVariables ? { themeVariables } : {}),
  } as MermaidConfig);
const hex = (v: string | undefined): string | undefined => {
  const c = v === undefined ? undefined : parseColor(v);
  return c && `#${[c[0], c[1], c[2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
};

describe('event modeling render: what is drawn', () => {
  it("draws v12's order: lanes, then boxes, then each relation's path and its head", async () => {
    const { tree } = await render(fixture('nightly-check/layout-relations.mmd'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(classOf(tree, root)).toBe('mermaid mermaid-eventmodeling');
    expect(attr(tree, root, 'aria-roledescription')).toBe('eventmodeling');
    const kids = tree.children(root).map((n) => `${tree.tag(n)}.${classOf(tree, n)}`);
    const lanes = kids.filter((k) => k === 'g.em-swimlane').length;
    const boxes = kids.filter((k) => k === 'g.em-box').length;
    // UI/Automation, Command/Read Model, Events.
    expect(lanes).toBe(3);
    expect(boxes).toBe(9);
    expect(kids.slice(0, lanes)).toEqual(Array(lanes).fill('g.em-swimlane'));
    expect(kids.slice(lanes, lanes + boxes)).toEqual(Array(boxes).fill('g.em-box'));
    const rest = kids.slice(lanes + boxes);
    expect(rest.length % 2).toBe(0);
    for (let i = 0; i < rest.length; i += 2)
      expect([rest[i], rest[i + 1]]).toEqual(['path.em-relation', 'polygon.']);
    // A lane: rect then bold label; lanes carry data-id only.
    const lane = tree.children(root)[0]!;
    expect(attr(tree, lane, 'data-id')).toBe('lane:0');
    expect(attr(tree, lane, 'data-ast')).toBeUndefined();
    expect(tree.children(lane).map((n) => tree.tag(n))).toEqual(['rect', 'text']);
    expect(attr(tree, tree.children(lane)[0], 'x')).toBe('0');
    expect(attr(tree, tree.children(lane)[0], 'rx')).toBe('3');
    expect(textOf(tree, tree.children(lane)[1]!)).toBe('UI/Automation');
    expect(weightOf(tree, tree.children(lane)[1]!)).toBe('bold');
    // v12's start-anchored label: left edge at x 30, first baseline at the lane's y + 30.
    const laneText = tree.children(lane)[1]!;
    expect(attr(tree, laneText, 'text-anchor')).toBe('start');
    const at = attr(tree, laneText, 'x') === undefined ? tree.children(laneText)[0] : laneText;
    expect([attr(tree, at, 'x'), attr(tree, at, 'y')]).toEqual(['30', '30']);
    // A box: rect rx 3, then its bold name.
    const box = tree.children(root)[lanes]!;
    expect(attr(tree, box, 'data-ast')).toBe('frame:01');
    expect(tree.children(box).map((n) => tree.tag(n))).toEqual(['rect', 'text']);
    expect(attr(tree, tree.children(box)[0], 'rx')).toBe('3');
    expect(textOf(tree, tree.children(box)[1]!)).toBe('Start');
    expect(weightOf(tree, tree.children(box)[1]!)).toBe('bold');
  });

  it('draws relations as one line, a self relation and one under its row in three, the inferred one without data-ast', async () => {
    // Without line hops, which add commands where two relations cross. They are off by default
    // (D689); the explicit `false` keeps this independent of the default.
    const plain = deterministicApi({ lineHops: false } as MermaidConfig);
    const { tree } = await render(fixture('nightly-check/layout-relations.mmd'), plain);
    const paths = tree.find((n, t) => t.getAttr(n, 'class') === 'em-relation');
    // The self loop and 02 → 04, which skips 03 in the Events lane (D659).
    const bent = ['relation:06->06', 'relation:02->04'];
    const self = paths.find((p) => attr(tree, p, 'data-id') === 'relation:06->06')!;
    expect(attr(tree, self, 'data-ast')).toBe('relation:06->06');
    for (const p of paths)
      expect(attr(tree, p, 'd')!.match(/[ML]/g)).toEqual(
        bent.includes(attr(tree, p, 'data-id')!) ? ['M', 'L', 'L', 'L'] : ['M', 'L']
      );
    expect(paths.filter((p) => bent.includes(attr(tree, p, 'data-id')!))).toHaveLength(2);
    const last = paths.at(-1)!;
    expect(attr(tree, last, 'data-id')).toBe('relation:08->09');
    expect(attr(tree, last, 'data-ast')).toBeUndefined();
    for (const p of paths) {
      expect(attr(tree, p, 'fill')).toBe('none');
      expect(attr(tree, p, 'stroke-width')).toBe('1');
    }
  });

  it("paints v12 default's colours in default, and the text in textColor (D527)", async () => {
    const { tree } = await render(
      fixture('nightly-check/parser-kinds-long.mmd'),
      literal('default')
    );
    const boxes = tree.find((n, t) => t.getAttr(n, 'class') === 'em-box');
    const paint = boxes.map((b) => {
      const r = tree.children(b)[0];
      return [hex(attr(tree, r, 'fill')), hex(attr(tree, r, 'stroke'))];
    });
    expect(paint).toEqual([
      ['#ffffff', '#dbdada'], // ui
      ['#bcd6fe', '#679ac3'], // cmd
      ['#ffb778', '#c19a0f'], // evt
      ['#d3f1a2', '#a3b732'], // rmo
      ['#edb3f6', '#b88cbf'], // pcr
      ['#edb3f6', '#b88cbf'],
    ]);
    const lane = tree.find((n, t) => t.getAttr(n, 'class') === 'em-swimlane')[0]!;
    const rect = tree.children(lane)[0];
    expect([hex(attr(tree, rect, 'fill')), hex(attr(tree, rect, 'stroke'))]).toEqual([
      '#fafafa',
      '#f0f0f0',
    ]);
    const path = tree.find((n, t) => t.getAttr(n, 'class') === 'em-relation')[0]!;
    expect(hex(attr(tree, path, 'stroke'))).toBe('#333333');
    const head = tree.find({ tag: 'polygon' })[0]!;
    expect(hex(attr(tree, head, 'fill'))).toBe('#333333');
    for (const t of tree.find({ tag: 'text' })) expect(hex(attr(tree, t, 'fill'))).toBe('#333333');
  });

  it("paints v12 dark's values in neo-dark, and follows an author's variables", async () => {
    const dark = literal('neo-dark');
    const { tree } = await render(fixture('nightly-check/parser-kinds-long.mmd'), dark);
    const box = tree.find((n, t) => t.getAttr(n, 'class') === 'em-box')[0]!;
    expect(hex(attr(tree, tree.children(box)[0], 'fill'))).toBe('#2d2d2d');
    const authored = literal('default', {
      emArrowhead: '#ff0000',
      emEventFill: '#00ff00',
      emTextColor: '#0000ff',
    });
    const a = await render(fixture('nightly-check/parser-kinds-long.mmd'), authored);
    expect(hex(attr(a.tree, a.tree.find({ tag: 'polygon' })[0], 'fill'))).toBe('#ff0000');
    const evt = a.tree.find((n, t) => t.getAttr(n, 'data-ast') === 'frame:03')[0]!;
    expect(hex(attr(a.tree, a.tree.children(evt)[0], 'fill'))).toBe('#00ff00');
    expect(hex(attr(a.tree, a.tree.children(evt)[1], 'fill'))).toBe('#0000ff');
  });

  it('draws data as written in mono, left-aligned, under the name (D523)', async () => {
    const { tree } = await render(fixture('pr-check/with-data-block-reference.mmd'));
    const box = tree.find((n, t) => t.getAttr(n, 'data-ast') === 'frame:03')[0]!;
    const [, name, data] = tree.children(box);
    expect(textOf(tree, name!)).toBe('ItemAdded');
    expect(attr(tree, data, 'text-anchor')).toBe('start');
    const spans = tree.children(data!);
    // The block's text between its braces, dedented (D523).
    expect(spans.map((s) => textOf(tree, s).replace(/\u00a0/g, ' '))).toEqual([
      'productId: 7,',
      'quantity: 1',
    ]);
    for (const s of spans) expect(attr(tree, s, 'font-family')).toMatch(/mono/i);
  });

  it('writes the accessible title and description from accTitle and accDescr only (D133)', async () => {
    const { tree } = await render(fixture('nightly-check/parser-title-acc.mmd'));
    const root = tree.find({ tag: 'svg' })[0]!;
    expect(attr(tree, root, 'aria-labelledby')).toBe('x-title');
    expect(attr(tree, root, 'aria-describedby')).toBe('x-desc');
    expect(textOf(tree, tree.find({ tag: 'title' })[0]!)).toBe('An accessible title');
    // The `title` is modelled and not drawn (D218).
    expect(tree.find({ tag: 'text' }).some((t) => textOf(tree, t).includes('Last wins'))).toBe(
      false
    );
  });

  it('sizes the root as v12 with useMaxWidth, and to the viewBox without it', async () => {
    const src = fixture('pr-check/state-change-pattern.mmd');
    const { tree } = await render(src);
    const root = tree.find({ tag: 'svg' })[0]!;
    const [, , w, h] = attr(tree, root, 'viewBox')!.split(' ');
    expect(attr(tree, root, 'width')).toBe('100%');
    expect(attr(tree, root, 'style')).toContain(`max-width:${w}px`);
    const fixed = deterministicApi({ eventmodeling: { useMaxWidth: false } });
    const f = await render(src, fixed);
    const froot = f.tree.find({ tag: 'svg' })[0]!;
    expect([attr(f.tree, froot, 'width'), attr(f.tree, froot, 'height')]).toEqual([w, h]);
    expect(f.warnings.map((x) => x.code)).not.toContain('EVENTMODELING_CONFIG_INVALID');
  });

  it('warns once and keeps useMaxWidth on for a value that is not a boolean (D226)', async () => {
    const odd = deterministicApi({
      eventmodeling: { useMaxWidth: 'no' },
    } as unknown as MermaidConfig);
    const r = await render(fixture('pr-check/state-change-pattern.mmd'), odd);
    expect(attr(r.tree, r.tree.find({ tag: 'svg' })[0], 'width')).toBe('100%');
    const invalid = r.warnings.filter((x) => x.code === 'EVENTMODELING_CONFIG_INVALID');
    expect(invalid.map((x) => x.path)).toEqual(['eventmodeling.useMaxWidth']);
  });

  it('draws SVG only: ascii is UnsupportedFormatError (D320)', async () => {
    await expect(
      api.render('x', fixture('pr-check/state-change-pattern.mmd'), { format: 'ascii' })
    ).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});
