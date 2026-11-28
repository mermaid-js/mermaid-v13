import type {
  DiagramIcon,
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
} from '@mermaid-js/core';
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import { resolveLimits } from '@mermaid-js/core/limits';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { treeViewOptions } from './config.ts';
import { treeViewConfigDefaults } from './generated/config-defaults.ts';
import { isBuiltinIcon, resolveIcon } from './icons.ts';
import { layoutTreeView, type TreeViewLayout } from './layout/index.ts';
import type { TreeViewModel } from './model.ts';
import { detectTreeView, parseTreeView, type TreeViewParseResult } from './parser/index.ts';
import { renderTreeView } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The icons `model` draws through the extensions' glyphs under the `treeView` options `section`
 * (`TreeViewModel.glyphIcons`): every name `resolveIcon` gives a node but the built-in glyphs,
 * which the package draws (D485).
 */
function glyphIcons(
  model: TreeViewModel,
  section: Readonly<TreeViewDiagramConfig> | undefined
): readonly string[] {
  const options = treeViewOptions(section);
  const names = new Set<string>();
  for (const node of model.nodes) {
    const name = resolveIcon(node, options);
    if (name !== undefined && !isBuiltinIcon(name)) names.add(name);
  }
  return Object.freeze([...names]);
}

/**
 * The treeView plugin (DESIGN §12.1, spec #518): `layoutKind: 'custom'` with its own
 * `TreeViewLayout` (no core change, D481). `parse` takes the whole source and, as it has the
 * config, records on the model the icons the glyphs draw (`glyphIcons`), which `icons` lists so
 * an icons extension loads only the packs a tree names (`icons()` gets only the model); `layout`
 * places the rows and connectors and measures every text; `render` writes the whole `<svg>`
 * document. Text output is the lazily loaded `./ascii` entry (#578, D488, manifest key `ascii`,
 * #577), so `formats` lists `ascii` and an SVG render never loads it.
 *
 * `theme` is treeView's own table (`theme/table.ts`, D331, D483). No `labels`: a name goes
 * through core's label handler (#1368) but is laid out without inline boxes, so no `$$` or icon
 * span in it loads anything; descriptions are plain text (D484).
 * `configDefaults` are the `treeView` section's generated defaults (#577).
 */
export const treeView = {
  id: 'treeView',
  formats: ['svg', 'ascii'] as const,
  layoutKind: 'custom' as const,
  configDefaults: treeViewConfigDefaults as Readonly<Record<string, unknown>>,
  detector: (text: string): boolean => detectTreeView(text),
  parse: (text: string, ctx: DiagramParseContext): TreeViewParseResult => {
    const { maxNodes, maxDepth } = ctx.limits ?? resolveLimits(ctx.config);
    const result = parseTreeView(text, { preprocessed: ctx.preprocessed, maxNodes, maxDepth });
    const icons = glyphIcons(result.model, ctx.config.treeView);
    return { ...result, model: Object.freeze({ ...result.model, glyphIcons: icons }) };
  },
  icons: (model: TreeViewModel): readonly DiagramIcon[] =>
    model.glyphIcons ?? glyphIcons(model, undefined),
  layout: (model: TreeViewModel, ctx: RenderContext): TreeViewLayout => layoutTreeView(model, ctx),
  render: (model: TreeViewModel, layout: TreeViewLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderTreeView(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<TreeViewModel, TreeViewLayout>;
