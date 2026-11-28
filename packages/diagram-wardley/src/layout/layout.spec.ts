import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Measurer } from '@mermaid-js/core/text';
import { MARKDOWN_NOT_READ } from '@mermaid-js/core/text/markdown-warning';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { parseWardley } from '../parser/index.ts';
import { layoutWardley, type PlacedText, type WardleyLayout } from './index.ts';

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

// A measurer with round numbers, so expected positions are worked by hand from v12's
// `wardleyRenderer.ts`: every character is 10 px wide, the ascent is 0.8 of the size and a
// line 1.2 of it.
const tenPx: Measurer = {
  id: 'ten',
  width: (text) => text.length * 10,
  metrics: (font) => ({
    ascent: font.size * 0.8,
    descent: font.size * 0.2,
    lineHeight: font.size * 1.2,
  }),
};

function lay(
  body: string,
  section: Record<string, unknown> = {},
  warnings: Warning[] = [],
  top: Record<string, unknown> = {}
): WardleyLayout {
  const { model, diagnostics } = parseWardley(`wardley-beta\n${body}\n`);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(errors.map((d) => d.message).join('; '));
  return layoutWardley(model, {
    config: { ...top, 'wardley-beta': section } as unknown as ResolvedConfig,
    measurer: tenPx,
    theme,
    warn: (w) => warnings.push(w),
  });
}

const node = (l: WardleyLayout, id: string) => l.nodes.find((n) => n.id === id)!;

describe('wardley layout: the canvas and the projection (:80-88, :147-166)', () => {
  it('is 900 × 600 with a 48 px inset by default', () => {
    const l = lay('component A [0.5, 0.25]');
    expect([l.width, l.height, l.padding]).toEqual([900, 600, 48]);
    expect(l.chart).toEqual({ x: 48, y: 48, width: 804, height: 504 });
    // x = p + evolution · chartW, y = H − p − visibility · chartH.
    expect(node(l, 'A').point).toEqual({ x: 48 + 0.25 * 804, y: 600 - 48 - 0.5 * 504 });
  });

  it('takes the size statement over the config, and the config over the defaults', () => {
    expect(lay('size [1100, 800]', { width: 300 })).toMatchObject({ width: 1100, height: 800 });
    expect(lay('', { width: 300, height: 200, padding: 10 }).chart).toEqual({
      x: 10,
      y: 10,
      width: 280,
      height: 180,
    });
  });

  it('falls back from a value below the schema minimum, one warning per key (D424)', () => {
    for (const width of [0, -5, Number.NaN, 'wide', Infinity]) {
      const warnings: Warning[] = [];
      expect(lay('', { width }, warnings).width).toBe(900);
      expect(warnings.map((w) => [w.code, w.path])).toEqual([
        ['WARDLEY_CONFIG_INVALID', 'wardley-beta.width'],
      ]);
    }
    const warnings: Warning[] = [];
    const l = lay('component A [0.5, 0.5]', { nodeRadius: -1, padding: '20' }, warnings);
    expect(l.nodeRadius).toBe(6);
    expect(l.padding).toBe(20);
    expect(warnings).toHaveLength(1);
  });

  it('falls back from a nodeRadius of 0, which draws nothing (D424)', () => {
    const warnings: Warning[] = [];
    expect(lay('', { nodeRadius: 0 }, warnings).nodeRadius).toBe(6);
    expect(warnings.map((w) => w.path)).toEqual(['wardley-beta.nodeRadius']);
  });

  it('falls back from a padding that leaves no chart, to the default or else 0 (D424)', () => {
    const warnings: Warning[] = [];
    expect(lay('', { padding: 300 }, warnings).padding).toBe(48);
    expect(lay('', { padding: 299 }).padding).toBe(299);
    expect(lay('size [80, 400]', {}, warnings).padding).toBe(0);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['WARDLEY_CONFIG_INVALID', 'wardley-beta.padding'],
      ['WARDLEY_CONFIG_INVALID', 'wardley-beta.padding'],
    ]);
    // One warning for a padding that is both invalid and too large.
    const one: Warning[] = [];
    expect(lay('size [50, 50]', { padding: 'x' }, one).padding).toBe(0);
    expect(one).toHaveLength(1);
  });

  it('falls back from a size of 0 to the configured canvas, with one warning (D424)', () => {
    const warnings: Warning[] = [];
    const l = lay('size [0, 0]', { width: 500 }, warnings);
    expect([l.width, l.height]).toEqual([500, 600]);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([['WARDLEY_CONFIG_INVALID', ['size']]]);
    const one: Warning[] = [];
    expect(lay('size [0, 300]', {}, one)).toMatchObject({ width: 900, height: 300 });
    expect(one).toHaveLength(1);
  });

  it('starts the bounds at the canvas and grows them over what is drawn (D224)', () => {
    expect(lay('component A [0.5, 0.5]').bounds).toEqual({ x: 0, y: 0, width: 900, height: 600 });
    // A label offset far past the canvas.
    const b = lay('component A [0.5, 1.0] label [500, -400]').bounds;
    expect(b.x + b.width).toBeGreaterThan(900 + 300);
    expect(b.y).toBeLessThan(0);
  });
});

