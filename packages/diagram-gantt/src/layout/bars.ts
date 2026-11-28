/**
 * Bars, milestones, `vert` markers and their labels (v12 `drawRects`), in v12's drawing order:
 * by start, `vert` markers last.
 */
import { clickTargets } from '../ids.ts';
import type { ScheduledTask } from '../schedule/index.ts';
import { byStart, isVert, resolved, type Chart } from './chart.ts';
import { Style } from './env.ts';
import type { GanttBar, GanttBarKind, GanttTaskLabel, LabelSide, Rect } from './types.ts';

const ANCHORS: Readonly<Record<LabelSide, 'start' | 'middle' | 'end'>> = {
  inside: 'middle',
  right: 'start',
  left: 'end',
};

/**
 * The tasks a `click` marks `clickable`, by v12's parse-time rule (`ids.ts` `clickTargets`):
 * the latest task with each id written before the click. Its `setLink` likewise kept a URL only
 * for an id with such a task, the last one winning.
 */
function clickableTasks(c: Chart): { tasks: Set<number>; links: Map<string, string> } {
  const out = new Set<number>();
  const links = new Map<string, string>();
  const { tasks, clicks } = c.model;
  clickTargets(tasks, clicks).forEach((targets, i) => {
    const click = clicks[i]!;
    targets.forEach((at, k) => {
      if (at === undefined) return;
      out.add(at);
      if (click.href !== undefined) links.set(click.ids[k]!, click.href);
    });
  });
  return { tasks: out, links };
}

function kindOf(t: ScheduledTask): GanttBarKind {
  if (isVert(t)) return 'vert';
  return t.task.tags.includes('milestone') ? 'milestone' : 'bar';
}

/** One task's drawing: its kind, row, and the x of its start, end and drawn end. */
interface Span {
  readonly t: ScheduledTask;
  readonly kind: GanttBarKind;
  /** The `milestone` tag, also on a `vert` marker (v12 kept both). */
  readonly milestone: boolean;
  readonly row: number;
  readonly start: number;
  readonly end: number;
  readonly renderEnd: number;
  readonly clickable: boolean;
}

/** v12's rect: a bar to `renderEndTime`, a milestone's square at the span's middle, a marker. */
function rectOf(c: Chart, s: Span): Rect {
  const { env } = c;
  const { m } = env;
  const lp = env.leftPadding;
  // v12 tests `milestone` first for x and width, `vert` first for y and height.
  const shift = m.milestoneCentre * (s.end - s.start) - m.milestoneCentre * env.barHeight;
  const x = s.milestone ? s.start + lp + shift : s.start + lp;
  if (s.kind === 'vert') {
    return {
      x,
      y: env.gridLineStartPadding,
      width: s.milestone ? env.barHeight : m.vertWidth * env.barHeight,
      height: c.plain.length * c.gap + m.vertOverhang * env.barHeight,
    };
  }
  const y = s.row * c.gap + env.topPadding;
  if (s.milestone) return { x, y, width: env.barHeight, height: env.barHeight };
  // v12 drew a negative width (an `until` before the start) as nothing: 0 here.
  return { x: s.start + lp, y, width: Math.max(0, s.renderEnd - s.start), height: env.barHeight };
}

/**
 * Where the bar the side is judged against ends. A bar's is its drawn end, `renderEnd`, as the
 * label's position reads it: v12's class rule read `endTime`, so with excludes a label wider than
 * the shortened bar but not than its whole span was called `inside` and drawn across the bar's
 * end (#1249, D729). A milestone is `barHeight` wide from its start; a `vert` marker keeps
 * `endTime` (its label is never on it).
 */
function sideEnd(c: Chart, s: Span): number {
  if (s.milestone) return s.start + c.env.barHeight;
  return s.kind === 'vert' ? s.end : s.renderEnd;
}

/**
 * v12's label rule: inside when it fits the drawn bar, else right of it unless that passes `w`
 * (then left). The side follows the drawn width, which v12's class rule did not (D729).
 */
