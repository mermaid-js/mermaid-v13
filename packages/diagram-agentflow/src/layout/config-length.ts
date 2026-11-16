/**
 * Config lengths, read as flowchart's builder reads its own (a copy, D446): a number, or a whole
 * numeric string as its number (`"20"`, `" 2.5 "`, as v12 took them), from 0 up to `MAX_CONFIG_LENGTH`. Unset
 * reads as the default. Anything else that is set (`"20px"`, `-5`, `true`) reads as the
 * default too, with one `AGENTFLOW_CONFIG_INVALID` warning per key, however often it is read.
 */
import { MAX_CONFIG_LENGTH } from './metrics.ts';
import { type ConfigLengthWarning, numericValue } from '@mermaid-js/shared/config/readers';
export type { ConfigLengthWarning } from '@mermaid-js/shared/config/readers';
export { numericValue } from '@mermaid-js/shared/config/readers';

/** A config length the layout can't honour (pitfall 22): it draws with the default instead. */
export const AGENTFLOW_CONFIG_INVALID = 'AGENTFLOW_CONFIG_INVALID';

/** The lengths a config object may set, with their defaults (only numbers are length defaults). */
export type LengthDefaults<K extends string> = Readonly<Partial<Record<K, unknown>>>;

/** A key's length in px: the value set, else the default. `fallback` is the default alone. */
export interface ConfigLength<K extends string> {
  (key: K): number;
  /** The default of `key`, read without the value set (so a bad one raises no warning). */
  fallback(key: K): number;
}

/**
 * Reads lengths from one config object (`path` names it in warnings, e.g. `agentflow`), with
 * `defaults` for the keys it may read (a section's generated defaults, whose other keys are not
 * lengths, or a table of lengths): a key whose default is no number defaults to 0. A key not in
 * `defaults` is a type error.
 */
export function configLengths<K extends string>(
  section: unknown,
  defaults: LengthDefaults<K>,
  path: string,
  warn: (warning: ConfigLengthWarning) => void
): ConfigLength<K> {
  const values: Readonly<Record<string, unknown>> =
    section !== null && typeof section === 'object' ? (section as Record<string, unknown>) : {};
  const fallback = (key: K): number => {
    const d = defaults[key];
    return typeof d === 'number' ? d : 0;
  };
  const read = new Map<K, number>();
  const length = (key: K): number => {
    const known = read.get(key);
    if (known !== undefined) return known;
    const value = Object.hasOwn(values, key) ? values[key] : undefined;
    const n = numericValue(value);
    const taken = typeof n === 'number' && n >= 0 && n < MAX_CONFIG_LENGTH ? n : undefined;
    const px = taken ?? fallback(key);
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
  return Object.assign(length, { fallback });
}
