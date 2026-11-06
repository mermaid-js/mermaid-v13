import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { Style, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type ThemeSpec } from '@mermaid-js/core/theme';
import type { CynefinModel } from '../model.ts';
import { cynefin as plugin } from '../plugin.ts';
import { FIXTURES, model } from './cynefin.fixtures.ts';
import { curveData, layoutCynefin, type CynefinLayout, type Point } from './index.ts';

let spec: ThemeSpec;
beforeAll(async () => {
  spec = await loadTheme('default');
});

// Round numbers, so positions are worked by hand from v12's cynefinRenderer.ts: every
// character is 10 px wide, the ascent is 0.8 of the size and a line 1.2 of it.
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
  m: CynefinModel,
  cynefin: Record<string, unknown> = {},
  idPrefix = 'mermaid-1',
  warnings: Warning[] = []
): CynefinLayout {
  return layoutCynefin(m, {
    config: { cynefin } as unknown as ResolvedConfig,
    measurer: tenPx,
    theme: createTheme(spec, { diagram: plugin.theme }),
    idPrefix,
    warn: (w) => warnings.push(w),
  });
}

const centre = (r: { x: number; y: number; width: number; height: number }): Point => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

describe('cynefin layout: the canvas (v12 cynefinRenderer.ts :40-50, :83-112, :158)', () => {
  it('tiles 800 × 600 with four quadrants, complex at the top left', () => {
    const l = lay(FIXTURES.empty!);
    expect(l.quadrants.map((q) => [q.name, q.x, q.y, q.width, q.height])).toEqual([
      ['complex', 0, 0, 400, 300],
      ['complicated', 400, 0, 400, 300],
      ['chaotic', 0, 300, 400, 300],
      ['clear', 400, 300, 400, 300],
    ]);
    expect(l.quadrants.map((q) => q.center)).toEqual([
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 200, y: 450 },
      { x: 600, y: 450 },
    ]);
    expect(l.confusion).toMatchObject({ center: { x: 400, y: 300 }, rx: 120, ry: 90 });
  });

  it('keeps v12’s viewBox when nothing leaves it: the canvas and the padding', () => {
    const l = lay(FIXTURES.five!);
    expect(l.offset).toEqual({ x: 40, y: 40 });
    expect(l.bounds).toEqual({ x: -40, y: -40, width: 880, height: 680 });
    expect(l.viewBox).toEqual({ x: 0, y: 0, width: 880, height: 680 });
  });

  it('marks declared domains with their block’s AST id; undeclared ones are drawn without', () => {
    const l = lay(FIXTURES.five!);
    expect(l.quadrants.map((q) => q.ast)).toEqual([
      'd:complex',
      'd:complicated',
      'd:chaotic',
      'd:clear',
    ]);
    expect(l.confusion.ast).toBe('d:confusion');
    const bare = lay(FIXTURES.bare!);
    expect(bare.quadrants.map((q) => q.ast)).toEqual([
      'd:complex',
      undefined,
      undefined,
      'd:clear',
    ]);
    expect(bare.confusion.ast).toBeUndefined();
  });
});

