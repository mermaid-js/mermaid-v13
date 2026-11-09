import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { ishikawaTestConfig, ishikawaTestContext, ishikawaTestTheme } from '../test-context.ts';
import { layoutIshikawa } from './layout.ts';
import { fixture, roundMeasurer } from './mmd.fixtures.ts';
import type { IshikawaLayout } from './types.ts';

/**
 * v12's formulas (`ishikawaRenderer.ts`, spec #519 §Layout) on worked examples: the expected
 * numbers are computed by hand from the spec's formulas with {@link roundMeasurer}'s sizes
 * (8 px a character, 20 px a line) in the classic `default` theme (`fontSize` 16), so
 * `cos 82° = 0.139173`, `sin 82° = 0.990268`.
 */
let classic: Theme;
beforeAll(async () => {
  classic = await ishikawaTestTheme(ishikawaTestConfig(undefined, { theme: 'default' }));
});

/** The layout of the fixture at `path`, with its front-matter config, at v12's sizes. */
function laid(path: string, theme: Theme = classic): IshikawaLayout {
  const { model, config } = fixture(path);
  return layoutIshikawa(model, ishikawaTestContext(theme, config, [], roundMeasurer));
}

const PR = 'pr-check';
const NIGHTLY = 'nightly-check';

/** A label's lines as text. */
const linesOf = (label: { text: { lines: readonly { text: string }[][] } }): string[] =>
  label.text.lines.map((l) =>
    l
      .map((r) => r.text)
      .join('')
      .trim()
  );

let neo: Theme;
beforeAll(async () => {
  neo = await ishikawaTestTheme(ishikawaTestConfig(undefined, { theme: 'neo' }));
});

describe('ishikawa layout: one leaf cause (worked example)', () => {
  it('puts the head at (0, 250) facing right, sized by its label', () => {
    const { head, spine } = laid(`${PR}/4-should-render-with-a-single-cause`);
    // "Problem": 56 × 20 at 14 px 600. w = max(60, 56 + 6) = 62, h = max(40, 2 · 20 + 40) = 80.
    expect(head).toMatchObject({ x: 0, y: 250, width: 62, height: 80 });
    expect(head!.top).toEqual({ x: 0, y: 210 });
    expect(head!.bottom).toEqual({ x: 0, y: 290 });
    expect(head!.control.x).toBeCloseTo(148.8, 9);
    expect(head!.control.y).toBe(250);
    // Centred 3 px right of the middle of w: x = (62 − 56) / 2 + 3.
    expect(head!.label).toMatchObject({ x: 6, y: 240, width: 56, height: 20 });
    expect(spine!.y1).toBe(250);
    expect(spine!.x2).toBe(0);
  });

  it('draws a leaf cause at 0.2 of its 250 px side, its label 11 px past the end', () => {
    const { pairs, spine } = laid(`${PR}/4-should-render-with-a-single-cause`);
    expect(pairs).toHaveLength(1);
    const [cause] = pairs[0]!.causes;
    expect(cause!.side).toBe('upper');
    // Start (−20, 250); 50 px at 82°: (−20 − 6.958655, 250 − 49.513403).
    expect(cause!.bone.x1).toBe(-20);
    expect(cause!.bone.y1).toBe(250);
    expect(cause!.bone.x2).toBeCloseTo(-26.958655, 5);
    expect(cause!.bone.y2).toBeCloseTo(200.486597, 5);
    // "Cause A", 56 × 20, centred on (end x, end y − 11).
    expect(cause!.label.anchor.x).toBeCloseTo(-26.958655, 5);
    expect(cause!.label.anchor.y).toBeCloseTo(189.486597, 5);
    expect(cause!.label.x).toBeCloseTo(-54.958655, 5);
    expect(cause!.label.y).toBeCloseTo(179.486597, 5);
    // Box: text ± 20 in x, ± 2 in y.
    expect(cause!.box.x).toBeCloseTo(-74.958655, 5);
    expect(cause!.box.y).toBeCloseTo(177.486597, 5);
    expect(cause!.box.width).toBe(96);
    expect(cause!.box.height).toBe(24);
    // The spine runs from the pair's leftmost text x to the head.
    expect(spine!.x1).toBeCloseTo(-54.958655, 5);
  });
});

