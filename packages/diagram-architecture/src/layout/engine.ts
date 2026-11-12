/**
 * The engine architecture is laid out with (#673, D556). `compass` places every node on the side
 * its edges name; `layered` (v12's `dagre`) ranks nodes down the flow and reads the sides only for
 * where a line leaves and enters a node, so `a:R --> L:b` puts `b` under `a` and the drawing
 * contradicts the source. v12 always laid architecture out with its own engine whatever `layout`
 * said, and integrations still set `layout: 'dagre'` site-wide, so those names map to `compass`
 * through the plugin's aliases (D284), with one {@link ARCHITECTURE_LAYOUT_IGNORED} warning. Every
 * other name is taken as D327 says: `compass`, an installed ELK (its ports are the named sides,
 * D503) or a registered engine.
 */
import { ARCHITECTURE_LAYOUT_IGNORED } from '../codes.ts';
import type { ArchitectureLayoutContext } from './context.ts';

/** The engine architecture lays out with when no config layer names one. */
const DEFAULT_ENGINE = 'compass';

/** Graph engines that ignore the sides for placement: `layered` and its v12 name. */
const SIDE_BLIND_ENGINES = ['layered', 'dagre'] as const;

/** The plugin's `layoutEngine` (D284): `compass`, which also stands in for those names. */
export const architectureLayoutEngine = {
  default: DEFAULT_ENGINE,
  aliases: Object.fromEntries(SIDE_BLIND_ENGINES.map((name) => [name, DEFAULT_ENGINE])),
} as const satisfies { default: string; aliases: Readonly<Record<string, string>> };

/**
 * One {@link ARCHITECTURE_LAYOUT_IGNORED} warning when `config.layout` names an engine the
 * aliases replaced with `compass`. `path` is `architecture.layout` when the section set it.
 */
export function warnIgnoredLayout({ config, warn }: ArchitectureLayoutContext): void {
  const name = config.layout;
  if (!(SIDE_BLIND_ENGINES as readonly unknown[]).includes(name)) return;
  const scoped = (config as { architecture?: { layout?: unknown } }).architecture?.layout;
  warn({
    code: ARCHITECTURE_LAYOUT_IGNORED,
    message: `Ignored layout "${String(name)}" for this architecture diagram: it does not place services on the sides their edges name (L, R, T, B); laid out with "${DEFAULT_ENGINE}".`,
    path: scoped === name ? 'architecture.layout' : 'layout',
  });
}
