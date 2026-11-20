/**
 * The pie layout's invariants (spec #288 §Testing, R-LAYOUT-3): what every `PieLayout` must
 * satisfy for the model it was laid out from. Empty when the layout is sound; each entry names
 * a broken rule.
 */
import { discBox } from '@mermaid-js/shared/layout/geometry';
import type { PieModel } from '../model.ts';
import { pieSum } from '../shares.ts';
import { MIN_PERCENT, PERCENT, PIE_COLOURS as COLOURS } from './metrics.ts';
import type { PieLayout, Point, Rect } from './types.ts';
import {
  EPS,
  nonFinite as finite,
  rectInside,
  rectsOverlap,
} from '@mermaid-js/shared/testing/layout-invariants';

const TAU = 2 * Math.PI;

export function pieLayoutViolations(model: PieModel, layout: PieLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);

  // Input order: slices by increasing section index, a legend row per section in order.
  const { slices, legend, center } = layout;
  if (legend.length !== model.sections.length)
    out.push(`${legend.length} legend rows for ${model.sections.length} sections`);
  legend.forEach((r, i) => {
    if (r.index !== i) out.push(`legend row ${i} is section ${r.index}`);
    if (r.colour !== i % COLOURS) out.push(`legend row ${i} has colour ${r.colour}`);
  });
  for (let i = 1; i < slices.length; i++)
    if (slices[i]!.index <= slices[i - 1]!.index) out.push(`slice ${i} is out of input order`);

  // Shown slices: every section of at least 1% of the sum, and only those (D223).
  const { unit, sum } = pieSum(model.sections.map((s) => s.value));
  const shown = model.sections
    .map((s, i) => ((s.value / unit / sum) * PERCENT >= MIN_PERCENT ? i : -1))
    .filter((i) => i >= 0);
  if (shown.join() !== slices.map((s) => s.index).join())
    out.push(`slices ${slices.map((s) => s.index).join()} for shown sections ${shown.join()}`);

  // Angles: from 0, contiguous, summing to 2π.
  let at = 0;
  for (const s of slices) {
    if (Math.abs(s.startAngle - at) > EPS) out.push(`slice ${s.index} starts at ${s.startAngle}`);
    if (s.endAngle < s.startAngle) out.push(`slice ${s.index} runs backwards`);
    at = s.endAngle;
  }
  if (slices.length > 0 && Math.abs(at - TAU) > EPS) out.push(`slices end at ${at}, not 2π`);

  for (const s of slices) {
    if (s.colour !== s.index % COLOURS) out.push(`slice ${s.index} has colour ${s.colour}`);
    const d = Math.hypot(s.anchor.x - center.x, s.anchor.y - center.y);
    if (Math.abs(d - layout.textRadius) > EPS)
      out.push(`slice ${s.index}'s label is ${d} from the centre, not ${layout.textRadius}`);
    if (Math.abs(s.percent.x + s.percent.width / 2 - s.anchor.x) > EPS)
      out.push(`slice ${s.index}'s percentage is not centred on its anchor`);
  }

  // Legend rows apart: each under the one before, or the first of a new column right of its
  // label (D616).
  for (let i = 1; i < legend.length; i++) {
    const a = legend[i - 1]!;
    const b = legend[i]!.swatch;
    const below = b.y >= a.swatch.y + a.swatch.height - EPS;
    const right = b.x >= a.label.x + a.label.width - EPS;
    if (!below && !right) out.push(`legend rows ${i - 1} and ${i} overlap`);
  }

  labelViolations(layout, out);

  // Everything drawn inside the bounds (D224).
  const inside = (r: Rect, what: string): void => {
    if (!rectInside(r, layout.bounds)) out.push(`${what} is outside the bounds`);
  };
  inside(discBox(center, layout.outerRadius + layout.outerStrokeWidth / 2), 'the outer circle');
  const scale = slices.some((s) => s.highlighted) ? layout.highlightScale : 1;
  inside(discBox(center, (layout.radius + layout.strokeWidth / 2) * scale), 'the slices');
  for (const s of slices) inside(s.percent, `slice ${s.index}'s percentage`);
  for (const r of legend) {
    inside(r.swatch, `legend row ${r.index}'s swatch`);
    inside(r.label, `legend row ${r.index}'s label`);
  }
  if (layout.title) inside(layout.title, 'the title');
  return out;
}

/**
 * Labels apart (D225: a label of several lines takes its height): legend texts from each other,
 * and the title from the legend, the percentages and the pie.
 */
function labelViolations(layout: PieLayout, out: string[]): void {
  const { slices, legend, center, title } = layout;
  const labels = legend.map((r) => [r.label, `legend row ${r.index}'s label`] as const);
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlap(labels[i]![0], labels[j]![0]))
        out.push(`${labels[i]![1]} overlaps ${labels[j]![1]}`);
  if (!title) return;
  // v12 draws a `center` legend over the pie; taller than the pie, it runs up into the title,
  // and v13 keeps that geometry (parity), so only a legend off the pie's centre is checked.
  if (!overPie(layout))
    for (const [r, what] of labels) if (overlap(title, r)) out.push(`the title overlaps ${what}`);
  for (const s of slices)
    if (overlap(title, s.percent)) out.push(`the title overlaps slice ${s.index}'s percentage`);
  if (meetsDisc(title, center, layout.outerRadius + layout.outerStrokeWidth / 2))
    out.push('the title overlaps the pie');
}

/** The legend is centred on the pie both ways: `legendPosition: center`. */
function overPie({ legend, center }: PieLayout): boolean {
  const first = legend[0];
  const last = legend[legend.length - 1];
  if (first === undefined || last === undefined) return false;
  return (
    first.swatch.x < center.x &&
    first.label.x + first.label.width > center.x &&
    first.swatch.y < center.y &&
    last.swatch.y + last.swatch.height > center.y
  );
}

/** Two boxes with some area in common; an empty label (no lines) overlaps nothing. */
function overlap(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return rectsOverlap(a, b);
}

/** A non-empty box reaches into the disc of radius `r` about `c`. */
function meetsDisc(a: Rect, c: Point, r: number): boolean {
  if (a.width <= 0 || a.height <= 0) return false;
  const dx = Math.max(a.x - c.x, 0, c.x - (a.x + a.width));
  const dy = Math.max(a.y - c.y, 0, c.y - (a.y + a.height));
  return Math.hypot(dx, dy) < r - EPS;
}