describe('ishikawa layout: sub-causes (worked examples)', () => {
  it('gives two causes with one sub-cause each the 500 px pool split evenly', () => {
    const { pairs, sides, spineY, spine } = laid(`${PR}/1-should-render-a-simple-ishikawa-diagram`);
    expect(sides).toEqual({ upper: 250, lower: 250 });
    expect(spineY).toBe(250);
    const [process, user] = pairs[0]!.causes;
    // A cause with children takes its full side: 250 px at 82°.
    expect(process!.bone.x2).toBeCloseTo(-54.793275, 5);
    expect(process!.bone.y2).toBeCloseTo(2.432983, 5);
    expect(user!.side).toBe('lower');
    expect(user!.bone.y2).toBeCloseTo(497.567017, 5);
    // One slot, halfway along the bone; a leaf's horizontal bone is 30 px, its label end-anchored.
    const [focus] = process!.subCauses;
    expect(focus).toMatchObject({ depth: 2, kind: 'align', slot: 0, parent: process!.ast });
    expect(focus!.bone.x1).toBeCloseTo(-37.396638, 5);
    expect(focus!.bone.y1).toBeCloseTo(126.216491, 5);
    expect(focus!.bone.x2).toBeCloseTo(-67.396638, 5);
    expect(focus!.bone.y2).toBeCloseTo(126.216491, 5);
    expect(focus!.label.x).toBeCloseTo(-67.396638 - 96, 5);
    expect(focus!.label.y).toBeCloseTo(126.216491 - 10, 5);
    expect(user!.subCauses[0]!.bone.y1).toBeCloseTo(373.783509, 5);
    // The spine starts at the leftmost text: "Out of focus" (96 px).
    expect(spine!.x1).toBeCloseTo(-163.396638, 5);
  });

  it("spreads a cause's descendants over its bone in flattenTree order, diagonals at odd depths", () => {
    const { pairs, sides, spineY, spine } = laid(`${PR}/3-should-render-with-deeply-nested-causes`);
    // Descendants 5 above and 2 below: 500 × 5/7 and 500 × 2/7.
    expect(sides.upper).toBeCloseTo(357.142857, 5);
    expect(sides.lower).toBeCloseTo(142.857143, 5);
    expect(spineY).toBeCloseTo(357.142857, 5);
    const [hardware, software] = pairs[0]!.causes;
    // The upper side reverses each sibling list; even depths pre-order, odd post-order.
    expect(hardware!.subCauses.map((s) => [linesOf(s.label).join(' '), s.slot])).toEqual([
      ['Memory', 0],
      ['Leak detected', 1],
      ['Disk', 2],
      ['Full capacity', 3],
      ['Bad sectors', 4],
    ]);
    const [memory, leak, disk, full, bad] = hardware!.subCauses;
    // Slots at startY + dy × (slot + 1) / 6; a horizontal bone with k children is 60 + 5k.
    expect(memory!.bone.y1).toBeCloseTo(298.198329, 5);
    expect(memory!.bone.x1).toBeCloseTo(-28.284113, 5);
    expect(memory!.bone.x2).toBeCloseTo(-93.284113, 5);
    expect(disk!.bone.x1).toBeCloseTo(-44.852339, 5);
    expect(disk!.bone.x2).toBeCloseTo(-114.852339, 5);
    // A diagonal starts at (k̄ / (n + 1)) along its parent and runs at 82° to its slot.
    expect(leak).toMatchObject({ depth: 3, kind: 'up', parent: memory!.ast });
    expect(leak!.bone.x1).toBeCloseTo(-60.784113, 5);
    expect(leak!.bone.y1).toBeCloseTo(298.198329, 5);
    expect(leak!.bone.x2).toBeCloseTo(-69.068226, 5);
    expect(leak!.bone.y2).toBeCloseTo(239.253801, 5);
    expect(full!.bone.x1).toBeCloseTo(-91.519006, 5);
    expect(full!.bone.x2).toBeCloseTo(-99.803119, 5);
    expect(full!.bone.y2).toBeCloseTo(121.364746, 5);
    expect(bad!.bone.x1).toBeCloseTo(-68.185673, 5);
    expect(bad!.bone.x2).toBeCloseTo(-84.753899, 5);
    expect(bad!.bone.y2).toBeCloseTo(62.420218, 5);
    // `up`: the baseline (16 px down the line) on the slot; `down`: hanging from it.
    expect(leak!.label.y).toBeCloseTo(239.253801 - 16, 5);
    expect(leak!.label.x).toBeCloseTo(-69.068226 - 104, 5);
    const race = software!.subCauses[1]!;
    expect(race.kind).toBe('down');
    expect(race.label.y).toBeCloseTo(race.bone.y2, 9);
    // The spine starts at "Full capacity", the leftmost text of the pair.
    expect(spine!.x1).toBeCloseTo(-203.803119, 5);
  });
});

