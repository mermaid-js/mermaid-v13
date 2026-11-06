/**
 * The journey layout's metrics table (pitfall 13): every length the layout uses, px only (journey
 * has no text output, D216). This is the only place in `layout/` that holds a length literal.
 *
 * The values are v12's: the `journey` config defaults of the v12 schema, and the constants
 * written into v12's `journeyRenderer.ts` and `svgDraw.js`. A length set in `journey` config
 * replaces its default when it is a number from 0 to `MAX_LENGTH`; any other value keeps the
 * default, with one `JOURNEY_CONFIG` warning per key.
 */
import type { Warning } from '@mermaid-js/core';

/** Lengths that `journey` config can set (v12 key names and defaults). */
export interface ConfigLengths {
  /** Room left and right of what is drawn. */
  readonly diagramMarginX: number;
  /** Room above and below what is drawn; also the gap between the bands and the tasks. */
  readonly diagramMarginY: number;
  /** The x the tasks start at, before the legend widens it (D242). */
  readonly leftMargin: number;
  /** The width legend labels wrap to. */
  readonly maxLabelWidth: number;
  /** Task width. */
  readonly width: number;
  /** Task and band height. */
  readonly height: number;
  /** The gap between two tasks, and between two bands (D242). */
  readonly taskMargin: number;
  /** A legend label starts two of these right of `legendTextX` (v12 `drawText`'s tspan x). */
  readonly boxTextMargin: number;
}

/** Lengths v12 wrote into its renderer. */
export interface FixedLengths {
  /** The top of the bands. */
  readonly bandTop: number;
  /** The tasks start this many `height`s below the top, plus `diagramMarginY`. */
  readonly taskRows: number;
  /** The activity line is this many `height`s from the top. */
  readonly activityRows: number;
  readonly activityStroke: number;
  /**
   * v12's arrowhead marker (`M 0,0 V 4 L6,2 Z`, ref 5,2) in stroke widths: its length behind
   * the ref point, its reach past it, and its half height.
   */
  readonly headBack: number;
  readonly headReach: number;
  readonly headHalf: number;
  /** The centre of the first legend dot, and the step between rows of one line. */
  readonly legendTop: number;
  readonly legendRow: number;
  /** The x of the legend dots' centre, and v12's legend text x before its `boxTextMargin`s. */
  readonly legendDotX: number;
  readonly legendTextX: number;
  /** A legend label's first baseline is this far below its dot's centre. */
  readonly legendBaseline: number;
  readonly dotRadius: number;
  readonly dotStroke: number;
  /** The first task dot's centre from the task's left edge, and the step to the next. */
  readonly dotStart: number;
  readonly dotStep: number;
  /** The centre of a face at the top score; each point less moves it this far down. */
  readonly faceTop: number;
  readonly faceStep: number;
  readonly faceRadius: number;
  readonly faceStroke: number;
  /** The eyes: their offset from the centre along both axes, and their radius. */
  readonly eyeOffset: number;
  readonly eyeRadius: number;
  /** The mouth arc's radii (v12 `radius / 2` and `radius / 2.2`). */
  readonly mouthOuter: number;
  readonly mouthInner: number;
  /** How far below the face centre a smile's and a frown's arc centre sit. */
  readonly smileDrop: number;
  readonly sadDrop: number;
  /** A flat mouth: its drop below the centre and its half width. */
  readonly flatDrop: number;
  readonly flatHalf: number;
  readonly taskLineStroke: number;
  /** The task line's dash and gap (v12 `stroke-dasharray: 4 2`). */
  readonly taskDash: number;
  readonly taskGap: number;
  /** Band and task corners (v12 `rx = ry = 3`) and their outline (v12 note rect, 1 px). */
  readonly cornerRadius: number;
  readonly boxStroke: number;
  /** v12 strokes its eyes 2 px wide and its mouth 1 px. */
  readonly eyeStroke: number;
  readonly mouthStroke: number;
  /** The title's first baseline. */
  readonly titleBaseline: number;
}

