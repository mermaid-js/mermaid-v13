/**
 * The `sankey` options, read here once for the layout and the renderer, each with the schema's
 * default (`pnpm gen:config`, the plugin's `configDefaults`: v12's `SankeyDiagramConfig`). The
 * config resolver does not check value types, so a directive can set `"width": "wide"`. A
 * length is read as a finite number of 0 or more, or a numeric string as its number; anything
 * else, an unknown alignment or label style, and a value of the wrong type fall back to the
 * default with one `SANKEY_CONFIG_INVALID` warning per key. v12 differs (GAPS #499): d3 took
 * `+value`, so a negative `nodePadding` overlapped nodes and a negative `nodeWidth` drew boxes
 * inside out, and a string `nodePadding` was concatenated with v12's `+ 15` before d3 read it.
 *
 * A `nodeColors` entry counts when it is the node's own entry and a string that passes core's
 * colour check: it takes the node out of the Tableau10 slots (v12's `??`). Any other entry, and
 * a `linkColor` that is neither a mode nor a colour, is dropped (spec #427 §Integration) with
 * one `SANKEY_COLOR_INVALID` warning per render naming each, and the default is drawn: the
 * node takes its slot, the links the gradient. v12 drew such a node, and a link stroked from
 * it, black or not at all (GAPS #502).
 *
 * `useMaxWidth` that is not a boolean is read as the default, `true`: v12's schema documented
 * `false` for sankey, but its bundled defaults held `true`, and every sankey without the key drew
 * `width="100%"` with a `max-width` (#503).
 */
import type { Warning } from '@mermaid-js/core';
import type {
  SankeyDiagramConfig,
  SankeyLabelStyle,
  SankeyNodeAlignment,
} from '@mermaid-js/core/config';
import { checkColor, type SafeColor } from '@mermaid-js/core/svg';
import { SANKEY_COLOR_INVALID, SANKEY_CONFIG_INVALID } from './codes.ts';
import { sankeyConfigDefaults } from './generated/config-defaults.ts';
import type { LinkPaint } from './layout/types.ts';
import { shownValue as shown } from '@mermaid-js/core/config';

export interface SankeyLayoutConfig {
  readonly width: number;
  readonly height: number;
  readonly nodeWidth: number;
  readonly nodePadding: number;
  readonly nodeAlignment: SankeyNodeAlignment;
  readonly showValues: boolean;
  readonly prefix: string;
  readonly suffix: string;
  readonly labelStyle: SankeyLabelStyle;
  /** The node's own entries that pass the colour check. */
  readonly nodeColors: ReadonlyMap<string, SafeColor>;
  /** `linkColor` as drawn: a mode, or one checked colour; the default when it is neither. */
  readonly linkColor: LinkPaint;
  readonly useMaxWidth: boolean;
}

type Key = Exclude<keyof SankeyLayoutConfig, 'nodeColors' | 'linkColor'>;

/** The schema gives every key read here a default (`mermaid/src/sankey.spec.ts` pins it). */
const DEFAULTS = sankeyConfigDefaults as Pick<SankeyLayoutConfig, Key | 'linkColor'>;

/** Every value of the schema's enums: the compiler flags one missing here. */
const ALIGNMENTS = Object.keys({
  left: true,
  right: true,
  center: true,
  justify: true,
} satisfies Record<SankeyNodeAlignment, true>) as readonly SankeyNodeAlignment[];
const LABEL_STYLES = Object.keys({
  legacy: true,
  outlined: true,
} satisfies Record<SankeyLabelStyle, true>) as readonly SankeyLabelStyle[];
const MODES: ReadonlySet<string> = new Set(['gradient', 'source', 'target']);

/**
 * `linkColor` as drawn: a mode is matched before the colour check (`checkColor('gradient')`
 * passes as a named colour); any other string is one colour for every link when it passes the
 * check. Undefined when it is neither.
 */
function linkPaint(given: unknown): LinkPaint | undefined {
  if (typeof given !== 'string') return undefined;
  return MODES.has(given) ? (given as LinkPaint) : checkColor(given);
}

type Reader = (value: unknown) => unknown;

