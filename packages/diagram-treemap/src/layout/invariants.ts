/**
 * The treemap layout's invariants (R-LAYOUT-3, spec #428 T3): what every `TreemapLayout` of a
 * model must satisfy, whatever the config or the measurer. Returns one message per broken
 * rule; none for a sound layout. Checks:
 * - no NaN anywhere, and no infinite length (a value of 309 digits is Infinity, and prints so);
 * - every row of the model is drawn once, as a section or a leaf;
 * - a child with area lies inside its parent's padded box (header band and margins off);
 * - siblings with area never overlap;
 * - areas follow values: a child's tile (its box plus half the padding around it) takes its
 *   share of the parent's inner area, within what d3's rounding moves (one px per edge);
 * - a zero value takes no area;
 * - every label and value lies inside its box;
 * - everything drawn lies inside `bounds`.
 */
import type { TreemapModel, TreemapNode } from '../model.ts';
import { TREEMAP_METRICS as M } from './metrics.ts';
import type { Rect, TreemapLayout, TreemapLeafLayout, TreemapSectionLayout } from './types.ts';
import { growRect } from '@mermaid-js/shared/layout/geometry';
import {
  numbers,
  rectInside as inside,
  rectsOverlap as overlap,
  rectText as show,
} from '@mermaid-js/shared/testing/layout-invariants';

type Item = TreemapSectionLayout | TreemapLeafLayout;

const area = (r: Rect): number => r.width * r.height;

/** A box with the header band and the margins of a section taken off. */
function padded(r: Rect): Rect {
  return {
    x: r.x + M.sectionPadding,
    y: r.y + M.sectionHeader + M.sectionPadding,
    width: r.width - 2 * M.sectionPadding,
    height: r.height - M.sectionHeader - 2 * M.sectionPadding,
  };
}

/** The broken invariants of `layout` as a layout of `model`. */
export function treemapLayoutViolations(model: TreemapModel, layout: TreemapLayout): string[] {
  const out: string[] = [];
  for (const [path, n] of numbers(layout, 'layout', 'node'))
    if (Number.isNaN(n) || (!Number.isFinite(n) && !path.endsWith('.value')))
      out.push(`${path} is ${n}`);
  if (out.length > 0) return out;

  const items = new Map<TreemapNode, Item>();
  for (const item of [...layout.sections, ...layout.leaves]) {
    if (items.has(item.node)) out.push(`${item.node.astId} is drawn twice`);
    items.set(item.node, item);
  }
  const canvas: Rect = { x: 0, y: layout.titleBand, width: layout.width, height: layout.height };
  const half = layout.padding / 2;

  const family = (parentBox: Rect, children: readonly TreemapNode[], name: string): void => {
    const drawn: Item[] = [];
    for (const child of children) {
      const item = items.get(child);
      if (item) drawn.push(item);
      else out.push(`${child.astId} is not drawn`);
    }
    const inner = padded(parentBox);
    const withArea = drawn.filter((c) => area(c.box) > 0);
    for (const c of withArea)
      if (!inside(c.box, inner))
        out.push(`${c.node.astId} ${show(c.box)} is outside ${name}'s padded box ${show(inner)}`);
    for (let i = 0; i < withArea.length; i++)
      for (let j = i + 1; j < withArea.length; j++)
        if (overlap(withArea[i]!.box, withArea[j]!.box))
          out.push(`${withArea[i]!.node.astId} overlaps ${withArea[j]!.node.astId}`);
    // d3 tiles the box with the margins less half the padding; each tile is the child's box
    // plus half the padding on each side, rounded edge by edge.
    const total = drawn.reduce((s, c) => s + c.value, 0);
    const tiles = growRect(inner, half);
    if (!(total > 0) || !Number.isFinite(total) || tiles.width <= 0 || tiles.height <= 0) return;
    for (const c of withArea) {
      const share = c.value / total;
      const tile = growRect(c.box, half);
      const want = share * area(tiles);
      const slack = tile.width + tile.height + 1 + share * (tiles.width + tiles.height + 1);
      if (Math.abs(area(tile) - want) > slack)
        out.push(`${c.node.astId}'s tile area ${area(tile)} is not its share ${want} of ${name}`);
    }
  };
  family(canvas, model.roots, 'the treemap');
  for (const s of layout.sections) family(s.box, s.node.children, s.node.astId);

  for (const item of items.values()) {
    if (item.value === 0 && area(item.box) > 0)
      out.push(`${item.node.astId} has no value and takes ${show(item.box)}`);
    for (const [what, text] of [
      ['label', item.label],
      ['value', item.valueText],
    ] as const)
      if (text && !inside(text.box, item.box))
        out.push(
          `${item.node.astId}'s ${what} ${show(text.box)} is outside its box ${show(item.box)}`
        );
  }

  const drawn: [string, Rect][] = [];
  for (const s of layout.sections) {
    drawn.push([s.node.astId, growRect(s.box, M.sectionStroke / 2)], [s.node.astId, s.header]);
  }
  for (const l of layout.leaves) drawn.push([l.node.astId, growRect(l.box, M.leafStroke / 2)]);
  for (const item of items.values())
    for (const text of [item.label, item.valueText])
      if (text) drawn.push([item.node.astId, text.box]);
  if (layout.title) drawn.push(['title', layout.title.box]);
  for (const [id, r] of drawn)
    if (!inside(r, layout.bounds)) out.push(`${id} ${show(r)} is outside the bounds`);
  return out;
}
