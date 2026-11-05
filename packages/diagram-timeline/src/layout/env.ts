/**
 * What both directions share: the context the layout reads, the fonts, label measuring and
 * v12's box height, colour slots, grouping by section (D251), arrowheads and bounding boxes.
 */
import type { RenderContext } from '@mermaid-js/core';
import { fontSizePx, layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { TimelineModel, TimelinePeriod } from '../model.ts';
import { TIMELINE_METRICS, type TimelineMetrics } from './metrics.ts';
import type { Arrowhead, PlacedLabel, Point, Rect, TimelineLine } from './types.ts';

/** What the layout reads from the render context. */
export type TimelineLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline'>>;

const WEIGHT_NORMAL = 400;
const WEIGHT_BOLD = 700;

function weightOf(value: string): number {
  if (value === 'bold' || value === 'bolder') return WEIGHT_BOLD;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : WEIGHT_NORMAL;
}

/** A config length: the value when it is a finite number at least 0, else the default. */
function lengthOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export interface Env {
  readonly m: TimelineMetrics;
  /** The font size every height formula reads (v12 `conf.fontSize`). */
  readonly fontSize: number;
  readonly leftMargin: number;
  readonly padding: number;
  readonly multicolor: boolean;
  /**
   * Stroke widths of the axis and the dashed connectors: v12's attributes (4 and 2) where boxes
   * take the `cScale` palettes, else the theme's `strokeWidth` (v12 redux `.lineWrapper line`).
   */
  readonly axisWidth: number;
  readonly connectorWidth: number;
  /** How far each box's strokes reach past it, for the bounds (D224). */
  readonly strokes: BoxStrokes;
  /** Box labels: the theme's font at its weight (redux draws them bold). */
  readonly font: FontKey;
  readonly titleFont: FontKey;
  /** The title's font in v12's one-line title box (`titleReferenceFontSize`). */
  readonly titleReferenceFont: FontKey;
  /** `text` laid out to `wrap` px (D225). */
  measure(text: string, wrap: number, font?: FontKey): MeasuredLabel;
  /** v12 `drawNode`'s height: the label, `heightEm` font sizes and the padding once. */
  boxHeight(label: MeasuredLabel, padding: number): number;
}

/**
 * Whether boxes take the `cScale` palettes (`timelineScaleColors`, v12 classic and neo) or the
 * `mainBkg` / `nodeBorder` paint (v12 redux). The layout reads it for the line widths.
 */
export function scaleColors(theme: TimelineLayoutContext['theme']): boolean {
  return theme.value('timelineScaleColors') === 'true';
}

/** The widths of a box's outline and of the rule under it; 0 where none is drawn. */
export interface BoxStrokes {
  readonly outline: number;
  readonly rule: number;
}

/**
 * The strokes `timelineScaleColors` and the gradient give a box: none and a 3 px rule (v12
 * classic), a 2 px gradient outline and a 2 px rule (neo), or an outline at `strokeWidth` and
 * no rule (v12 redux).
 */
export function boxStrokes(theme: TimelineLayoutContext['theme']): BoxStrokes {
  const { ruleWidth, gradientWidth } = TIMELINE_METRICS.common;
  if (!scaleColors(theme)) return { outline: theme.number('strokeWidth'), rule: 0 };
  return theme.gradient()
    ? { outline: gradientWidth, rule: gradientWidth }
    : { outline: 0, rule: ruleWidth };
}

// Labels are plain text, as v12 drew them with `.text()` (spec #291): only core's line breaks
// (D225) apply, so every `<` but a `<br>` is escaped before core's label layout reads markup.
const RE_NOT_BREAK = /<(?!br\s*\/?>)/gi;
const plain = (text: string): string => text.replace(RE_NOT_BREAK, '&lt;');

export function envOf(ctx: TimelineLayoutContext): Env {
  const m = TIMELINE_METRICS;
  const conf = ctx.config.timeline ?? {};
  const fontSize = ctx.theme.number('fontSize');
  const family = ctx.theme.value('fontFamily');
  const font: FontKey = { family, size: fontSize, weight: weightOf(ctx.theme.value('fontWeight')) };
  const titleSize = fontSizePx(m.common.titleFontSize, fontSize) ?? fontSize;
  const refSize = m.common.titleReferenceFontSize;
  const titleRefSize = fontSizePx(m.common.titleFontSize, refSize) ?? refSize;
  const stroke = scaleColors(ctx.theme) ? undefined : ctx.theme.number('strokeWidth');
  return {
    m,
    fontSize,
    leftMargin: lengthOf(conf.leftMargin, m.common.leftMargin),
    padding: lengthOf(conf.padding, m.common.padding),
    multicolor: conf.disableMulticolor !== true,
    axisWidth: stroke ?? m.common.axisWidth,
    connectorWidth: stroke ?? m.common.connectorWidth,
    strokes: boxStrokes(ctx.theme),
    font,
    titleFont: { family, size: titleSize, weight: m.common.titleFontWeight },
    titleReferenceFont: { family, size: titleRefSize, weight: m.common.titleFontWeight },
    measure: (text, wrap, f = font) =>
      layoutLabel(plain(text), f, Math.max(wrap, m.common.minWrap), ctx.measurer, {
        inline: ctx.inline,
      }),
    boxHeight: (label, padding) => label.height + fontSize * m.common.heightEm + padding,
  };
}

/** One run of periods drawn together: a section's, or those before the first section. */
export interface Group {
  /** Index into `model.sections`; undefined for the periods before the first section. */
  readonly section?: number;
  /** Indexes into `model.periods`, in order. */
  readonly periods: readonly number[];
}

/**
 * Periods grouped by section position (D251): the periods before the first section first (no
 * section box), then one group per section in order, empty ones included.
 */
export function groupsOf(model: TimelineModel): Group[] {
  const by = new Map<number | undefined, number[]>();
  model.periods.forEach((p, i) => {
    const list = by.get(p.section) ?? [];
    list.push(i);
    by.set(p.section, list);
  });
  const out: Group[] = [];
  const lead = by.get(undefined);
  if (lead) out.push({ periods: lead });
  model.sections.forEach((_, s) => out.push({ section: s, periods: by.get(s) ?? [] }));
  return out;
}

/**
 * A period's colour slot: its section's ordinal, 0 before the first section (D251); with no
 * sections its own index, or 0 under `disableMulticolor` (v12 `sectionColor++`).
 */
export function slotOf(env: Env, model: TimelineModel, p: TimelinePeriod, index: number): number {
  if (model.sections.length > 0) return p.section ?? 0;
  return env.multicolor ? index : 0;
}

/** v12's marker at the end of (x1, y1) → (x2, y2), sized for a stroke of `width`. */
export function arrowAt(
  env: Env,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): Arrowhead {
  const { arrowBack, arrowAhead, arrowHalf } = env.m.common;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [dx, dy] = len > 0 ? [(x2 - x1) / len, (y2 - y1) / len] : [1, 0];
  const at = (along: number, across: number): Point => ({
    x: x2 + dx * along * width - dy * across * width,
    y: y2 + dy * along * width + dx * across * width,
  });
  return {
    tip: at(arrowAhead, 0),
    left: at(-arrowBack, -arrowHalf),
    right: at(-arrowBack, arrowHalf),
  };
}

export function line(
  env: Env,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number
): TimelineLine {
  return { x1, y1, x2, y2, width, arrow: arrowAt(env, x1, y1, x2, y2, width) };
}

/** A growing bounding box. */
export class Bounds {
  private x1 = Infinity;
  private y1 = Infinity;
  private x2 = -Infinity;
  private y2 = -Infinity;

  point(x: number, y: number): this {
    this.x1 = Math.min(this.x1, x);
    this.y1 = Math.min(this.y1, y);
    this.x2 = Math.max(this.x2, x);
    this.y2 = Math.max(this.y2, y);
    return this;
  }

  rect(r: Rect): this {
    return this.point(r.x, r.y).point(r.x + r.width, r.y + r.height);
  }

  /** The line's ends only, as v12's `getBBox` measured it. */
  segment(l: Pick<TimelineLine, 'x1' | 'y1' | 'x2' | 'y2'>): this {
    return this.point(l.x1, l.y1).point(l.x2, l.y2);
  }

  /** The line as drawn: its stroke and its arrowhead. */
  stroke(l: TimelineLine): this {
    const half = l.width / 2;
    for (const [x, y] of [
      [l.x1, l.y1],
      [l.x2, l.y2],
    ] as const)
      this.point(x - half, y - half).point(x + half, y + half);
    for (const p of [l.arrow.tip, l.arrow.left, l.arrow.right]) this.point(p.x, p.y);
    return this;
  }

  get empty(): boolean {
    return this.x1 > this.x2;
  }

  /** The box; a point at `origin` when nothing was added. */
  box(origin: Point): Rect {
    if (this.empty) return { x: origin.x, y: origin.y, width: 0, height: 0 };
    return { x: this.x1, y: this.y1, width: this.x2 - this.x1, height: this.y2 - this.y1 };
  }
}

/** The title's label, and how far it pushes the content down. */
export interface TitleBlock {
  readonly label?: MeasuredLabel;
  /**
   * How far the title's bottom passes v12's one-line title box (a one-line title at
   * `titleReferenceFontSize`): 0 for a one-line title at the default font size, so the
   * geometry is v12's.
   */
  readonly shift: number;
}

export function titleBlock(env: Env, title: string | undefined): TitleBlock {
  if (title === undefined || title.trim() === '') return { shift: 0 };
  const label = env.measure(title, Infinity, env.titleFont);
  // One line of the reference font: only its baseline and line height are read.
  const ref = env.measure(title, Infinity, env.titleReferenceFont);
  const refBottom = -ref.baseline + ref.lineHeight;
  const bottom = -label.baseline + label.height;
  return { label, shift: Math.max(0, bottom - refBottom) };
}

/** The title, left-aligned at `x` with its first baseline at v12's `y = 20` (D254). */
export function titleAt(env: Env, block: TitleBlock, x: number): PlacedLabel | undefined {
  const text = block.label;
  if (!text) return undefined;
  return {
    x,
    y: env.m.common.titleBaseline - text.baseline,
    width: text.width,
    height: text.height,
    text,
  };
}
