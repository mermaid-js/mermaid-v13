// cspell:ignore LRTB
// Test-only builder for `compass`'s T0 acceptance harness (#590): turns an `architecture-beta`
// fixture into the `LayoutGraph` architecture's T3 will build, before any architecture parser
// exists. It reads the corpus subset (services, junctions, groups with `in`, edges with sides,
// `{group}`, arrows and `-[label]-`, `align`); front matter, `title` and `acc*` lines are skipped.
// Sizes follow v12's metrics table (spec #525): services are `iconSize` squares with their label
// beneath (`iconSize × 1.5` wide at most), junctions bare `iconSize` squares, groups `padding` on
// every side. Labels are measured with core's table measurer. Not shipped; never Pele's code.
import type {
  LayoutEdge,
  LayoutGraph,
  LayoutGroup,
  LayoutNode,
  Side,
} from '@mermaid-js/core/layout';
import { DEFAULT_FONT_FAMILY, layoutLabel, tableMeasurer } from '@mermaid-js/core/text';

const ICON_SIZE = 80;
const PADDING = 40;
const FONT = { family: DEFAULT_FONT_FAMILY, size: 16, weight: 400 };

const SIDE: Record<string, Side> = { L: 'left', R: 'right', T: 'top', B: 'bottom' };

const ID = String.raw`[\w](?:[-\w]*\w)?`;
const NODE = new RegExp(
  String.raw`^(service|junction|group)\s+(${ID})\s*(?:\(([\w:-]+)\))?\s*(?:\[([^\]]*)\])?\s*(?:in\s+(${ID}))?\s*$`
);
const EDGE = new RegExp(
  String.raw`^(${ID})\s*(\{group\})?\s*:\s*([LRTB])\s*([<>])?\s*(?:--|-\[([^\]]*)\]-)\s*([<>])?\s*([LRTB])\s*:\s*(${ID})\s*(\{group\})?\s*$`
);
const ALIGN = new RegExp(String.raw`^align\s+(row|column)\s+((?:${ID}\s*)+)$`);

function measure(text: string | undefined, maxWidth: number): { width: number; height: number } {
  if (!text) return { width: 0, height: 0 };
  const l = layoutLabel(text, FONT, maxWidth, tableMeasurer);
  return { width: Math.ceil(l.width), height: Math.ceil(l.height) };
}

/** What the harness needs besides the graph: which edges and nodes the metrics look at. */
export interface ArchitectureFixture {
  graph: LayoutGraph;
  /** Service and junction ids, in source order. */
  nodes: string[];
}

export function architectureGraph(source: string): ArchitectureFixture {
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, '');
  const nodes: LayoutNode[] = [];
  const groups: LayoutGroup[] = [];
  const edges: LayoutEdge[] = [];
  const align: { axis: 'row' | 'column'; members: string[] }[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.replace(/%%.*$/, '').trim();
    if (!line || line === 'architecture-beta' || /^(title|accTitle|accDescr)\b/.test(line))
      continue;
    const node = NODE.exec(line);
    if (node) {
      const [, kind, id, , title, parent] = node;
      if (kind === 'group') {
        groups.push({
          id: id!,
          ...(parent ? { parent } : {}),
          padding: { top: PADDING, right: PADDING, bottom: PADDING, left: PADDING },
          ...(title ? { title: measure(title, Infinity) } : {}),
        });
      } else {
        const label = kind === 'service' ? measure(title, ICON_SIZE * 1.5) : measure('', 0);
        nodes.push({
          id: id!,
          width: Math.max(ICON_SIZE, label.width),
          height: ICON_SIZE + label.height,
          anchorY: ICON_SIZE / 2,
          ...(parent ? { parent } : {}),
          ...(kind === 'junction' ? { shape: 'junction' } : {}),
        });
      }
      continue;
    }
    const edge = EDGE.exec(line);
    if (edge) {
      const [, lhs, lg, ls, , label, , rs, rhs, rg] = edge;
      edges.push({
        id: `${lhs}-${rhs}@${edges.length}`,
        source: lhs!,
        target: rhs!,
        minLen: 1,
        sides: { source: SIDE[ls!]!, target: SIDE[rs!]! },
        ...(lg || rg ? { border: { source: !!lg, target: !!rg } } : {}),
        ...(label ? { label: measure(label, Infinity) } : {}),
      });
      continue;
    }
    const a = ALIGN.exec(line);
    if (a) {
      align.push({ axis: a[1] as 'row' | 'column', members: a[2]!.trim().split(/\s+/) });
      continue;
    }
    throw new Error(`architecture harness: cannot read "${line}"`);
  }
  // v12's DB adds every group first, so parents come first already (spec #525, model order).
  return {
    graph: {
      direction: 'TB',
      nodes,
      edges,
      groups,
      spacing: { node: PADDING, rank: PADDING, edge: PADDING },
      ...(align.length > 0 ? { align } : {}),
    },
    nodes: nodes.map((n) => n.id),
  };
}
