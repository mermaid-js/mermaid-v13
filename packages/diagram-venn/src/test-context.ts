/**
 * The venn tests' context builder, which the layout specs, the conformance layout corpus, parity
 * and stress share: the shared test context (`@mermaid-js/shared/testing/test-context`) with
 * venn's config section and theme table.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import {
  defaultsWith,
  selfLaidOut,
  testConfig,
  testRenderContext,
  testTheme,
  TEST_ID_PREFIX,
} from '@mermaid-js/shared/testing/test-context';
import type { VennModel } from './model.ts';
import { parseVenn } from './parser/index.ts';
import { venn } from './plugin.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

/** The config a render of `pre` resolves under `integrator`, as `initialize()` would get it. */
export const vennTestConfig = (
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig => testConfig('venn', pre, integrator, warn);

/** The theme `config` names (core's default with none), with venn's table. */
export const vennTestTheme = (
  config: ResolvedConfig = vennTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = TEST_ID_PREFIX
): Promise<Theme> =>
  testTheme(config, { diagram: venn.theme, idPrefix, ...(warn ? { warn } : {}) });

/** What {@link vennRenderContext} takes besides the config and the theme. */
export interface VennContextOptions {
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  readonly warn: (w: Warning) => void;
}

/** The render context the pipeline would give venn under `config` and `theme`. */
export const vennRenderContext = (
  config: ResolvedConfig,
  theme: Theme,
  options: VennContextOptions
): RenderContext => testRenderContext(config, theme, { ...options, layout: selfLaidOut('venn') });

/**
 * {@link vennRenderContext} over `theme`, with core's defaults and the `venn` section `section`
 * as given, for the layout specs; warnings go to `warnings`.
 */
export const vennTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer?: Measurer
): RenderContext =>
  vennRenderContext(defaultsWith('venn', section), theme, {
    ...(measurer ? { measurer } : {}),
    warn: (w) => void warnings.push(w),
  });

/** A source parsed: its model, its diagnostics, and the `venn` config its text sets. */
export interface ParsedVenn {
  readonly model: VennModel;
  readonly diagnostics: readonly Diagnostic[];
  /** What the front matter and `init` directives set in the `venn` section, as resolved. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** `src` preprocessed and parsed as the plugin does, with the `venn` config its text sets. */
export function parsedVenn(src: string): ParsedVenn {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseVenn(src, { preprocessed });
  const section = (vennTestConfig(preprocessed) as { venn?: unknown }).venn;
  return { model, diagnostics, config: (section ?? {}) as Readonly<Record<string, unknown>> };
}
