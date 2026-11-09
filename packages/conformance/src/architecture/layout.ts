/**
 * Parser-produced layout graphs for the architecture corpus specs (#607): a source is
 * preprocessed, its front matter and directives resolved over the defaults (as a render does),
 * parsed by the v13 parser and measured by `prepareArchitecture`, the builder the plugin calls,
 * with core's table measurer in the source's theme.
 */
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import type { LayoutEngine } from '@mermaid-js/core/layout';
import { preprocess } from '@mermaid-js/core/preprocess';
import { tableMeasurer } from '@mermaid-js/core/text';
import { createTheme, isThemeName, loadTheme } from '@mermaid-js/core/theme';
import {
  parseArchitecture,
  prepareArchitecture,
  type ArchitectureModel,
  type ArchitecturePrepared,
} from '@mermaid-js/diagram-architecture';

export interface ArchitectureLaidOut {
  readonly model: ArchitectureModel;
  readonly prepared: ArchitecturePrepared;
  /** Warning codes the builder raised. */
  readonly warnings: readonly string[];
}

/**
 * The parsed and measured `source`, or `undefined` when it does not parse (an error
 * diagnostic): those are the parser's gates', not the layout's.
 */
export async function architectureLaidOut(
  source: string,
  engine: LayoutEngine
): Promise<ArchitectureLaidOut | undefined> {
  const pre = preprocess(source);
  const directives = pre.directives.flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const config = resolveConfig(CORE_DEFAULTS, {}, pre.frontMatter?.config, directives);
  const parse = parseArchitecture(source, { preprocessed: pre });
  if (parse.diagnostics.some((d) => d.severity === 'error')) return undefined;
  const themeName =
    typeof config.theme === 'string' && isThemeName(config.theme) ? config.theme : 'default';
  const warnings: string[] = [];
  const prepared = prepareArchitecture(parse.model, {
    config,
    measurer: tableMeasurer,
    theme: createTheme(await loadTheme(themeName)),
    layout: (graph) => engine(graph, { config }),
    warn: (w) => warnings.push(w.code),
  });
  return { model: parse.model, prepared, warnings };
}
