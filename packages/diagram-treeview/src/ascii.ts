/**
 * The treeView diagram's text output (spec #518 T7, D488, D320), a separate lazily loaded entry
 * (`@mermaid-js/diagram-treeview/ascii`, manifest key `ascii`, T5) so SVG renders never load it.
 *
 * It draws from `TreeViewModel`, not from the px layout: a text tree has its own geometry (four
 * cells a level). `rowIndent`, the paddings and `lineThickness` are px geometry and are ignored,
 * with no warning (D347's rule), as is `ascii.maxWidth`: the drawing is never cropped, and
 * `ASCII_TOO_WIDE` is the API's (R-ASCII-8). `ascii.padding: roomy` (D77) puts a line between
 * rows.
 */
import type { TextRenderContext } from '@mermaid-js/core';
import { asciiOptions } from '@mermaid-js/core/ascii';
import type { TreeViewModel } from './model.ts';
import { drawTreeView } from './ascii/draw.ts';
import { asciiWarnings } from './ascii/warnings.ts';

export type { AsciiDroppedFeature, AsciiDroppedWarning } from './ascii/warnings.ts';

/** What the hook reads of core's `TextRenderContext`. */
export type TreeViewAsciiContext = Pick<TextRenderContext, 'config' | 'warn'> &
  Partial<Pick<TextRenderContext, 'ast'>>;

/**
 * The treeView `ascii` hook (DESIGN §12.1): the tree as text, `\n` line ends, no trailing
 * spaces. The layout is not read. Warns once per feature kind it drops (D82).
 */
export function ascii(model: TreeViewModel, _layout: unknown, ctx: TreeViewAsciiContext): string {
  const { charset, padding } = asciiOptions(ctx.config);
  const text = drawTreeView(model, charset, padding);
  for (const w of asciiWarnings(model, ctx.config.treeView, ctx.ast)) ctx.warn(w);
  return text;
}
