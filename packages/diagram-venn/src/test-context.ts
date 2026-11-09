/**
 * The venn tests' one context builder, which the render harness (`render/harness.ts`) and the
 * layout specs (the layout specs, the conformance layout corpus, parity and stress) share. It
 * builds what the pipeline builds (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`):
 * the config core resolves from its defaults, the integrator's config and the source's front
 * matter and directives; the theme that config names, with the plugin's table, its
 * `themeVariables` and its dark half for `theme: 'auto'`; and a render context with a measurer
 * (the table measurer by default) and the warnings collected.
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
import type { VennModel } from './model.ts';
import { parseVenn } from './parser/index.ts';
import { venn } from './plugin.ts';

/** The `data-mermaid-version` the test renders write. */
export const TEST_VERSION = '13.0.0-alpha.0';

/** The id prefix of a test render when none is given. */
const ID_PREFIX = 'mermaid-0';

/**
 * The config a render of `pre` resolves: core's defaults, then `integrator` as `initialize()`
 * would get it, then the front matter and `init` directives.
 */
export function vennTestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, undefined, {
    ...(warn ? { warn } : {}),
    section: 'venn',
  });
}

/**
 * The theme `config` names (with no config, core's default, redux-color), with venn's table,
 * the config's `themeVariables` and, for `theme: 'auto'`, its dark half.
 */
export async function vennTestTheme(
  config: ResolvedConfig = vennTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = ID_PREFIX
): Promise<Theme> {
  const choice = resolveThemeName(config.theme, warn);
  return createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    diagram: venn.theme,
    ...(warn ? { warn } : {}),
    idPrefix: () => idPrefix,
  });
}

/** What {@link vennRenderContext} takes besides the config and the theme. */
export interface VennContextOptions {
  readonly measurer?: Measurer;
  readonly idPrefix?: string;
  readonly warn: (w: Warning) => void;
}

/** The render context the pipeline would give venn under `config` and `theme`. */
export function vennRenderContext(
  config: ResolvedConfig,
  theme: Theme,
  { measurer = tableMeasurer, idPrefix = ID_PREFIX, warn }: VennContextOptions
): RenderContext {
  return {
    config,
    measurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: () => {
      throw new Error('venn lays itself out (layoutKind: custom)');
    },
    limits: resolveLimits(config),
    warn,
  };
}

/** Core's defaults under no source, resolved once. */
let plain: ResolvedConfig | undefined;

/**
 * {@link vennRenderContext} over `theme`, with core's defaults and the `venn` section `section`
 * as given (the resolver passes a section's values through as they are), for the layout specs;
 * warnings go to `warnings`.
 */
export function vennTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer: Measurer = tableMeasurer
): RenderContext {
  plain ??= vennTestConfig();
  const config = { ...plain, venn: section } as unknown as ResolvedConfig;
  return vennRenderContext(config, theme, { measurer, warn: (w) => void warnings.push(w) });
}

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
