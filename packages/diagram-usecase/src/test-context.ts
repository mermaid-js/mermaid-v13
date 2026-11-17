/**
 * The usecase tests' context builder (as venn's, #495), which the ASCII fixtures share: the
 * shared test context (`@mermaid-js/shared/testing/test-context`) with usecase's config section
 * and theme table, laid out with core's `layered` unless another engine is given.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { layered, type LayoutEngine } from '@mermaid-js/core/layout';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import {
  testConfig,
  testRenderContext,
  testTheme,
  TEST_ID_PREFIX,
} from '@mermaid-js/shared/testing/test-context';
import { usecase } from './plugin.ts';

/** The config a render of `pre` resolves under `integrator`, as `initialize()` would get it. */
export const usecaseTestConfig = (
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig => testConfig('usecase', pre, integrator, warn);

/** The theme `config` names (core's default with none), with usecase's table. */
export const usecaseTestTheme = (
  config: ResolvedConfig = usecaseTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = TEST_ID_PREFIX
): Promise<Theme> =>
  testTheme(config, { diagram: usecase.theme, idPrefix, ...(warn ? { warn } : {}) });

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
export const usecaseRenderContext = (
  config: ResolvedConfig,
  theme: Theme,
  { engine = layered, ...options }: UsecaseContextOptions
): RenderContext => testRenderContext(config, theme, { ...options, layout: (g) => engine(g) });