export { drawnScore, SCORE } from '../score.ts';

/** v12 draws section fills from `fillType0`…`fillType7` (D241). */
export const SECTION_SLOTS = 8;

/** The title's default size and weight (D248). */
export const TITLE_FONT = { size: '4ex', weight: 700 } as const;
export const FONT_WEIGHT = { normal: 400, bold: 700 } as const;

const FACE_RADIUS = 15;

export const CONFIG_DEFAULTS: ConfigLengths = {
  diagramMarginX: 50,
  diagramMarginY: 10,
  leftMargin: 150,
  maxLabelWidth: 360,
  width: 150,
  height: 50,
  taskMargin: 50,
  boxTextMargin: 5,
};

export const FIXED: FixedLengths = {
  bandTop: 50,
  taskRows: 2,
  activityRows: 4,
  activityStroke: 4,
  headBack: 5,
  headReach: 1,
  headHalf: 2,
  legendTop: 60,
  legendRow: 20,
  legendDotX: 20,
  legendTextX: 40,
  legendBaseline: 7,
  dotRadius: 7,
  dotStroke: 1,
  dotStart: 14,
  dotStep: 10,
  faceTop: 300,
  faceStep: 30,
  faceRadius: FACE_RADIUS,
  faceStroke: 2,
  eyeOffset: FACE_RADIUS / 3,
  eyeRadius: 1.5,
  mouthOuter: FACE_RADIUS / 2,
  mouthInner: FACE_RADIUS / 2.2,
  smileDrop: 2,
  sadDrop: 7,
  flatDrop: 7,
  flatHalf: 5,
  taskLineStroke: 1,
  taskDash: 4,
  taskGap: 2,
  cornerRadius: 3,
  boxStroke: 1,
  eyeStroke: 2,
  mouthStroke: 1,
  titleBaseline: 25,
};

export interface JourneyMetrics extends ConfigLengths, FixedLengths {}

/**
 * The largest length `journey` config may set, in px. Far past any real diagram, and low enough
 * that the sums and products of the layout stay finite (core's number formatter writes
 * `Infinity` as it is).
 */
export const MAX_LENGTH = 10000;

/** A refused value as a warning shows it: a number as written, anything else as JSON, cut. */
function shown(value: unknown): string {
  if (typeof value === 'number') return String(value);
  const json = JSON.stringify(value) as string | undefined;
  return (json ?? typeof value).slice(0, 60);
}

function length(value: unknown): number | undefined {
  return typeof value === 'number' && value >= 0 && value <= MAX_LENGTH ? value : undefined;
}

/**
 * The metrics of one layout: the fixed lengths, and the config lengths over their defaults.
 * With `warn`, each refused length warns once (`JOURNEY_CONFIG`); the layout passes it, the
 * renderer, which reads the same config again, does not.
 */
export function journeyMetrics(
  config: Readonly<Record<string, unknown>> = {},
  warn?: (w: Warning) => void
): JourneyMetrics {
  const set = (key: keyof ConfigLengths): number => {
    const value = config[key];
    const ok = length(value);
    if (ok !== undefined) return ok;
    if (value !== undefined)
      warn?.({
        code: 'JOURNEY_CONFIG',
        message: `Ignored journey.${key} ${shown(value)}: a length is a number from 0 to ${MAX_LENGTH} px; the default ${CONFIG_DEFAULTS[key]} is used`,
        path: `journey.${key}`,
      });
    return CONFIG_DEFAULTS[key];
  };
  return {
    ...FIXED,
    diagramMarginX: set('diagramMarginX'),
    diagramMarginY: set('diagramMarginY'),
    leftMargin: set('leftMargin'),
    maxLabelWidth: set('maxLabelWidth'),
    width: set('width'),
    height: set('height'),
    taskMargin: set('taskMargin'),
    boxTextMargin: set('boxTextMargin'),
  };
}
