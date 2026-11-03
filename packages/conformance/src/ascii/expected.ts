// What a flowchart's text drawing should show, from its cell layout's views: the labels the
// builder measured (a shape that has no label in SVG has none here either, and members of a
// collapsed subgraph are gone), group titles and the front-matter title.
import type { FlowLayout } from '@mermaid-js/diagram-flowchart';
import type { Expected } from './structure.ts';

type Label = NonNullable<FlowLayout['flow']>['nodes'][number]['label'];

/** A measured label's text, lines joined with `\n`. */
const textOf = (label: Label): string =>
  label.lines.map((line) => line.map((run) => run.text).join('')).join('\n');

export function expectedOf(layout: FlowLayout, title?: string): Expected {
  const flow = layout.flow!;
  const shown = (s: string) => s.trim() !== '';
  return {
    nodes: flow.nodes.map((n) => textOf(n.label)).filter(shown),
    edgeLabels: flow.edges.map((e) => textOf(e.label)).filter(shown),
    texts: [...flow.groups.map((g) => textOf(g.label)).filter(shown), ...(title ? [title] : [])],
  };
}
