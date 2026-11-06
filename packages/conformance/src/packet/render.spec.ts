import { beforeAll, describe, expect, it } from 'vitest';
import { assertInert } from '@mermaid-js/core/svg';
import { detectPacket, type PacketModel } from '@mermaid-js/diagram-packet';
import {
  MermaidError,
  UnsupportedFormatError,
  type Mermaid,
  type MermaidConfig,
  type Prepared,
  type RenderResult,
} from 'mermaid';
import { astIndex, extents, wellFormed } from '../svg-props.ts';
import { parseSvg, type SvgElement, type SvgView } from '../svg-tree.ts';
import { packetGateCorpus } from './corpus.ts';
import { packetApi } from './render-api.ts';

/**
 * Render properties of the packet renderer (spec #421 T4, DESIGN §13.2, §13.4) over the packet
 * gate corpus (e2e fixtures, v12 spec strings and the cases, each also with CRLF and comment
 * lines), through the public `render()` with `deterministic: true`, in a classic, a dark redux
 * and an `auto` theme: well-formed XML, the allow-list, render-twice determinism, no
 * NaN/Infinity/undefined, no `foreignObject`, every drawn coordinate inside the viewBox, ids
 * only on the title and description, and the AST round-trip (R-PARSE-8).
 *
 * The round-trip rule for packet's AST (D345): every model field maps to exactly one `data-ast`
 * element, the `rect` of its first piece, and every piece's `rect` carries the field's
 * `<start>-<end>` as `data-id`. A `Field` node with no model field is one the 10,000-row cap
 * dropped whole (a misplaced field rejects the diagram, D341), so it maps to none and the model
 * carries `PACKET_TRUNCATED`. The header, title and accessibility statements have no element of
 * their own, as in the other ported types.
 *
 * The cap cases draw 10,000 rows, about 5 MB of SVG, past the default `maxOutputLength`, so the
 * corpus renders with that limit lifted; the last test pins the `LIMIT` error at the default.
 */