describe('cynefin layout: labels and subtitles (:168-225)', () => {
  it('puts a quadrant name 30 above its centre, its model and practice at −10 and +5', () => {
    const l = lay(FIXTURES.empty!);
    expect(l.labels.map((t) => [t.domain, t.text.lines[0]![0]!.text, centre(t)])).toEqual([
      ['complex', 'Complex', { x: 200, y: 120 }],
      ['complicated', 'Complicated', { x: 600, y: 120 }],
      ['chaotic', 'Chaotic', { x: 200, y: 420 }],
      ['clear', 'Clear', { x: 600, y: 420 }],
      ['confusion', 'Confusion', { x: 400, y: 290 }],
    ]);
    expect(l.subtitles.map((t) => [t.text.lines[0]![0]!.text, centre(t)])).toEqual([
      ['Probe → Sense → Respond', { x: 200, y: 140 }],
      ['Emergent Practices', { x: 200, y: 155 }],
      ['Sense → Analyse → Respond', { x: 600, y: 140 }],
      ['Good Practices', { x: 600, y: 155 }],
      ['Act → Sense → Respond', { x: 200, y: 440 }],
      ['Novel Practices', { x: 200, y: 455 }],
      ['Sense → Categorise → Respond', { x: 600, y: 440 }],
      ['Best Practices', { x: 600, y: 455 }],
      ['Disorder', { x: 400, y: 308 }],
    ]);
  });

  it('measures labels at domainFontSize bold, subtitles at itemFontSize − 1 (pitfall 16)', () => {
    const l = lay(FIXTURES.empty!);
    expect(l.fonts.label).toMatchObject({ size: 16, weight: 700, style: 'normal' });
    expect(l.fonts.subtitle).toMatchObject({ size: 11, weight: 400, style: 'italic' });
    expect(l.fonts.item).toMatchObject({ size: 12, weight: 400, style: 'normal' });
    expect(l.fonts.transition).toMatchObject({ size: 11, weight: 400, style: 'normal' });
    expect(l.fonts.title).toMatchObject({ size: 18, weight: 700, style: 'normal' });
    // The subtitles were measured italic: every run of theirs is.
    expect(l.subtitles[0]!.text.lines[0]!.every((r) => r.style === Style.Italic)).toBe(true);
    // "Complex": 7 characters at 10 px, one 19.2 px line.
    expect(l.labels[0]).toMatchObject({ x: 165, width: 70, height: 16 * 1.2 });
  });

  it('centres the names without descriptions, and draws no subtitles', () => {
    const l = lay(FIXTURES.bare!, { showDomainDescriptions: false });
    expect(l.labels.map(centre)).toEqual([
      { x: 200, y: 150 },
      { x: 600, y: 150 },
      { x: 200, y: 450 },
      { x: 600, y: 450 },
      { x: 400, y: 300 },
    ]);
    expect(l.subtitles).toEqual([]);
  });
});

describe('cynefin layout: item badges (:229-348)', () => {
  it('centres 26 px badges on the quadrant, 25 under its centre, stepping by 30', () => {
    const l = lay(FIXTURES.many!);
    const complex = l.items.filter((i) => i.domain === 'complex');
    // "New product discovery": 21 characters, 210 px, plus 10 each side.
    expect(complex.map((i) => [i.ast, i.x, i.y, i.width, i.height])).toEqual([
      ['i:complex/New product discovery', 200 - 115, 175, 230, 26],
      ['i:complex/User behavior analysis', 200 - 120, 205, 240, 26],
      ['i:complex/A/B testing strategy', 200 - 110, 235, 220, 26],
    ]);
    expect(centre(complex[0]!.label)).toEqual({ x: 200, y: 188 });
    expect(complex[0]!.radius).toBe(4);
  });

  it('draws quadrants in v12’s order, then confusion', () => {
    const l = lay(FIXTURES.five!);
    expect([...new Set(l.items.map((i) => i.domain))]).toEqual([
      'complex',
      'complicated',
      'chaotic',
      'clear',
      'confusion',
    ]);
  });

  it('starts quadrant items 15 under the centre, confusion items 14, without descriptions', () => {
    const l = lay(FIXTURES.five!, { showDomainDescriptions: false });
    expect(l.items.find((i) => i.domain === 'complex')!.y).toBe(165);
    expect(l.items.find((i) => i.domain === 'confusion')!.y).toBe(314);
  });

  it('shows three confusion items from 22 under the centre, then a +2 more badge', () => {
    const l = lay(FIXTURES.confusion!);
    expect(l.items.map((i) => [i.label.text.lines[0]![0]!.text, i.y])).toEqual([
      ['Unknown A', 322],
      ['Unknown B', 352],
      ['Unknown C', 382],
    ]);
    // "+2 more": 7 characters.
    expect(l.overflow).toMatchObject({ count: 2, x: 400 - 45, y: 412, width: 90, height: 26 });
    expect(l.overflow!.label.text.lines[0]![0]!.text).toBe('+2 more');
    expect(lay(FIXTURES.five!).overflow).toBeUndefined();
  });

  it('grows a badge by its extra lines (D363) and steps the next one past it', () => {
    const l = lay(FIXTURES.labels!);
    const [two, amp, md, empty] = l.items;
    // Two 14.4 px lines: 26 + 14.4.
    expect(two!.height).toBeCloseTo(40.4);
    expect(two!.label.text.lines.length).toBe(2);
    expect(amp!.y).toBeCloseTo(175 + 40.4 + 4);
    expect(amp!.label.text.lines[0]!.map((r) => r.text).join('')).toBe('Tom & Jerry');
    expect(md!.label.text.lines[0]!.map((r) => r.text).join('')).toBe('bold item');
    // An empty item is a badge of the padding alone.
    expect(empty).toMatchObject({ width: 20, height: 26 });
  });

  it('lets a twelfth item run past the canvas, and grows the bounds to cover it (D361)', () => {
    const l = lay(FIXTURES.crowded!);
    const chaotic = l.items.filter((i) => i.domain === 'chaotic');
    const last = chaotic[chaotic.length - 1]!;
    expect(last.y).toBe(475 + 11 * 30);
    expect(l.bounds.y + l.bounds.height).toBeCloseTo(last.y + 26 + 0.5);
    expect(l.viewBox.height).toBeCloseTo(l.bounds.height);
  });
});

