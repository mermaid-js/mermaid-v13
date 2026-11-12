/**
 * The journey custom layout (spec #290 T3): v12's `journeyRenderer.ts` placement without its
 * drawing or module state (R-ARCH-4). Labels are measured first, through core's label layout
 * (D225); every length comes from the metrics table.
 *
 * Kept from v12 at default config: bands at y 50, tasks at `2 × height + diagramMarginY` one
 * `width + taskMargin` apart, faces at `300 + (5 − score) × 30`, legend rows from y 60, dots of
 * r 7 every 10 px, the title at (`left`, 25), the activity line at `4 × height`. Changed (D242):
 * bands gap by `taskMargin`, the margin grows past a legend wider than it with no threshold
 * jump, a label taller than its box grows the box downward, and the bounds are what is drawn
 * (D224). A task or section name keeps a word wider than its box whole and the box widens to
 * hold it, moving the tasks after it along (D557).
 */
import { pathBuilder } from '@mermaid-js/core/svg';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { JourneyModel, JourneySection, JourneyTask } from '../model.ts';
import { envOf, type Env, type JourneyLayoutContext } from './env.ts';
import { drawnRects, union } from './extent.ts';
import { faceOf, lineEnd } from './faces.ts';
import { drawnScore, SCORE, SECTION_SLOTS } from './metrics.ts';
import type {
  ActivityLine,
  ActorDot,
  BandLayout,
  JourneyLayout,
  LegendEntry,
  PlacedLabel,
  Rect,
  TaskLayout,
} from './types.ts';

/** A label centred in a box; undefined when it has no text. */
function centred(text: MeasuredLabel, box: Rect): PlacedLabel | undefined {
  if (text.lines.length === 0) return undefined;
  return {
    x: box.x + (box.width - text.width) / 2,
    y: box.y + (box.height - text.height) / 2,
    width: text.width,
    height: text.height,
    text,
  };
}

/** Each named actor's colour slot, in model order (D244: `''` takes none). */
function actorSlots(model: JourneyModel): Map<string, number> {
  const slots = new Map<string, number>();
  for (const a of model.actors) if (a !== '' && !slots.has(a)) slots.set(a, slots.size);
  return slots;
}

function legendOf(
  env: Env,
  slots: ReadonlyMap<string, number>
): { legend: LegendEntry[]; widest: number } {
  const { m } = env;
  const legend: LegendEntry[] = [];
  let widest = 0;
  let y = m.legendTop;
  for (const [actor, slot] of slots) {
    const text = env.measure(actor, env.fonts.legend, m.maxLabelWidth);
    legend.push({
      actor,
      dot: { actor, slot, cx: m.legendDotX, cy: y, r: m.dotRadius },
      label: {
        x: m.legendTextX + 2 * m.boxTextMargin,
        y: y + m.legendBaseline - text.baseline,
        width: text.width,
        height: text.height,
        text,
      },
    });
    widest = Math.max(widest, text.width);
    // The next row starts below this one's dot and label, and at least one row on (v12).
    const top = Math.min(-m.dotRadius, m.legendBaseline - text.baseline);
    const bottom = Math.max(m.dotRadius, m.legendBaseline - text.baseline + text.height);
    y += Math.max(m.legendRow, bottom - top);
  }
  return { legend, widest };
}

const badScore = (score: number): boolean =>
  Number.isNaN(score) || score < SCORE.min || score > SCORE.max;

/** D226: one `JOURNEY_SCORE` warning per render, naming the tasks drawn at another score. */
function warnScores(env: Env, tasks: readonly JourneyTask[]): void {
  const bad = tasks.filter((t) => badScore(t.score));
  if (bad.length === 0) return;
  const shown = bad
    .slice(0, 5)
    .map((t) => `${JSON.stringify(t.name.trim())} (${t.score})`)
    .join(', ');
  const more = bad.length > 5 ? ` and ${bad.length - 5} more` : '';
  env.warn({
    code: 'JOURNEY_SCORE',
    message: `Journey scores are drawn from ${SCORE.min} to ${SCORE.max}: ${shown}${more}. A score that is not a number is drawn at ${SCORE.mid}, others at the nearest end.`,
  });
}

/**
 * The section line a task's run opened under: its `sectionIndex`, else the last line of that
 * name; undefined when there is none.
 */
function sectionOf(model: JourneyModel, t: JourneyTask): number | undefined {
  if (t.sectionIndex !== undefined && model.sections[t.sectionIndex]) return t.sectionIndex;
  for (let i = model.sections.length - 1; i >= 0; i--)
    if (model.sections[i]!.name === t.section) return i;
  return undefined;
}

/**
 * Task widths and section labels (D557, #649): names wrap at `width` but keep a word wider than
 * that whole, and a task box grows to its widest line. A section name wider than its run of
 * tasks shares the extra width out evenly among them. Names that fit keep v12's `width`.
 */
function widthsOf(
  model: JourneyModel,
  env: Env
): { names: MeasuredLabel[]; widths: number[]; runs: Map<number, MeasuredLabel> } {
  const { m } = env;
  const all = model.tasks;
  const names = all.map((t) => env.measure(t.name, env.fonts.task, m.width, true));
  const widths = names.map((n) => Math.max(m.width, n.width));
  const runs = new Map<number, MeasuredLabel>();
  let last = '';
  all.forEach((t, i) => {
    if (t.section === last) return;
    last = t.section;
    let end = i + 1;
    while (all[end]?.section === t.section) end++;
    let width = (end - i - 1) * m.taskMargin;
    for (let k = i; k < end; k++) width += widths[k]!;
    const text = env.measure(t.section, env.fonts.task, width, true);
    const extra = (text.width - width) / (end - i);
    if (extra > 0) for (let k = i; k < end; k++) widths[k] = widths[k]! + extra;
    runs.set(i, text);
  });
  return { names, widths, runs };
}