/** A finite number of 0 or more, or a string that reads as one; else undefined. */
const length: Reader = (value) => {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const oneOf =
  (values: readonly string[]): Reader =>
  (value) =>
    typeof value === 'string' && values.includes(value) ? value : undefined;
const ofType =
  (type: 'boolean' | 'string'): Reader =>
  (value) =>
    typeof value === type ? value : undefined;

const LENGTH = [length, 'a number of 0 or more'] as const;

/** Each key the layout reads: how it is read, and how a warning says what it wants. */
const READERS: Readonly<Record<Key, readonly [Reader, string]>> = {
  width: LENGTH,
  height: LENGTH,
  nodeWidth: LENGTH,
  nodePadding: LENGTH,
  nodeAlignment: [oneOf(ALIGNMENTS), `one of ${ALIGNMENTS.join(', ')}`],
  showValues: [ofType('boolean'), 'true or false'],
  prefix: [ofType('string'), 'a string'],
  suffix: [ofType('string'), 'a string'],
  labelStyle: [oneOf(LABEL_STYLES), `one of ${LABEL_STYLES.join(', ')}`],
  useMaxWidth: [ofType('boolean'), 'true or false'],
};

/** A dropped colour: its key under `sankey`, and its value as a warning shows it. */
type Dropped = readonly [key: string, shown: string];

/**
 * `nodeColors`' entries that pass the colour check, and the entries dropped; undefined when
 * `nodeColors` is not an object at all.
 */
function readNodeColors(
  given: unknown
): { colours: Map<string, SafeColor>; dropped: Dropped[] } | undefined {
  const colours = new Map<string, SafeColor>();
  const dropped: Dropped[] = [];
  if (given === undefined) return { colours, dropped };
  if (given === null || typeof given !== 'object' || Array.isArray(given)) return undefined;
  for (const [id, value] of Object.entries(given)) {
    const colour = typeof value === 'string' ? checkColor(value) : undefined;
    if (colour) colours.set(id, colour);
    else dropped.push([`nodeColors.${id}`, shown(value)]);
  }
  return { colours, dropped };
}

/** One `SANKEY_CONFIG_INVALID`: `key` is `value`, not what it `wants`; `using` instead. */
const invalid = (key: string, value: unknown, wants: string, using: string): Warning => ({
  code: SANKEY_CONFIG_INVALID,
  message: `sankey.${key} is ${shown(value)}, not ${wants}; using ${using}`,
  path: `sankey.${key}`,
});

/**
 * The layout's and the renderer's options from the resolved `sankey` section, each checked. With
 * `warn`, each key that falls back warns once, and every dropped colour (`linkColor` and each
 * `nodeColors` entry) is named in one `SANKEY_COLOR_INVALID`.
 */
export function sankeyLayoutConfig(
  section: Readonly<SankeyDiagramConfig> | Readonly<Record<string, unknown>> | undefined,
  warn?: (w: Warning) => void
): SankeyLayoutConfig {
  const s = (section ?? {}) as Readonly<Record<string, unknown>>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(READERS) as Key[]) {
    const [read, wants] = READERS[key];
    const value = s[key];
    const got = value === undefined ? undefined : read(value);
    out[key] = got ?? DEFAULTS[key];
    if (value !== undefined && got === undefined)
      warn?.(invalid(key, value, wants, `the default ${shown(DEFAULTS[key])}`));
  }
  const dropped: Dropped[] = [];
  const linkColor = s.linkColor === undefined ? undefined : linkPaint(s.linkColor);
  if (s.linkColor !== undefined && linkColor === undefined)
    dropped.push(['linkColor', shown(s.linkColor)]);
  const read = readNodeColors(s.nodeColors);
  if (read) dropped.push(...read.dropped);
  else warn?.(invalid('nodeColors', s.nodeColors, 'an object of node colours', 'none'));
  if (dropped.length > 0)
    warn?.({
      code: SANKEY_COLOR_INVALID,
      message: `Not a colour, so the default is drawn instead: ${dropped.map(([key, value]) => `sankey.${key} ${value}`).join(', ')}`,
      path: `sankey.${dropped[0]![0]}`,
    });
  return {
    ...(out as Pick<SankeyLayoutConfig, Key>),
    nodeColors: read?.colours ?? new Map(),
    linkColor: linkColor ?? DEFAULTS.linkColor,
  };
}
