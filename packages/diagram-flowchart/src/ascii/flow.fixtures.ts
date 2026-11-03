// Test helper: renders a flowchart to text through the `./ascii` entry, as a pipeline does
// (parse → plugin layout → `ascii` hook), with the table measurer in the context.
import { CORE_DEFAULTS, resolveConfig, type ResolvedConfig } from '@mermaid-js/core/config';
import { cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { ascii, type FlowAsciiContext } from '../ascii.ts';
import { flowchartConfigDefaults } from '../generated/config-defaults.ts';
import { parseFlowchart } from '../parser/index.ts';
import { flowchart } from '../plugin.ts';
import type { FlowWarning } from '../render/context.ts';

export interface Drawn {
  text: string;
  warnings: FlowWarning[];
}

export interface DrawOptions {
  charset?: 'unicode' | 'ascii';
  padding?: 'compact' | 'roomy';
  /** Lay out in cells before the hook, as the API does once it sets `ctx.units` (#47). */
  cells?: boolean;
}

let theme: Theme | undefined;

/** `src` as text. The `ascii` options go in as the config section the API adds (#47). */
export async function draw(src: string, options: DrawOptions = {}): Promise<Drawn> {
  const pre = preprocess(src);
  const resolved = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, [], {
    flowchart: flowchartConfigDefaults,
  } as never);
  const { cells, ...section } = options;
  const config = { ...resolved, ascii: section } as unknown as ResolvedConfig;
  const parse = parseFlowchart(src, { preprocessed: pre });
  const warnings: FlowWarning[] = [];
  theme ??= createTheme(await loadTheme('default'), {});
  const ctx: FlowAsciiContext = {
    config,
    measurer: tableMeasurer,
    theme,
    warn: (w) => void warnings.push(w),
    title: pre.frontMatter?.title,
    ast: parse.ast,
  };
  const model = parse.model;
  const layout = flowchart.layout(
    model,
    cells ? { ...ctx, measurer: cellMeasurer, units: cellProfile(options.padding) } : ctx
  );
  return { text: ascii(model, layout, ctx), warnings };
}

/** Draws and returns the text alone. */
export const text = async (src: string, options?: DrawOptions): Promise<string> =>
  (await draw(src, options)).text;