describe('wardley layout: title, axes, stages and grid', () => {
  it('centres the bold title at (W / 2, p / 2) in axisFontSize · 1.05', () => {
    const t = lay('title Tea Shop').title!;
    expect(t.at).toEqual({ x: 450, y: 24 });
    expect(t.font).toMatchObject({ size: 12 * 1.05, weight: 700 });
    expect([t.anchor, t.baseline]).toEqual(['middle', 'middle']);
    expect(t.x).toBeCloseTo(450 - 40);
    expect(lay('').title).toBeUndefined();
  });

  it('draws the axes along the chart and their bold labels (:168-212)', () => {
    const { axes } = lay('');
    expect(axes.x).toEqual({ from: { x: 48, y: 552 }, to: { x: 852, y: 552 } });
    expect(axes.y).toEqual({ from: { x: 48, y: 48 }, to: { x: 48, y: 552 } });
    expect(axes.xLabel).toMatchObject({ at: { x: 450, y: 588 }, anchor: 'middle', rotate: 0 });
    expect(axes.yLabel).toMatchObject({ at: { x: 16, y: 300 }, rotate: -90 });
    expect(axes.yLabel.text).toBe('Visibility');
    expect(axes.xLabel.font).toMatchObject({ size: 12, weight: 700 });
  });

  it('draws v12’s four stages in equal quarters, a divider before each but the first', () => {
    const { stages } = lay('');
    expect(stages.map((s) => s.label.text)).toEqual([
      'Genesis',
      'Custom Built',
      'Product',
      'Commodity',
    ]);
    expect(stages.map((s) => [s.start, s.end])).toEqual([
      [48, 249],
      [249, 450],
      [450, 651],
      [651, 852],
    ]);
    expect(stages[0]!.divider).toBeUndefined();
    expect(stages[1]!.divider).toEqual({ from: { x: 249, y: 48 }, to: { x: 249, y: 552 } });
    expect(stages[1]!.label.at).toEqual({ x: (249 + 450) / 2, y: 600 - 48 / 1.5 });
    expect(stages[1]!.label.font.size).toBe(10);
  });

  it('uses custom widths only when every stage has @, clamped to [0, 1] (D424)', () => {
    const custom = lay('evolution A@0.1 -> B@0.5 -> C@1.0').stages;
    expect(custom.map((s) => [s.start, s.end])).toEqual([
      [48, 48 + 80.4],
      [48 + 80.4, 450],
      [450, 852],
    ]);
    const some = lay('evolution A@0.1 -> B -> C@1.0').stages;
    expect(some.map((s) => s.start)).toEqual([48, 48 + 268, 48 + 536]);
    const warnings: Warning[] = [];
    // Decreasing boundaries draw as v12 does: the second stage runs right to left.
    const back = lay('evolution A@0.8 -> B@0.3').stages;
    expect(back.map((s) => [s.start, s.end])).toEqual([
      [48, 48 + 0.8 * 804],
      [48 + 0.8 * 804, 48 + 0.3 * 804],
    ]);
    const clamped = lay('evolution A@0.5 -> B@40.0', {}, warnings).stages;
    expect(clamped.map((s) => s.end)).toEqual([450, 852]);
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['WARDLEY_STAGE_CLAMPED', ['evolution']],
    ]);
  });

  it('draws grid quarters only under showGrid', () => {
    expect(lay('').grid).toEqual([]);
    const { grid } = lay('', { showGrid: true });
    expect(grid).toHaveLength(6);
    expect(grid[0]).toEqual({ from: { x: 249, y: 48 }, to: { x: 249, y: 552 } });
    expect(grid[1]).toEqual({ from: { x: 48, y: 426 }, to: { x: 852, y: 426 } });
  });
});

