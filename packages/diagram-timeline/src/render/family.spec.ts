import { describe, expect, it } from 'vitest';
import * as fx from '../layout/fixtures.ts';
import type { TimelineBox } from '../layout/index.ts';
import type { TimelineModel } from '../model.ts';
import { elementsOf, type Element } from './properties.fixtures.ts';
import { renderForTest } from './testing.fixtures.ts';

/**
 * What each theme family draws (spec #291 "v12 family differences", D227, D257), read off the
 * SVG. Expected colours are v12 12.2.0's (`01-v12-timeline.md` §6): default `cScale0`
 * hsl(240 100% 76.27%) is #8686ff, `cScaleInv0` hsl(60 100% 86.27%) is #ffffb9.
 */
async function draw(model: TimelineModel, config: Record<string, unknown>) {
  const r = await renderForTest(model, { config });
  const els = elementsOf(r.svg).elements;
  // The group of the box `ast` (sections carry their id on the node group itself).
  const node = (ast: string): Element[] => {
    const i = els.findIndex(
      (e) => e.attrs.class?.startsWith('timeline-node') && e.attrs['data-id'] === ast
    );
    const out: Element[] = [];
    for (let k = i + 1; k < els.length && !els[k]!.attrs.class?.startsWith('timeline-node'); k++) {
      if (els[k]!.attrs['data-id'] !== undefined && els[k]!.tag !== 'text') break;
      out.push(els[k]!);
    }
    return [els[i]!, ...out];
  };
  const part = (ast: string, tag: string) => node(ast).find((e) => e.tag === tag);
  return { r, els, node, part };
}

describe('classic themes (v12 genSections, svgDraw.js)', () => {
  it('fills boxes from cScale, text from cScaleLabel, a 3 px cScaleInv rule, no outline', async () => {
    const d = await draw(fx.sections, { theme: 'default' });
    expect(d.node('sec:1')[0]!.attrs.class).toBe('timeline-node section--1');
    const path = d.part('sec:1', 'path')!;
    expect(path.attrs).toMatchObject({ class: 'node-bkg', fill: '#8686ff' });
    expect(path.attrs.stroke).toBeUndefined();
    expect(path.attrs.filter).toBeUndefined();
    expect(d.part('sec:1', 'line')!.attrs).toMatchObject({
      class: 'node-line--1',
      stroke: '#ffffb9',
      'stroke-width': '3',
    });
    expect(d.part('sec:1', 'text')!.attrs.fill).toBe('#ffffff');
    expect(d.part('sec:1', 'text')!.attrs['font-weight']).toBeUndefined();
  });

  it('rounds the top corners by 5 and keeps the bottom square', async () => {
    const d = await draw(fx.simple, { theme: 'forest' });
    const b = d.r.layout.periods[0]!;
    const path = d.part('per:1', 'path')!.attrs.d!;
    expect(path).toBe(
      `M${b.x},${+(b.y + b.height).toFixed(2)}L${b.x},${b.y + 5}Q${b.x},${b.y} ${b.x + 5},${b.y}` +
        `L${b.x + b.width - 5},${b.y}Q${b.x + b.width},${b.y} ${b.x + b.width},${b.y + 5}` +
        `L${b.x + b.width},${+(b.y + b.height).toFixed(2)}Z`
    );
  });

  it('draws the axis at 4 px and the connectors at 2 px, dashed, in cScaleLabel11', async () => {
    const d = await draw(fx.simple, {
      theme: 'default',
      themeVariables: { cScaleLabel11: '#123456' },
    });
    const lines = d.els.filter((e) => e.tag === 'line' && !e.attrs.class);
    const axis = lines.at(-1)!;
    expect(axis.attrs).toMatchObject({ stroke: '#123456', 'stroke-width': '4' });
    expect(axis.attrs['stroke-dasharray']).toBeUndefined();
    for (const c of lines.slice(0, -1))
      expect(c.attrs).toMatchObject({
        stroke: '#123456',
        'stroke-width': '2',
        'stroke-dasharray': '5, 5',
      });
  });

  it('places a label half its padding below the top, its first line centred 1em lower', async () => {
    const d = await draw(fx.simple, { theme: 'default' });
    const b = d.r.layout.periods[0]!;
    const text = d.part('per:1', 'text')!;
    // One line at 16 px: the line box centre is 20 / 2 + 16 below the top.
    const lineHeight = b.label.lineHeight;
    expect(Number(text.attrs.y)).toBeCloseTo(b.y + 10 + 16 - lineHeight / 2 + b.label.baseline, 1);
  });
});

