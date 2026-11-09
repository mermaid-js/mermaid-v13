import type {
  DiagramIcon,
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
} from '@mermaid-js/core';
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { treeViewLayoutConfig } from './config.ts';
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
  const options = treeViewLayoutConfig(section);
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
 * document. Text output is the lazily loaded `./ascii` entry (#578, D488); `formats` gains
 * `ascii` with the manifest that loads it (T5, #577).
 *
 * `theme` is treeView's own table (`theme/table.ts`, D331, D483). No `labels`: names and
 * descriptions are plain text (D484) and never go through core's label layout. No
 * `configDefaults` yet: the `treeView` section's keys become `honoured` with the integration
 * (T5, #577).
 */
export const treeView = {
  id: 'treeView',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectTreeView(text),
  parse: (text: string, ctx: DiagramParseContext): TreeViewParseResult => {
    const result = parseTreeView(text, { preprocessed: ctx.preprocessed });
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
