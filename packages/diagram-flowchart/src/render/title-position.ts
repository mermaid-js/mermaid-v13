// Where a subgraph's title sits (mermaid-js/mermaid#2977): `flowchart.subGraphTitlePosition`
// for every subgraph, `id@{ titlePosition: … }` for one.

import type { TitlePosition } from '@mermaid-js/core/layout';
import type { FlowWarning } from './context.ts';

const POSITIONS: ReadonlySet<unknown> = new Set<TitlePosition>([
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

const VALUES = [...POSITIONS].join(', ');

const isPosition = (value: unknown): value is TitlePosition => POSITIONS.has(value);

/**
 * Reads the position of each subgraph's title: its own `titlePosition`, else the config's, else
 * none (the layout engine's own place). A value that is not a position warns and is skipped:
 * the config's once, a subgraph's own once each.
 */
export function titlePositions(
  config: unknown,
  warn: (warning: FlowWarning) => void
): (own: unknown, id: string, ast: string) => TitlePosition | undefined {
  const fallback = isPosition(config) ? config : undefined;
  if (config !== undefined && fallback === undefined) {
    const path = 'flowchart.subGraphTitlePosition';
    warn({
      code: 'FLOWCHART_CONFIG_IGNORED',
      message: `Ignored ${path}: it is not one of ${VALUES}; using the default`,
      path,
    });
  }
  return (own, id, ast) => {
    if (own === undefined || isPosition(own)) return own ?? fallback;
    warn({
      code: 'FLOWCHART_TITLE_POSITION',
      message: `Ignored titlePosition of subgraph "${id}": it is not one of ${VALUES}; using ${fallback ?? 'the default'}`,
      astIds: [ast],
    });
    return fallback;
  };
}