describe('cynefin layout: transitions (:350-419)', () => {
  it('bends a curve from centre to centre by 0.15 of its length to the left', () => {
    const [t] = lay(FIXTURES.transitions!).transitions;
    expect(t).toMatchObject({
      from: 'complex',
      to: 'complicated',
      ast: 't:complex>complicated',
      start: { x: 200, y: 150 },
      end: { x: 600, y: 150 },
    });
    // len 400, left normal (0, 1): 60 below the midpoint.
    expect(t!.control).toEqual({ x: 400, y: 210 });
    // Baseline 6 above the control point, centred on it, at 11 px.
    const label = t!.label!;
    expect(label.x + label.width / 2).toBe(400);
    expect(label.y + label.text.baseline).toBeCloseTo(204);
    expect(label.width).toBe(180);
  });

  it('puts v12’s marker triangle at the end, along the end tangent, 12 px long', () => {
    const [t] = lay(FIXTURES.transitions!).transitions;
    const { end, control } = t!;
    const len = Math.hypot(end.x - control.x, end.y - control.y);
    const u = { x: (end.x - control.x) / len, y: (end.y - control.y) / len };
    const n = { x: -u.y, y: u.x };
    // markerWidth 6 × arrowWidth 2 over a 10 unit box: 1.2 px a unit; refX 9, refY 5.
    const at = (mx: number, my: number): Point => ({
      x: end.x + (mx - 9) * 1.2 * u.x + (my - 5) * 1.2 * n.x,
      y: end.y + (mx - 9) * 1.2 * u.y + (my - 5) * 1.2 * n.y,
    });
    const [a, tip, b] = t!.head;
    for (const [got, want] of [
      [a, at(0, 0)],
      [tip, at(10, 5)],
      [b, at(0, 10)],
    ] as const) {
      expect(got.x).toBeCloseTo(want.x);
      expect(got.y).toBeCloseTo(want.y);
    }
  });

  it('draws no label for none, keeps repeats on top of each other (D365)', () => {
    const l = lay(FIXTURES.repeats!);
    expect(l.transitions.map((t) => t.ast)).toEqual([
      't:complex>clear',
      't:complex>clear#2',
      't:complex>clear#3',
    ]);
    expect(l.transitions[2]!.label).toBeUndefined();
    expect(l.transitions[1]!.control).toEqual(l.transitions[0]!.control);
  });

  it('skips a self-loop that reaches the layout, as v12’s renderer does', () => {
    const l = lay(
      model(
        [],
        [
          ['complex', 'complex', 'x'],
          ['complex', 'clear'],
        ]
      )
    );
    expect(l.transitions.map((t) => t.ast)).toEqual(['t:complex>clear']);
  });
});

describe('cynefin layout: the title (:424-433)', () => {
  it('centres it half the padding above the canvas, at domainFontSize + 2 bold', () => {
    const l = lay(FIXTURES.transitions!);
    expect(centre(l.title!)).toEqual({ x: 400, y: -20 });
    expect(l.title!.width).toBe(230);
    expect(lay(FIXTURES.two!).title).toBeUndefined();
  });

  it('grows a title of several lines upwards, its last line where one would be', () => {
    const t = lay(FIXTURES.labels!).title!;
    expect(t.text.lines.length).toBe(2);
    expect(t.y + t.height - t.text.lineHeight / 2).toBeCloseTo(-20);
  });

  it('grows the bounds over a title wider than the canvas, or above it with little padding', () => {
    const wide = lay(FIXTURES.wide!);
    expect(wide.bounds.x).toBeLessThan(-40);
    expect(wide.bounds.x).toBeCloseTo(wide.title!.x);
    expect(wide.viewBox.x).toBeCloseTo(wide.bounds.x + 40);
    const tight = lay(FIXTURES.transitions!, { padding: 0 });
    // A 21.6 px line centred on y = 0.
    expect(tight.bounds.y).toBeCloseTo(-10.8);
  });
});

