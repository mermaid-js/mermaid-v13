/**
 * The `sankey` options the layout reads, each with v12's default (`SankeyDiagramConfig`). The
 * config resolver does not check value types, so a directive can set `"width": "wide"`. A
 * length is read as a finite number of 0 or more, or a numeric string as its number; anything
 * else, and an unknown alignment or label style, falls back to the default. v12 differs (GAPS
 * #499): d3 took `+value`, so a negative `nodePadding` overlapped nodes and a negative
 * `nodeWidth` drew boxes inside out, and a string `nodePadding` was concatenated with v12's
 * `+ 15` before d3 read it. A `nodeColors` entry counts when it is the node's own entry and a
 * string that passes core's colour check: it takes the node out of the Tableau10 slots (v12's
 * `??`). Any other entry counts as absent (spec #427 §Integration: dropped, and the default
 * used), so the node takes its slot; v12 drew such a node, and a link stroked from it, black
 * or not at all (GAPS #502). #503 warns on each dropped or invalid value.
 */
import type { SankeyDiagramConfig } from '@mermaid-js/core/config';
import { checkColor, type SafeColor } from '@mermaid-js/core/svg';
import { SANKEY_LENGTH_DEFAULTS } from './layout/metrics.ts';
import type { SankeyAlignment, SankeyLabelStyle } from './layout/types.ts';

export interface SankeyLayoutConfig {
  readonly width: number;
  readonly height: number;
  readonly nodeWidth: number;
  readonly nodePadding: number;
  readonly nodeAlignment: SankeyAlignment;
  readonly showValues: boolean;
  readonly prefix: string;
  readonly suffix: string;
  readonly labelStyle: SankeyLabelStyle;
  /** The node's own entries that pass the colour check. */
  readonly nodeColors: ReadonlyMap<string, SafeColor>;
}

const ALIGNMENTS: readonly SankeyAlignment[] = ['left', 'right', 'center', 'justify'];
const LABEL_STYLES: readonly SankeyLabelStyle[] = ['legacy', 'outlined'];

/** A finite number of 0 or more, or a string that reads as one; else `fallback`. */
function length(value: unknown, fallback: number): number {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

/** The layout's options from the resolved `sankey` section. */
export function sankeyLayoutConfig(
  section: Readonly<SankeyDiagramConfig> | Readonly<Record<string, unknown>> | undefined
): SankeyLayoutConfig {
  const s = (section ?? {}) as Readonly<Record<string, unknown>>;
  const d = SANKEY_LENGTH_DEFAULTS;
  const colours = new Map<string, SafeColor>();
  const given = s.nodeColors;
  if (given !== null && typeof given === 'object')
    for (const [id, value] of Object.entries(given)) {
      const colour = typeof value === 'string' ? checkColor(value) : undefined;
      if (colour) colours.set(id, colour);
    }
  return {
    width: length(s.width, d.width),
    height: length(s.height, d.height),
    nodeWidth: length(s.nodeWidth, d.nodeWidth),
    nodePadding: length(s.nodePadding, d.nodePadding),
    nodeAlignment: oneOf(s.nodeAlignment, ALIGNMENTS, 'justify'),
    showValues: typeof s.showValues === 'boolean' ? s.showValues : true,
    prefix: typeof s.prefix === 'string' ? s.prefix : '',
    suffix: typeof s.suffix === 'string' ? s.suffix : '',
    labelStyle: oneOf(s.labelStyle, LABEL_STYLES, 'legacy'),
    nodeColors: colours,
  };
}