describe('redux themes (v12 genReduxSections)', () => {
  it('draws square boxes in mainBkg with a nodeBorder outline at strokeWidth and the shadow', async () => {
    const d = await draw(fx.sections, { theme: 'redux' });
    const path = d.part('per:1', 'path')!;
    expect(path.attrs.d).not.toContain('Q');
    expect(path.attrs).toMatchObject({
      fill: 'var(--_mb)',
      stroke: 'var(--_nb)',
      'stroke-width': 'var(--_sw)',
      filter: 'var(--_ds)',
    });
    expect(d.part('per:1', 'line')).toBeUndefined();
    expect(d.part('per:1', 'text')!.attrs).toMatchObject({
      fill: 'var(--_nb)',
      'font-weight': '600',
    });
    expect(d.r.svg).toContain(
      '--_ds:var(--mermaid-dropShadow,drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06)))'
    );
  });

  it('draws the axis and connectors in nodeBorder at strokeWidth', async () => {
    const d = await draw(fx.simple, { theme: 'redux-dark' });
    for (const l of d.els.filter((e) => e.tag === 'line'))
      expect(l.attrs).toMatchObject({ stroke: 'var(--_nb)', 'stroke-width': '2' });
  });

  it('places a period label its whole padding below the top, an event label half plus 3', async () => {
    const d = await draw(fx.simple, { theme: 'redux' });
    const p = d.r.layout.periods[1]!;
    const e = p.events[0]!;
    const centre = (b: TimelineBox, off: number) =>
      b.y + off + 14 - b.label.lineHeight / 2 + b.label.baseline;
    expect(Number(d.part(p.ast, 'text')!.attrs.y)).toBeCloseTo(centre(p, 20), 1);
    expect(Number(d.part(e.ast, 'text')!.attrs.y)).toBeCloseTo(centre(e, 13), 1);
  });

  it('fills redux-color boxes with the border palette slot, stamped with data-color-id (D257)', async () => {
    const d = await draw(fx.sections, { theme: 'redux-color' });
    const [g, path] = d.node('sec:2');
    expect(g!.attrs['data-color-id']).toBe('color-1');
    expect(path!.attrs.fill).toBe(path!.attrs.stroke);
    expect(path!.attrs.fill).toMatch(/^#/);
  });

  it('keeps mainBkg in redux-dark-color, whose fill palette is empty, with the slot outline', async () => {
    const d = await draw(fx.sections, { theme: 'redux-dark-color' });
    const path = d.part('sec:2', 'path')!;
    expect(path.attrs.fill).toBe('var(--_mb)');
    expect(path.attrs.stroke).toMatch(/^#/);
  });

  it('turns per-slot colour on in any redux theme that is given a border palette', async () => {
    const d = await draw(fx.sections, {
      theme: 'redux',
      themeVariables: { borderColorArray: ['#ff0000', '#00ff00'] },
    });
    expect(d.part('sec:2', 'path')!.attrs.stroke).toBe('#00ff00');
  });
});

describe('neo themes (D227: classic geometry, gradient outlines, mainBkg fill)', () => {
  it('keeps the rounded corners and the rule, fills mainBkg and outlines with the gradient', async () => {
    const d = await draw(fx.simple, { theme: 'neo' });
    expect(d.r.svg).toMatch(/^<svg [^>]*><defs><linearGradient id="mermaid-0-gradient"/);
    const path = d.part('per:1', 'path')!;
    expect(path.attrs.d).toContain('Q');
    expect(path.attrs).toMatchObject({
      fill: 'var(--_mb)',
      stroke: 'url(#mermaid-0-gradient)',
      'stroke-width': '2',
    });
    expect(path.attrs.filter).toBeUndefined();
    // A zero-height line can't take the gradient: the rule is plain (D185).
    expect(d.part('per:1', 'line')!.attrs).toMatchObject({
      stroke: 'var(--_nb)',
      'stroke-width': '2',
    });
  });

  it('draws classic boxes plain when the gradient is turned off', async () => {
    const d = await draw(fx.simple, { theme: 'neo-dark', themeVariables: { useGradient: false } });
    expect(d.r.svg).not.toContain('<defs>');
    const path = d.part('per:1', 'path')!;
    expect(path.attrs.fill).toMatch(/^#/);
    expect(path.attrs.stroke).toBeUndefined();
  });
});

describe('events (v12 .eventWrapper { filter: brightness(120%) })', () => {
  it('computes 120% brightness into the event colours', async () => {
    const d = await draw(fx.simple, { theme: 'default' });
    // #8686ff × 1.2 = #a1a1ff; #ffffb9 × 1.2 stays #ffffde.
    expect(d.part('ev:1.1', 'path')!.attrs.fill).toBe('#a1a1ff');
    expect(d.part('ev:1.1', 'line')!.attrs.stroke).toBe('#ffffde');
    expect(d.r.svg).not.toContain('brightness');
  });

  it('brightens theme variables too, but keeps them live under theme auto', async () => {
    const redux = await draw(fx.simple, { theme: 'redux', themeVariables: { mainBkg: '#808080' } });
    expect(redux.part('ev:1.1', 'path')!.attrs.fill).toBe('#9a9a9a');
    // Without the border palette, so the fill is mainBkg, a colour that switches with the page.
    // The plain outline brightens with the rest of the group (#404040 × 1.2 = #4d4d4d).
    const outlined = await draw(fx.simple, {
      theme: 'redux',
      themeVariables: { nodeBorder: '#404040' },
    });
    expect(outlined.part('ev:1.1', 'path')!.attrs.stroke).toBe('#4d4d4d');
    expect(outlined.part('per:1', 'path')!.attrs.stroke).toBe('var(--_nb)');
    // A gradient outline is not brightened.
    const grad = await draw(fx.simple, { theme: 'redux', themeVariables: { useGradient: true } });
    expect(grad.part('ev:1.1', 'path')!.attrs.stroke).toBe('url(#mermaid-0-gradient)');
    const auto = await draw(fx.simple, {
      theme: 'auto',
      themeVariables: { borderColorArray: [], bkgColorArray: [] },
    });
    expect(auto.part('ev:1.1', 'path')!.attrs.fill).toBe('var(--_mb)');
  });
});

describe('slots and classes', () => {
  it('numbers classes section-<slot mod 12 − 1>, as v12 does', async () => {
    const many = fx.timeline(Array.from({ length: 14 }, (_, i) => [`${2000 + i}`] as const));
    const d = await draw(many, { theme: 'default' });
    const classes = d.els
      .filter((e) => e.attrs.class?.startsWith('timeline-node'))
      .map((e) => e.attrs.class);
    expect(classes[0]).toBe('timeline-node section--1');
    expect(classes[11]).toBe('timeline-node section-10');
    expect(classes[12]).toBe('timeline-node section--1');
  });

  it('gives boxes that share a section-<n> class one colour, past slot 11', async () => {
    const many = fx.timeline(Array.from({ length: 14 }, (_, i) => [`${2000 + i}`] as const));
    const five = ['#110000', '#220000', '#330000', '#440000', '#550000'];
    const classic = await draw(many, { theme: 'default', themeVariables: { cScale: five } });
    // Slot 12 is class section--1 like slot 0: (12 mod 12) mod 5 = 0, not 12 mod 5 = 2.
    expect(classic.part('per:13', 'path')!.attrs.fill).toBe(
      classic.part('per:1', 'path')!.attrs.fill
    );
    const redux = await draw(many, {
      theme: 'redux-color',
      themeVariables: { borderColorArray: five, bkgColorArray: five },
    });
    const [g12, p12] = redux.node('per:13');
    const [g0, p0] = redux.node('per:1');
    expect(g12!.attrs['data-color-id']).toBe(g0!.attrs['data-color-id']);
    expect(p12!.attrs.fill).toBe(p0!.attrs.fill);
  });

  it('paints every period in slot 0 under disableMulticolor', async () => {
    const d = await draw(fx.seven, { theme: 'default', timeline: { disableMulticolor: true } });
    const fills = new Set(fx.seven.periods.map((p) => d.part(p.ast, 'path')!.attrs.fill));
    expect(fills).toEqual(new Set(['#8686ff']));
  });

  it('follows cScale<n> and cScaleLabel<n> overrides (D258)', async () => {
    const d = await draw(fx.sections, {
      theme: 'default',
      themeVariables: { cScale1: '#ff0000', cScaleLabel1: '#00ff00', cScaleInv1: '#0000ff' },
    });
    expect(d.part('sec:2', 'path')!.attrs.fill).toBe('#ff0000');
    expect(d.part('sec:2', 'text')!.attrs.fill).toBe('#00ff00');
    expect(d.part('sec:2', 'line')!.attrs.stroke).toBe('#0000ff');
  });
});

describe('labels are plain text (v12 .text(), D225 line breaks only)', () => {
  it('shows markup literally in sections, periods, events and the title; <br> still breaks', async () => {
    const m = fx.timeline(['a <b>bold</b> c', ['a <i>it</i> c<br>next', 'a <u>u</u> &amp; c']], {
      title: 'T <b>x</b>',
    });
    const d = await draw(m, { theme: 'default' });
    const text = (ast: string) =>
      new RegExp(`<text data-id="${ast}"[^>]*>(.*?)</text>`).exec(d.r.svg)![1]!;
    expect(text('sec:1')).toBe('a &lt;b&gt;bold&lt;/b&gt; c');
    expect(text('per:1')).toMatch(/>a &lt;i&gt;it&lt;\/i&gt; c<\/tspan><tspan[^>]*>next<\/tspan>$/);
    expect(text('ev:1.1')).toBe('a &lt;u&gt;u&lt;/u&gt; &amp; c');
    expect(d.r.svg).toMatch(/class="timeline-title"[^>]*>T &lt;b&gt;x&lt;\/b&gt;<\/text>/);
    expect(d.r.svg).not.toMatch(/font-weight="bold"|font-style|text-decoration/);
  });
});

describe('structure', () => {
  it('wraps periods, events and lines in v12 classes, with labels and connectors data-id only', async () => {
    const d = await draw(fx.simple, { theme: 'default' });
    const wrapper = d.els.find((e) => e.attrs['data-ast'] === 'per:1')!;
    expect(wrapper.attrs.class).toBe('taskWrapper');
    expect(d.els.find((e) => e.attrs['data-ast'] === 'ev:1.1')!.attrs.class).toBe('eventWrapper');
    const connector = d.els.find(
      (e) => e.attrs.class === 'lineWrapper' && e.attrs['data-id'] === 'per:1'
    )!;
    expect(connector.attrs['data-ast']).toBeUndefined();
    for (const t of d.els.filter((e) => e.tag === 'text'))
      expect(t.attrs['data-ast']).toBeUndefined();
  });

  it('draws arrowheads as filled paths in TD as in LR (D253)', async () => {
    for (const m of [fx.verticalSimple, fx.simple]) {
      const d = await draw(m, { theme: 'default' });
      const heads = d.els.filter((e) => e.attrs.class === 'arrowhead');
      expect(heads.length).toBe(d.r.layout.connectors.length + 1);
      const { left, tip } = d.r.layout.axis.arrow;
      const n = (v: number) => +v.toFixed(2);
      expect(d.r.svg).toContain(`M${n(left.x)},${n(left.y)}L${n(tip.x)},${n(tip.y)}`);
    }
  });

  it('draws the TD axis first and the LR axis last', async () => {
    const td = await draw(fx.verticalSimple, { theme: 'default' });
    expect(td.els[1]!.attrs.class).toBe('lineWrapper');
    const lr = await draw(fx.simple, { theme: 'default' });
    expect(lr.els.at(-3)!.attrs).toEqual({ class: 'lineWrapper' });
  });

  it('draws the title bold at 4ex in textColor, left-aligned where the layout put it (D218, D254)', async () => {
    const d = await draw(fx.simple, { theme: 'default' });
    const t = d.els.find((e) => e.attrs.class === 'timeline-title')!;
    expect(t.attrs).toMatchObject({
      fill: 'var(--_tx)',
      'font-size': '32',
      'font-weight': '700',
      'text-anchor': 'start',
      x: String(d.r.layout.title!.x),
    });
  });

  it('writes accTitle and accDescr as <title> and <desc> (R-A11Y-1)', async () => {
    const d = await draw(
      { ...fx.simple, accTitle: 'Social media', accDescr: 'When each one began' },
      {}
    );
    expect(d.r.svg).toMatch(/aria-labelledby="mermaid-0-title" aria-describedby="mermaid-0-desc"/);
    expect(d.r.svg).toContain('<title id="mermaid-0-title">Social media</title>');
    expect(d.r.svg).toContain('<desc id="mermaid-0-desc">When each one began</desc>');
  });

  it('sizes the root to 100% with a max-width, or to the drawing when useMaxWidth is off', async () => {
    const on = await draw(fx.simple, {});
    const w = Math.ceil(on.r.layout.bounds.width);
    expect(on.els[0]!.attrs.width).toBe('100%');
    expect(on.els[0]!.attrs.style).toContain(`max-width:${w}px`);
    const off = await draw(fx.simple, { timeline: { useMaxWidth: false } });
    expect(off.els[0]!.attrs).toMatchObject({
      width: String(w),
      height: String(Math.ceil(off.r.layout.bounds.height)),
    });
  });
});