describe('wardley layout: nodes (:584-823)', () => {
  it('draws a component as a circle, an anchor without one, labelled as v12', () => {
    const l = lay('anchor U [1.0, 0.5]\ncomponent A [0.5, 0.5]');
    const a = node(l, 'A');
    expect([a.glyph, a.radius]).toEqual(['circle', 6]);
    expect(a.label).toMatchObject({ at: { x: 450 + 8, y: 300 - 8 }, anchor: 'start' });
    expect(a.label.baseline).toBe('auto');
    // The first baseline on the anchor point: the box top is ascent above it.
    expect(a.label.y).toBeCloseTo(292 - 8);
    const u = node(l, 'U');
    expect([u.glyph, u.radius]).toEqual(['none', 0]);
    expect(u.label).toMatchObject({ at: { x: 450, y: 48 - 3 }, anchor: 'middle' });
    expect(u.label.font.weight).toBe(700);
  });

  it('honours label offsets, and moves a strategy’s label 10 px further only without them', () => {
    const l = lay(
      'component A [0.5, 0.5] label [20, 30]\ncomponent B [0.5, 0.5] (buy)\ncomponent C [0.5, 0.5] label [1, 2] (buy)'
    );
    expect(node(l, 'A').label.at).toEqual({ x: 470, y: 330 });
    expect(node(l, 'B').label.at).toEqual({ x: 450 + 18, y: 300 - 18 });
    expect(node(l, 'C').label.at).toEqual({ x: 451, y: 302 });
  });

  it('draws strategy overlays at 2r, market dots on a triangle and no circle for market', () => {
    const l = lay('component B [0.5, 0.5] (build)\ncomponent M [0.5, 0.5] (market)');
    expect(node(l, 'B').overlay).toEqual({ strategy: 'build', radius: 12 });
    const m = node(l, 'M');
    expect(m.glyph).toBe('none');
    expect(m.market!.radius).toBeCloseTo(4.2);
    const [top, left, right] = m.market!.dots;
    expect(top).toEqual({ x: 450, y: 300 - 7.2 });
    expect(left.x).toBeCloseTo(450 - 7.2 * Math.cos(Math.PI / 6));
    expect(left.y).toBeCloseTo(300 + 3.6);
    expect(right.x).toBeCloseTo(450 + 7.2 * Math.cos(Math.PI / 6));
  });

  it('draws the inertia bar r + 15 right of the node, r + 10 more with a strategy', () => {
    const l = lay('component A [0.5, 0.5] inertia\ncomponent B [0.5, 0.5] (buy) inertia');
    expect(node(l, 'A').inertia).toEqual({
      line: { from: { x: 471, y: 294 }, to: { x: 471, y: 306 } },
      width: 6,
    });
    expect(node(l, 'B').inertia!.line.from.x).toBe(450 + 21 + 16);
  });
});

describe('wardley layout: pipelines (:306-380)', () => {
  const src = 'component P [0.5, 0.5]\npipeline P {\n  component a [0.2]\n  component b [0.8]\n}';

  it('boxes the children ±15 about their line, 4r high, joins them by evolution', () => {
    const [p] = lay(src).pipelines;
    const ax = 48 + 0.2 * 804;
    const bx = 48 + 0.8 * 804;
    expect(p!.box).toEqual({ x: ax - 15, y: 300 - 12, width: bx - ax + 30, height: 24 });
    expect(p!.joins).toEqual([{ from: { x: ax, y: 300 }, to: { x: bx, y: 300 } }]);
  });

  it('moves the parent to the box’s centre x and 1/6 of its square above the box top', () => {
    const l = lay(src);
    const p = node(l, 'P');
    expect(p.glyph).toBe('square');
    expect(p.radius).toBeCloseTo(4.8);
    expect(p.point.x).toBeCloseTo(450);
    expect(p.point.y).toBeCloseTo(288 - 9.6 / 6);
    expect(node(l, 'P_a').point.y).toBe(300);
  });

  it('skips a link from a child to its own parent, without a warning', () => {
    const warnings: Warning[] = [];
    const l = lay(`${src}\na -> P\nP -> a`, {}, warnings);
    expect(l.links.map((k) => [k.source, k.target])).toEqual([['P', 'P_a']]);
    expect(warnings).toEqual([]);
  });

  it('starts a trend from a moved parent, its target on the original line', () => {
    const t = lay(`${src}\nevolve P 0.9`).trends[0]!;
    expect(t.from.x).toBeCloseTo(450);
    expect(t.from.y).toBeCloseTo(288 - 1.6);
    const target = { x: 48 + 0.9 * 804, y: 300 };
    const d = Math.hypot(target.x - t.from.x, target.y - t.from.y);
    expect(t.to.x).toBeCloseTo(target.x - ((target.x - t.from.x) / d) * 8);
  });
});

