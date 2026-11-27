import { beforeAll, describe, expect, it } from 'vitest';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import { parseSankey } from '../parser/index.ts';
import { sankeyTestContext, sankeyTestTheme } from '../test-context.ts';
import { layoutSankey, type SankeyLayout } from './index.ts';
import { sankeyLayoutViolations } from './invariants.ts';
import { TABLEAU10 } from './metrics.ts';

let theme: Theme;
beforeAll(async () => {
  theme = await sankeyTestTheme();
});

/**
 * A measurer with round numbers, so expected boxes are worked by hand from v12's code: every
 * character is 10 px wide, the ascent is 0.8 of the size and the descent 0.2. `fonts` gets each
 * font it measures in.
 */
function tenPx(fonts: FontKey[] = []): Measurer {
  return {
    id: 'ten',
    width: (text, font) => {
      fonts.push(font);
      return text.length * 10;
    },
    metrics: (font) => ({
      ascent: font.size * 0.8,
      descent: font.size * 0.2,
      lineHeight: font.size,
    }),
  };
}

function lay(src: string, sankey: Record<string, unknown> = {}, measurer = tenPx()): SankeyLayout {
  const { model } = parseSankey(src);
  const layout = layoutSankey(model, sankeyTestContext(theme, sankey, measurer));
  expect(sankeyLayoutViolations(model, layout, sankey)).toEqual([]);
  return layout;
}

const node = (l: SankeyLayout, id: string) => l.nodes.find((n) => n.id === id)!;

// a → b (10), a → c (5): two layers; the right column is the tallest, so it sets ky and fills
// the height: ky = min(400 / 15, (400 - 27) / 15) = 373 / 15.
const FORK = 'sankey\na,b,10\na,c,5';

