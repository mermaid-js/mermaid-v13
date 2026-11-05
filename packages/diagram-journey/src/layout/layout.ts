/**
 * The journey custom layout (spec #290 T3): v12's `journeyRenderer.ts` placement without its
 * drawing or module state (R-ARCH-4). Labels are measured first, through core's label layout
 * (D225); every length comes from the metrics table.
 *
 * Kept from v12 at default config: bands at y 50, tasks at `2 × height + diagramMarginY` one
 * `width + taskMargin` apart, faces at `300 + (5 − score) × 30`, legend rows from y 60, dots of
 * r 7 every 10 px, the title at (`left`, 25), the activity line at `4 × height`. Changed (D242):
 * bands gap by `taskMargin`, the margin widens by the widest legend line with no threshold, and
 * the bounds are what is drawn (D224).
 */
import { pathBuilder } from '@mermaid-js/core/svg';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { JourneyModel, JourneyTask } from '../model.ts';
import { envOf, type Env, type JourneyLayoutContext } from './env.ts';
import { drawnRects, union } from './extent.ts';
import { drawnScore, faceOf, lineEnd } from './faces.ts';
import { SCORE, SECTION_SLOTS } from './metrics.ts';
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

/** v12 `drawTasks`: a band per run of tasks under one section name, a box per task. */
function tasksOf(
  model: JourneyModel,
  env: Env,
  left: number,
  slots: ReadonlyMap<string, number>
): { bands: BandLayout[]; tasks: TaskLayout[] } {
  const { m } = env;
  const pitch = m.width + m.taskMargin;
  const taskY = m.taskRows * m.height + m.diagramMarginY;
  const bands: BandLayout[] = [];
  const tasks: TaskLayout[] = [];
  const all = model.tasks;
  let last = '';
  let band: number | undefined;
  let slot = 0;
  all.forEach((t, i) => {
    const x = left + i * pitch;
    if (t.section !== last) {
      let count = 1;
      while (all[i + count]?.section === t.section) count++;
      const at = t.sectionIndex ?? 0;
      const line = model.sections[at];
      band = bands.length;
      slot = band % SECTION_SLOTS;
      const box = {
        x,
        y: m.bandTop,
        width: count * m.width + (count - 1) * m.taskMargin,
        height: m.height,
      };
      const label = centred(env.measure(t.section, env.fonts.task, box.width), box);
      bands.push({
        ...box,
        ast: line?.ast ?? `s:${t.section}`,
        section: at,
        name: t.section,
        slot,
        ...(label ? { label } : {}),
      });
      last = t.section;
    }
    const box = { x, y: taskY, width: m.width, height: m.height };
    const cx = x + m.width / 2;
    const label = centred(env.measure(t.name, env.fonts.task, m.width), box);
    const dots: ActorDot[] = [];
    for (const actor of t.people) {
      const s = slots.get(actor);
      if (s === undefined) continue;
      dots.push({
        actor,
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
  const left = m.leftMargin + widest;
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
