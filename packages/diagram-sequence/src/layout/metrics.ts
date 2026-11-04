/**
 * The sequence layout's metrics table (D108, ADR-13 as amended): every length the layout uses,
 * with a `px` value set and a `cell` value set chosen by `units.id`. Core's `UnitProfile` has no
 * sequence section; this table is the only place in `layout/` that holds a length literal.
 *
 * The px values are v12's: the `sequence` config defaults of the v12 schema, and the constants
 * written into v12's `sequenceRenderer.ts` and `svgDraw.js`. The cell values are scaled to
 * character cells by hand (about px / 8 across, px / 16 down) for the text output (D100).
 * A px value set in `sequence` config is converted through `units.pxPerUnit` along its axis and
 * kept at least at the profile's minimum, as the flowchart builder does (`fromPx`).
 */
import type { SequenceDiagramConfig } from '@mermaid-js/core/config';
import { fromPx, type UnitProfile } from '@mermaid-js/core/layout';
import type { ParticipantKind } from '../model.ts';

export interface XY {
  readonly x: number;
  readonly y: number;
}

/** Lengths that `sequence` config can set (v12 key names). */
export interface ConfigLengths {
  /** Least gap between two participant boxes. */
  readonly actorMargin: number;
  /** Least participant box width; also the least note and message width. */
  readonly width: number;
  /** Least participant box height. */
  readonly height: number;
  /** Room around frames, boxes and notes; each nesting level of a frame adds one. */
  readonly boxMargin: XY;
  /** Room between a frame's border and its label text. */
  readonly boxTextMargin: XY;
  /** Room between a note's border and its text. */
  readonly noteMargin: XY;
  readonly activationWidth: number;
  /** Room on each side of a label in its box or message span. */
  readonly wrapPadding: number;
  /** Least width of a frame's label tab. */
  readonly labelBoxWidth: number;
  /** Least height of a frame's label tab and title. */
  readonly labelBoxHeight: number;
  readonly diagramMarginX: number;
  readonly diagramMarginY: number;
  /** Added below the mirrored participants. */
  readonly bottomMarginAdj: number;
}

/** Lengths v12 wrote into its renderer. */
export interface FixedLengths {
  /** From the top of a message row to the top of its label. */
  readonly messageLead: number;
  /** Label lines counted twice above a message line (v12 adds the first line's height again). */
  readonly messageLeadLines: number;
  /** How far above its line a message reaches in the frame bounds. */
  readonly messageRise: number;
  /** How far a curved self message reaches out from its lifeline. */
  readonly selfLoopReach: number;
  /** How far below its start a curved self message comes back. */
  readonly selfLoopDrop: number;
  /** The same with `rightAngles`. */
  readonly selfLoopSquareDrop: number;
  /** Room a self message takes below its line. */
  readonly selfLoopAdvance: number;
  /** How far above its row a self message reaches in the frame bounds. */
  readonly selfLoopRise: number;
  /** Half a lifeline's stroke: a message starts this far from the lifeline. */
  readonly lifelineHalf: number;
  /** Room an arrowhead takes at a message's end. */
  readonly arrowGap: number;
  /** A central connection's circle moves the line start this far. */
  readonly centralOffset: number;
  /** And this much more for a leftward bidirectional message. */
  readonly centralBidiOffset: number;
  /** From the activating row to the top of the activation bar. */
  readonly activationLead: number;
  /** A shorter activation is drawn this tall instead. */
  readonly activationMin: number;
  /** A short activation starts this far above its end row … */
  readonly activationShortLead: number;
  /** … and ends this far below it. */
  readonly activationShortTail: number;
  /** How far above its end an activation reaches in the frame bounds. */
  readonly activationRise: number;
  /** Room between a creating or destroying message's end and the participant's symbol. */
  readonly createGap: number;
  /** Width of a drawn symbol (stick figure, control, entity, database); 0 draws boxes only. */
  readonly symbolWidth: number;
  /** Where the lifeline starts below the top of a drawn symbol; the box height elsewhere. */
  readonly glyphLifeline: Readonly<Partial<Record<ParticipantKind, number>>>;
  /** A database's lifeline starts this many `boxTextMargin`s below its box. */
  readonly databaseTextMargins: number;
  /** Where a drawn symbol's label row starts below the top of its box; 0 elsewhere. */
  readonly symbolLabelTop: Readonly<Partial<Record<ParticipantKind, number>>>;
  /** The stick figure's label row height (v12 `ACTOR_GLYPH_HEIGHT`); 0 takes the box height. */
  readonly figureLabelHeight: number;
  /** Least room above and below a participant label in its box. */
  readonly actorPadY: number;
  /** Room above the drawing for the diagram title. */
  readonly titleBand: number;
  /** A box's members are widened by this many `boxMargin`s before its label is fitted (a count). */
  readonly boxLabelMargins: number;
}

export interface MetricsTable {
  /** Used when config sets none. */
  readonly defaults: ConfigLengths;
  /** The least a config value converts to. */
  readonly min: ConfigLengths;
  readonly fixed: FixedLengths;
}

const xy = (x: number, y: number): XY => ({ x, y });

