/**
 * Hand-built treemap models for the layout's unit specs (as radar's `layout/fixtures.ts`), and a
 * measurer whose widths are easy to work by hand: every character is half the font size wide.
 */
import type { Measurer } from '@mermaid-js/core/text';
import type { Theme } from '@mermaid-js/core/theme';
import type { TreemapModel, TreemapNode } from '../model.ts';
import { treemapTestContext } from '../test-context.ts';
import type { TreemapLayoutContext } from './layout.ts';

let ids = 0;

export function leaf(name: string, value: number, classSelector?: string): TreemapNode {
  return {
    type: 'Leaf',
    name,
    value,
    depth: 0,
    children: [],
    astId: `node:${name}@${++ids}`,
    ...(classSelector === undefined ? {} : { classSelector }),
  };
}

export function section(name: string, ...children: TreemapNode[]): TreemapNode {
  return { type: 'Section', name, depth: 0, children, astId: `node:${name}@${++ids}` };
}

export function model(roots: TreemapNode[], extra: Partial<TreemapModel> = {}): TreemapModel {
  return { roots, classes: [], accTitle: '', accDescr: '', warnings: [], ...extra };
}

/** Every character half an em wide. */
export const halfEm: Measurer = {
  id: 'half-em',
  width: (text, font) => ([...text].length * font.size) / 2,
  metrics: (font) => ({ ascent: font.size * 0.8, descent: font.size * 0.2, lineHeight: font.size }),
};

/** A layout context with the half-em measurer (or `measurer`). */
export function context(
  theme: Theme,
  treemap: Record<string, unknown> = {},
  measurer: Measurer = halfEm
): TreemapLayoutContext {
  return treemapTestContext(theme, treemap, measurer);
}
