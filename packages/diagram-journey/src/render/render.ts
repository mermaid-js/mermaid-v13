// Draws a laid-out user journey through the SvgWriter (spec #290 T4, DESIGN §7). The layout
// (`layoutJourney`) placed everything; this file only paints it, in v12's order: the actor
// legend, the section bands, the tasks (each its dashed line, face, box, actor dots and name),
// the title and the activity arrow. Every element drawn from an AST node carries `data-id` and
// `data-ast` (R-PARSE-8), exactly one per node; labels and legend entries carry `data-id` only.
// A task dot's `data-id` is its legend entry's (`a:<name>`), its `data-ast` the mention's.
import type { RenderContext } from '@mermaid-js/core';
import type { SafeValue, SvgWriter } from '@mermaid-js/core/svg';
import { centreX, centreY, openSvgRoot } from '@mermaid-js/shared/svg/document';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type { JourneyModel } from '../model.ts';
import { journeyMetrics, type JourneyMetrics } from '../layout/metrics.ts';
import type {
  BandLayout,
  JourneyLayout,
  LegendEntry,
  PlacedLabel,
  TaskLayout,
} from '../layout/types.ts';
import { FIXED_COLORS, paints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type JourneyRenderContext = Pick<
  RenderContext,
  'config' | 'theme' | 'warn' | 'idPrefix' | 'version'
>;

/** What every section of one render draws from. */
interface Scene {
  readonly w: SvgWriter;
  readonly model: JourneyModel;
  readonly layout: JourneyLayout;
  readonly ctx: JourneyRenderContext;
  readonly paint: Paints;
  readonly m: JourneyMetrics;
}

/** Writes the whole `<svg>` document for a laid-out journey. */
export function renderJourney(
  model: JourneyModel,
  layout: JourneyLayout,
  ctx: JourneyRenderContext,
  w: SvgWriter
): void {
  const scene: Scene = {
    w,
    model,
    layout,
    ctx,
    paint: paints(ctx, layout),
    m: journeyMetrics(ctx.config.journey ?? {}),
  };
  openRoot(scene);
  if (layout.legend.length > 0) drawLegend(scene);
  drawSections(scene);
  if (layout.tasks.length > 0) drawTasks(scene);
  if (layout.title) drawTitle(scene, layout.title);
  drawActivity(scene);
  w.close();
}

/** Lines start at the label's left edge (v12 drew the legend and title `text-anchor: start`). */
const leftAligned = (text: MeasuredLabel): MeasuredLabel => ({ ...text, left: true });

/** The `<svg>` root with its title and description (R-A11Y-1). */
function openRoot({ w, layout, ctx, model }: Scene): void {
  const { theme, config } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  const maxWidth = config.journey?.useMaxWidth !== false;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares their aliases.
  const font = theme.font();
  const fontSize = theme.length('fontSize');
  openSvgRoot(w, ctx, {
    name: 'journey',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    desc,
    attrs: {
      'font-family': font,
      'font-size': fontSize,
    },
  });
}

/** The actor legend (v12 `drawActorLegend`): a dot and a name per named actor (D244). */
function drawLegend(scene: Scene): void {
  const { w, layout, paint } = scene;
  w.open('g', { class: 'legend-entries', ...paint.fonts.legend });
  for (const e of layout.legend) drawLegendEntry(scene, e);
  w.close();
}

function drawLegendEntry({ w, paint, m }: Scene, e: LegendEntry): void {
  const id = `a:${e.actor}`;
  w.open('g', { class: 'legend-entry', 'data-id': id });
  w.leaf('circle', {
    class: `actor-${e.dot.slot}`,
    cx: e.dot.cx,
    cy: e.dot.cy,
    r: e.dot.r,
    fill: paint.actorOf(e.dot.slot),
    stroke: FIXED_COLORS.dot,
    'stroke-width': m.dotStroke,
  });
  w.label(leftAligned(e.label.text), centreX(e.label), centreY(e.label), {
    class: 'legend',
    'data-id': id,
    fill: paint.text,
  });
  w.close();
}

/**
 * The section bands, then one empty group for each section line no band opened (an empty
 * section, or a repeat folded into the run before it), so every line has its `data-ast`.
 */
function drawSections(scene: Scene): void {
  const { w, layout, model, paint } = scene;
  const banded = new Set(layout.bands.map((b) => b.section));
  const empty = model.sections.filter((_, i) => !banded.has(i));
  if (layout.bands.length === 0 && empty.length === 0) return;
  w.open('g', { class: 'sections', ...paint.fonts.task });
  layout.bands.forEach((b, i) => drawBand(scene, b, i));
  for (const s of empty)
    w.leaf('g', { class: 'journey-section empty', 'data-id': s.ast, 'data-ast': s.ast });
  w.close();
}

function drawBand({ w, paint, m }: Scene, b: BandLayout, index: number): void {
  const cls = `journey-section section-type-${b.slot}`;
  // A band of a section the model has no line for (a hand-built model) maps to no AST node.
  const ast = b.section === undefined ? undefined : b.ast;
  w.open('g', { class: cls, 'data-id': b.ast, 'data-ast': ast });
  w.leaf('rect', {
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    rx: m.cornerRadius,
    ry: m.cornerRadius,
    fill: paint.fillOf(b.slot),
    stroke: FIXED_COLORS.box,
    'stroke-width': m.boxStroke,
  });
  if (b.label) drawName(w, b.label, b.ast, 'section-label', paint.labelOf(index));
  w.close();
}

function drawName(
  w: SvgWriter,
  label: PlacedLabel,
  id: string,
  cls: string,
  fill: Paints['text']
): void {
  w.label(label.text, centreX(label), centreY(label), { class: cls, 'data-id': id, fill });
}

/** The tasks (v12 `drawTask`): line, face, box, actor dots and name, in v12's paint order. */
function drawTasks(scene: Scene): void {
  const { w, layout, paint } = scene;
  const names = new Map(layout.legend.map((e) => [e.actor, plainText(e.label.text)]));
  w.open('g', { class: 'tasks', ...paint.fonts.task });
  for (const t of layout.tasks) drawTask(scene, t, names);
  w.close();
}

/** A measured label as plain text, its lines joined with a space. */
const plainText = (label: MeasuredLabel): string =>
  label.lines.map((line) => line.map((r) => r.text).join('')).join(' ');

/**
 * One task. `names` holds each actor's legend text, which its dots' tooltips show: the name as
 * read (entities decoded, `<br>` a space), not as written.
 */
function drawTask(scene: Scene, t: TaskLayout, names: ReadonlyMap<string, string>): void {
  const { w, paint, m } = scene;
  w.open('g', { class: `task task-type-${t.slot}`, 'data-id': t.ast, 'data-ast': t.ast });
  w.leaf('line', {
    class: 'task-line',
    x1: t.line.x,
    y1: t.line.y1,
    x2: t.line.x,
    y2: t.line.y2,
    stroke: paint.text,
    'stroke-width': m.taskLineStroke,
    'stroke-dasharray': `${m.taskDash} ${m.taskGap}` as SafeValue,
  });
  drawFace(scene, t);
  w.leaf('rect', {
    x: t.x,
    y: t.y,
    width: t.width,
    height: t.height,
    rx: m.cornerRadius,
    ry: m.cornerRadius,
    fill: paint.fillOf(t.slot),
    stroke: FIXED_COLORS.box,
    'stroke-width': m.boxStroke,
  });
  for (const d of t.dots) {
    w.open('circle', {
      class: `actor-${d.slot}`,
      'data-id': `a:${d.actor}`,
      'data-ast': d.ast,
      cx: d.cx,
      cy: d.cy,
      r: d.r,
      fill: paint.actorOf(d.slot),
      stroke: FIXED_COLORS.dot,
      'stroke-width': m.dotStroke,
    });
    // v12's tooltip naming the actor, as the legend shows it.
    w.open('title');
    w.text(names.get(d.actor) ?? d.actor);
    w.close();
    w.close();
  }
  if (t.label) drawName(w, t.label, t.ast, 'task-label', paint.labelOf(t.band));
  w.close();
}

/** v12 `drawFace`: the face, its eyes and its mouth (an arc band, or a line when flat). */
function drawFace({ w, paint, m }: Scene, t: TaskLayout): void {
  const { face } = t;
  w.leaf('circle', {
    class: 'face',
    cx: face.cx,
    cy: face.cy,
    r: face.r,
    fill: paint.face,
    stroke: FIXED_COLORS.face,
    'stroke-width': m.faceStroke,
  });
  for (const eye of face.eyes)
    w.leaf('circle', {
      class: 'eye',
      cx: eye.cx,
      cy: eye.cy,
      r: eye.r,
      fill: FIXED_COLORS.feature,
      stroke: FIXED_COLORS.feature,
      'stroke-width': m.eyeStroke,
    });
  w.leaf('path', {
    class: `mouth mouth-${face.mouth}`,
    d: face.mouthPath,
    fill: face.mouth === 'flat' ? 'none' : FIXED_COLORS.feature,
    stroke: FIXED_COLORS.feature,
    'stroke-width': m.mouthStroke,
  });
}

/** The title (D248): bold, at v12's place, `titleColor` or `textColor`. */
function drawTitle({ w, paint }: Scene, title: PlacedLabel): void {
  w.label(leftAligned(title.text), centreX(title), centreY(title), {
    class: 'journey-title',
    fill: paint.title,
    ...paint.fonts.title,
  });
}

/** The activity arrow: v12's line and its marker, inlined in the line's colour (D245). */
function drawActivity({ w, layout, paint }: Scene): void {
  const a = layout.activity;
  w.open('g', { class: 'activity' });
  w.leaf('line', {
    class: 'activity-line',
    x1: a.x1,
    y1: a.y,
    x2: a.x2,
    y2: a.y,
    stroke: paint.text,
    'stroke-width': a.strokeWidth,
  });
  w.leaf('path', { class: 'arrowhead', d: a.head, fill: paint.text });
  w.close();
}
