/**
 * The pie layout's invariants (spec #288 §Testing, R-LAYOUT-3): what every `PieLayout` must
 * satisfy for the model it was laid out from. Empty when the layout is sound; each entry names
 * a broken rule.
 */
import type { PieModel } from '../model.ts';
import { MIN_PERCENT, PERCENT, PIE_COLOURS as COLOURS } from './metrics.ts';
import type { PieLayout, Point, Rect } from './types.ts';

/** Float tolerance of the checks. */
const EPS = 1e-6;
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
  let sum = 0;
  for (const s of model.sections) sum += s.value;
  const shown = model.sections
    .map((s, i) => ((s.value / sum) * PERCENT >= MIN_PERCENT ? i : -1))
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

  // Legend rows apart.
  for (let i = 1; i < legend.length; i++) {
    const a = legend[i - 1]!.swatch;
    const b = legend[i]!.swatch;
    if (b.y < a.y + a.height - EPS) out.push(`legend rows ${i - 1} and ${i} overlap`);
  }

  // Everything drawn inside the bounds (D224).
  const inside = (r: Rect, what: string): void => {
    const b = layout.bounds;
    if (
      r.x < b.x - EPS ||
      r.y < b.y - EPS ||
      r.x + r.width > b.x + b.width + EPS ||
      r.y + r.height > b.y + b.height + EPS
    )
      out.push(`${what} is outside the bounds`);
  };
  const disc = (c: Point, r: number): Rect => ({
    x: c.x - r,
    y: c.y - r,
    width: 2 * r,
    height: 2 * r,
  });
  inside(disc(center, layout.outerRadius + layout.outerStrokeWidth / 2), 'the outer circle');
  const scale = slices.some((s) => s.highlighted) ? layout.highlightScale : 1;
  inside(disc(center, (layout.radius + layout.strokeWidth / 2) * scale), 'the slices');
  for (const s of slices) inside(s.percent, `slice ${s.index}'s percentage`);
  for (const r of legend) {
    inside(r.swatch, `legend row ${r.index}'s swatch`);
    inside(r.label, `legend row ${r.index}'s label`);
  }
  if (layout.title) inside(layout.title, 'the title');
  return out;
}

/** Every number in `v`, at any depth, is finite. */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`, out);
}
