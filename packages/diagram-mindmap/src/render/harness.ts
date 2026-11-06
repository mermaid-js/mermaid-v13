/**
 * Test harness (`@mermaid-js/diagram-mindmap/testing`): renders a mindmap source or model through
 * the renderer's own seam, `parseMindmap` → `layoutMindmap` → `renderMindmap`, with a render
 * context built as the pipeline builds one (`mermaid/src/api.ts` `themeFor`,
 * `core/src/pipeline/draw.ts`): core's config defaults under the integrator's config and the
 * source's front matter and directives, the theme with its `themeVariables` and its dark half
 * for `theme: 'auto'`, the table measurer, the `tree` engine (or the one given) and the stream
 * writer with the theme's gradient and an optional outline drawer. Until the plugin lands
 * (T5, #390), parsed sources render here rather than through `createMermaid().render()`.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import { CORE_DEFAULTS, resolveConfig, type ConfigInput } from '@mermaid-js/core/config';
import { pxProfile, type LayoutEngine } from '@mermaid-js/core/layout';
import { tree } from '@mermaid-js/core/layout/tree';
import { resolveLimits } from '@mermaid-js/core/limits';
import { preprocess } from '@mermaid-js/core/preprocess';
import { streamWriter, type OutlineDraw } from '@mermaid-js/core/svg';
import { tableMeasurer, type Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme, resolveThemeName } from '@mermaid-js/core/theme';
import { layoutMindmap, type MindmapLayout } from '../layout/layout.ts';
import type { MindmapModel } from '../model.ts';
import { parseMindmap, type MindmapDocument } from '../parser/index.ts';
import { renderMindmap } from './render.ts';

export interface RenderMindmapOptions {
  /** Integrator config, as `initialize()` would get it (`theme`, `themeVariables`, …). */
  readonly config?: Readonly<Record<string, unknown>>;
  readonly idPrefix?: string;
  /** The layout engine; `tree` by default. */
  readonly engine?: LayoutEngine;
  /** An outline drawer (D302) installed on the writer, as an active extension's would be. */
  readonly outline?: OutlineDraw;
  readonly measurer?: Measurer;
  /** The extensions' glyphs (`RenderContext.icon`, D293), as an icons extension would give them. */
  readonly icon?: RenderContext['icon'];
  /** The API's icon packs (`RenderContext.iconPacks`, D294): whether a pack is still loading. */
  readonly iconPacks?: RenderContext['iconPacks'];
}

export interface RenderedMindmap {
  readonly svg: string;
  readonly model: MindmapModel;
  /** The parse's AST, when `input` was a source. */
  readonly ast?: MindmapDocument;
  readonly layout: MindmapLayout;
  readonly config: ReturnType<typeof resolveConfig>;
  readonly warnings: readonly Warning[];
  /** The render's gradient id, or false when the theme draws none (for `assertInert`). */
  readonly gradient: string | false;
  /** Whether the SVG carries a `theme: 'auto'` style sheet (for `assertInert`). */
  readonly themeStyle: boolean;
}

export const TEST_VERSION = '13.0.0-alpha.0';

/** Renders `input` (a source, parsed with its front matter and directives, or a model). */
export async function renderMindmapForTest(
  input: string | MindmapModel,
  options: RenderMindmapOptions = {}
): Promise<RenderedMindmap> {
  const warnings: Warning[] = [];
  const warn = (w: Warning): void => void warnings.push({ code: w.code, message: w.message });
  const pre = typeof input === 'string' ? preprocess(input) : undefined;
  const directives = (pre?.directives ?? []).flatMap((d) =>
    d.kind === 'init' && d.args && typeof d.args === 'object' ? [d.args as ConfigInput] : []
  );
  const config = resolveConfig(
    CORE_DEFAULTS,
    options.config,
    pre?.frontMatter?.config,
    directives,
    undefined,
    { warn, section: 'mindmap' }
  );
  let model: MindmapModel;
  let ast: MindmapDocument | undefined;
  if (typeof input === 'string') {
    const colorBy = config.mindmap?.colorBy === 'depth' ? 'depth' : 'branch';
    const parse = parseMindmap(input, { preprocessed: pre, colorBy });
    const error = parse.diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(`mindmap parse error: ${error.message}`);
    model = parse.model;
    ast = parse.ast;
  } else model = input;
  const idPrefix = options.idPrefix ?? 'mermaid-0';
  const choice = resolveThemeName(config.theme, warn);
  const theme = createTheme(await loadTheme(choice.name), {
    themeVariables: config.themeVariables as Record<string, unknown> | undefined,
    dark: choice.dark ? await loadTheme(choice.dark) : undefined,
    warn,
    idPrefix: () => idPrefix,
  });
  const engine = options.engine ?? tree;
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
    ...(options.iconPacks ? { iconPacks: options.iconPacks } : {}),
  };
  const layout = layoutMindmap(model, ctx);
  const gradient = theme.gradient();
  const w = streamWriter({ gradient, outline: options.outline });
  renderMindmap(model, layout, ctx, w);
  return {
    svg: w.finish(),
    model,
    ...(ast ? { ast } : {}),
    layout,
    config,
    warnings,
    gradient: gradient?.id ?? false,
    themeStyle: theme.autoDeclarations() !== undefined,
  };
}
