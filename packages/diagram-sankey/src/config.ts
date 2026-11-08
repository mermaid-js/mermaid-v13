/**
 * The `sankey` options the layout reads, each with v12's default (`SankeyDiagramConfig`). The
 * config resolver does not check value types, so a directive can set `"width": "wide"`: a
 * length is read as d3 read it (a number, or a numeric string as its number) and must be
 * finite and not negative; anything else, and an unknown alignment or label style, falls back
 * to the default. A `nodeColors` entry counts when it is the node's own string entry.
 * (Warnings for dropped values, and the colour check, are #503's.)
 */
import type { SankeyDiagramConfig } from '@mermaid-js/core/config';
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
  /** Own string entries only. */
  readonly nodeColors: ReadonlyMap<string, string>;
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
  const colours = new Map<string, string>();
  const given = s.nodeColors;
  if (given !== null && typeof given === 'object')
    for (const [id, colour] of Object.entries(given)) {
      if (typeof colour === 'string') colours.set(id, colour);
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
