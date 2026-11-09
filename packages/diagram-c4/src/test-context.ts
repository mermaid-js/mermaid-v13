/**
 * The C4 tests' context builder, which the layout specs (the package's and the conformance
 * layout corpus) share. It builds what the pipeline builds (`mermaid/src/api.ts`,
 * `core/src/pipeline/draw.ts`): the config core resolves from its defaults, the source's front
 * matter and directives; and a layout context with a theme and a measurer (the table measurer by
 * default), the warnings collected.
 */
import type { Warning } from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ConfigInput,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import type { C4LayoutContext } from './layout/layout.ts';
import type { C4Model } from './model.ts';
import { parseC4 } from './parser/index.ts';

/**
 * The config a render of `pre` resolves: core's defaults, then `integrator` as `initialize()`
 * would get it, then the front matter and `init` directives.
 */
export function c4TestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, undefined, {
    section: 'c4',
  });
}

/** A source parsed: its model, its diagnostics, and the config its text resolves to. */
export interface ParsedC4 {
  readonly model: C4Model;
  readonly diagnostics: readonly Diagnostic[];
  readonly config: ResolvedConfig;
}

/** `src` preprocessed and parsed as the plugin does, with the config its text resolves to. */
export function parsedC4(src: string, integrator?: Readonly<Record<string, unknown>>): ParsedC4 {
  const preprocessed = preprocess(src);
  const { model, diagnostics } = parseC4(src, { preprocessed });
  return { model, diagnostics, config: c4TestConfig(preprocessed, integrator) };
}

/** A layout context over `config` and `theme`; warnings go to `warnings`. */
export function c4TestContext(
  config: ResolvedConfig,
  theme: Theme,
  warnings: Warning[] = [],
  measurer: Measurer = tableMeasurer
): C4LayoutContext {
  return { config, theme, measurer, warn: (w) => void warnings.push(w) };
}
