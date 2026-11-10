/**
 * Config lengths, read as flowchart's builder reads its own (a copy, D446): a number, or a whole
 * numeric string as its number (`"20"`, `" 2.5 "`, as v12 took them), from 0 up to `MAX_CONFIG_LENGTH`. Unset
 * reads as the default. Anything else that is set (`"20px"`, `-5`, `true`) reads as the
 * default too, with one `AGENTFLOW_CONFIG_INVALID` warning per key, however often it is read.
 */
import { MAX_CONFIG_LENGTH } from './metrics.ts';

/** A config length the layout can't honour (pitfall 22): it draws with the default instead. */
export const AGENTFLOW_CONFIG_INVALID = 'AGENTFLOW_CONFIG_INVALID';

/** A whole decimal number, spaces around it allowed: `"20"`, `" 20 "`, `"2.5"`; not `"20px"`. */
const NUMERIC = /^\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*$/i;

export interface ConfigLengthWarning {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

/** A key's length in px: the value set, else the default. */
export type ConfigLength = (key: string) => number;

/**
 * Reads lengths from one config object (`path` names it in warnings, e.g. `agentflow`), with
 * `defaults` for the keys it may read (a section's generated defaults, whose other keys are not
 * lengths, or a table of lengths): a key whose default is no number defaults to 0.
 */
export function configLengths(
  section: unknown,
  defaults: object,
  path: string,
  warn: (warning: ConfigLengthWarning) => void
): ConfigLength {
  const values: Readonly<Record<string, unknown>> =
    section !== null && typeof section === 'object' ? (section as Record<string, unknown>) : {};
  const read = new Map<string, number>();
  return (key) => {
    const known = read.get(key);
    if (known !== undefined) return known;
    const value = Object.hasOwn(values, key) ? values[key] : undefined;
    // Any other string stays a string, and so is not taken.
    const n = typeof value === 'string' && NUMERIC.test(value) ? Number(value) : value;
    const taken = typeof n === 'number' && n >= 0 && n < MAX_CONFIG_LENGTH ? n : undefined;
    const fallback = (defaults as Readonly<Record<string, unknown>>)[key];
    const px = taken ?? (typeof fallback === 'number' ? fallback : 0);
    read.set(key, px);
    if (taken === undefined && value !== undefined) {
      const at = `${path}.${key}`;
      warn({
        code: AGENTFLOW_CONFIG_INVALID,
        message: `Ignored ${at}: it is not a number from 0 up to ${MAX_CONFIG_LENGTH}; using ${px}`,
        path: at,
      });
    }
    return px;
  };
}