describe('wardley layout: links and trends (:382-582)', () => {
  it('shortens a link by r at each end, √2-reduced square at a parent', () => {
    const l = lay('component A [0.5, 0.2]\ncomponent B [0.5, 0.8]\nA -> B');
    const k = l.links[0]!;
    expect(k.from).toEqual({ x: 48 + 0.2 * 804 + 6, y: 300 });
    expect(k.to).toEqual({ x: 48 + 0.8 * 804 - 6, y: 300 });
    expect(k.heads).toEqual({});
    expect(k.dashed).toBe(false);
  });

  it('puts the flow heads at the ends: forward at the end, backward at the start', () => {
    const l = lay(
      'component A [0.5, 0.2]\ncomponent B [0.5, 0.8]\nA +> B\nA +< B\nA +<> B\nA -.-> B'
    );
    const [fwd, back, both, dashed] = l.links;
    expect(fwd!.heads.start).toBeUndefined();
    // Tip half a px past the end, base 4.5 before it, 5 wide.
    const end = fwd!.to;
    expect(fwd!.heads.end).toEqual([
      { x: end.x - 4.5, y: 302.5 },
      { x: end.x + 0.5, y: 300 },
      { x: end.x - 4.5, y: 297.5 },
    ]);
    expect(back!.heads.end).toBeUndefined();
    expect(back!.heads.start![1]).toEqual({ x: back!.from.x - 0.5, y: 300 });
    expect(Object.keys(both!.heads).sort()).toEqual(['end', 'start']);
    expect(dashed!.dashed).toBe(true);
  });

  it('puts a label 8 px off the midpoint, rotated with the line, flipped past ±90°', () => {
    const l = lay(
      'component A [0.5, 0.2]\ncomponent B [0.5, 0.8]\nA -> B ; ab\nB -> A ; ba\ncomponent C [0.2, 0.2]\nA -> C ; up'
    );
    const [ab, ba, up] = l.links.map((k) => k.label!);
    expect(ab).toMatchObject({ at: { x: 450, y: 292 }, rotate: 0, anchor: 'middle' });
    // v12 adds a half turn past ±90°: 180° becomes 360°.
    expect(ba).toMatchObject({ at: { x: 450, y: 308 }, rotate: 360 });
    expect(up!.rotate).toBeCloseTo(90);
    expect(l.links[0]!.label!.font.size).toBe(10);
  });

  it('drops self-links, links to unknown names and links between coincident nodes', () => {
    const warnings: Warning[] = [];
    const l = lay(
      'component A [0.5, 0.5]\ncomponent B [0.5, 0.5]\nA -> A\nA -> Z\nA -> B',
      {},
      warnings
    );
    expect(l.links).toEqual([]);
    // The parser's WARDLEY_LINK_DROPPED names all three; the layout adds none (D425).
    expect(warnings).toEqual([]);
  });

  it('raises WARDLEY_LINK_DROPPED for coincident ends only when the parser raised none', () => {
    const { model } = parseWardley(
      'wardley-beta\ncomponent A [0.5, 0.5]\ncomponent B [0.5, 0.5]\nA -> B\n'
    );
    expect(model.warnings.map((w) => w.code)).toEqual(['WARDLEY_LINK_DROPPED']);
    const warnings: Warning[] = [];
    layoutWardley(
      { ...model, warnings: [] },
      {
        config: {} as unknown as ResolvedConfig,
        measurer: tenPx,
        theme,
        warn: (w) => warnings.push(w),
      }
    );
    expect(warnings.map((w) => [w.code, w.astIds])).toEqual([
      ['WARDLEY_LINK_DROPPED', ['link:A->B']],
    ]);
  });

  it('draws a trend to its target on the same line, shortened by r + 2, with a 6 px head', () => {
    const t = lay('component A [0.5, 0.2]\nevolve A 0.8').trends[0]!;
    const tx = 48 + 0.8 * 804;
    expect(t.from).toEqual({ x: 48 + 0.2 * 804, y: 300 });
    expect(t.to).toEqual({ x: tx - 8, y: 300 });
    expect(t.head[1]).toEqual({ x: tx - 8 + 0.6, y: 300 });
    // Not shortened when the target is within r + 2.
    const near = lay('component A [0.5, 0.5]\nevolve A 0.505').trends[0]!;
    expect(near.to.x).toBeCloseTo(48 + 0.505 * 804);
    // A trend to its own evolution has no direction: the head points right, never NaN.
    expect(lay('component A [0.5, 0.5]\nevolve A 0.5').trends[0]!.head[1].x).toBeCloseTo(450.6);
  });
});