/** v12 `drawTasks`: a band per run of tasks under one section name, a box per task. */
function tasksOf(
  model: JourneyModel,
  env: Env,
  left: number,
  slots: ReadonlyMap<string, number>
): { bands: BandLayout[]; tasks: TaskLayout[] } {
  const { m } = env;
  const taskY = m.taskRows * m.height + m.diagramMarginY;
  const bands: BandLayout[] = [];
  const tasks: TaskLayout[] = [];
  const all = model.tasks;
  const { names, widths, runs } = widthsOf(model, env);
  let band: number | undefined;
  let slot = 0;
  let x = left;
  all.forEach((t, i) => {
    const text = runs.get(i);
    if (text) {
      let count = 1;
      while (all[i + count]?.section === t.section) count++;
      const at = sectionOf(model, t);
      band = bands.length;
      slot = band % SECTION_SLOTS;
      let width = (count - 1) * m.taskMargin;
      for (let k = i; k < i + count; k++) width += widths[k]!;
      // A label taller than the band grows it downward; its top stays at v12's.
      const box = { x, y: m.bandTop, width, height: Math.max(m.height, text.height) };
      const label = centred(text, box);
      bands.push({
        ...box,
        ast: at === undefined ? `s:${t.section}` : (model.sections[at] as JourneySection).ast,
        ...(at === undefined ? {} : { section: at }),
        name: t.section,
        slot,
        ...(label ? { label } : {}),
      });
    }
    const name = names[i]!;
    const width = widths[i]!;
    // A label taller than the box grows it downward; the top edge, its dots and the face stay.
    const box = { x, y: taskY, width, height: Math.max(m.height, name.height) };
    const cx = x + width / 2;
    const label = centred(name, box);
    const dots: ActorDot[] = [];
    for (const actor of t.people) {
      const s = slots.get(actor);
      if (s === undefined) continue;
      // Only '' has no slot, and it has no mention node: dots and mentions pair in order.
      const ast = t.mentions?.[dots.length];
      dots.push({
        actor,
        ...(ast === undefined ? {} : { ast }),
        slot: s,
        cx: x + m.dotStart + dots.length * m.dotStep,
        cy: taskY,
        r: m.dotRadius,
      });
    }
    tasks.push({
      ...box,
      ast: t.ast,
      index: i,
      slot,
      ...(band === undefined ? {} : { band }),
      ...(label ? { label } : {}),
      drawnScore: drawnScore(t.score),
      line: { x: cx, y1: taskY, y2: Math.max(lineEnd(m), taskY) },
      face: faceOf(m, cx, t.score),
      dots,
    });
    x += width + m.taskMargin;
  });
  return { bands, tasks };
}

/** The arrow under the tasks: from `left` to a task margin past the last task (v12's marker). */
function activityOf(env: Env, left: number, tasks: readonly TaskLayout[]): ActivityLine {
  const { m } = env;
  const lastTask = tasks.at(-1);
  const end = lastTask ? lastTask.x + lastTask.width : left;
  const w = m.activityStroke;
  const tip = end + m.taskMargin;
  const x2 = tip - m.headReach * w;
  const y = m.activityRows * m.height;
  const back = x2 - m.headBack * w;
  const head = pathBuilder()
    .moveTo(back, y - m.headHalf * w)
    .lineTo(back, y + m.headHalf * w)
    .lineTo(tip, y)
    .close()
    .done();
  return { y, x1: left, x2, strokeWidth: w, head };
}

function titleOf(model: JourneyModel, env: Env, left: number): PlacedLabel | undefined {
  if (model.title === undefined) return undefined;
  const text = env.measure(model.title, env.fonts.title, Infinity);
  if (text.lines.length === 0) return undefined;
  return {
    x: left,
    y: env.m.titleBaseline - text.baseline,
    width: text.width,
    height: text.height,
    text,
  };
}

export function layoutJourney(model: JourneyModel, ctx: JourneyLayoutContext): JourneyLayout {
  const env = envOf(ctx);
  const { m } = env;
  warnScores(env, model.tasks);
  const slots = actorSlots(model);
  const { legend, widest } = legendOf(env, slots);
  // D242: v12's `leftMargin` while the legend fits in it, else the legend's right edge plus a
  // gap as wide as its text inset; no threshold jump.
  const inset = 2 * m.boxTextMargin;
  const left =
    slots.size === 0
      ? m.leftMargin
      : Math.max(m.leftMargin, m.legendTextX + inset + widest + inset);
  const { bands, tasks } = tasksOf(model, env, left, slots);
  const activity = activityOf(env, left, tasks);
  const title = titleOf(model, env, left);
  const drawn = { legend, bands, tasks, activity, left, ...(title ? { title } : {}) };
  const box = union(drawnRects(m, drawn));
  return {
    units: 'px',
    ...drawn,
    bounds: {
      x: box.x - m.diagramMarginX,
      y: box.y - m.diagramMarginY,
      width: box.width + 2 * m.diagramMarginX,
      height: box.height + 2 * m.diagramMarginY,
    },
  };
}
