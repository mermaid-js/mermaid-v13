/**
 * The config, theme and render context a diagram's tests render with, built as the pipeline
 * builds them (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's config
 * defaults under the integrator's config and the source's front matter and `init` directives;
 * the theme that config names, with the diagram's table, its `themeVariables` and its dark half
 * for `theme: 'auto'`; and a render context with the table measurer unless another is given.
 * Each diagram package's `test-context.ts` is a call to these (#817). Workspace-only: specs and
 * `testing.ts` import it, the build and the tarball leave it out (#816).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ConfigInput,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import {
  createTheme,
  loadTheme,
  resolveThemeName,
  type DiagramThemeTable,
  type Theme,
  type ThemeName,
} from '@mermaid-js/core/theme';

/** The `data-mermaid-version` the test renders write. */
export const TEST_VERSION = '13.0.0-alpha.0';

/** The id prefix of a test render when none is given. */
export const TEST_ID_PREFIX = 'mermaid-0';

/** Where a test render's warnings go. */
export type Warn = (w: Warning) => void;

/**
 * The config a render of `pre` resolves for the diagram whose config section is `section`:
 * core's defaults, then `integrator` as `initialize()` would get it, then the front matter and
 * `init` directives; `below` is the layer under the integrator's (a plugin's engine, D284).
 */
export function testConfig(
  section: string,
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: Warn,
  below?: ConfigInput
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, below, {
    ...(warn ? { warn } : {}),
    section,
  });
}

/** Core's defaults under no source, resolved once per section. */
const plain = new Map<string, ResolvedConfig>();

/**
 * Core's defaults (resolved once) with the section `section` set to `values` as given, the
 * resolver passing a section's values through as they are; with `merge`, `values` go over the
 * section's resolved defaults instead.
 */
export function defaultsWith(
  section: string,
  values: Readonly<Record<string, unknown>>,
  merge = false
): ResolvedConfig {
  let base = plain.get(section);
  if (!base) plain.set(section, (base = testConfig(section)));
  const own = merge ? (base as Record<string, unknown>)[section] : undefined;
  const merged = own && typeof own === 'object' ? { ...own, ...values } : values;
  return { ...base, [section]: merged } as unknown as ResolvedConfig;
}

/** What {@link testTheme} takes besides the config. */
export interface TestThemeOptions {
  /** The diagram's theme table (`DiagramPlugin.theme`, D331). */
  readonly diagram?: DiagramThemeTable;
  /** The render's id prefix, which scopes the gradient's id (D182); `mermaid` when absent. */
  readonly idPrefix?: string;
  readonly warn?: Warn;
  /** `output.cssVariables`; core's default when absent. */
  readonly cssVariables?: boolean;
}

/**
 * The theme `config` names (with core's default config, redux-color), with the diagram's table,
 * the config's `themeVariables` and, for `theme: 'auto'`, its dark half.
 */
export async function testTheme(
  config: ResolvedConfig,
  { diagram, idPrefix, warn, cssVariables }: TestThemeOptions = {}
): Promise<Theme> {
  const choice = resolveThemeName(config.theme, warn);
  return createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram,
    ...(cssVariables === undefined ? {} : { cssVariables }),
    ...(warn ? { warn } : {}),
    ...(idPrefix === undefined ? {} : { idPrefix: () => idPrefix }),
  });
}

/** The theme `name` with a diagram's table and the author's `themeVariables`, if any. */
export async function namedTestTheme(
  name: ThemeName,
  diagram?: DiagramThemeTable,
  themeVariables?: Readonly<Record<string, unknown>>
): Promise<Theme> {
  return createTheme(await loadTheme(name), {
    diagram,
    ...(themeVariables ? { themeVariables } : {}),
  });
}

/** A config with only the section `section` set, for a layout that reads nothing else. */
export const sectionConfig = (
  section: string,
  values: Readonly<Record<string, unknown>>
): ResolvedConfig => ({ [section]: values }) as unknown as ResolvedConfig;

/** The `ctx.layout` of a diagram that lays itself out (`layoutKind: 'custom'`). */
export const selfLaidOut =
  (id: string): RenderContext['layout'] =>
  () => {
    throw new Error(`${id} lays itself out (layoutKind: custom)`);
  };

/** What {@link testRenderContext} takes besides the config and the theme. */
export interface TestContextOptions {
  readonly warn: Warn;
  /** `ctx.layout`: the graph engine, or {@link selfLaidOut}. */
  readonly layout: RenderContext['layout'];
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  readonly securityLevel?: RenderContext['securityLevel'];
  readonly linkSchemes?: RenderContext['linkSchemes'];
  readonly icon?: RenderContext['icon'];
  readonly iconPacks?: RenderContext['iconPacks'];
  readonly inline?: RenderContext['inline'];
}

/** The render context the pipeline would give a diagram under `config` and `theme`. */
export function testRenderContext(
  config: ResolvedConfig,
  theme: Theme,
  options: TestContextOptions
): RenderContext {
  const { warn, layout, linkSchemes, icon, iconPacks, inline } = options;
  return {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: options.securityLevel ?? 'default',
    idPrefix: options.idPrefix ?? TEST_ID_PREFIX,
    version: TEST_VERSION,
    layout,
    limits: resolveLimits(config),
    warn,
    ...(linkSchemes ? { linkSchemes } : {}),
    ...(icon ? { icon } : {}),
    ...(iconPacks ? { iconPacks } : {}),
    ...(inline ? { inline } : {}),
  };
}
