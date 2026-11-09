/**
 * The d3 side of sankey's layout oracle (#499): d3-sankey 0.12.3 as `mermaid@12.2.0` resolves
 * it (with its own d3-array 2.12.1 and d3-shape 1.3.7), and v12's use of it, copied from
 * `sankeyRenderer.ts:113-134` at the harvest commit. The sankey package re-implements
 * d3-sankey with no dependency; the specs compare its output with what this gives.
 */
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The part of a laid-out d3-sankey node the oracle reads. */
export interface D3SankeyNode {
  readonly id: string;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
  readonly value: number;
  readonly layer: number;
}

/** The part of a laid-out d3-sankey link the oracle reads. */
export interface D3SankeyLink {
  readonly source: D3SankeyNode;
  readonly target: D3SankeyNode;
  readonly value: number;
  readonly width: number;
  readonly y0: number;
  readonly y1: number;
}

export interface D3SankeyGraph {
  readonly nodes: D3SankeyNode[];
  readonly links: D3SankeyLink[];
}

export type SankeyAlign = 'left' | 'right' | 'center' | 'justify';

type Align = (node: unknown, n: number) => number;

interface D3SankeyInput {
  nodes: { id: string }[];
  links: { source: string; target: string; value: number }[];
}

interface D3Sankey {
  (graph: D3SankeyInput): D3SankeyGraph;
  nodeId(id: (d: { id: string }) => string): D3Sankey;
  nodeWidth(w: number): D3Sankey;
  nodePadding(p: number): D3Sankey;
  nodeAlign(a: Align): D3Sankey;
  extent(e: [[number, number], [number, number]]): D3Sankey;
}

export interface D3 {
  sankey(): D3Sankey;
  align: Readonly<Record<SankeyAlign, Align>>;
  /** `sankeyLinkHorizontal()`: the link's `d`, as d3-path writes it. */
  linkHorizontal(link: D3SankeyLink): string;
  version: string;
}

let loaded: D3 | undefined;

/** Loads (once) d3-sankey from mermaid\@12's own dependencies. */
export function loadD3Sankey(): D3 {
  if (loaded) return loaded;
  const here = createRequire(import.meta.url);
  const mermaid = createRequire(realpathSync(here.resolve('mermaid-v12/package.json')));
  const main = realpathSync(mermaid.resolve('d3-sankey'));
  const version = /d3-sankey@(\d+\.\d+\.\d+)\//.exec(main)?.[1] ?? 'unknown';
  const m = createRequire(main)(main) as Record<string, unknown>;
  const link = (m.sankeyLinkHorizontal as () => (l: D3SankeyLink) => string)();
  loaded = {
    sankey: m.sankey as () => D3Sankey,
    align: {
      left: m.sankeyLeft as Align,
      right: m.sankeyRight as Align,
      center: m.sankeyCenter as Align,
      justify: m.sankeyJustify as Align,
    },
    linkHorizontal: link,
    version,
  };
  return loaded;
}

/** The `sankey` options v12's draw read for the layout. */
export interface V12SankeyOptions {
  readonly width: number;
  readonly height: number;
  readonly nodeWidth: number;
  readonly nodePadding: number;
  readonly showValues: boolean;
  readonly nodeAlignment: SankeyAlign;
}

/** A graph as v12's `getGraph()` gives it: node ids in first-appearance order, links in row order. */
export interface V12Graph {
  readonly nodes: readonly string[];
  readonly links: readonly { source: string; target: string; value: number }[];
}

/** v12's layout (`sankeyRenderer.ts:113-134`) of `graph`. */
export function v12Sankey(d3: D3, graph: V12Graph, options: V12SankeyOptions): D3SankeyGraph {
  const sankey = d3
    .sankey()
    .nodeId((d) => d.id)
    .nodeWidth(options.nodeWidth)
    .nodePadding(options.nodePadding + (options.showValues ? 15 : 0))
    .nodeAlign(d3.align[options.nodeAlignment])
    .extent([
      [0, 0],
      [options.width, options.height],
    ]);
  return sankey({
    nodes: graph.nodes.map((id) => ({ id })),
    links: graph.links.map((l) => ({ ...l })),
  });
}