describe('cynefin layout: config (D366)', () => {
  it('reads width, height, padding and the amplitude', () => {
    const l = lay(FIXTURES.two!, { width: 1000, height: 700, padding: 10, boundaryAmplitude: 0 });
    expect([l.width, l.height, l.padding]).toEqual([1000, 700, 10]);
    expect(l.quadrants[3]).toMatchObject({ x: 500, y: 350, width: 500, height: 350 });
    expect(l.viewBox).toEqual({ x: 0, y: 0, width: 1020, height: 720 });
    expect(l.boundaries.fold.segments.every((s) => s.c1.x === 500 && s.to.x === 500)).toBe(true);
  });

  it('falls back on a bad width, height or padding, with one warning each', () => {
    const warnings: Warning[] = [];
    const l = lay(
      FIXTURES.two!,
      { width: -100, height: Number.NaN, padding: '12', showDomainDescriptions: true },
      'm',
      warnings
    );
    expect([l.width, l.height, l.padding]).toEqual([800, 600, 40]);
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      ['CYNEFIN_CONFIG_INVALID', 'cynefin.width'],
      ['CYNEFIN_CONFIG_INVALID', 'cynefin.height'],
      ['CYNEFIN_CONFIG_INVALID', 'cynefin.padding'],
    ]);
    expect(warnings[0]!.message).toBe(
      'cynefin.width is -100, not a number of 1 or more; using the default 800'
    );
  });

  it('falls back on a size whose canvas would overflow, one warning per key', () => {
    const warnings: Warning[] = [];
    const l = lay(
      FIXTURES.two!,
      { width: 1e308, height: 1e200, padding: Number.MAX_VALUE },
      'm',
      warnings
    );
    expect([l.width, l.height, l.padding]).toEqual([800, 1e200, 40]);
    expect(warnings.map((w) => w.path)).toEqual(['cynefin.width', 'cynefin.padding']);
    expect(warnings[0]!.message).toBe(
      'cynefin.width is 1e+308, not a number of 1 or more that keeps the canvas finite; using the default 800'
    );
  });

  it('clamps the amplitude to [0, 50] and counts a non-finite seed as 0', () => {
    const warnings: Warning[] = [];
    const high = lay(FIXTURES.two!, { boundaryAmplitude: 80, seed: Infinity }, 'p', warnings);
    expect(high.boundaries.fold).toEqual(
      lay(FIXTURES.two!, { boundaryAmplitude: 50 }, 'p').boundaries.fold
    );
    expect(warnings.map((w) => w.path)).toEqual(['cynefin.boundaryAmplitude', 'cynefin.seed']);
    expect(lay(FIXTURES.two!, { boundaryAmplitude: -1 }).boundaries.fold).toEqual(
      lay(FIXTURES.two!, { boundaryAmplitude: 0 }).boundaries.fold
    );
  });

  it('warns about nothing for the defaults or an absent section', () => {
    const warnings: Warning[] = [];
    lay(FIXTURES.two!, {}, 'm', warnings);
    lay(
      FIXTURES.two!,
      { width: 800, height: 600, padding: 0, boundaryAmplitude: 50, seed: -3 },
      'm',
      warnings
    );
    expect(warnings).toEqual([]);
  });
});

describe('cynefin layout: the seed (D362)', () => {
  it('draws a non-zero seed’s boundaries whatever the id prefix', () => {
    const a = lay(FIXTURES.seeded!, { seed: 42 }, 'a');
    const b = lay(FIXTURES.seeded!, { seed: 42 }, 'b');
    expect(a.seed).toBe(42);
    expect(curveData(a.boundaries.fold)).toBe(curveData(b.boundaries.fold));
  });

  it('hashes the id prefix for seed 0: the same per prefix, different between two', () => {
    const a = lay(FIXTURES.seeded!, {}, 'mermaid-a');
    const again = lay(FIXTURES.seeded!, { seed: 0 }, 'mermaid-a');
    const b = lay(FIXTURES.seeded!, {}, 'mermaid-b');
    // Java hashCode of "mermaid-a".
    expect(a.seed).toBe(1795733021);
    expect(again).toEqual(a);
    expect(b.seed).not.toBe(a.seed);
    expect(curveData(b.boundaries.fold)).not.toBe(curveData(a.boundaries.fold));
    expect(curveData(b.boundaries.horizon)).not.toBe(curveData(a.boundaries.horizon));
  });
});
