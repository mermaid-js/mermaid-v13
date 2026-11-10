// Test helper: renders an agentflow source to text through the `./ascii` entry, as the pipeline
// does (parse → the plugin's `layout` with the cell measurer and profile → `ascii` hook), with
// the config resolved as the harness resolves it (core's defaults, the integrator's config with
// the generated `agentflow` defaults, the front matter and directives) and the `ascii` section
// the API adds.
import type { Warning } from '@mermaid-js/core';
import {
  CORE_DEFAULTS,
  resolveConfig,
  type ConfigInput,
  type ResolvedConfig,
} from '@mermaid-js/core/config';
import { asciiOptions, cellMeasurer } from '@mermaid-js/core/ascii';
import { cellProfile, layered, pxProfile } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import { ascii, type AgentflowAsciiContext } from '../ascii.ts';
import type { AgentflowLayout } from '../layout/index.ts';
import { agentflow } from '../plugin.ts';

export interface Drawn {
  readonly text: string;
  readonly warnings: Warning[];
  readonly layout: AgentflowLayout;
}

export interface DrawOptions {
  readonly charset?: 'unicode' | 'ascii';
  readonly padding?: 'compact' | 'roomy';
  readonly maxWidth?: number;
  /** Integrator config, as `initialize()` would get it. */
  readonly config?: Readonly<Record<string, unknown>>;
  /** Lay out in px first: the hook must redo the layout in cells. */
  readonly px?: boolean;
}

let theme: Theme | undefined;

/** Draws `source` as text; throws on a parse error. */
export async function draw(source: string, options: DrawOptions = {}): Promise<Drawn> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push(w);
  const pre = preprocess(source);
  const directives = pre.directives.flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const resolved = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre.frontMatter?.config,
    directives,
    { agentflow: agentflow.configDefaults } as never,
    { warn, section: 'agentflow' }
  );
  const { charset, padding, maxWidth } = options;
  const opts = asciiOptions(resolved, { charset, padding, maxWidth });
  const config = Object.freeze({
    ...resolved,
    ascii: Object.freeze({
      charset: opts.charset,
      padding: opts.padding,
      ...(opts.maxWidth === undefined ? {} : { maxWidth: opts.maxWidth }),
    }),
  }) as ResolvedConfig;
  const parse = agentflow.parse(source, { config, preprocessed: pre });
  const error = parse.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`agentflow parse error: ${error.message}`);
  theme ??= createTheme(await loadTheme('default'), { diagram: agentflow.theme });
  const title = pre.frontMatter?.title;
  const ctx: AgentflowAsciiContext = {
    config,
    theme,
    warn,
    layout: layered,
    ...(options.px
      ? { measurer: tableMeasurer, units: pxProfile }
      : { measurer: cellMeasurer, units: cellProfile(opts.padding) }),
    ...(title !== undefined ? { title } : {}),
    ast: parse.ast,
  };
  const layout = agentflow.layout(parse.model, ctx);
  return { text: ascii(parse.model, layout, ctx), warnings, layout };
}

/** The text of {@link draw}. */
export const text = async (source: string, options?: DrawOptions): Promise<string> =>
  (await draw(source, options)).text;
