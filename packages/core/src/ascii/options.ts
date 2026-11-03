// The `ascii` config section, resolved once (DESIGN §6.3, D79, D77, D84): the API and every
// diagram's text entry read their options through here, so unset or invalid keys default the
// same way everywhere.
import type { CellPadding } from '../layout/units.ts';

/** The `ascii` section as given: config or explicit options, unchecked. */
export interface AsciiInput {
  charset?: unknown;
  padding?: unknown;
  maxWidth?: unknown;
}

/** The `ascii` section with its defaults applied. */
export interface AsciiOptions {
  /** Glyph set (D79): `unicode` unless `ascii` is asked for. */
  charset: 'unicode' | 'ascii';
  /** Cell padding preset (D77): `compact` unless `roomy` is asked for. */
  padding: CellPadding;
  /** Columns to fit (D84): a whole number ≥ 1, or none. */
  maxWidth: number | undefined;
}

/**
 * The resolved `ascii` options of `config`. Keys set in `explicit` (the API's per-call text
 * options, the CLI's flags) win over the config's, key by key, whatever set those: site
 * config, front matter or directives.
 */
export function asciiOptions(
  config: { readonly ascii?: unknown },
  explicit: AsciiInput = {}
): AsciiOptions {
  const own = (
    typeof config.ascii === 'object' && config.ascii !== null ? config.ascii : {}
  ) as AsciiInput;
  const pick = (key: keyof AsciiInput): unknown => explicit[key] ?? own[key];
  const width = pick('maxWidth');
  return {
    charset: pick('charset') === 'ascii' ? 'ascii' : 'unicode',
    padding: pick('padding') === 'roomy' ? 'roomy' : 'compact',
    maxWidth: typeof width === 'number' && width >= 1 ? Math.floor(width) : undefined,
  };
}
