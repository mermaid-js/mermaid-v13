/**
 * Layout invariants for `JourneyLayout` (spec #290 T3), the custom layout's counterpart of the
 * graph engine's `validateLayout`. Each is a property of the output: no NaN or Infinity, in
 * numbers or path data; every model task laid out, in order; every task inside its band and
 * bands apart; every task and band label inside its box; every face on its task's line; legend rows clear of each other, of the bands and
 * of the tasks; nothing drawn for the `''` actor (D244); the bounds holding everything drawn
 * (D224). Each violation is one readable line. Comparisons allow a float tolerance.
 */
import type { JourneyModel } from '../model.ts';
import { drawnRects } from './extent.ts';
import { journeyMetrics } from './metrics.ts';
import type { JourneyLayout, Rect } from './types.ts';

const EPS = 1e-6;

function numbers(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
  } else if (typeof value === 'string') {
    if (/NaN|Infinity/.test(value)) out.push(`${path} is ${JSON.stringify(value)}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${path}[${i}]`, out));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) numbers(v, `${path}.${k}`, out);
}

const within = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const contains = (outer: Rect, inner: Rect): boolean =>
  within(inner.x, outer.x, outer.x + outer.width) &&
  within(inner.x + inner.width, outer.x, outer.x + outer.width) &&
  within(inner.y, outer.y, outer.y + outer.height) &&
  within(inner.y + inner.height, outer.y, outer.y + outer.height);
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - EPS &&
  b.x < a.x + a.width - EPS &&
  a.y < b.y + b.height - EPS &&
  b.y < a.y + a.height - EPS;

/** A legend row's box: its dot and its label. */
function rowOf(e: JourneyLayout['legend'][number]): Rect {
  const x = Math.min(e.dot.cx - e.dot.r, e.label.x);
  const y = Math.min(e.dot.cy - e.dot.r, e.label.y);
  return {
    x,
    y,
    width: Math.max(e.dot.cx + e.dot.r, e.label.x + e.label.width) - x,
    height: Math.max(e.dot.cy + e.dot.r, e.label.y + e.label.height) - y,
  };
}

/** Every invariant `layout` breaks for `model`, one line each; empty when it holds them all. */
export function journeyLayoutViolations(model: JourneyModel, layout: JourneyLayout): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  if (out.length > 0) return out;

  if (layout.tasks.length !== model.tasks.length)
    out.push(`${layout.tasks.length} tasks laid out for ${model.tasks.length} in the model`);
  layout.tasks.forEach((t, i) => {
    const source = model.tasks[i];
    if (source && t.ast !== source.ast) out.push(`task ${i} is ${t.ast}, not ${source.ast}`);
    const where = `task ${t.ast}`;
    if (source?.section !== '' && t.band === undefined) out.push(`${where} has no band`);
    if (t.band !== undefined) {
      const band = layout.bands[t.band];
      if (!band) out.push(`${where} names band ${t.band}, which is not laid out`);
      else if (
        !within(t.x, band.x, band.x + band.width) ||
        !within(t.x + t.width, band.x, band.x + band.width)
      )
        out.push(
          `${where} (${t.x}…${t.x + t.width}) is outside its band ${band.ast} (${band.x}…${band.x + band.width})`
        );
      else if (band.slot !== t.slot) out.push(`${where} has slot ${t.slot}, its band ${band.slot}`);
    }
    if (t.label && !contains(t, t.label)) out.push(`${where}: its label is outside its box`);
    if (Math.abs(t.face.cx - t.line.x) > EPS || !within(t.face.cy, t.line.y1, t.line.y2))
      out.push(`${where}: its face (${t.face.cx}, ${t.face.cy}) is not on its line`);
    if (Math.abs(t.line.x - (t.x + t.width / 2)) > EPS)
      out.push(`${where}: its line is off its centre`);
    for (const d of t.dots) if (d.actor === '') out.push(`${where} draws a dot for the '' actor`);
    const next = layout.tasks[i + 1];
    if (next && overlaps(t, next)) out.push(`${where} overlaps ${next.ast}`);
  });

  layout.bands.forEach((b, i) => {
    const next = layout.bands[i + 1];
    if (next && overlaps(b, next)) out.push(`band ${b.ast} overlaps ${next.ast}`);
    if (b.label && !contains(b, b.label)) out.push(`band ${b.ast}: its label is outside its box`);
  });

  const rows = layout.legend.map(rowOf);
  layout.legend.forEach((e, i) => {
    const where = `legend row ${JSON.stringify(e.actor)}`;
    if (e.actor === '') out.push(`the '' actor has a legend row`);
    for (let j = i + 1; j < rows.length; j++)
      if (overlaps(rows[i]!, rows[j]!))
        out.push(`${where} overlaps ${JSON.stringify(layout.legend[j]!.actor)}`);
    for (const r of [...layout.bands, ...layout.tasks])
      if (overlaps(rows[i]!, r)) out.push(`${where} overlaps ${r.ast}`);
  });

  // Stroke widths are fixed lengths, the same under any config.
  for (const r of drawnRects(journeyMetrics(), layout))
    if (!contains(layout.bounds, r))
      out.push(`the bounds do not hold (${r.x}, ${r.y}, ${r.width} × ${r.height})`);
  return out;
}