describe('wardley layout: annotations, notes, accelerators', () => {
  it('numbers each annotation in a circle of 10', () => {
    const [a] = lay('annotation 1, [0.5, 0.5] "x"').annotations;
    expect(a).toMatchObject({ number: 1, point: { x: 450, y: 300 }, radius: 10 });
    expect(a!.label).toMatchObject({ anchor: 'middle', baseline: 'central' });
    expect(a!.label.font).toMatchObject({ size: 10, weight: 700 });
  });

  it('boxes the texts by number only with annotations, clamped to the chart (:880-955)', () => {
    expect(lay('annotation 1, [0.5, 0.5] "x"').annotationsBox).toBeUndefined();
    const l = lay(
      'annotations [0.9, 0.95]\nannotation 2, [0.5, 0.5] "bb"\nannotation 1, [0.5, 0.5] "a"'
    );
    const box = l.annotationsBox!;
    // "2. bb" is 50 px; 50 + 20 + 105 wide, 2 · 16 + 20 + 13.2 / 2 high.
    expect(box.box.width).toBe(175);
    expect(box.box.height).toBeCloseTo(58.6);
    expect(box.box.x).toBe(852 - 175);
    expect(box.box.y).toBeCloseTo(48 + 0.1 * 504);
    expect(box.lines.map((t) => t.text)).toEqual(['1. a', '2. bb']);
    expect(box.lines[1]!.at).toEqual({ x: 677 + 10, y: box.box.y + 10 + 32 });
    expect(box.lines[0]!.font.size).toBe(11);
  });

  it('writes notes bold at 11 px from their point', () => {
    const [n] = lay('note "hi" [0.5, 0.5]').notes;
    expect(n!.label).toMatchObject({ at: { x: 450, y: 300 }, anchor: 'start', baseline: 'auto' });
    expect(n!.label.font).toMatchObject({ size: 11, weight: 700 });
  });

  it('draws accelerators right and deaccelerators left, 60 × 30, labelled 30 below', () => {
    const l = lay('accelerator Go [0.5, 0.5]\ndeaccelerator No [0.5, 0.5]');
    const [acc] = l.accelerators;
    expect(acc!.outline).toEqual([
      { x: 450, y: 285 },
      { x: 490, y: 285 },
      { x: 490, y: 277 },
      { x: 510, y: 300 },
      { x: 490, y: 323 },
      { x: 490, y: 315 },
      { x: 450, y: 315 },
    ]);
    expect(acc!.label).toMatchObject({ at: { x: 480, y: 330 }, anchor: 'middle' });
    expect(l.deaccelerators[0]!.outline[3]).toEqual({ x: 450, y: 300 });
    expect(l.deaccelerators[0]!.outline[0]).toEqual({ x: 510, y: 285 });
  });
});