describe('ishikawa layout: side lengths', () => {
  it('keeps both sides at 250 when every cause is a leaf', () => {
    expect(laid(`${PR}/4-should-render-with-a-single-cause`).sides).toEqual({
      upper: 250,
      lower: 250,
    });
  });

  it('gives a side with no descendants the 75 px minimum, and the spine the upper side', () => {
    const { sides, spineY, pairs } = laid(`${NIGHTLY}/baseline-clamp`);
    expect(sides).toEqual({ upper: 500, lower: 75 });
    expect(spineY).toBe(500);
    // Generator, a lower leaf: 0.2 × 75 = 15 px.
    const generator = pairs[0]!.causes[1]!;
    expect(generator.bone.x2 - generator.bone.x1).toBeCloseTo(-2.087597, 5);
    expect(generator.bone.y2 - generator.bone.y1).toBeCloseTo(14.854021, 5);
    // The second pair starts at the first pair's leftmost text x.
    const firstLeft = Math.min(
      ...pairs[0]!.causes.flatMap((c) => [c.label.x, ...c.subCauses.map((s) => s.label.x)])
    );
    expect(pairs[1]!.x).toBe(firstLeft);
  });

  it('makes a side at least max descendants × 2 × fontSize long', () => {
    expect(laid(`${NIGHTLY}/layout/slot-minimum`).sides).toEqual({ upper: 320, lower: 320 });
    expect(laid(`${NIGHTLY}/layout/slot-minimum`, neo).sides).toEqual({ upper: 280, lower: 280 });
  });
});

describe('ishikawa layout: text (D493, D495)', () => {
  it("measures the head at 14 px 600 and the rest at the theme's fontSize", () => {
    expect(laid(`${PR}/4-should-render-with-a-single-cause`).fonts).toMatchObject({
      head: { size: 14, weight: 600 },
      label: { size: 16, weight: 400 },
    });
    expect(laid(`${PR}/4-should-render-with-a-single-cause`, neo).fonts).toMatchObject({
      head: { size: 14, weight: 600 },
      label: { size: 14, weight: 400 },
    });
  });

  it('wraps the effect at 110 × 14/16 px and sub-causes at 144 × fontSize/16 px; causes at <br> only', () => {
    const { head, pairs } = laid(`${NIGHTLY}/long-labels`);
    // 96.25 px: 12 characters of 8 px.
    expect(linesOf(head!.label)).toEqual([
      'Customer',
      'satisfaction',
      'scores',
      'dropping',
      'across every',
      'region this',
      'quarter',
    ]);
    const [delivery, product] = pairs[0]!.causes;
    expect(linesOf(delivery!.label)).toEqual(['Delivery and logistics partners']);
    // A word wider than the width stays whole.
    expect(linesOf(delivery!.subCauses.find((s) => s.label.width === 272)!.label)).toEqual([
      'Supercalifragilisticexpialidocious',
    ]);
    // 144 px: 18 characters.
    expect(linesOf(product!.subCauses[0]!.label)).toEqual([
      'Packaging damaged',
      'in transit more',
      'often than before',
    ]);
    // neo's 14 px: 126 px, 15 characters.
    const narrow = laid(`${NIGHTLY}/long-labels`, neo).pairs[0]!.causes[1]!.subCauses[0]!;
    expect(linesOf(narrow.label)).toEqual([
      'Packaging',
      'damaged in',
      'transit more',
      'often than',
      'before',
    ]);
  });

  it('wraps the effect by the size it is drawn at, the same in every theme', () => {
    // "Coffee tastes" is 104 px: past 96.25 (v12's 11 characters at 14 px) in every theme, though
    // within 110 × 16/16 (classic's fontSize scale).
    for (const theme of [classic, neo]) {
      expect(linesOf(laid(`${NIGHTLY}/line-breaks-in-labels`, theme).head!.label)).toEqual([
        'Coffee',
        'tastes',
        'bitter',
      ]);
    }
  });

  it('breaks labels at <br> and grows the head by its lines', () => {
    const { head, pairs } = laid(`${NIGHTLY}/line-breaks-in-labels`);
    // h = max(40, 2 × 60 + 40).
    expect(head!.height).toBe(160);
    const beans = pairs[0]!.causes[0]!;
    expect(linesOf(beans.label)).toEqual(['Beans', 'and roast']);
    expect(beans.box.height).toBe(44);
  });
});

describe('ishikawa layout: arrowheads', () => {
  it("draws v12's marker as a triangle at each bone's start: 12 px on causes, 6 px on sub-causes", () => {
    const cause = laid(`${PR}/4-should-render-with-a-single-cause`).pairs[0]!.causes[0]!;
    const { tip, left, right } = cause.bone.arrow;
    expect(tip).toEqual({ x: -20, y: 250 });
    expect(left.x).toBeCloseTo(-15.728469, 5);
    expect(left.y).toBeCloseTo(237.281745, 5);
    expect(right.x).toBeCloseTo(-27.611686, 5);
    expect(right.y).toBeCloseTo(238.951822, 5);
    const sub = laid(`${PR}/1-should-render-a-simple-ishikawa-diagram`).pairs[0]!.causes[0]!
      .subCauses[0]!.bone;
    expect(sub.arrow.tip).toEqual({ x: sub.x1, y: sub.y1 });
    expect(sub.arrow.left.x).toBeCloseTo(sub.x1 - 6, 9);
    expect(sub.arrow.left.y).toBeCloseTo(sub.y1 - 3, 9);
    expect(sub.arrow.right.y).toBeCloseTo(sub.y1 + 3, 9);
  });
});

