/**
 * The ishikawa tests' context builder (spec #519), which the layout specs and the conformance
 * layout gates share: the shared test context (`@mermaid-js/shared/testing/test-context`) with
 * ishikawa's config section (ishikawa has no theme table of its own).
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
import type { IshikawaModel } from './model.ts';
import { parseIshikawa } from './parser/index.ts';

/** The config a render of `pre` resolves under `integrator`, as `initialize()` would get it. */
export const ishikawaTestConfig = (
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig => testConfig('ishikawa', pre, integrator, warn);

/** The theme `config` names (core's default with none). */
export const ishikawaTestTheme = (
  config: ResolvedConfig = ishikawaTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = TEST_ID_PREFIX
): Promise<Theme> => testTheme(config, { idPrefix, ...(warn ? { warn } : {}) });

/** What {@link ishikawaRenderContext} takes besides the config and the theme. */
export interface IshikawaContextOptions {
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  readonly warn: (w: Warning) => void;
}

/** The render context the pipeline would give ishikawa under `config` and `theme`. */
export const ishikawaRenderContext = (
  config: ResolvedConfig,
  theme: Theme,
  options: IshikawaContextOptions
): RenderContext =>
  testRenderContext(config, theme, { ...options, layout: selfLaidOut('ishikawa') });

/**
 * {@link ishikawaRenderContext} over `theme`, with core's defaults and the `ishikawa` section
 * `section` as given, for the layout specs; warnings go to `warnings`.
 */
export const ishikawaTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer?: Measurer
): RenderContext =>
  ishikawaRenderContext(defaultsWith('ishikawa', section), theme, {
    ...(measurer ? { measurer } : {}),
    warn: (w) => void warnings.push(w),
  });

/** A source parsed: its model, its diagnostics, and the config its text sets. */
export interface ParsedIshikawa {
  readonly model: IshikawaModel;
  readonly diagnostics: readonly Diagnostic[];
  /** The config the source resolves: core's defaults, its front matter and directives. */
  readonly resolved: ResolvedConfig;
  /** What the front matter and `init` directives set in the `ishikawa` section, as resolved. */
  readonly config: Readonly<Record<string, unknown>>;
}

/** `src` preprocessed and parsed as the plugin does, with the config its text sets. */
export function parsedIshikawa(src: string): ParsedIshikawa {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseIshikawa(src, { preprocessed });
  const resolved = ishikawaTestConfig(preprocessed);
  const section = (resolved as { ishikawa?: unknown }).ishikawa;
  return {
    model,
    diagnostics,
    resolved,
    config: (section ?? {}) as Readonly<Record<string, unknown>>,
  };
}
