/**
 * The railroad layout's fixed lengths in px (spec #526 §Package and contract, pitfall 13): v12's
 * constants in `railroadRenderer.ts` and `styles.ts`. The configurable lengths are the `railroad`
 * section's (`../config.ts`), the font is the config's or the theme's. No other file in
 * `layout/` writes a length literal (`packages/conformance/src/railroad-layout-literals.spec.ts`).
 * Railroad draws SVG in px (D216); its text output lays out in cells with the cell tables below.
 */
import type { RailroadLayoutConfig } from '../config.ts';

export interface RailroadMetrics {
  /** A terminal's corner radius: fixed, not `arcRadius` (`railroadRenderer.ts:112-113`). */
  readonly terminalCornerRadius: number;
  /** A special's dashed outline, dash then gap (`styles.ts:344`, `stroke-dasharray: 5,3`). */
  readonly specialDash: readonly [number, number];
  /** Added to the rule label's width to place the start marker (`nameWidth`, L542). */
  readonly nameGap: number;
  /** From the start marker to the definition (`definitionX = nameWidth + 20`, L543). */
  readonly definitionGap: number;
  /** From the definition's end to the end marker (L571, L594, L602). */
  readonly endGap: number;
  /** The track never runs above this distance from the rule's top (`max(20, up)`, L548). */
  readonly minBaseline: number;
  /** A rule is at least this tall (`max(40, …)`, L601). */
  readonly minRuleHeight: number;
  /** The canvas of a diagram with no rules (L650-654). */
  readonly emptyWidth: number;
  readonly emptyHeight: number;
}

export const RAILROAD_METRICS: RailroadMetrics = {
  terminalCornerRadius: 10,
  specialDash: [5, 3],
  nameGap: 20,
  definitionGap: 20,
  endGap: 10,
  minBaseline: 20,
  minRuleHeight: 40,
  emptyWidth: 200,
  emptyHeight: 100,
};

/** The CSS weight of every text but rule names (v12 sets none). */
export const NORMAL_WEIGHT = 400;

/** Rule names are drawn bold (`styles.ts` `.railroad-rule-name`) and measured so (D514). */
export const BOLD_WEIGHT = 700;

/**
 * The text output's fixed lengths in cells (#617, D518), in place of `RAILROAD_METRICS` when the
 * text entry lays out in cells (`cells.ts`). A point is a cell's centre, so a box `w` wide covers
 * `w + 1` columns, its borders included; a corner of track is one cell. The name, a blank cell
 * and the start marker; one cell of track to the definition and from it to the end marker. No
 * rule is taller than its definition needs, and an empty diagram is empty.
 */
export const RAILROAD_CELL_METRICS: RailroadMetrics = {
  terminalCornerRadius: 1,
  specialDash: [1, 1],
  nameGap: 1,
  definitionGap: 2,
  endGap: 2,
  minBaseline: 0,
  minRuleHeight: 0,
  emptyWidth: 0,
  emptyHeight: 0,
};

/**
 * The text output's lengths in cells (#617), by `ascii.padding` (D77): a box is its text, a blank
 * cell each side (`CELL_TEXT_ROOM` and the padding) and its borders, three rows high (`roomy`:
 * two blank cells each side and a blank row above and below); one cell of track between the
 * elements of a sequence; branches a row apart and a blank row between rules; corners of one
 * cell. The `railroad` section's px lengths are not read (the text entry warns when set).
 */
export const RAILROAD_CELL_LENGTHS: Readonly<Record<'compact' | 'roomy', RailroadLayoutConfig>> = {
  compact: {
    padding: 1,
    verticalSeparation: 1,
    horizontalSeparation: 2,
    arcRadius: 1,
    markerRadius: 0,
    strokeWidth: 0,
  },
  roomy: {
    padding: 2,
    verticalSeparation: 1,
    horizontalSeparation: 2,
    arcRadius: 1,
    markerRadius: 0,
    strokeWidth: 0,
  },
};

/**
 * What the text output adds to a box's text width: with the padding on both sides, a box's text
 * sits between the same number of blank cells each side (a box `w` wide covers `w + 1` columns).
 */
export const CELL_TEXT_ROOM = 1;

/** A text is one row in cells: its height is 0 between the cell centres. */
export const CELL_TEXT_METRICS = { ascent: 0, descent: 0, lineHeight: 0 } as const;

/**
 * In cells, the rows from a choice's main line to the nearest extent (box, bypass or loop) of a
 * branch off it: a full blank row between them (#617 review).
 */
export const CELL_MAIN_CLEARANCE = 2;

/** In cells, a rule takes the rows its definition covers (a point is a cell's centre). */
export const CELL_RULE_ROOM = 1;

/** The fixed lengths of a layout in px or in cells (a layout made without them, read back). */
export const metricsFor = (cells: boolean): RailroadMetrics =>
  cells ? RAILROAD_CELL_METRICS : RAILROAD_METRICS;
