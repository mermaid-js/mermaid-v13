/**
 * The `packet` options, checked (D342, D226: never NaN, warn once per key). The config resolver
 * does not check value types or the schema's minimums, so a directive can set `"bitsPerRow": 0`.
 * A length is a number, or a numeric string as its number (v12 drew `"8"` as 8, by coercion).
 * A `rowHeight`, `bitWidth` or `bitsPerRow` below 1, a negative padding, a non-integer
 * `bitsPerRow` or anything that is not a number falls back to the default, and the parse reports
 * one `PACKET_CONFIG_INVALID` warning per key.
 *
 * `showBits` and `bitOrder` are read as v12's renderer read them (`showBits` truthy,
 * `bitOrder === 'descending'`), with no warning.
 */

export interface PacketConfig {
  readonly rowHeight: number;
  readonly bitWidth: number;
  readonly bitsPerRow: number;
  readonly showBits: boolean;
  readonly bitOrder: 'ascending' | 'descending';
  readonly paddingX: number;
  readonly paddingY: number;
}

/**
 * `PacketDiagramConfig`'s defaults (`core/schema/config.schema.yaml`). Hand-kept until T5 (#462)
 * gives the package a manifest and `gen:config` writes `generated/config-defaults.ts`.
 */
export const PACKET_CONFIG_DEFAULTS: PacketConfig = Object.freeze({
  rowHeight: 32,
  bitWidth: 32,
  bitsPerRow: 32,
  showBits: true,
  bitOrder: 'ascending',
  paddingX: 5,
  paddingY: 5,
});

/** One key that fell back to its default. */
export interface PacketConfigProblem {
  readonly key: string;
  readonly message: string;
}

type LengthKey = 'rowHeight' | 'bitWidth' | 'bitsPerRow' | 'paddingX' | 'paddingY';

/** Each length key: its smallest value, whether it must be whole, and how a message says so. */
const LENGTHS: readonly (readonly [LengthKey, number, boolean, string])[] = [
  ['rowHeight', 1, false, 'a number of 1 or more'],
  ['bitWidth', 1, false, 'a number of 1 or more'],
  ['bitsPerRow', 1, true, 'a whole number of 1 or more'],
  ['paddingX', 0, false, 'a number of 0 or more'],
  ['paddingY', 0, false, 'a number of 0 or more'],
];

function configNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** The packet options from the resolved `packet` config section, each checked. */
export function packetConfig(section: Readonly<Record<string, unknown>> | undefined): {
  config: PacketConfig;
  problems: PacketConfigProblem[];
} {
  const given = section ?? {};
  const out: Record<string, unknown> = { ...PACKET_CONFIG_DEFAULTS };
  const problems: PacketConfigProblem[] = [];
  for (const [key, min, whole, wants] of LENGTHS) {
    const value = given[key];
    if (value === undefined) continue;
    const n = configNumber(value);
    if (Number.isFinite(n) && n >= min && (!whole || Number.isInteger(n))) {
      out[key] = n;
      continue;
    }
    const used = PACKET_CONFIG_DEFAULTS[key];
    problems.push({
      key,
      message: `packet.${key} is ${shown(value)}, not ${wants}; using the default ${used}.`,
    });
  }
  if (given.showBits !== undefined) out.showBits = Boolean(given.showBits);
  if (given.bitOrder !== undefined) {
    out.bitOrder = given.bitOrder === 'descending' ? 'descending' : 'ascending';
  }
  return { config: Object.freeze(out) as unknown as PacketConfig, problems };
}
