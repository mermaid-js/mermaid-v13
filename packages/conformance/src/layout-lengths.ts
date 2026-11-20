import type { LayoutGraph } from '@mermaid-js/core/layout';

/**
 * Every length a graph builder writes into a `LayoutGraph`, with a path for the failure message.
 * `span` adds each node's `span`, which only some builders (flowchart) are checked for.
 */
export function layoutLengths(g: LayoutGraph, opts: { span?: boolean } = {}): [string, number][] {
  const out: [string, number][] = [];
  const put = (path: string, v: number | undefined): void => {
    if (v !== undefined) out.push([path, v]);
  };
  for (const n of g.nodes) {
    put(`node ${n.id} width`, n.width);
    put(`node ${n.id} height`, n.height);
    if (opts.span) put(`node ${n.id} span`, n.span);
  }
  for (const gr of g.groups) {
    for (const side of ['top', 'right', 'bottom', 'left'] as const)
      put(`group ${gr.id} padding.${side}`, gr.padding[side]);
    put(`group ${gr.id} title.width`, gr.title?.width);
    put(`group ${gr.id} title.height`, gr.title?.height);
  }
  for (const e of g.edges) {
    put(`edge ${e.id} label.width`, e.label?.width);
    put(`edge ${e.id} label.height`, e.label?.height);
  }
  put('spacing.node', g.spacing.node);
  put('spacing.rank', g.spacing.rank);
  put('spacing.edge', g.spacing.edge);
  put('diagramPadding', g.diagramPadding);
  put('headRoom', g.headRoom);
  return out;
}
