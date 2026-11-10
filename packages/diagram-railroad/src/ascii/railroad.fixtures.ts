// Test helper: draws a railroad diagram as text through the `./ascii` entry as the pipeline hands
// it over: the plugin's parse, its layout under the cell profile and the cell measurer, the
// resolved config with the generated `railroad` defaults and the `ascii` section, and the AST.
import type { TextRenderContext, Warning } from '@mermaid-js/core';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile, pxProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ascii } from '../ascii.ts';
import { railroadConfigDefaults } from '../generated/config-defaults.ts';
import type { RailroadLayout } from '../layout/index.ts';
import { railroad } from '../plugin.ts';
import { railroadRenderContext, railroadTestTheme } from '../test-context.ts';

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  /** The site's `railroad` section, under the source's own. */
  railroad?: Record<string, unknown>;
  /** Hand the hook a layout in px, as a caller outside the pipeline might. */
  pxLayout?: boolean;
}

export interface Drawn {
  text: string;
  warnings: Warning[];
  /** The layout handed to the hook: in cells, or in px with `pxLayout`. */
  layout: RailroadLayout;
}

/** `src` as text, with the warnings the layout and the hook gave. */
export async function draw(src: string, options: DrawOptions = {}): Promise<Drawn> {
  const pre = preprocess(src);
  const { railroad: site, charset = 'unicode', padding = 'compact' } = options;
  const directives = pre.directives.flatMap((d) => (d.kind === 'init' ? [d.args] : []));
  const resolved = resolveConfig(
    CORE_DEFAULTS,
    (site ? { railroad: site } : {}) as never,
    pre.frontMatter?.config as never,
    directives as never,
    { railroad: railroadConfigDefaults } as never
  );
  const config = { ...resolved, ascii: { charset, padding } } as unknown as ResolvedConfig;
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const parse = railroad.parse(src, { preprocessed: pre, config, limits: resolveLimits(config) });
  const theme = await railroadTestTheme(config);
  const ctx: TextRenderContext = {
    ...railroadRenderContext(config, theme, { measurer: cellMeasurer, warn }),
    units: cellProfile(padding),
    ast: parse.ast,
  };
  const layout = railroad.layout(
    parse.model,
    options.pxLayout ? { ...ctx, units: pxProfile, warn: () => undefined } : ctx
  );
  return { text: ascii(parse.model, layout, ctx), warnings, layout };
}

/** Draws and returns the text alone. */
export const text = async (src: string, options?: DrawOptions): Promise<string> =>
  (await draw(src, options)).text;
