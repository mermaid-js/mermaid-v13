/**
 * The radar layout's invariants (spec #422 §Testing, R-LAYOUT-3): what every `RadarLayout`
 * must satisfy for the model it was laid out from. Empty when the layout is sound; each entry
 * names a broken rule. Exported from `@mermaid-js/diagram-radar/testing` for the conformance
 * corpus spec.
 */
import type { RadarModel } from '../model.ts';
import { MAX_TICKS, RADAR_METRICS as m, RADAR_SLOTS as SLOTS } from './metrics.ts';
import type { Point, RadarLayout, Rect } from './types.ts';

/** Float tolerance of the checks, relative to the chart's size. */
const EPS = 1e-6;
const TAU = 2 * Math.PI;

export function radarLayoutViolations(model: RadarModel, layout: RadarLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  const { center, radius, spokes, rings, curves, legend } = layout;
  const n = model.axes.length;
  const tol = EPS * Math.max(1, radius);
  const dist = (p: Point): number => Math.hypot(p.x - center.x, p.y - center.y);

  // Spokes: one per axis in order, spoke i at 2πi/n − π/2, its end and anchor on that ray.
  if (spokes.length !== n) out.push(`${spokes.length} spokes for ${n} axes`);
  spokes.forEach((s, i) => {
    const th = (TAU * i) / n - Math.PI / 2;
    if (s.index !== i) out.push(`spoke ${i} is axis ${s.index}`);
    if (Math.abs(s.angle - th) > EPS) out.push(`spoke ${i} is at ${s.angle}, not ${th}`);
    if (!onRay(center, s.end, s.angle, layout.axisLength, tol))
      out.push(`spoke ${i} does not end ${layout.axisLength} along its angle`);
    if (!onRay(center, s.anchor, s.angle, layout.labelRadius, tol))
      out.push(`spoke ${i}'s label anchor is not ${layout.labelRadius} along its angle`);
    const cos = Math.cos(s.angle);
    let want = 'middle';
    if (cos > m.anchorThreshold) want = 'start';
    else if (cos < -m.anchorThreshold) want = 'end';
    if (s.textAnchor !== want) out.push(`spoke ${i}'s label is anchored ${s.textAnchor}`);
  });

  // Rings: ring k at radius·k/ticks, ⌈ticks⌉ of them (none for a polygon without axes).
  const ticks = Math.min(Math.max(model.options.ticks, 0), MAX_TICKS);
  const want = layout.graticule === 'polygon' && n === 0 ? 0 : Math.ceil(ticks);
  if (layout.ticks !== ticks) out.push(`rings for ${layout.ticks} ticks, not ${ticks}`);
  if (rings.length !== want) out.push(`${rings.length} rings, not ${want}`);
  rings.forEach((r, i) => {
    const k = i + 1;
    if (Math.abs(r.radius - (radius * k) / ticks) > tol) out.push(`ring ${k} at ${r.radius}`);
    const corners = layout.graticule === 'polygon' ? n : 0;
    if (r.points.length !== corners) out.push(`ring ${k} has ${r.points.length} corners`);
    r.points.forEach((p, j) => {
      if (!onRay(center, p, spokes[j]?.angle ?? NaN, r.radius, tol))
        out.push(`ring ${k}, corner ${j} is off spoke ${j}`);
    });
  });

  // Curves: exactly the drawable ones, in input order; point i on spoke i within the radius.
  const drawable = model.curves
    .map((c, i) => (n > 0 && c.entries.length === n ? i : -1))
    .filter((i) => i >= 0);
  const drawn = curves.map((c) => c.index);
  if (drawn.join() !== drawable.join())
    out.push(`drawn curves ${drawn.join()} for drawable curves ${drawable.join()}`);
  for (const c of curves) {
    if (c.slot !== c.index % SLOTS) out.push(`curve ${c.index} has slot ${c.slot}`);
    c.points.forEach((p, i) => {
      const r = dist(p);
      if (r > radius + tol) out.push(`curve ${c.index}, point ${i} is past the radius`);
      if (r > tol && !onRay(center, p, spokes[i]?.angle ?? NaN, r, tol))
        out.push(`curve ${c.index}, point ${i} is off spoke ${i}`);
    });
    const segments = layout.graticule === 'circle' ? c.points.length : 0;
    if (c.segments.length !== segments)
      out.push(`curve ${c.index} has ${c.segments.length} segments`);
    c.segments.forEach((s, i) => {
      const to = c.points[(i + 1) % c.points.length]!;
      if (Math.abs(s.to.x - to.x) > tol || Math.abs(s.to.y - to.y) > tol)
        out.push(`curve ${c.index}, segment ${i} does not end at point ${i + 1}`);
    });
  }

  // Legend: a row per curve in order under showLegend, 20 px apart (more under a taller label).
  const rows = model.options.showLegend ? model.curves.length : 0;
  if (legend.length !== rows) out.push(`${legend.length} legend rows for ${rows} curves`);
  legend.forEach((r, i) => {
    if (r.index !== i) out.push(`legend row ${i} is curve ${r.index}`);
    if (r.slot !== i % SLOTS) out.push(`legend row ${i} has slot ${r.slot}`);
    const prev = legend[i - 1];
    if (!prev) return;
    const step = m.legendRow + Math.max(0, prev.label.height - prev.label.text.lineHeight);
    if (Math.abs(r.swatch.y - prev.swatch.y - step) > tol || r.swatch.x !== prev.swatch.x)
      out.push(`legend rows ${i - 1} and ${i} are not ${step} px apart`);
  });

  // Everything drawn inside the bounds (D354).
  const inside = (r: Rect, what: string): void => {
    const b = layout.bounds;
    if (
      r.x < b.x - tol ||
      r.y < b.y - tol ||
      r.x + r.width > b.x + b.width + tol ||
      r.y + r.height > b.y + b.height + tol
    )
      out.push(`${what} is outside the bounds`);
  };
  const disc = (c: Point, r: number): Rect => ({
    x: c.x - r,
    y: c.y - r,
    width: 2 * r,
    height: 2 * r,
  });
  const { axis, curve, graticule } = layout.strokes;
  rings.forEach((r, i) => {
    if (r.points.length === 0) inside(disc(center, r.radius + graticule / 2), `ring ${i + 1}`);
    r.points.forEach((p, j) => inside(disc(p, graticule / 2), `ring ${i + 1}, corner ${j}`));
  });
  for (const s of spokes) {
    inside(disc(s.end, axis / 2), `spoke ${s.index}`);
    inside(s.label, `spoke ${s.index}'s label`);
  }
  for (const c of curves) {
    c.points.forEach((p, i) => inside(disc(p, curve / 2), `curve ${c.index}, point ${i}`));
    c.segments.forEach((s, i) => {
      inside(disc(s.c1, curve / 2), `curve ${c.index}, segment ${i}`);
      inside(disc(s.c2, curve / 2), `curve ${c.index}, segment ${i}`);
    });
  }
  for (const r of legend) {
    inside(r.swatch, `legend row ${r.index}'s swatch`);
    inside(r.label, `legend row ${r.index}'s label`);
  }
  if (layout.title) inside(layout.title, 'the title');
  return out;
}

/** `p` is `r` from `c` along angle `a`. */
function onRay(c: Point, p: Point, a: number, r: number, tol: number): boolean {
  return (
    Math.abs(p.x - (c.x + r * Math.cos(a))) <= tol && Math.abs(p.y - (c.y + r * Math.sin(a))) <= tol
  );
}

/** Every number in `v`, at any depth, is finite. */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`, out);
}
