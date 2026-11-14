/**
 * The block tests' one context builder, which the layout specs and the conformance layout specs
 * (invariants, parity, stress) share. It builds what the pipeline builds (`mermaid/src/api.ts`
 * `themeFor`, `core/src/pipeline/draw.ts`): the config core resolves from its defaults and the
 * source's front matter and directives; the theme that config names (block has no table of its
 * own, spec #521), with its `themeVariables` and its dark half for `theme: 'auto'`; and a render
 * context with a measurer (the table measurer by default).
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
import type { Diagnostic } from '@mermaid-js/core/parser-kit';
import { preprocess, type PreprocessResult } from '@mermaid-js/core/preprocess';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName, type Theme } from '@mermaid-js/core/theme';
import type { BlockModel } from './model.ts';
import { parseBlock } from './parser/index.ts';
import { theme as table } from './theme/table.ts';

/** The `data-mermaid-version` the test renders write. */
export const TEST_VERSION = '13.0.0-alpha.0';

/**
 * The config a render of `pre` resolves: core's defaults, then `integrator` as `initialize()`
 * would get it, then the front matter and directives.
 */
export function blockTestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, undefined, {
    ...(warn ? { warn } : {}),
    section: 'block',
  });
}

/** What {@link blockTestTheme} takes besides the config. */
export interface BlockThemeOptions {
  /** The render's id prefix, which scopes the gradient's id (D182); `mermaid` by default. */
  readonly idPrefix?: string;
  readonly warn?: (w: Warning) => void;
}

/** The theme `config` names (with no config, core's default), its variables and dark half. */
export async function blockTestTheme(
  config: ResolvedConfig = blockTestConfig(),
  { idPrefix, warn }: BlockThemeOptions = {}
): Promise<Theme> {
  const choice = resolveThemeName(config.theme, warn);
  return createTheme(await loadTheme(choice.name), {
    diagram: table,
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    ...(warn ? { warn } : {}),
    ...(idPrefix !== undefined ? { idPrefix: () => idPrefix } : {}),
  });
}

/**
 * The render context the pipeline would give block under `config` (core's defaults when absent)
 * and `theme`, with the `block` section `section` over the config's; warnings go to `warnings`.
 */
export function blockTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  measurer: Measurer = tableMeasurer,
  warnings: Warning[] = []
): RenderContext {
  const base = blockTestConfig();
  const resolved = (base as { block?: Record<string, unknown> }).block ?? {};
  const config = { ...base, block: { ...resolved, ...section } } as unknown as ResolvedConfig;
  return {
    config,
    measurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix: 'mermaid-0',
    version: TEST_VERSION,
    layout: () => {
      throw new Error('block lays itself out (layoutKind: custom)');
    },
    limits: resolveLimits(config),
    warn: (w) => void warnings.push(w),
  };
}

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
