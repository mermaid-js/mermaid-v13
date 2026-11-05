/**
 * Test-only (not built, not exported): the internal render entry the render specs use until the
 * plugin can register (the parser, #336, is not merged). It builds the render context as the
 * public pipeline does (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's
 * config defaults under the integrator's config, the theme with its `themeVariables` and its
 * dark half for `theme: 'auto'`, the deterministic table measurer, and the writer with the
 * theme's gradient. T5 swaps it for `createMermaid().render()` over parsed sources.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { streamWriter } from '@mermaid-js/core/svg';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import { layoutTimeline, type TimelineLayout } from '../layout/index.ts';
import type { TimelineModel } from '../model.ts';
import { renderTimeline } from './render.ts';

export interface RenderForTestOptions {
  /** Integrator config, as `initialize()` would get it. */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
}

export interface RenderedForTest {
  readonly svg: string;
  readonly layout: TimelineLayout;
  readonly config: ResolvedConfig;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

export async function renderForTest(
  model: TimelineModel,
  options: RenderForTestOptions = {}
): Promise<RenderedForTest> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push({ code: w.code, message: w.message });
  const config = resolveConfig(CORE_DEFAULTS, options.config, undefined, [], undefined, {
    warn,
    section: 'timeline',
  });
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
    idPrefix: () => idPrefix,
  });
  const ctx: RenderContext = {
    config,
    measurer: tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: () => {
      throw new Error('timeline lays itself out');
    },
    limits: resolveLimits(config),
    warn,
  };
  const layout = layoutTimeline(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient });
  renderTimeline(model, layout, ctx, w);
  return {
    svg: w.finish(),
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
