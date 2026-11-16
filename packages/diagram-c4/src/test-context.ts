/**
 * The C4 tests' context builder, which the layout specs (the package's and the conformance
 * layout corpus) share. It builds what the pipeline builds (`mermaid/src/api.ts`,
 * `core/src/pipeline/draw.ts`): the config core resolves from its defaults, the plugin's section
 * defaults, the source's front matter and directives; and a layout context with a theme and a
 * measurer (the table measurer by default), the warnings collected.
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
import { createTheme, loadTheme, resolveThemeName, type Theme } from '@mermaid-js/core/theme';
import { c4ConfigDefaults } from './generated/config-defaults.ts';
import type { C4LayoutContext } from './layout/layout.ts';
import type { C4Model } from './model.ts';
import { parseC4 } from './parser/index.ts';
import { theme as c4ThemeTable } from './theme/table.ts';

/**
 * The config a render of `pre` resolves: core's defaults and the `c4` section's generated
 * defaults (the plugin's `configDefaults`), then `integrator` as `initialize()` would get it, then
 * the front matter and `init` directives. With `beta`, the section is `c4beta` over `c4`, as the
 * registry chains them for a c4-beta source (D534); `c4beta`'s defaults come from core's.
 */
export function c4TestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  beta = false
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(
    CORE_DEFAULTS,
    integrator,
    pre?.frontMatter?.config,
    directives,
    { c4: c4ConfigDefaults },
    { section: beta ? ['c4beta', 'c4'] : 'c4' }
  );
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

/**
 * The theme a render draws in, built as the pipeline builds it: `name` resolved as the `theme`
 * option is (none gives the product default, `redux-color`, D151), with the plugin's table. A
 * layout spec that loads a theme by name alone misses the table and the default.
 */
export async function c4TestTheme(name?: string): Promise<Theme> {
  return createTheme(await loadTheme(resolveThemeName(name).name), { diagram: c4ThemeTable });
}