const THEMES = [
  'default',
  'redux-dark',
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
  api = await packetApi();
  const corpus = await packetGateCorpus();
  for (const theme of THEMES) {
    const themed = await packetApi({ theme, ...UNCAPPED });
    for (const item of corpus) {
      if (!detectPacket(item.source)) continue;
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
}, 600_000);

/** The 10,000-row cap draws past the default output limit (R-SEC-5). */
const UNCAPPED = { limits: { maxOutputLength: Infinity } } as MermaidConfig;

// The writer rounds coordinates to two decimals.
const TOL = 0.01;

const textOf = (tree: SvgView, n: SvgElement): string =>
  n.children.map((c) => c.text ?? textOf(tree, c)).join('');
const classOf = (tree: SvgView, n: SvgElement): string => tree.getAttr(n, 'class') ?? '';
const rootOf = (tree: SvgView): SvgElement => tree.find({ tag: 'svg' })[0]!;
/** The root's row groups, as v12's `#id > g`. */
const rowsOf = (tree: SvgView): SvgElement[] =>
  tree.children(rootOf(tree)).filter((n) => tree.tag(n) === 'g');
const blocks = (tree: SvgView): SvgElement[] => tree.find({ tag: 'rect', class: 'packetBlock' });
const attrs = (tree: SvgView, n: SvgElement, names: readonly string[]) =>
  names.map((a) => tree.getAttr(n, a));
/** An attribute as drawn: the element's own, else the nearest ancestor's (presentation attributes inherit). */
const inherited = (tree: SvgView, n: SvgElement, name: string): string | undefined => {
  for (let at: SvgElement | undefined = n; at; at = at.parent) {
    const v = tree.getAttr(at, name);
    if (v !== undefined) return v;
  }
  return undefined;
};

// The cap cases' 5 MB documents make each pass over the corpus take seconds.
describe('packet render properties over the corpus', { timeout: 120_000 }, () => {
  it('renders the corpus', () => {
    for (const theme of THEMES)
      expect(cases.filter((c) => c.theme === theme).length, theme).toBeGreaterThan(250);
    // Inputs v13 rejects are the parser's business (#454 parity); none fail to render.
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
    for (const theme of THEMES) fresh.set(theme, await packetApi({ theme, ...UNCAPPED }));
    for (const c of cases) {
      const again = await fresh.get(c.theme)!.render('mermaid-0', c.source);
      expect(again.svg, c.id).toBe(c.result.svg);
    }
  });

  it('writes no NaN, Infinity or undefined, no foreignObject, and a <style> only for auto', () => {
    for (const c of cases) {
      expect(c.result.svg, c.id).not.toMatch(/NaN|Infinity|undefined|foreignObject|<marker/);
      if (String(c.prepared.config.theme) !== 'auto')
        expect(c.result.svg, c.id).not.toContain('<style');
    }
  });

  it('writes no element ids but the title and description', () => {
    for (const c of cases) {
      const ids = [...c.result.svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
      for (const id of ids) expect(['mermaid-0-title', 'mermaid-0-desc'], c.id).toContain(id);
    }
  });

  it('keeps every drawn coordinate inside the viewBox (D344)', () => {
    for (const c of cases) {
      const { tree } = c;
      const [x, y, w, h] = tree.getAttr(rootOf(tree), 'viewBox')!.split(' ').map(Number);
      const out = extents(tree).filter(
        (p) => p.x < x! - TOL || p.y < y! - TOL || p.x > x! + w! + TOL || p.y > y! + h! + TOL
      );
      expect(out.slice(0, 3), c.id).toEqual([]);
    }
  });

  it('draws one g per row and one rect per piece, in model order', () => {
    for (const c of cases) {
      const { tree } = c;
      const model = c.prepared.parse.model as PacketModel;
      const rows = rowsOf(tree);
      expect(rows.length, c.id).toBe(model.rows.length);
      rows.forEach((g, r) => {
        const rects = tree.children(g).filter((n) => classOf(tree, n) === 'packetBlock');
        const want = model.rows[r]!.map((p) => {
          const f = model.fields[p.field]!;
          return `${f.start}-${f.end}`;
        });
        expect(
          rects.map((n) => tree.getAttr(n, 'data-id')),
          `${c.id} row ${r}`
        ).toEqual(want);
      });
      expect(tree.find({ tag: 'text', class: 'packetTitle' }).length, c.id).toBe(
        model.title ? 1 : 0
      );
    }
  });

  it('maps every field to one data-ast rect and back; fields the row cap dropped to none', () => {
    let dropped = 0;
    for (const c of cases) {
      const { tree } = c;
      const parse = c.prepared.parse;
      const model = parse.model as PacketModel;
      const index = astIndex(parse.ast);
      const seen = new Map<string, number>();
      for (const el of tree.find((n, t) => t.getAttr(n, 'data-ast') !== undefined)) {
        const id = tree.getAttr(el, 'data-ast')!;
        seen.set(id, (seen.get(id) ?? 0) + 1);
        expect([tree.tag(el), classOf(tree, el)], `${c.id}: ${id}`).toEqual([
          'rect',
          'packetBlock',
        ]);
        const node = index.get(id);
        expect(node, `${c.id}: ${id} is not an AST id`).toBeDefined();
        expect(node!.type, `${c.id}: ${id}`).toBe('Field');
        expect(node!.range.end, `${c.id}: ${id}`).toBeLessThanOrEqual(c.source.length);
        expect(c.source.slice(node!.range.start, node!.range.end), `${c.id}: ${id}`).toMatch(
          /^[\d+]/
        );
        // data-id is the field's resolved range, the AST id without its prefix (D345).
        expect(`field:${tree.getAttr(el, 'data-id')}`, c.id).toBe(id);
      }
      const fields = new Set(model.fields.map((f) => f.astId));
      for (const f of model.fields) expect(seen.get(f.astId), `${c.id}: ${f.astId}`).toBe(1);
      for (const node of parse.ast.children ?? []) {
        if (node.type !== 'Field' || fields.has(node.id)) continue;
        dropped++;
        expect(seen.get(node.id), `${c.id}: ${node.id}`).toBeUndefined();
        expect(
          model.warnings.map((w) => w.code),
          `${c.id}: ${node.id}`
        ).toContain('PACKET_TRUNCATED');
      }
    }
    // The corpus has a cap case that drops fields whole.
    expect(dropped).toBeGreaterThan(0);
  });
});

describe('packet render: what is drawn', () => {
  it('draws one g per row, each piece a rect, a label and its bit numbers', async () => {
    const src = 'packet\n0-15: "Source"\n16-31: "Dest"\n32-35: "Off"';
    const tree = parseSvg((await api.render('x', src)).svg);
    const rows = rowsOf(tree);
    expect(rows).toHaveLength(2);
    expect(tree.children(rows[0]!).map((n) => classOf(tree, n))).toEqual([
      'packetBlock',
      'packetLabel',
      'packetByte start',
      'packetByte end',
      'packetBlock',
      'packetLabel',
      'packetByte start',
      'packetByte end',
    ]);
    const [rect, label, start, end] = tree.children(rows[1]!);
    expect(tree.tag(rect!)).toBe('rect');
    expect(attrs(tree, rect!, ['x', 'y', 'width', 'height'])).toEqual(['1', '62', '123', '32']);
    expect(textOf(tree, label!)).toBe('Off');
    expect([textOf(tree, start!), textOf(tree, end!)]).toEqual(['32', '35']);
    expect(attrs(tree, start!, ['x', 'y', 'text-anchor'])).toEqual(['1', '60', 'start']);
    expect(attrs(tree, end!, ['x', 'y', 'text-anchor'])).toEqual(['124', '60', 'end']);
    // No title: no packetTitle text (v12 always wrote an empty one).
    expect(tree.find({ tag: 'text', class: 'packetTitle' })).toEqual([]);
  });

  it('puts data-ast on the first piece of a split field and data-id on every piece (D345)', async () => {
    const src = '---\nconfig:\n  packet:\n    bitsPerRow: 8\n---\npacket\n0-3: "a"\n4-19: "long"';
    const tree = parseSvg((await api.render('x', src)).svg);
    expect(blocks(tree).map((n) => attrs(tree, n, ['data-id', 'data-ast']))).toEqual([
      ['0-3', 'field:0-3'],
      ['4-19', 'field:4-19'],
      ['4-19', undefined],
      ['4-19', undefined],
    ]);
    // Each piece draws its own label.
    expect(tree.find({ tag: 'text', class: 'packetLabel' }).map((n) => textOf(tree, n))).toEqual([
      'a',
      'long',
      'long',
      'long',
    ]);
  });

  it('centres a one-bit piece’s number and draws none without showBits', async () => {
    const one = parseSvg((await api.render('x', 'packet\n0: "a"')).svg);
    const [n] = one.find({ tag: 'text', class: 'packetByte' });
    expect(one.find({ tag: 'text', class: 'packetByte' })).toHaveLength(1);
    expect(classOf(one, n!)).toBe('packetByte start');
    expect(attrs(one, n!, ['x', 'text-anchor'])).toEqual(['14.5', 'middle']);
    const src = '%%{init: {"packet": {"showBits": false}}}%%\npacket\n0-7: "a"';
    const none = parseSvg((await api.render('x', src)).svg);
    expect(none.find((x, t) => classOf(t, x).startsWith('packetByte'))).toEqual([]);
  });

  it('draws the title from the layout’s box, every line, below the rows', async () => {
    const one = parseSvg((await api.render('x', 'packet\ntitle Hello\n0-31: "a"')).svg);
    const t = one.find({ tag: 'text', class: 'packetTitle' })[0]!;
    expect(textOf(one, t)).toBe('Hello');
    expect(one.getAttr(t, 'x')).toBe('513');
    const src = '---\ntitle: First<br>Second<br>Third\n---\npacket\n0-31: "a"';
    const tree = parseSvg((await api.render('x', src)).svg);
    const title = tree.find({ tag: 'text', class: 'packetTitle' })[0]!;
    const lines = tree.children(title).filter((n) => tree.tag(n) === 'tspan');
    expect(lines.map((n) => textOf(tree, n))).toEqual(['First', 'Second', 'Third']);
    const ys = lines.map((n) => Number(tree.getAttr(n, 'y')));
    // The first line sits where the one-line title does; the others grow down.
    expect(ys[0]).toBe(Number(one.getAttr(t, 'y')));
    expect(ys[1]! - ys[0]!).toBeGreaterThan(0);
    expect(ys[2]! - ys[1]!).toBeCloseTo(ys[1]! - ys[0]!, 2);
    const [, vy, , vh] = tree.getAttr(rootOf(tree), 'viewBox')!.split(' ').map(Number);
    expect(ys[2]!).toBeLessThan(vy! + vh!);
    const rect = blocks(tree)[0]!;
    expect(ys[0]).toBeGreaterThan(Number(tree.getAttr(rect, 'y')) + 32);
  });

  it('shrinks a label wider than its piece, down to the bit-number size (D343)', async () => {
    const src = 'packet\n0: "a very long label for one bit"\n1-31: "ok"';
    const tree = parseSvg((await api.render('x', src)).svg);
    const [shrunk, kept] = tree.find({ tag: 'text', class: 'packetLabel' });
    expect(inherited(tree, shrunk!, 'font-size')).toBe('10');
    expect(inherited(tree, kept!, 'font-size')).toBe('12');
  });

  it('decodes entities and breaks lines in labels through core label layout (D343)', async () => {
    const src = 'packet\n0-31: "a &amp; b<br>c"';
    const tree = parseSvg((await api.render('x', src)).svg);
    const label = tree.find({ tag: 'text', class: 'packetLabel' })[0]!;
    expect(
      tree
        .children(label)
        .filter((n) => tree.tag(n) === 'tspan')
        .map((n) => textOf(tree, n))
    ).toEqual(['a & b', 'c']);
  });

  it('sizes the root as v12 with and without useMaxWidth', async () => {
    const wide = parseSvg((await api.render('x', 'packet\n0-31: "a"')).svg);
    const root = rootOf(wide);
    expect(wide.getAttr(root, 'viewBox')).toBe('0 0 1026 62');
    expect(wide.getAttr(root, 'width')).toBe('100%');
    expect(wide.getAttr(root, 'style')).toMatch(/max-width:1026px/);
    const src = '%%{init: {"packet": {"useMaxWidth": false}}}%%\npacket\n0-31: "a"';
    const fixed = parseSvg((await api.render('x', src)).svg);
    const r = rootOf(fixed);
    expect(attrs(fixed, r, ['width', 'height'])).toEqual(['1026', '62']);
  });
});

describe('packet render: theme', () => {
  const paints = (tree: SvgView) => {
    const rect = blocks(tree)[0]!;
    const one = (cls: string) =>
      tree.find((n, t) => t.tag(n) === 'text' && classOf(t, n) === cls)[0]!;
    const get = (n: SvgElement, name: string) => inherited(tree, n, name);
    return {
      fill: get(rect, 'fill'),
      stroke: get(rect, 'stroke'),
      strokeWidth: get(rect, 'stroke-width'),
      label: get(one('packetLabel'), 'fill'),
      start: get(one('packetByte start'), 'fill'),
      end: get(one('packetByte end'), 'fill'),
      title: get(one('packetTitle'), 'fill'),
      sizes: ['packetLabel', 'packetByte start', 'packetTitle'].map((c) =>
        get(one(c), 'font-size')
      ),
    };
  };
  const SRC = 'packet\ntitle T\n0-15: "a"';
  const render = async (config: MermaidConfig) =>
    paints(parseSvg((await (await packetApi(config)).render('x', SRC)).svg));

  it('paints from packet’s variables, as CSS variables by default', async () => {
    expect(await render({})).toEqual({
      fill: 'var(--_pkf)',
      stroke: 'var(--_pkb)',
      strokeWidth: '1',
      label: 'var(--_pkl)',
      start: 'var(--_pks)',
      end: 'var(--_pke)',
      title: 'var(--_pkt)',
      sizes: ['12', '10', '14'],
    });
  });

  it('draws v12’s colours in default and dark, and the dark entry in neo-dark (D333(b))', async () => {
    const lit = { output: { cssVariables: false } } as const;
    const inks = (ink: string, fill: string) => ({
      fill,
      stroke: ink,
      strokeWidth: '1',
      label: ink,
      start: ink,
      end: ink,
      title: ink,
      sizes: ['12', '10', '14'],
    });
    expect(await render({ ...lit, theme: 'default' })).toEqual(inks('black', '#efefef'));
    expect(await render({ ...lit, theme: 'dark' })).toEqual(inks('#e0dfdf', '#333333'));
    const neoDark = await render({ ...lit, theme: 'neo-dark' });
    expect(neoDark.fill).not.toBe('#efefef');
    expect(neoDark.label).not.toBe('black');
  });

  it('takes themeVariables.packet.* and the flat names (D335, D540)', async () => {
    const config = {
      theme: 'dark',
      output: { cssVariables: false },
      themeVariables: {
        packet: { startByteColor: 'red', labelFontSize: '16px', blockStrokeWidth: 3 },
        packetTitleColor: '#123456',
      },
    } as MermaidConfig;
    const p = await render(config);
    expect([p.start, p.end, p.title, p.strokeWidth, p.sizes[0]]).toEqual([
      'red',
      '#e0dfdf',
      '#123456',
      '3',
      '16',
    ]);
  });
});

describe('packet render: accessibility, ids, security and formats', () => {
  it('names the diagram by accTitle alone, describes it by accDescr (D133)', async () => {
    const titled = parseSvg((await api.render('m', 'packet\ntitle Visible\n0: "a"')).svg);
    const root = rootOf(titled);
    expect(titled.getAttr(root, 'aria-labelledby')).toBeUndefined();
    expect(titled.getAttr(root, 'aria-roledescription')).toBe('packet');
    expect(titled.getAttr(root, 'role')).toBe('img');
    const src = 'packet\naccTitle: Header\naccDescr {\n  The TCP header\n}\n0: "a"';
    const named = parseSvg((await api.render('m', src)).svg);
    const r = rootOf(named);
    expect(named.getAttr(r, 'aria-labelledby')).toBe('m-title');
    expect(named.getAttr(r, 'aria-describedby')).toBe('m-desc');
    expect(textOf(named, named.find({ tag: 'title' })[0]!)).toBe('Header');
    expect(textOf(named, named.find({ tag: 'desc' })[0]!)).toBe('The TCP header');
  });

  it('gives two renders in one document no colliding ids', async () => {
    const source = 'packet\n  accTitle: T\n  accDescr: D\n  0: "a"';
    const ids = (svg: string): string[] => [...svg.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]!);
    const a = ids((await api.render('mermaid-1', source)).svg);
    const b = ids((await api.render('mermaid-2', source)).svg);
    expect(a).toEqual(['mermaid-1-title', 'mermaid-1-desc']);
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
  });

  it('renders hostile labels and titles inert', async () => {
    const hostile = [
      'packet\ntitle </text><script>alert(1)</script>\n0: "a"',
      'packet\n0-7: "<img src=x onerror=alert(1)>"\n8: "<svg onload=alert(1)>"',
      'packet\naccTitle: <script>x</script>\naccDescr: ]]><x\n0: "&<>\'"',
      'packet\n0: "\\u0000\\0\\b"',
    ];
    for (const source of hostile) {
      const { svg } = await api.render('x', source);
      expect(() => assertInert(svg), source).not.toThrow();
      expect(wellFormed(svg), source).toBeUndefined();
      expect(svg, source).not.toMatch(/<script|<img|<svg [^>]*onload|="[^"]*(javascript:|url\()/);
    }
  });

  it('stops the 10,000-row cap at the default output limit with a LIMIT error (R-SEC-5)', async () => {
    const err = await api.render('x', 'packet\n0-99999999: "a"').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MermaidError);
    expect((err as MermaidError).code).toBe('LIMIT');
  });

  it('draws SVG only: ascii throws UnsupportedFormatError until T7', async () => {
    await expect(api.render('x', 'packet\n0: "a"', { format: 'ascii' })).rejects.toBeInstanceOf(
      UnsupportedFormatError
    );
  });
});
