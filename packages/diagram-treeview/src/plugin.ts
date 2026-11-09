import type {
  DiagramIcon,
  DiagramParseContext,
  DiagramPlugin,
  RenderContext,
} from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { treeViewLayoutConfig } from './config.ts';
import { BUILTIN_ICON_PACK, BUILTIN_ICONS, resolveIcon } from './icons.ts';
import { layoutTreeView, type TreeViewLayout } from './layout/index.ts';
import type { TreeViewModel } from './model.ts';
import { detectTreeView, parseTreeView, type TreeViewParseResult } from './parser/index.ts';
import { renderTreeView } from './render/index.ts';
import { theme } from './theme/table.ts';

/**
 * The icons each parsed model draws through the extensions' glyphs (`DiagramPlugin.icons`, D293):
 * every name `resolveIcon` gives a node under the parse's `treeView` options, but the built-in
 * glyphs, which the package draws (D485). They are worked out at parse time, which has the
 * config, as `icons()` gets only the model; a model `parse` did not make reads v12's defaults.
 */
const ICONS = new WeakMap<TreeViewModel, readonly DiagramIcon[]>();

/** The names `glyphs.ts` draws. */
const BUILTIN = new Set(BUILTIN_ICONS.map((name) => `${BUILTIN_ICON_PACK}:${name}`));

function iconsOf(model: TreeViewModel, section: unknown): readonly DiagramIcon[] {
  const options = treeViewLayoutConfig(section as Parameters<typeof treeViewLayoutConfig>[0]);
  const names = new Set<string>();
  for (const node of model.nodes) {
    const name = resolveIcon(node, options);
    if (name !== undefined && !BUILTIN.has(name)) names.add(name);
  }
  return [...names];
}

/**
 * The treeView plugin (DESIGN §12.1, spec #518): `layoutKind: 'custom'` with its own
 * `TreeViewLayout` (no core change, D481). `parse` takes the whole source; `layout` places the
 * rows and connectors and measures every text; `render` writes the whole `<svg>` document. SVG
 * only until the ASCII entry (T7, D488).
 *
 * `theme` is treeView's own table (`theme/table.ts`, D331, D483). No `labels`: names and
 * descriptions are plain text (D484) and never go through core's label layout. `icons` lists the
 * icons drawn through `ctx.icon`, so an icons extension loads only the packs a tree names. No
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
    ICONS.set(result.model, iconsOf(result.model, ctx.config.treeView));
    return result;
  },
  icons: (model: TreeViewModel): readonly DiagramIcon[] =>
    ICONS.get(model) ?? iconsOf(model, undefined),
  layout: (model: TreeViewModel, ctx: RenderContext): TreeViewLayout => layoutTreeView(model, ctx),
  render: (model: TreeViewModel, layout: TreeViewLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderTreeView(model, layout, ctx, w),
  theme,
} satisfies DiagramPlugin<TreeViewModel, TreeViewLayout>;