describe('wardley layout: labels follow the label rule (#1368)', () => {
  /** Each line of a text as `text`, `*text*` (bold) or `_text_` (italic) runs. */
  const runs = (t: PlacedText): string[] =>
    t.label.lines.map((line) =>
      line
        .map((r) => {
          if (r.bold) return `*${r.text}*`;
          return r.italic ? `_${r.text}_` : r.text;
        })
        .join('')
    );

  // Every label kind, written the ways of the label fixture (`pr-check/label-syntax.mmd`).
  const SOURCE = [
    'title t **b** "`x`" `y`',
    'evolution "`**G**`" -> "s **b**" -> "s <b>b</b>" -> "s one\\ntwo"',
    'component "`c **b** _i_`" [0.9, 0.1]',
    "component 'q **b**' [0.8, 0.3]",
    'anchor "a <b>b</b><br>n H<sub>2</sub>O" [0.95, 0.6]',
    'component "c one\\ntwo" [0.5, 0.5]',
    'component "c a `code` b" [0.3, 0.7]',
    'component "#lt;b#gt;lit#lt;/b#gt; #92;n" [0.2, 0.2]',
    '"`c **b** _i_`" -> \'q **b**\' ; l `x` one\\ntwo',
    'pipeline "c one\\ntwo" {\n  component "`p **b**`" [0.6]\n}',
    'note "`n **b**`" [0.1, 0.9]',
    'annotations [0.05, 0.4]',
    'annotation 1, [0.5, 0.9] "`a **b**`"',
    'annotation 2, [0.6, 0.9] "a one\\ntwo"',
    'accelerator "x <i>i</i>" [0.4, 0.4]',
  ].join('\n');

  it('reads each label kind: markdown strings, plain text, tags, entities and \\n', () => {
    const l = lay(SOURCE);
    // The title keeps its text: a markdown string inside it is not the whole label.
    expect(runs(l.title!)).toEqual(['t **b** "`x`" `y`']);
    expect(l.stages.map((s) => runs(s.label))).toEqual([
      ['*G*'],
      ['s **b**'],
      ['s *b*'],
      ['s one', 'two'],
    ]);
    const label = (id: string) => runs(node(l, id).label);
    expect(label('`c **b** _i_`')).toEqual(['c *b* _i_']);
    // Single quotes make no markdown string; neither do bare backticks or a code span.
    expect(label('q **b**')).toEqual(['q **b**']);
    expect(label('c a `code` b')).toEqual(['c a `code` b']);
    expect(label('a <b>b</b><br>n H<sub>2</sub>O')).toEqual(['a *b*', 'n H2O']);
    expect(label('c one\ntwo')).toEqual(['c one', 'two']);
    // `#name;` codes are text: never a tag, never a written `\n`.
    const coded = l.nodes.find((n) => n.id.startsWith('<b>lit'))!.label;
    expect(runs(coded)).toEqual(['<b>lit</b> \\n']);
    expect(label('c one\ntwo_`p **b**`')).toEqual(['p *b*']);
    expect(runs(l.links[0]!.label!)).toEqual(['l `x` one', 'two']);
    expect(runs(l.notes[0]!.label)).toEqual(['n *b*']);
    expect(l.annotationsBox!.lines.map(runs)).toEqual([['1. a *b*'], ['2. a one', 'two']]);
    expect(runs(l.accelerators[0]!.label)).toEqual(['x _i_']);
  });

  // Every label kind, each written plain with an emphasis pair.
  const PLAIN = [
    'title t **b** _i_',
    'evolution "s **b** _i_" -> B -> C -> D',
    'anchor "a **b** _i_" [0.95, 0.6]',
    'component "c **b** _i_" [0.5, 0.5]',
    'component "d **b** _i_" [0.2, 0.2]',
    '"c **b** _i_" -> "d **b** _i_" ; l **b** _i_',
    'pipeline "c **b** _i_" {\n  component "p **b** _i_" [0.6]\n}',
    'note "n **b** _i_" [0.1, 0.9]',
    'annotations [0.05, 0.4]',
    'annotation 1, [0.5, 0.9] "a **b** _i_"',
    'accelerator "x **b** _i_" [0.4, 0.4]',
    'deaccelerator "y **b** _i_" [0.4, 0.7]',
  ].join('\n');

  /** Every label of a layout, as `runs`. */
  const everyLabel = (l: WardleyLayout): string[][] => [
    runs(l.title!),
    runs(l.stages[0]!.label),
    ...l.nodes.map((n) => runs(n.label)),
    ...l.links.map((k) => runs(k.label!)),
    ...l.notes.map((n) => runs(n.label)),
    ...l.annotationsBox!.lines.map(runs),
    ...[...l.accelerators, ...l.deaccelerators].map((a) => runs(a.label)),
  ];

  it('reads every label kind as markdown with markdownAlwaysOn, as written without it', () => {
    const always = everyLabel(lay(PLAIN, {}, [], { markdownAlwaysOn: true }));
    expect(always).toEqual([
      ['t *b* _i_'],
      ['s *b* _i_'],
      ['a *b* _i_'],
      ['c *b* _i_'],
      ['d *b* _i_'],
      ['p *b* _i_'],
      ['l *b* _i_'],
      ['n *b* _i_'],
      ['1. a *b* _i_'],
      ['x *b* _i_'],
      ['y *b* _i_'],
    ]);
    const plain = everyLabel(lay(PLAIN));
    expect(plain.flat().every((t) => t.endsWith('**b** _i_'))).toBe(true);
    // The fixed texts are no labels: the axis names stay plain.
    const l = lay(PLAIN, {}, [], { markdownAlwaysOn: true });
    expect([l.axes.xLabel.markup, l.annotations[0]!.label.markup]).toEqual(['plain', 'plain']);
  });

  it('reads markdown strings, tags, entities and \\n with markdownAlwaysOn as without it', () => {
    const always = lay(SOURCE, {}, [], { markdownAlwaysOn: true });
    const plain = lay(SOURCE);
    // A markdown string, a tag, an entity-coded tag and a written `\n` draw the same.
    for (const id of ['`c **b** _i_`', 'a <b>b</b><br>n H<sub>2</sub>O', 'c one\ntwo'])
      expect(runs(node(always, id).label)).toEqual(runs(node(plain, id).label));
    const coded = (l: WardleyLayout) => l.nodes.find((n) => n.id.startsWith('<b>lit'))!.label;
    expect(runs(coded(always))).toEqual(['<b>lit</b> \\n']);
    expect(runs(always.notes[0]!.label)).toEqual(runs(plain.notes[0]!.label));
    // Plain text is now markdown: the single-quoted name's pair and the code span.
    expect(runs(node(always, 'q **b**').label)).toEqual(['q *b*']);
  });

  it('warns once per label that holds markdown it does not read, never with markdownAlwaysOn', () => {
    const warned: Warning[] = [];
    lay(PLAIN, {}, warned);
    // Without `ctx.inline` (no API) the warning comes from each such label.
    expect(new Set(warned.map((w) => w.code))).toEqual(new Set([MARKDOWN_NOT_READ.code]));
    const none: Warning[] = [];
    lay(PLAIN, {}, none, { markdownAlwaysOn: true });
    lay('component "`c **b**`" [0.5, 0.5]\nnote "`n _i_`" [0.1, 0.1]\ntitle "`t **b**`"', {}, none);
    expect(none.filter((w) => w.code === MARKDOWN_NOT_READ.code)).toEqual([]);
  });

  it('keeps the first line where v12 drew its one line, the others below it', () => {
    const one = node(lay('component "ab" [0.5, 0.5]'), 'ab').label;
    const two = node(lay('component "ab\\ncd" [0.5, 0.5]'), 'ab\ncd').label;
    expect([two.x, two.y, two.at, two.width]).toEqual([one.x, one.y, one.at, one.width]);
    expect([one.height, two.height]).toEqual([12, 24]);
  });

  it('grows the annotations box by the further lines of an annotation', () => {
    const box = (text: string) =>
      lay(
        `annotations [0.5, 0.5]\nannotation 1, [0.1, 0.1] "${text}"\nannotation 2, [0.2, 0.2] "z"`
      ).annotationsBox!;
    const one = box('a');
    const two = box('a\\nb');
    const line = one.lines[0]!.label.lineHeight;
    expect(two.box.height - one.box.height).toBeCloseTo(line);
    expect(two.lines[1]!.y - one.lines[1]!.y).toBeCloseTo(line);
  });
});

describe('wardley layout: fonts', () => {
  it('measures every text in the theme’s font family (D422)', () => {
    const l = lay('title T\ncomponent A [0.5, 0.5]');
    const family = theme.value('fontFamily');
    for (const f of Object.values(l.fonts)) expect(f.family).toBe(family);
    expect(l.fonts.stage.size).toBe(10);
    expect(lay('', { axisFontSize: 1 }).fonts.stage.size).toBe(0);
  });
});
