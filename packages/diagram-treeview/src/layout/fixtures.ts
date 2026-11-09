/**
 * Models and measurers for the layout's unit specs. Models come from the parser (the layout
 * reads what `parseTreeView` produces); the measurer's widths are easy to work by hand: every
 * character is half the font size wide, and a line is one font size high.
 */
import type { Measurer } from '@mermaid-js/core/text';
import { Style } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import type { TreeViewModel } from '../model.ts';
import { parseTreeView } from '../parser/index.ts';
import { treeViewTestContext } from '../test-context.ts';
import type { TreeViewLayoutContext } from './layout.ts';

/** The model of `treeView-beta` followed by `lines`. */
export function tree(...lines: string[]): TreeViewModel {
  return parseTreeView(['treeView-beta', ...lines].join('\n')).model;
}

/** Every character half an em wide; ascent 0.8 em, descent 0.2 em. */
export const halfEm: Measurer = {
  id: 'half-em',
  width: (text, font) => ([...text].length * font.size) / 2,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2, lineHeight: font.size }),
};

/** Ems per character: bold a whole one, italic a quarter, the rest half. */
function ems(style: number): number {
  if (style & Style.Bold) return 1;
  return style & Style.Italic ? 1 / 4 : 1 / 2;
}

/** {@link halfEm}, with bold text a whole em per character and italic a quarter. */
export const styled: Measurer = {
  id: 'styled',
  width: (text, font, style) => [...text].length * font.size * ems(style),
  metrics: (font) => halfEm.metrics(font),
};

/**
 * A layout context with the half-em measurer (or `measurer`): the unit specs' positions are
 * worked by hand against it, where `treeViewTestContext` defaults to the table measurer the
 * conformance specs use.
 */
export function context(
  theme: Theme,
  treeView: Record<string, unknown> = {},
  measurer: Measurer = halfEm
): TreeViewLayoutContext {
  return treeViewTestContext(theme, treeView, measurer);
}
