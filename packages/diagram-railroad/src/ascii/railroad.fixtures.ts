// Test helper: draws a railroad diagram as text through the `./ascii` entry as the pipeline hands
// it over: the plugin's parse, its layout under the cell profile and the cell measurer (in px),
// the resolved config with the generated `railroad` defaults and the `ascii` section, the AST.
import type { TextRenderContext, Warning } from '@mermaid-js/core';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { cellProfile } from '@mermaid-js/core/layout';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ascii } from '../ascii.ts';
import { railroadConfigDefaults } from '../generated/config-defaults.ts';
import { layoutInCells } from '../layout/cells.ts';
import type { RailroadExpressionLayout, RailroadLayout } from '../layout/index.ts';
import { railroad } from '../plugin.ts';
import { railroadRenderContext, railroadTestTheme } from '../test-context.ts';

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  /** The site's `railroad` section, under the source's own. */
  railroad?: Record<string, unknown>;
  /** Hand the hook the layout in cells, as a caller outside the pipeline might. */
  cellLayout?: boolean;
  /** `ascii.padding` in the config when it differs from the profile's (the profile wins). */
  configPadding?: 'compact' | 'roomy';
}

export interface Drawn {
  text: string;
  warnings: Warning[];
  /** The layout the hook draws, in cells. */
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
  const ascii_ = { charset, padding: options.configPadding ?? padding };
  const config = { ...resolved, ascii: ascii_ } as unknown as ResolvedConfig;
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const parse = railroad.parse(src, { preprocessed: pre, config, limits: resolveLimits(config) });
  const theme = await railroadTestTheme(config);
  const ctx: TextRenderContext = {
    ...railroadRenderContext(config, theme, { measurer: cellMeasurer, warn }),
    units: cellProfile(padding),
    ast: parse.ast,
  };
  // The pipeline's layout (in px: the plugin lays out in cells only with the entry's options).
  const piped = railroad.layout(parse.model, ctx);
  const layout = layoutInCells(parse.model, ctx);
  const out = ascii(parse.model, options.cellLayout ? layout : piped, ctx);
  return { text: out, warnings, layout };
}

/** Draws and returns the text alone. */
export const text = async (src: string, options?: DrawOptions): Promise<string> =>
  (await draw(src, options)).text;

/**
 * Each off-line branch of a choice whose extent (box, bypass or loop) comes within a row of the
 * choice's main line, or a main line off a whole row: none in cells (#617 review).
 */
export function mainRowClashes(layout: RailroadLayout): string[] {
  const out: string[] = [];
  const walk = (e: RailroadExpressionLayout, oy: number): void => {
    if (e.kind === 'choice') {
      const c = oy + e.up;
      if (!Number.isInteger(c)) out.push(`${e.ast}: main line at ${c}`);
      for (const b of e.children) {
        const top = oy + b.y;
        const bottom = top + b.up + b.down;
        if (top + b.up === c) continue;
        if (bottom > c - 2 && top < c + 2) out.push(`${b.ast}: rows ${top}-${bottom}, main ${c}`);
      }
    }
    for (const ch of e.children) walk(ch, oy + ch.y);
  };
  for (const r of layout.rules) walk(r.definition, r.origin.y + r.definition.y);
  return out;
}
