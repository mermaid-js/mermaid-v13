/**
 * Bars, milestones, `vert` markers and their labels (v12 `drawRects`), in v12's drawing order:
 * by start, `vert` markers last.
 */
import type { ScheduledTask } from '../schedule/index.ts';
import { byStart, isVert, resolved, type Chart } from './chart.ts';
import { Style } from './env.ts';
import type { GanttBar, GanttBarKind, GanttTaskLabel, LabelSide, Rect } from './types.ts';

const ANCHORS: Readonly<Record<LabelSide, 'start' | 'middle' | 'end'>> = {
  inside: 'middle',
  right: 'start',
  left: 'end',
};

/** Tasks a `click` names: v12 marks the last task with each id `clickable`. */
function clickableTasks(c: Chart): Set<number> {
  const last = new Map<string, number>();
  c.model.tasks.forEach((t, i) => last.set(t.id, i));
  last.delete('__proto__');
  const out = new Set<number>();
  for (const click of c.model.clicks)
    for (const id of click.ids) {
      const at = last.get(id);
      if (at !== undefined) out.add(at);
    }
  return out;
}

function kindOf(t: ScheduledTask): GanttBarKind {
  if (isVert(t)) return 'vert';
  return t.task.tags.includes('milestone') ? 'milestone' : 'bar';
}

/** One task's drawing: its kind, row, and the x of its start, end and drawn end. */
interface Span {
  readonly t: ScheduledTask;
  readonly kind: GanttBarKind;
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
  if (s.kind === 'vert') {
    return {
      x: s.start + lp,
      y: env.gridLineStartPadding,
      width: m.vertWidth * env.barHeight,
      height: c.plain.length * c.gap + m.vertOverhang * env.barHeight,
    };
  }
  const y = s.row * c.gap + env.topPadding;
  if (s.kind === 'milestone') {
    const shift = m.milestoneCentre * (s.end - s.start) - m.milestoneCentre * env.barHeight;
    return { x: s.start + lp + shift, y, width: env.barHeight, height: env.barHeight };
  }
  // v12 drew a negative width (an `until` before the start) as nothing: 0 here.
  return { x: s.start + lp, y, width: Math.max(0, s.renderEnd - s.start), height: env.barHeight };
}

/** v12's label rule: inside when it fits, else right of the bar unless that passes `w`. */
function labelOf(c: Chart, s: Span): GanttTaskLabel {
  const { env } = c;
  const { m } = env;
  const lp = env.leftPadding;
  const milestone = s.kind === 'milestone';
  const font = s.kind === 'vert' ? env.fonts.vert : env.fonts.task;
  const style = (s.clickable ? Style.Bold : 0) | (milestone ? Style.Italic : 0);
  const text = env.label(s.t.task.text, font, style);
  const tw = text.width;
  const outside = (endX: number): 'left' | 'right' =>
    endX + tw + m.labelRightRoom * lp > c.w ? 'left' : 'right';
  // The class rule reads `endTime`; a milestone is `barHeight` wide from its start.
  const classEnd = milestone ? s.start + env.barHeight : s.end;
  const side: LabelSide = tw > classEnd - s.start ? outside(classEnd) : 'inside';
  if (s.kind === 'vert') {
    const y = env.gridLineStartPadding + c.plain.length * c.gap + m.vertLabelGap;
    return { x: s.start + lp, y, anchor: 'middle', side, text };
  }
  // The position rule reads `renderEndTime`, and puts a milestone at its square.
  let startX = s.start;
  let endX = s.renderEnd;
  if (milestone) {
    startX += m.milestoneCentre * (s.end - s.start) - m.milestoneCentre * env.barHeight;
    endX = startX + env.barHeight;
  }
  let x = (endX - startX) / 2 + startX + lp;
  if (tw > endX - startX)
    x = outside(endX) === 'left' ? startX + lp - m.labelGap : endX + lp + m.labelGap;
  const y =
    s.row * c.gap + env.barHeight / 2 + (env.fontSize / 2 - m.labelBaselineLift) + env.topPadding;
  return { x, y, anchor: ANCHORS[side], side, text };
}

/** The diamond v12's CSS draws: the square rotated 45° and scaled about its centre. */
function diamond(c: Chart, r: Rect): void {
  const half = (c.env.m.milestoneScale * r.width * Math.SQRT2) / 2;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  c.bounds.point(cx - half, cy - half).point(cx + half, cy + half);
}

export function barsOf(c: Chart): GanttBar[] {
  const clickable = clickableTasks(c);
  const sorted = byStart(c.plan.tasks.filter(resolved));
  const out: GanttBar[] = [];
  for (const t of [...sorted.filter((x) => !isVert(x)), ...sorted.filter(isVert)]) {
    const kind = kindOf(t);
    const row = c.rows.of.get(t.index);
    if (kind !== 'vert' && row === undefined) continue;
    const span: Span = {
      t,
      kind,
      row: row ?? 0,
      start: c.scale(t.start!),
      end: c.scale(t.end!),
      renderEnd: c.scale(t.renderEnd ?? t.end!),
      clickable: clickable.has(t.index),
    };
    const rect = rectOf(c, span);
    const label = labelOf(c, span);
    if (kind === 'milestone') diamond(c, rect);
    else c.bounds.rect(rect);
    c.bounds.text(label);
    const tags = t.task.tags;
    const ast = c.model.tasks[t.index]?.ast;
    out.push({
      ...rect,
      task: t.index,
      id: t.task.id,
      ...(ast !== undefined ? { ast } : {}),
      kind,
      start: t.start!,
      end: t.end!,
      active: tags.includes('active'),
      done: tags.includes('done'),
      crit: tags.includes('crit'),
      clickable: span.clickable,
      slot: c.slot(t.task.section),
      radius: c.env.m.barRadius,
      ...(kind === 'milestone' ? { scale: c.env.m.milestoneScale } : {}),
      label,
    });
  }
  return out;
}
