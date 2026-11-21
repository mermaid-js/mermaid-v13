/**
 * The radar model (spec #422): what the parser (#446) produces and the layout (#447) reads. Plain,
 * frozen data in source order (R-ARCH-7). Shared contract of the radar tickets: change it only
 * additively, and say so in the run notes (`v13/docs/agents/runs/422/GAPS.md`).
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { TextModelFields } from '@mermaid-js/shared/parser/rule';

/** One `axis id["Label"]`. Duplicate names are all kept, as in v12. */
export interface RadarAxis {
  /** The `ID` as written (ASCII, D357). */
  readonly name: string;
  /** The `["…"]` label after v12's string conversion, else the name; `[""]` is an empty label. */
  readonly label: string;
  /** `axis:<name>`; a repeat of the name is `axis:<name>@2`, … (pitfall 9). */
  readonly astId: AstId;
}

/** One curve value, in axis order once detailed entries are reordered (v12 `db.ts:75-91`). */
export interface RadarEntry {
  readonly value: number;
  /** `curve:<name>>axis` for a detailed entry, `curve:<name>#k` (k from 0) for a positional one. */
  readonly astId: AstId;
}

/** One `curve id["Label"]{…}`. Duplicate names are all kept, as in v12. */
export interface RadarCurve {
  readonly name: string;
  /** As for `RadarAxis.label`. */
  readonly label: string;
  /**
   * Positional entries as written; detailed entries reordered to the axes (the first entry per axis
   * wins, one naming no axis is dropped with `RADAR_UNKNOWN_AXIS`). A count other than the axis
   * count is kept: the layout skips the curve, with `RADAR_CURVE_SKIPPED` (D356).
   */
  readonly entries: readonly RadarEntry[];
  /** `curve:<name>`; a repeat is `curve:<name>@2`, …. */
  readonly astId: AstId;
}

/**
 * v12 `db.ts` `MAX_TICKS`: more rings are clamped (`RADAR_TICKS_CLAMPED`, D356). Here, not in
 * `layout/`, so the parser (and the `./language` bundle) reads it without the layout.
 */
export const MAX_TICKS = 32;

/** The options as v12 resolves them: the last of each name wins (`db.ts:95-109`). */
export interface RadarOptions {
  readonly showLegend: boolean;
  /** At most `MAX_TICKS` (32); larger values are clamped with `RADAR_TICKS_CLAMPED` (D356). May be fractional. */
  readonly ticks: number;
  /** `null` when unset: the layout takes the largest entry. */
  readonly max: number | null;
  readonly min: number;
  readonly graticule: 'circle' | 'polygon';
}

export interface RadarModel extends TextModelFields {
  /** Axes in source order (v12 sets axes before curves, whatever the text order). */
  readonly axes: readonly RadarAxis[];
  /** Curves in source order. */
  readonly curves: readonly RadarCurve[];
  readonly options: RadarOptions;
  /**
   * The AST id of the `title` statement the title comes from (`title`, `title@2`, …), which the
   * drawn title carries as `data-ast`; absent for a front-matter title or none.
   */
  readonly titleAstId?: AstId;
}

/**
 * The value at `radius` when `max` is unset: the largest entry of any curve, drawn or not (v12
 * `Math.max` over all curves); 0 when there is none. The parser's `RADAR_EMPTY_RANGE` and the
 * layout both read it.
 */
export function largestEntry(curves: readonly RadarCurve[]): number {
  let max = -Infinity;
  for (const curve of curves)
    for (const entry of curve.entries) if (entry.value > max) max = entry.value;
  return max === -Infinity ? 0 : max;
}
