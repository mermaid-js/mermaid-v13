import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LayoutGraph, LayoutModel } from '@mermaid-js/core/layout';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { arrowheads, markerTrim } from '@mermaid-js/shared/svg/arrowheads';
import { REPO_ROOT } from './index.ts';

// Helpers for the "label centred on the visible line" specs (#1148, D682): how much line shows
// on each side of an edge's label box, along the flow.

/** A fixture's source (a path under `e2e/diagrams`), with `config` added to its front matter. */
export function fixture(path: string, config = ''): string {
  const source = readFileSync(join(REPO_ROOT, 'e2e/diagrams', path), 'utf8');
  if (!config) return source;
  const front = /^---\n([\s\S]*?)\n---\n/.exec(source);
  const body = front ? source.slice(front[0].length) : source;
  return `---\n${front ? front[1] + '\n' : ''}config:\n${config}\n---\n${body}`;
}

/** How far the default theme's point head shortens the line (gap and head). */
export async function pointTrim(): Promise<number> {
  return markerTrim('arrow_point', arrowheads(createTheme(await loadTheme('default'))));
}

/**
 * For every labelled edge of `graph`: how far, along the flow, its route runs from the source to
 * the label box (`before`) and from the box to the target (`after`), by edge id. The route's
 * ends are where it meets the nodes, before any arrowhead is taken off.
 */
export function labelGaps(
  graph: LayoutGraph,
  model: LayoutModel
): Map<string, { before: number; after: number }> {
  const gaps = new Map<string, { before: number; after: number }>();
  for (const e of graph.edges) {
    const at = model.edges.get(e.id);
    if (!e.label || !at?.label) continue;
    const axis = model.direction === 'LR' || model.direction === 'RL' ? 'x' : 'y';
    const half = (axis === 'x' ? e.label.width : e.label.height) / 2;
    const s = at.points[0]![axis];
    const t = at.points.at(-1)![axis];
    const c = at.label[axis];
    const sign = Math.sign(t - s);
    gaps.set(e.id, { before: sign * (c - s) - half, after: sign * (t - c) - half });
  }
  return gaps;
}