function labelOf(c: Chart, s: Span): GanttTaskLabel {
  const { env } = c;
  const { m } = env;
  const lp = env.leftPadding;
  const milestone = s.milestone;
  const font = s.kind === 'vert' ? env.fonts.vert : env.fonts.task;
  const style = (s.clickable ? Style.Bold : 0) | (milestone ? Style.Italic : 0);
  const text = env.label(s.t.task.text, font, style);
  const tw = text.width;
  const outside = (endX: number): 'left' | 'right' =>
    endX + tw + m.labelRightRoom * lp > c.w ? 'left' : 'right';
  const classEnd = sideEnd(c, s);
  const side: LabelSide = tw > classEnd - s.start ? outside(classEnd) : 'inside';
  if (s.kind === 'vert') {
    const y = env.gridLineStartPadding + c.plain.length * c.gap + m.vertLabelGap;
    return { x: s.start + lp, y, anchor: 'middle', side, text };
  }
  // The position reads `renderEndTime`, and puts a milestone at its square.
  let startX = s.start;
  let endX = s.renderEnd;
  if (milestone) {
    startX += m.milestoneCentre * (s.end - s.start) - m.milestoneCentre * env.barHeight;
    endX = startX + env.barHeight;
  }
  let x = (endX - startX) / 2 + startX + lp;
  if (tw > endX - startX)
    x = outside(endX) === 'left' ? startX + lp - m.labelGap : endX + lp + m.labelGap;
  // A label of several lines (D735) is centred on the bar as its one line would be: its first
  // baseline is lifted by half the extra lines. A third line reaches into the rows beside it.
  const lift = (Math.max(0, text.lines.length - 1) * text.lineHeight) / 2;
  const y =
    s.row * c.gap +
    env.barHeight / 2 +
    (env.fontSize / 2 - m.labelBaselineLift) +
    env.topPadding -
    lift;
  return { x, y, anchor: ANCHORS[side], side, text };
}

/**
 * v12's `transform-origin` of a milestone: the middle of its span, on the middle of its row.
 * A `vert` marker's row is v12's `order` −1, so a `vert` milestone turns about a point above it.
 */
function pivotOf(c: Chart, s: Span): { x: number; y: number } {
  const { env } = c;
  const row = s.kind === 'vert' ? -1 : s.row;
  return {
    x: s.start + env.leftPadding + env.m.milestoneCentre * (s.end - s.start),
    y: row * c.gap + env.topPadding + env.barHeight / 2,
  };
}

/** What v12's CSS draws: the rectangle rotated 45° and scaled about the pivot. */
function turned(c: Chart, r: Rect, o: { x: number; y: number }): void {
  const { m } = c.env;
  const a = (m.milestoneRotation / m.halfTurnDegrees) * Math.PI;
  const k = m.milestoneScale;
  for (const [px, py] of [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x, r.y + r.height],
    [r.x + r.width, r.y + r.height],
  ] as const) {
    const dx = px - o.x;
    const dy = py - o.y;
    c.bounds.point(
      o.x + k * (dx * Math.cos(a) - dy * Math.sin(a)),
      o.y + k * (dx * Math.sin(a) + dy * Math.cos(a))
    );
  }
}

export function barsOf(c: Chart): GanttBar[] {
  const clicks = clickableTasks(c);
  const sorted = byStart(c.plan.tasks.filter(resolved));
  const out: GanttBar[] = [];
  for (const t of [...sorted.filter((x) => !isVert(x)), ...sorted.filter(isVert)]) {
    const kind = kindOf(t);
    const row = c.rows.of.get(t.index);
    if (kind !== 'vert' && row === undefined) continue;
    const span: Span = {
      t,
      kind,
      milestone: t.task.tags.includes('milestone'),
      row: row ?? 0,
      start: c.scale(t.start!),
      end: c.scale(t.end!),
      renderEnd: c.scale(t.renderEnd ?? t.end!),
      clickable: clicks.tasks.has(t.index),
    };
    const rect = rectOf(c, span);
    const label = labelOf(c, span);
    // The rectangle as written, and (a milestone) as v12's CSS turns it.
    c.bounds.add(rect);
    const pivot = span.milestone ? pivotOf(c, span) : undefined;
    if (pivot) turned(c, rect, pivot);
    const href = span.clickable ? clicks.links.get(t.task.id) : undefined;
    c.bounds.text(label);
    const tags = t.task.tags;
    const ast = c.model.tasks[t.index]?.ast;
    out.push({
      ...rect,
      task: t.index,
      id: t.task.id,
      ...(ast !== undefined ? { ast } : {}),
      kind,
      milestone: span.milestone,
      start: t.start!,
      end: t.end!,
      active: tags.includes('active'),
      done: tags.includes('done'),
      crit: tags.includes('crit'),
      clickable: span.clickable,
      ...(href !== undefined ? { href } : {}),
      slot: c.slot(c.names[t.index]!),
      radius: c.env.m.barRadius,
      ...(pivot ? { scale: c.env.m.milestoneScale, pivot } : {}),
      label,
    });
  }
  return out;
}
