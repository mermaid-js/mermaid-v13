/**
 * Config: the schema-generated `MermaidConfig` types and defaults, and `resolveConfig`,
 * which merges one render's config sources into a frozen object (DESIGN §9).
 */
import { deepFreeze } from './freeze.ts';
import { CORE_DEFAULTS as GENERATED_DEFAULTS } from './generated/defaults.ts';
import type { MermaidConfig } from './generated/config.type.ts';
import type { DeepReadonly } from './resolve.ts';

export type * from './generated/config.type.ts';
export type { KeyNote, KeyTree } from './keys.ts';
/** The schema's key tree: every section's keys, for routing config between sections (D534). */
export { KEY_TREE } from './generated/keys.ts';
export { checkFragment, type ConfigAlias, type ConfigFragment } from './fragment.ts';
export {
  INTEGRATOR_ONLY_KEYS,
  resolveConfig,
  resolveSite,
  resolveText,
  type ConfigInput,
  type ConfigSource,
  type ConfigWarning,
  type ConfigWarningCode,
  type DeepReadonly,
  type ResolveConfigOptions,
  type ResolvedConfig,
  type ResolvedSite,
} from './resolve.ts';

/** Top-level defaults from the schema, frozen. Diagram sections come from their packages. */
export const CORE_DEFAULTS: DeepReadonly<MermaidConfig> = deepFreeze(GENERATED_DEFAULTS);
