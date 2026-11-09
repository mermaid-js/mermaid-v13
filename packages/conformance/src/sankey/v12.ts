/**
 * The v12 side of sankey parity (spec #427): mermaid\@12's sankey DB, driven through the oracle.
 * The snapshot is `getGraph()` as it is: nodes in first-appearance order, links in row order
 * with their source, target and value (`parseFloat`, so NaN where it read no number; the
 * runner compares with `Object.is`, so NaN equals NaN). Names are as stored (the oracle's
 * DOMPurify is the identity, so `sanitizeText` changes nothing).
 */

/** `diagram.type` values mermaid\@12 reports for sankey sources. */
export const SANKEY_V12_TYPES = ['sankey'];

/** The plain-data form both sides of sankey parity normalise to. */
export interface SankeySnapshot {
  nodes: { id: string }[];
  links: { source: string; target: string; value: number }[];
}

interface SankeyDbV12 {
  getGraph(): SankeySnapshot;
}

export function sankeyV12Snapshot(dbValue: unknown): SankeySnapshot {
  const graph = (dbValue as SankeyDbV12).getGraph();
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id })),
    links: graph.links.map((l) => ({ source: l.source, target: l.target, value: l.value })),
  };
}
