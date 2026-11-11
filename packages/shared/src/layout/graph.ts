/**
 * The pieces of a `LayoutGraph` every graph diagram builds the same way from its unit profile:
 * the spacing along and across the flow, a group's padding and an edge with its label's room.
 */
import {
  type BuilderMetrics,
  type Dir,
  fromPx,
  type LayoutEdge,
  type LayoutGroup,
  type LayoutSpacing,
  type Size,
  type UnitProfile,
} from '@mermaid-js/core/layout';

/** Whether the ranks of a drawing in this direction run across (`LR`, `RL`). */
export const sideways = (d: Dir): boolean => d === 'LR' || d === 'RL';

/**
 * A graph's spacing: `nodeSpacing` runs across the flow and `rankSpacing` along it. `px` reads
 * each as the px config value (undefined for the profile's own). `turnedSpacing` is set where
 * a drawing the engine turns to TB for `availableWidth` (its ranks then run down, #47) would
 * space differently. `minRank` is the least rank gap, in the profile's units.
 */
export function graphSpacing(
  units: UnitProfile,
  direction: Dir,
  px: (key: 'nodeSpacing' | 'rankSpacing') => number | undefined,
  minRank = 0
): { spacing: LayoutSpacing; turnedSpacing?: LayoutSpacing } {
  const b = units.builder;
  const of = (key: 'node' | 'rank', axis: 'x' | 'y'): number => {
    const v = px(`${key}Spacing`);
    return v === undefined ? b.spacing[key] : fromPx(units, v, axis, b.minSpacing[key]);
  };
  const on = (rank: 'x' | 'y', node: 'x' | 'y'): LayoutSpacing => {
    const n = of('node', node);
    const r = of('rank', rank);
    return { node: n, rank: minRank > 0 ? Math.max(r, minRank) : r, edge: b.spacing.edge };
  };
  const along = sideways(direction) ? 'x' : 'y';
  const spacing = on(along, along === 'x' ? 'y' : 'x');
  const down = on('y', 'x');
  return down.node !== spacing.node || down.rank !== spacing.rank
    ? { spacing, turnedSpacing: down }
    : { spacing };
}

/** A group's padding: the profile's `groupPad`, and `titlePad` (plus `titleRoom`) over a title. */
export function groupPadding(
  b: BuilderMetrics,
  titled: boolean,
  titleRoom = 0
): LayoutGroup['padding'] {
  return {
    top: titled ? b.titlePad + titleRoom : b.groupPad,
    right: b.groupPad,
    bottom: b.groupPad,
    left: b.groupPad,
  };
}

/** An edge of the graph; a label (one with any width) takes its size and the profile's patch. */
export function labelledEdge(
  b: BuilderMetrics,
  id: string,
  source: string,
  target: string,
  label: Size | undefined,
  minLen = 1
): LayoutEdge {
  const edge: LayoutEdge = { id, source, target, minLen };
  if (label && label.width > 0)
    edge.label = { width: label.width + b.labelPatch.x, height: label.height + b.labelPatch.y };
  return edge;
}