describe('ishikawa layout: bounds (D224)', () => {
  it('covers everything drawn, strokes included, plus diagramPadding', () => {
    const { bounds, padding } = laid(`${PR}/4-should-render-with-a-single-cause`);
    expect(padding).toBe(20);
    // Left: the label box (−74.958655, stroke 1); top: the box (177.486597); right: the head's
    // curve at 1.2 w = 74.4 (stroke 1); bottom: the head (290, stroke 1).
    expect(bounds.x).toBeCloseTo(-95.958655, 5);
    expect(bounds.y).toBeCloseTo(156.486597, 5);
    expect(bounds.x + bounds.width).toBeCloseTo(95.4, 9);
    expect(bounds.y + bounds.height).toBeCloseTo(311, 9);
  });

  it('grows by ishikawa.diagramPadding', () => {
    const plain = laid(`${PR}/1-should-render-a-simple-ishikawa-diagram`);
    const padded = laid(`${PR}/9-should-render-with-custom-diagrampadding`);
    expect(padded.padding).toBe(50);
    expect(padded.bounds.x).toBeCloseTo(plain.bounds.x - 30, 9);
    expect(padded.bounds.width).toBeCloseTo(plain.bounds.width + 60, 9);
  });
});

describe('ishikawa layout: degenerate input (D496)', () => {
  it('draws an effect alone with a zero-length spine at (0, 250)', () => {
    const { head, spine, pairs } = laid(`${PR}/5-should-render-with-no-children-root-only`);
    expect(pairs).toEqual([]);
    expect(spine).toMatchObject({ x1: 0, y1: 250, x2: 0, y2: 250 });
    expect(head).toMatchObject({ x: 0, y: 250 });
  });

  it('draws nothing for an empty body: no head, no spine, the padding about the origin', () => {
    const layout = laid(`${NIGHTLY}/empty-document`);
    expect(layout.head).toBeUndefined();
    expect(layout.spine).toBeUndefined();
    expect(layout.pairs).toEqual([]);
    expect(layout.bounds).toEqual({ x: -20, y: -20, width: 40, height: 40 });
  });
});

describe('ishikawa layout: label boxes clear the head (fixed on the way)', () => {
  it('starts a pair further left when a cause box would reach over the head', () => {
    const { pairs, head } = laid(`${NIGHTLY}/baseline-clamp`);
    // Generator, a lower leaf on the 75 px side: its 15 px bone ends 2.087597 left of the start,
    // its box ("Generator", 72 px) reaches 56 px right of that, and its rows meet the head's.
    // v12 started the pair at −20, the box 33.912403 px over the head's back.
    const generator = pairs[0]!.causes[1]!;
    expect(generator.box.y).toBeLessThan(head!.bottom.y);
    expect(pairs[0]!.x).toBeCloseTo(-53.912403, 5);
    expect(generator.box.x + generator.box.width).toBeCloseTo(0, 9);
  });

  it('keeps the start at −20 when the boxes already clear the head', () => {
    expect(laid(`${PR}/4-should-render-with-a-single-cause`).pairs[0]!.x).toBe(-20);
  });
});

describe('ishikawa layout: label boxes clear the spine (fixed on the way)', () => {
  it("grows a bone until its cause's label box clears the spine", () => {
    const { pairs, spineY, sides } = laid(`${NIGHTLY}/layout/tall-leaf-label`);
    expect(sides.lower).toBe(75);
    const agents = pairs[0]!.causes[1]!;
    // Three lines, 60 px: the box reaches 32 px from its centre, 11 px past the bone's end, so the
    // bone must reach 21 px from the spine; v12's 0.2 × 75 = 15 px reaches 14.854021.
    expect(agents.bone.y2 - agents.bone.y1).toBeCloseTo(21, 9);
    expect(agents.box.y).toBeCloseTo(spineY, 9);
  });

  it("keeps v12's length when the box already clears it", () => {
    const cause = laid(`${PR}/4-should-render-with-a-single-cause`).pairs[0]!.causes[0]!;
    expect(cause.bone.y1 - cause.bone.y2).toBeCloseTo(49.513403, 5);
  });
});
