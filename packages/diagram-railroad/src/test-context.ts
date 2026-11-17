/**
 * The railroad tests' context builder: the shared test context
 * (`@mermaid-js/shared/testing/test-context`) with railroad's config section and theme table.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import {
  selfLaidOut,
  testConfig,
  testRenderContext,
  testTheme,
  TEST_ID_PREFIX,
} from '@mermaid-js/shared/testing/test-context';
import { railroad } from './plugin.ts';

/** The theme `config` names (core's default with none), with railroad's table. */
export const railroadTestTheme = (
  config: ResolvedConfig = testConfig('railroad'),
  warn?: (w: Warning) => void,
  idPrefix = TEST_ID_PREFIX
): Promise<Theme> =>
  testTheme(config, { diagram: railroad.theme, idPrefix, ...(warn ? { warn } : {}) });

/** What {@link railroadRenderContext} takes besides the config and the theme. */
export interface RailroadContextOptions {
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  readonly warn: (w: Warning) => void;
}

/** The render context the pipeline would give railroad under `config` and `theme`. */
export const railroadRenderContext = (
  config: ResolvedConfig,
  theme: Theme,
  options: RailroadContextOptions
): RenderContext =>
  testRenderContext(config, theme, { ...options, layout: selfLaidOut('railroad') });
