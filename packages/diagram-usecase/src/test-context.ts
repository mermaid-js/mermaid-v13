/**
 * The usecase tests' one context builder (as venn's, #495), which the render harness
 * (`render/harness.ts`) and the conformance render and theme specs share. It builds what the
 * pipeline builds (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): the config core
 * resolves from its defaults, the integrator's config and the source's front matter and
 * directives; the theme that config names, with the plugin's table, its `themeVariables` and its
 * dark half for `theme: 'auto'`; and a render context with a measurer (the table measurer by
 * default), a layout engine (core's `layered` by default) and the warnings collected.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ConfigInput,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import { layered, pxProfile, type LayoutEngine } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName, type Theme } from '@mermaid-js/core/theme';
import { usecase } from './plugin.ts';

/** The `data-mermaid-version` the test renders write. */
export const TEST_VERSION = '13.0.0-alpha.0';

/** The id prefix of a test render when none is given. */
export const ID_PREFIX = 'mermaid-0';

/**
 * The config a render of `pre` resolves: core's defaults, then `integrator` as `initialize()`
 * would get it, then the front matter and `init` directives.
 */
export function usecaseTestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, undefined, {
    ...(warn ? { warn } : {}),
    section: 'usecase',
  });
}

/**
 * The theme `config` names (with no config, core's default, redux-color), with usecase's table,
 * the config's `themeVariables` and, for `theme: 'auto'`, its dark half.
 */
export async function usecaseTestTheme(
  config: ResolvedConfig = usecaseTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = ID_PREFIX
): Promise<Theme> {
  const choice = resolveThemeName(config.theme, warn);
  return createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: usecase.theme,
    ...(warn ? { warn } : {}),
    idPrefix: () => idPrefix,
  });
}

/** What {@link usecaseRenderContext} takes besides the config and the theme. */
export interface UsecaseContextOptions {
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  /** The layout engine; core's `layered` when left out. */
  readonly engine?: LayoutEngine;
  readonly icon?: RenderContext['icon'];
  readonly warn: (w: Warning) => void;
}

/** The render context the pipeline would give usecase under `config` and `theme`. */
export function usecaseRenderContext(
  config: ResolvedConfig,
  theme: Theme,
  {
    measurer = tableMeasurer,
    idPrefix = ID_PREFIX,
    engine = layered,
    icon,
    warn,
  }: UsecaseContextOptions
): RenderContext {
  return {
    config,
    measurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: (graph) => engine(graph),
    limits: resolveLimits(config),
    ...(icon ? { icon } : {}),
    warn,
  };
}