describe('sankey layout: d3-sankey as v12 configures it', () => {
  it('puts the layers nodeWidth wide at the extent edges', () => {
    const l = lay(FORK);
    expect([node(l, 'a').x0, node(l, 'a').x1]).toEqual([0, 10]);
    expect([node(l, 'b').x0, node(l, 'b').x1]).toEqual([590, 600]);
    expect([node(l, 'a').layer, node(l, 'b').layer, node(l, 'c').layer]).toEqual([0, 1, 1]);
    const w = lay(FORK, { width: 410, nodeWidth: 20 });
    expect([node(w, 'c').x0, node(w, 'c').x1]).toEqual([390, 410]);
  });

  it('pads nodes by nodePadding, plus 15 under showValues', () => {
    expect(lay(FORK).padding).toBe(27);
    expect(lay(FORK, { showValues: false }).padding).toBe(12);
    expect(lay(FORK, { nodePadding: 30, showValues: false }).padding).toBe(30);
    // A column of two nodes in 20 px cannot keep 27 apart: d3 pads by the height.
    expect(lay(FORK, { height: 20 }).padding).toBe(20);
  });

  it('scales node heights so the tallest column fills the extent', () => {
    const l = lay(FORK);
    const ky = 373 / 15;
    expect(node(l, 'b').y0).toBeCloseTo(0, 9);
    expect(node(l, 'b').y1).toBeCloseTo(10 * ky, 9);
    expect(node(l, 'c').y0).toBeCloseTo(10 * ky + 27, 9);
    expect(node(l, 'c').y1).toBeCloseTo(400, 9);
    expect(node(l, 'a').y1 - node(l, 'a').y0).toBeCloseTo(15 * ky, 9);
    expect(l.links[0]!.width).toBeCloseTo(10 * ky, 9);
    expect(l.links[1]!.width).toBeCloseTo(5 * ky, 9);
  });

  it('takes each align from nodeAlignment, justify by default', () => {
    // a → b → c and x → c: x is a source one layer before c.
    const src = 'sankey\na,b,1\nb,c,1\nx,c,1\nb,d,1';
    const layers = (s: Record<string, unknown>) =>
      lay(src, s)
        .nodes.map((n) => `${n.id}${n.layer}`)
        .join(' ');
    expect(layers({})).toBe('a0 b1 c2 x0 d2');
    expect(layers({ nodeAlignment: 'left' })).toBe('a0 b1 c2 x0 d2');
    expect(layers({ nodeAlignment: 'right' })).toBe('a0 b1 c2 x1 d2');
    expect(layers({ nodeAlignment: 'center' })).toBe('a0 b1 c2 x1 d2');
    // A sink before the last layer: justify moves it to the last, left keeps it.
    const sink = 'sankey\na,b,1\nb,c,1\na,s,1';
    expect(lay(sink).nodes.map((n) => n.layer)).toEqual([0, 1, 2, 2]);
    expect(lay(sink, { nodeAlignment: 'left' }).nodes.map((n) => n.layer)).toEqual([0, 1, 2, 1]);
  });

  it('draws each link from its source right edge to its target left edge, d3-shape horizontal', () => {
    const [ab] = lay(FORK).links;
    expect(ab!.path.from).toEqual({ x: 10, y: ab!.y0 });
    expect(ab!.path.to).toEqual({ x: 590, y: ab!.y1 });
    expect(ab!.path.c1).toEqual({ x: 300, y: ab!.y0 });
    expect(ab!.path.c2).toEqual({ x: 300, y: ab!.y1 });
  });

  it('draws a zero link 1 px wide and never NaN (D394)', () => {
    const l = lay('sankey\na,b,1\na,c,0');
    expect(l.links[1]!.width).toBe(0);
    expect(l.links[1]!.strokeWidth).toBe(1);
  });

  it('spreads nodes 0 high when every flow is 0, where d3 wrote NaN', () => {
    const l = lay('sankey\na,b,0');
    // One node per column: d3 places it (400 - 27 + 27) / 2 down.
    expect(l.nodes.map((n) => [n.y0, n.y1])).toEqual([
      [200, 200],
      [200, 200],
    ]);
    expect(l.links[0]!.strokeWidth).toBe(1);
    // NaN, negative and infinite values count as 0 (the parser's flow).
    expect(lay('sankey\na,b,abc\nb,c,-2\nc,d,1e999').nodes.every((n) => n.y0 === n.y1)).toBe(true);
  });

  it('keeps sums that overflow a double finite', () => {
    const l = lay('sankey\na,b,1e308\na,c,1e308');
    expect(node(l, 'b').y1 - node(l, 'b').y0).toBeCloseTo(node(l, 'c').y1 - node(l, 'c').y0, 9);
    expect(node(l, 'a').value).toBe(Infinity);
    expect(node(l, 'b').value).toBe(1e308);
  });

  it('lays out nothing for a model without rows', () => {
    const l = lay('sankey');
    expect(l.nodes).toEqual([]);
    expect(l.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('throws on a cycle, as d3 did (the parser rejects it first, D393)', () => {
    const { model } = parseSankey('sankey\na,b,1\nb,a,1');
    expect(() => layoutSankey(model, sankeyTestContext(theme))).toThrow('circular link');
  });
});

describe('sankey layout: colours, labels and bounds, worked from v12 sankeyRenderer.ts', () => {
  it('gives nodes not in nodeColors the next Tableau10 slot, mod 10', () => {
    const rows = Array.from({ length: 11 }, (_, i) => `s,t${i},1`).join('\n');
    const l = lay(`sankey\n${rows}`, { nodeColors: { t0: '#123456', constructor: '#fff' } });
    expect(l.nodes.map((n) => n.fill)).toEqual([
      ...[0, undefined, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((slot) =>
        slot === undefined ? '#123456' : TABLEAU10[slot]
      ),
    ]);
    expect(node(l, 't0').fill).toBe('#123456');
    expect(node(l, 's').fill).toBe('#4e79a7');
    expect(node(l, 't10').fill).toBe('#4e79a7');
    expect(l.links[0]).toMatchObject({ sourceFill: '#4e79a7', targetFill: '#123456' });
    // Only own entries count: `__proto__` and `constructor` are names like any other.
    const p = lay('sankey\n__proto__,constructor,1', { nodeColors: {} });
    expect(p.nodes.map((n) => n.fill)).toEqual([TABLEAU10[0], TABLEAU10[1]]);
  });

  it('takes a node out of the slots only for a nodeColors entry that is a colour', () => {
    // v12 never asked the scale for a's slot, so b took slot 0; null fell through to the scale.
    const l = lay('sankey\na,b,1\nb,c,1', { nodeColors: { a: ' red ', c: null } });
    expect(l.nodes.map((n) => n.fill)).toEqual(['red', '#4e79a7', '#f28e2c']);
    // Dropped (spec #427: the default used): a number, an unsafe value, an object. v12 drew
    // these black and asked the scale for no slot.
    const bad = lay('sankey\na,b,1\nb,c,1', {
      nodeColors: { a: 5, b: 'red;x:url(y)', c: { r: 1 } },
    });
    expect(bad.nodes.map((n) => n.fill)).toEqual(['#4e79a7', '#f28e2c', '#e15759']);
    expect(bad.links.map((k) => [k.sourceFill, k.targetFill])).toEqual([
      ['#4e79a7', '#f28e2c'],
      ['#f28e2c', '#e15759'],
    ]);
  });

  it('writes one line, the value rounded to 2 decimals between prefix and suffix (D395)', () => {
    const l = lay('sankey\na,b,0.125\na,c,0.2', { prefix: '$', suffix: 'B' });
    expect(l.nodes.map((n) => n.label.line)).toEqual(['a $0.33B', 'b $0.13B', 'c $0.2B']);
    expect(lay(FORK, { showValues: false }).nodes.map((n) => n.label.line)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('places legacy labels right of nodes left of the middle, left of the others', () => {
    const l = lay(FORK);
    expect(node(l, 'a').label).toMatchObject({ x: 16, anchor: 'start', dy: 0 });
    expect(node(l, 'b').label).toMatchObject({ x: 584, anchor: 'end', dy: 0 });
    const b = node(l, 'b');
    expect(b.label.y).toBe((b.y0 + b.y1) / 2);
    // 'b 10': 40 px wide, ending at the anchor; 14 px font: ascent 11.2, descent 2.8.
    expect(b.label.box).toMatchObject({ x: 544, y: b.label.y - 11.2, width: 40 });
    expect(b.label.box.height).toBeCloseTo(14, 9);
  });

  it('shifts the baseline 0.35em (4.9 px) without values', () => {
    const l = lay(FORK, { showValues: false });
    for (const n of l.nodes) expect(n.label.dy).toBeCloseTo(4.9, 12);
    const a = node(l, 'a');
    expect(a.label.box.y).toBeCloseTo(a.label.y + 4.9 - 11.2, 9);
  });

  it('places outlined labels left of nodes in layers before the largest node, right of the rest', () => {
    // b (value 10) is the largest and in layer 1: a's label goes left of it.
    const src = 'sankey\na,b,4\nx,b,6\nb,c,10';
    const l = lay(src, { labelStyle: 'outlined' });
    expect(l.labelStyle).toBe('outlined');
    expect(l.nodes.map((n) => `${n.id}:${n.label.anchor}`)).toEqual([
      'a:end',
      'b:start',
      'x:end',
      'c:start',
    ]);
    expect(node(l, 'a').label.x).toBe(-6);
    // The first of two equal largest nodes counts: a (layer 0), so every label is right.
    const tie = lay('sankey\na,b,5\nc,d,5', { labelStyle: 'outlined' });
    expect(tie.nodes.every((n) => n.label.anchor === 'start')).toBe(true);
  });

  it('bounds what is drawn, with no padding (D224)', () => {
    // Legacy: every label inside the 600 × 400 extent; the nodes reach its four edges.
    const b = lay(FORK).bounds;
    expect(b).toMatchObject({ x: 0, y: 0, width: 600 });
    expect(b.height).toBeCloseTo(400, 9);
    // Outlined, with a the largest: b's and c's labels start 6 px past the right edge, and the
    // 4 px outline reaches 2 px past the text.
    const l = lay(FORK, { labelStyle: 'outlined' });
    expect(l.bounds.x).toBe(0);
    expect(l.bounds.width).toBe(606 + 40 + 2);
    // A label left of layer 0 starts before 0.
    const left = lay('sankey\na,b,4\nx,b,6\nb,c,10', { labelStyle: 'outlined' });
    expect(left.bounds.x).toBe(-6 - 'a 4'.length * 10 - 2);
  });

  it('bounds a zero link by its 1 px stroke', () => {
    // Every flow 0: both nodes 0 high at y 200; text measured 0 wide and 0 high.
    const flat: Measurer = {
      id: 'flat',
      width: () => 0,
      metrics: () => ({ ascent: 0, descent: 0, lineHeight: 0 }),
    };
    const l = lay('sankey\na,b,0', {}, flat);
    expect(l.bounds).toEqual({ x: 0, y: 199.5, width: 600, height: 1 });
  });

  it('measures labels at 14 px in the theme font, normal weight', () => {
    const fonts: FontKey[] = [];
    const l = lay(FORK, {}, tenPx(fonts));
    expect(fonts.length).toBe(3);
    expect(new Set(fonts.map((f) => JSON.stringify(f)))).toEqual(
      new Set([JSON.stringify({ family: theme.value('fontFamily'), size: 14, weight: 400 })])
    );
    expect(l.font).toEqual(fonts[0]);
  });

  it('falls back to the default for a value of the wrong type, reads numeric strings', () => {
    expect(lay(FORK, { width: 'wide', nodeWidth: -1 }).nodes[1]!.x1).toBe(600);
    expect(lay(FORK, { width: '300' }).nodes[1]!.x1).toBe(300);
    expect(lay(FORK, { nodeAlignment: 'middle', labelStyle: 'bold' }).labelStyle).toBe('legacy');
  });
});

/** Each line of a label as `text` with `*` for a bold run and `_` for an italic one. */
const shown = (l: SankeyLayout, id: string): string[] =>
  node(l, id).label.text.lines.map((line) =>
    line
      .map((r) => {
        const mark = (r.bold ? '*' : '') + (r.italic ? '_' : '');
        return mark + r.text + [...mark].reverse().join('');
      })
      .join('')
  );

describe('sankey layout: labels by the label rule (#1368)', () => {
  const ways = (legacyMarkdown: boolean) => {
    const src = [
      'sankey',
      'a **b** _c_,hub,1',
      '"`d **e** _f_`",hub,1',
      '`g **h**`,hub,1',
      'i `j` k,hub,1',
      'l <b>m</b><br>n,hub,1',
      'o\\np,hub,1',
    ].join('\n');
    const { model } = parseSankey(src);
    const ctx = sankeyTestContext(theme, { showValues: false }, tenPx());
    return layoutSankey(model, { ...ctx, config: { ...ctx.config, legacyMarkdown } });
  };

  for (const legacyMarkdown of [false, true])
    it(`reads markdown only in a quoted markdown string (legacyMarkdown: ${legacyMarkdown})`, () => {
      const l = ways(legacyMarkdown);
      expect(shown(l, 'a **b** _c_')).toEqual(['a **b** _c_']);
      expect(shown(l, '`d **e** _f_`')).toEqual(['d *e* _f_']);
      expect(shown(l, '`g **h**`')).toEqual(['`g **h**`']);
      expect(shown(l, 'i `j` k')).toEqual(['i `j` k']);
      expect(shown(l, 'l <b>m</b><br>n')).toEqual(['l *m*', 'n']);
      expect(shown(l, 'o\\np')).toEqual(['o', 'p']);
    });

  it('appends the value as plain text, after the last line', () => {
    const src = 'sankey\n"`**a**\\nb`",c,1\nc,d <i>e</i>,1';
    const l = lay(src, { prefix: '**', suffix: '<b>_</b>' });
    expect(shown(l, '`**a**\\nb`')).toEqual(['*a*', 'b **1<b>_</b>']);
    expect(shown(l, 'd <i>e</i>')).toEqual(['d _e_ **1<b>_</b>']);
  });

  it('keeps a one-line plain label on v12 baseline, centres a block of lines on the node', () => {
    const l = lay('sankey\na,b\\nc,10');
    const a = node(l, 'a');
    expect(a.label.text.lines).toHaveLength(1);
    expect(a.label.box).toMatchObject({ x: 16, y: a.label.y - 11.2, width: 40 });
    // 'b', then 'c 10': 40 px wide, two 14 px lines centred on the node, ending at the anchor.
    const b = node(l, 'b\\nc');
    expect(b.label.box).toMatchObject({ x: 584 - 40, y: b.label.y - 14, width: 40, height: 28 });
  });
});
