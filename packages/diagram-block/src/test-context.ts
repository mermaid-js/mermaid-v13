/**
 * The block tests' context builder, which the layout specs and the conformance layout specs
 * (invariants, parity, stress) share: the shared test context
 * (`@mermaid-js/shared/testing/test-context`) with block's config section and theme table.
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
} from '@mermaid-js/shared/testing/test-context';
import type { BlockModel } from './model.ts';
import { parseBlock } from './parser/index.ts';
import { theme as table } from './theme/table.ts';

export { TEST_VERSION } from '@mermaid-js/shared/testing/test-context';

/** The config a render of `pre` resolves under `integrator`, as `initialize()` would get it. */
export const blockTestConfig = (
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig => testConfig('block', pre, integrator, warn);

/** What {@link blockTestTheme} takes besides the config. */
export interface BlockThemeOptions {
  /** The render's id prefix, which scopes the gradient's id (D182); `mermaid` by default. */
  readonly idPrefix?: string;
  readonly warn?: (w: Warning) => void;
}

/** The theme `config` names (with no config, core's default), its variables and dark half. */
export const blockTestTheme = (
  config: ResolvedConfig = blockTestConfig(),
  options: BlockThemeOptions = {}
): Promise<Theme> => testTheme(config, { ...options, diagram: table });

/**
 * The render context the pipeline would give block under core's defaults and `theme`, with the
 * `block` section `section` over the defaults' own; warnings go to `warnings`.
 */
export const blockTestContext = (
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer?: Measurer,
  warnings: Warning[] = []
): RenderContext =>
  testRenderContext(defaultsWith('block', section, true), theme, {
    ...(measurer ? { measurer } : {}),
    layout: selfLaidOut('block'),
    warn: (w) => void warnings.push(w),
  });

/** A source parsed: its model, its diagnostics, and the `block` config and theme its text sets. */
export interface ParsedBlock {
  readonly model: BlockModel;
  readonly diagnostics: readonly Diagnostic[];
  /** What the front matter and `init` directives set in the `block` section. */
  readonly config: Readonly<Record<string, unknown>>;
  /** The resolved config, for {@link blockTestTheme} (the source's theme). */
  readonly resolved: ResolvedConfig;
}

/** `src` preprocessed and parsed as the plugin does, with the config its text sets. */
export function parsedBlock(src: string): ParsedBlock {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseBlock(src, { preprocessed });
  const resolved = blockTestConfig(preprocessed);
  const section = (resolved as { block?: unknown }).block;
  return {
    model,
    diagnostics,
    config: (section ?? {}) as Readonly<Record<string, unknown>>,
    resolved,
  };
}
