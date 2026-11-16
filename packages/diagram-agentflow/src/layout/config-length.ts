/**
 * Config lengths, read by the shared reader (`@mermaid-js/shared/config/readers`, #821): a
 * number, or a whole numeric string as its number (`"20"`, `" 2.5 "`, as v12 took them), from 0
 * up to 10000. Unset reads as the default. Anything else that is set (`"20px"`, `-5`, `true`)
 * reads as the default too, with one `AGENTFLOW_CONFIG_INVALID` warning per key, however often
 * it is read. Agentflow adds a default for every key and the default alone (`fallback`).
 */
import {
  configLengths as sectionLengths,
  type ConfigLengthWarning,
} from '@mermaid-js/shared/config/readers';
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
 * lengths, or a table of lengths). A key not in `defaults` is a type error. A key whose default
 * is no number draws 0, and its warning says "using the default"; every length agentflow reads
 * has a number default.
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
  const read = sectionLengths(path, AGENTFLOW_CONFIG_INVALID, values, defaults, warn);
  return Object.assign((key: K): number => read(key) ?? fallback(key), { fallback });
}