const PX: MetricsTable = {
  defaults: {
    actorMargin: 50,
    width: 150,
    height: 65,
    boxMargin: xy(10, 10),
    boxTextMargin: xy(5, 5),
    noteMargin: xy(10, 10),
    activationWidth: 10,
    wrapPadding: 10,
    labelBoxWidth: 50,
    labelBoxHeight: 20,
    diagramMarginX: 50,
    diagramMarginY: 10,
    bottomMarginAdj: 1,
  },
  min: {
    actorMargin: 0,
    width: 0,
    height: 0,
    boxMargin: xy(0, 0),
    boxTextMargin: xy(0, 0),
    noteMargin: xy(0, 0),
    // A bar of no width could not show what it stacks on.
    activationWidth: 1,
    wrapPadding: 0,
    labelBoxWidth: 0,
    labelBoxHeight: 0,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  fixed: {
    messageLead: 10,
    messageLeadLines: 1,
    messageRise: 10,
    selfLoopReach: 60,
    selfLoopDrop: 20,
    selfLoopSquareDrop: 25,
    selfLoopAdvance: 30,
    selfLoopRise: 10,
    lifelineHalf: 1,
    arrowGap: 3,
    centralOffset: 4,
    centralBidiOffset: 6,
    activationLead: 2,
    activationMin: 18,
    activationShortLead: 6,
    activationShortTail: 12,
    activationRise: 10,
    createGap: 3,
    symbolWidth: 36,
    glyphLifeline: { actor: 80, boundary: 80, control: 75, entity: 75 },
    databaseTextMargins: 2,
    // v12 `svgDraw.js` label rows: below the stack, the cylinder, the figure or the glyph.
    symbolLabelTop: {
      collections: 6,
      database: 35,
      actor: 35,
      control: 34,
      entity: 36,
      boundary: 36,
    },
    figureLabelHeight: 65,
    actorPadY: 0,
    titleBand: 40,
    boxLabelMargins: 8,
  },
};

// A text-form box is its label plus a border and a space on each side: `wrapPadding` 2 across,
// `actorPadY` 1 down. Symbols are drawn as boxes in text, so they need no extra room.
const CELL: MetricsTable = {
  defaults: {
    actorMargin: 6,
    width: 19,
    height: 3,
    boxMargin: xy(1, 1),
    boxTextMargin: xy(1, 0),
    noteMargin: xy(2, 1),
    activationWidth: 2,
    wrapPadding: 2,
    labelBoxWidth: 6,
    labelBoxHeight: 1,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  min: {
    actorMargin: 2,
    width: 5,
    height: 3,
    boxMargin: xy(1, 1),
    boxTextMargin: xy(1, 0),
    noteMargin: xy(2, 1),
    activationWidth: 2,
    wrapPadding: 2,
    labelBoxWidth: 4,
    labelBoxHeight: 1,
    diagramMarginX: 0,
    diagramMarginY: 0,
    bottomMarginAdj: 0,
  },
  fixed: {
    messageLead: 1,
    messageLeadLines: 0,
    messageRise: 1,
    selfLoopReach: 3,
    selfLoopDrop: 1,
    selfLoopSquareDrop: 1,
    selfLoopAdvance: 2,
    selfLoopRise: 1,
    lifelineHalf: 1,
    arrowGap: 0,
    centralOffset: 1,
    centralBidiOffset: 1,
    activationLead: 0,
    activationMin: 1,
    activationShortLead: 0,
    activationShortTail: 1,
    activationRise: 1,
    createGap: 0,
    symbolWidth: 0,
    glyphLifeline: {},
    databaseTextMargins: 0,
    symbolLabelTop: {},
    figureLabelHeight: 0,
    actorPadY: 1,
    titleBand: 2,
    boxLabelMargins: 2,
  },
};

/** The table for a unit profile. */
export function metricsTable(units: UnitProfile): MetricsTable {
  return units.id === 'cell' ? CELL : PX;
}

/** The sequence layout's lengths for one render, in the profile's units. */
export interface SequenceMetrics extends ConfigLengths, FixedLengths {
  readonly cells: boolean;
  /** Half a length; whole cells round down, so columns stay on the grid. */
  half(v: number): number;
}

// Config numbers may arrive as strings from front matter, as v12 accepted them.
const MAX_CONFIG = 1e4;
function configNumber(value: unknown): number | undefined {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_CONFIG) : undefined;
}

type Axis = 'x' | 'y';
const SINGLE: Readonly<Record<string, Axis>> = {
  actorMargin: 'x',
  width: 'x',
  height: 'y',
  activationWidth: 'x',
  wrapPadding: 'x',
  labelBoxWidth: 'x',
  labelBoxHeight: 'y',
  diagramMarginX: 'x',
  diagramMarginY: 'y',
  bottomMarginAdj: 'y',
};
const BOTH = ['boxMargin', 'boxTextMargin', 'noteMargin'] as const;

/** Resolves the metrics for a profile and the `sequence` config section. */
export function sequenceMetrics(
  units: UnitProfile,
  config: Readonly<SequenceDiagramConfig> | undefined
): SequenceMetrics {
  const table = metricsTable(units);
  const cfg = (config ?? {}) as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = { ...table.fixed };
  const length = (key: string, axis: Axis, fallback: number, min: number): number => {
    const px = configNumber(cfg[key]);
    return px === undefined ? fallback : fromPx(units, px, axis, min);
  };
  for (const [key, axis] of Object.entries(SINGLE)) {
    const k = key as keyof ConfigLengths;
    out[key] = length(key, axis, table.defaults[k] as number, table.min[k] as number);
  }
  for (const key of BOTH) {
    out[key] = xy(
      length(key, 'x', table.defaults[key].x, table.min[key].x),
      length(key, 'y', table.defaults[key].y, table.min[key].y)
    );
  }
  const cells = units.id === 'cell';
  out.cells = cells;
  out.half = cells ? (v: number) => Math.floor(v / 2) : (v: number) => v / 2;
  return out as unknown as SequenceMetrics;
}

/** CSS font weights a config weight keyword stands for. */
export const FONT_WEIGHT = { normal: 400, bold: 700 } as const;
