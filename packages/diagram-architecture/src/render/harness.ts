/**
 * Test harness (`@mermaid-js/diagram-architecture/testing`): renders an architecture source
 * through the package's render entry, `parseArchitecture` → `layoutArchitecture` →
 * `renderArchitecture`, with a render context built as the pipeline builds one
 * (`mermaid/src/api.ts` `themeFor`, `core/src/pipeline/draw.ts`): core's config defaults under
 * the integrator's config and the source's front matter and directives, the theme with its
 * `themeVariables` and its dark half for `theme: 'auto'`, the package's theme table, the table
 * measurer, `compass` (or the engine given) and the stream writer with the theme's gradient and
 * an optional outline drawer.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile, type LayoutEngine } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import { layoutArchitecture, type ArchitectureLayout } from '../layout/layout.ts';
import type { ArchitectureModel } from '../model.ts';
import { parseArchitecture } from '../parser/index.ts';
import type { ArchitectureDocument } from '../parser/ast.ts';
import { theme as table } from '../theme/table.ts';
import { renderArchitecture } from './render.ts';

export interface RenderArchitectureOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** The layout engine; `compass` by default. */
  readonly engine?: LayoutEngine;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
  /** The extensions' glyphs (`RenderContext.icon`, D293), as an icons extension would give them. */
  readonly icon?: RenderContext['icon'];
  /** The extensions' inline-box providers (`RenderContext.inline`, D177). */
  readonly inline?: RenderContext['inline'];
}

export interface RenderedArchitecture {
  readonly svg: string;
  readonly model: ArchitectureModel;
  readonly ast: ArchitectureDocument;
  readonly layout: ArchitectureLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `source`, parsed with its front matter and directives; throws on a parse error. */
export async function renderArchitectureForTest(
  source: string,
  options: RenderArchitectureOptions = {}
): Promise<RenderedArchitecture> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push({ code: w.code, message: w.message });
  const pre = preprocess(source);
  const directives = pre.directives.flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre.frontMatter?.config,
    directives,
    undefined,
    { warn, section: 'architecture' }
  );
  const parse = parseArchitecture(source, { preprocessed: pre });
  const error = parse.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`architecture parse error: ${error.message}`);
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    diagram: table,
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
    idPrefix: () => idPrefix,
  });
  const engine = options.engine ?? compass;
  const ctx: RenderContext = {
    config,
    measurer: options.measurer ?? tableMeasurer,
    units: pxProfile,
    theme,
    securityLevel: 'default',
    idPrefix,
    version: TEST_VERSION,
    layout: (graph) => engine(graph, { config }),
    limits: resolveLimits(config),
    warn,
    ...(options.icon ? { icon: options.icon } : {}),
    ...(options.inline ? { inline: options.inline } : {}),
  };
  const layout = layoutArchitecture(parse.model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  renderArchitecture(parse.model, layout, ctx, w);
  return {
    svg: w.finish(),
    model: parse.model,
    ast: parse.ast,
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
