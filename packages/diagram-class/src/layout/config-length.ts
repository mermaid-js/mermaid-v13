/**
 * `class` config lengths, read as the M4 ports read them (mindmap, timeline, gitGraph): a number,
 * or a whole numeric string as its number (`"20"`, `" 2.5 "`, as v12 took them), from 0 up to
 * 10000. Anything else that is set (`"20px"`, `-5`, `true`) reads as the schema default, as if
 * unset in a render (whose resolved config carries the defaults), with one `CLASS_CONFIG_IGNORED` warning per
 * key, however often the key is read. The config resolver checks no value types, so a directive
 * can set any of these.
 */

/** A config length the layout can't honour (pitfall 22): it draws with the default instead. */
const CLASS_CONFIG_IGNORED = 'CLASS_CONFIG_IGNORED';

/** A whole decimal number, spaces around it allowed: `"20"`, `" 20 "`, `"2.5"`; not `"20px"`. */
const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

/** Lengths at or above this are not taken: the cap the builder always had. */
const MAX = 1e4;

/** The warning `configLengths` raises. */
export interface ConfigLengthWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

/** A key's length in px, or undefined when it is unset (or no length and has no default). */
export type ConfigLength = (key: string) => number | undefined;

/**
 * Reads lengths from the `class` section, warning once for each key that is no length. `defaults`
 * is the section's generated defaults.
 */
export function configLengths(
  section: Readonly<Record<string, unknown>>,
  defaults: object,
  warn: ((warning: ConfigLengthWarning) => void) | undefined
): ConfigLength {
  const read = new Map<string, number | undefined>();
  return (key) => {
    if (read.has(key)) return read.get(key);
    const value = section[key];
    // Any other string stays a string, and so is not taken.
    const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
    const taken = typeof n === 'number' && n >= 0 && n < MAX ? n : undefined;
    const fallback = (defaults as Readonly<Record<string, unknown>>)[key];
    // Unset reads as unset: the layout's own fallback applies, as before.
    const px =
      taken ?? (value !== undefined && typeof fallback === 'number' ? fallback : undefined);
    read.set(key, px);
    if (taken === undefined && value !== undefined) {
      const path = `class.${key}`;
      warn?.({
        code: CLASS_CONFIG_IGNORED,
        message: `Ignored ${path}: it is not a number from 0 up to 10000; using ${px ?? 'the default'}`,
        path,
      });
    }
    return px;
  };
}
