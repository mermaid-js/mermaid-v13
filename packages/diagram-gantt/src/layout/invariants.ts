/**
 * Layout invariants (spec #293 T3, DDLT-style): no NaN or Infinity anywhere (R-LAYOUT-3), bars
 * inside the plot and the rows, no two bars of one row overlapping in time in compact mode,
 * ticks ascending, and the bounds covering every bar and band (D224). Returns the violations,
 * an empty list when the layout holds.
 */
import type { GanttAxis, GanttBar, GanttLayout, Rect } from './types.ts';

/** Rounding slack, px. */
const EPS = 1e-6;

function nonFinite(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [k, v] of Object.entries(value)) nonFinite(v, `${path}.${k}`, out);
}

const inside = (r: Rect, b: Rect): boolean =>
  r.x >= b.x - EPS &&
  r.y >= b.y - EPS &&
  r.x + r.width <= b.x + b.width + EPS &&
  r.y + r.height <= b.y + b.height + EPS;

const what = (bar: GanttBar): string => `${bar.kind} "${bar.id}"`;

/** A bar's x extent must lie in the plot; a milestone's centre and a marker's x must. */
function inPlot(l: GanttLayout, bar: GanttBar): boolean {
  const end = l.plot.x + l.plot.width;
  const within = (x: number): boolean => x >= l.plot.x - EPS && x <= end + EPS;
  if (bar.kind === 'vert') return within(bar.x);
  if (bar.kind === 'milestone') return within(bar.x + bar.width / 2);
  return within(bar.x) && within(bar.x + bar.width);
}

function barViolations(l: GanttLayout, out: string[]): void {
  const rowsTop = Math.min(...l.bands.map((b) => b.y), Infinity);
  for (const bar of l.bars) {
    if (!inPlot(l, bar)) out.push(`${what(bar)} is outside the plot`);
    if (bar.width < 0 || bar.height < 0) out.push(`${what(bar)} has a negative size`);
    if (bar.kind === 'vert') continue;
    if (bar.y < rowsTop - EPS || bar.y + bar.height > l.height + EPS)
      out.push(`${what(bar)} is outside the rows`);
    if (bar.kind === 'bar' && !inside(bar, l.bounds))
      out.push(`${what(bar)} is outside the bounds`);
  }
  for (const band of l.bands) if (!inside(band, l.bounds)) out.push('a band is outside the bounds');
}

/** Compact mode: bars sharing a row never overlap in time (v12 `start >= laneEnd`). */
function overlapViolations(l: GanttLayout, out: string[]): void {
  const rows = new Map<number, [number, number][]>();
  for (const bar of l.bars) {
    if (bar.kind === 'vert') continue;
    const list = rows.get(bar.y) ?? [];
    list.push([bar.start, bar.end]);
    rows.set(bar.y, list);
  }
  for (const [y, spans] of rows) {
    spans.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++)
      if (spans[i]![0] < spans[i - 1]![1]) out.push(`two bars in the row at y=${y} overlap`);
  }
}

/** Ticks run left to right, their times all one way (a reversed domain's descend, as d3's). */
function tickViolations(axis: GanttAxis | undefined, out: string[]): void {
  const ticks = axis?.ticks ?? [];
  const way = Math.sign((ticks.at(-1)?.time ?? 0) - (ticks[0]?.time ?? 0));
  for (let i = 1; i < ticks.length; i++) {
    const [a, b] = [ticks[i - 1]!, ticks[i]!];
    if (Math.sign(b.time - a.time) !== way || b.x < a.x)
      out.push(`ticks ${a.label}, ${b.label} are not ascending`);
  }
}

export function ganttLayoutViolations(l: GanttLayout): string[] {
  const out: string[] = [];
  nonFinite(l, 'layout', out);
  if (out.length > 0) return out;
  barViolations(l, out);
  if (l.compact) overlapViolations(l, out);
  tickViolations(l.bottomAxis, out);
  tickViolations(l.topAxis, out);
  return out;
}
