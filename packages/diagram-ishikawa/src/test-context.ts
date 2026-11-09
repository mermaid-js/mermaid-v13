/**
 * The ishikawa tests' one context builder (spec #519), which the layout specs and the
 * conformance layout gates share, as venn's. It builds what the pipeline builds
 * (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): the config core resolves from
 * its defaults, the integrator's config and the source's front matter and directives; the theme
 * that config names, with its `themeVariables` and its dark half for `theme: 'auto'` (ishikawa
 * has no theme table of its own); and a render context with a measurer (the table measurer by
 * default) and the warnings collected.
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
import type { IshikawaModel } from './model.ts';
import { parseIshikawa } from './parser/index.ts';

/** The id prefix of a test render when none is given. */
const ID_PREFIX = 'mermaid-0';

/** The `data-mermaid-version` the test contexts carry. */
const TEST_VERSION = '13.0.0-alpha.0';

/**
 * The config a render of `pre` resolves: core's defaults, then `integrator` as `initialize()`
 * would get it, then the front matter and `init` directives.
 */
export function ishikawaTestConfig(
  pre?: PreprocessResult,
  integrator?: Readonly<Record<string, unknown>>,
  warn?: (w: Warning) => void
): ResolvedConfig {
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  return resolveConfig(CORE_DEFAULTS, integrator, pre?.frontMatter?.config, directives, undefined, {
    ...(warn ? { warn } : {}),
    section: 'ishikawa',
  });
}

/**
 * The theme `config` names (with no config, core's default, redux-color), with the config's
 * `themeVariables` and, for `theme: 'auto'`, its dark half.
 */
export async function ishikawaTestTheme(
  config: ResolvedConfig = ishikawaTestConfig(),
  warn?: (w: Warning) => void,
  idPrefix = ID_PREFIX
): Promise<Theme> {
  const choice = resolveThemeName(config.theme, warn);
  return createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    ...(warn ? { warn } : {}),
    idPrefix: () => idPrefix,
  });
}

/** Core's defaults under no source, resolved once. */
let plain: ResolvedConfig | undefined;

/**
 * The render context the pipeline would give ishikawa over `theme`, with core's defaults and the
 * `ishikawa` section `section` as given (the resolver passes a section's values through as they
 * are), for the layout specs; warnings go to `warnings`.
 */
export function ishikawaTestContext(
  theme: Theme,
  section: Readonly<Record<string, unknown>> = {},
  warnings: Warning[] = [],
  measurer: Measurer = tableMeasurer
): RenderContext {
  plain ??= ishikawaTestConfig();
  const config = { ...plain, ishikawa: section } as unknown as ResolvedConfig;
  return {
    config,
    measurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix: ID_PREFIX,
    version: TEST_VERSION,
    layout: () => {
      throw new Error('ishikawa lays itself out (layoutKind: custom)');
    },
    limits: resolveLimits(config),
    warn: (w) => void warnings.push(w),
  };
}

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
