import type { DiagramPlugin } from '@mermaid-js/core';

/**
 * Test-only stub of a non-graph diagram plugin (DESIGN §15 item 23): Sankey-shaped, with
 * `layoutKind: 'custom'` and its own layout type, so the plugin API keeps working for
 * diagrams that never touch `LayoutModel`. Not shipped.
 *
 * Syntax: a `stub-sankey` header (`sankey` alone is v12's built-in detector), then `source,target,value` lines. No diagnostics; lines
 * that do not match are skipped.
 */
export interface SankeyModel {
  readonly flows: readonly { source: string; target: string; value: number }[];
}

/** Its own layout type: columns of nodes and their boxes, nothing graph-shaped. */
export interface SankeyLayout {
  readonly columns: readonly (readonly string[])[];
  readonly nodes: Readonly<Record<string, { x: number; y: number; height: number }>>;
  readonly width: number;
  readonly height: number;
}

const UNIT = 12;
const GAP = 12;
const NODE_W = 20;
const COL_STEP = 90;
const FLOW = /^\s*([\w-]+)\s*,\s*([\w-]+)\s*,\s*(\d+(?:\.\d+)?)\s*$/;

function parseFlows(text: string): SankeyModel {
  const flows = [];
  for (const line of text.split('\n').slice(1)) {
    const m = FLOW.exec(line);
    if (m) flows.push({ source: m[1]!, target: m[2]!, value: Number(m[3]) });
  }
  return { flows };
}

function layoutFlows({ flows }: SankeyModel): SankeyLayout {
  const depth = new Map<string, number>();
  const through = new Map<string, { in: number; out: number }>();
  for (const f of flows) {
    for (const id of [f.source, f.target]) {
      if (!depth.has(id)) depth.set(id, 0);
      if (!through.has(id)) through.set(id, { in: 0, out: 0 });
    }
    through.get(f.source)!.out += f.value;
    through.get(f.target)!.in += f.value;
  }
  // Longest path from a source; the stub assumes acyclic input.
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of flows) {
      const d = depth.get(f.source)! + 1;
      if (d > depth.get(f.target)!) {
        depth.set(f.target, d);
        changed = true;
      }
    }
  }
  const columns: string[][] = [];
  for (const [id, d] of depth) (columns[d] ??= []).push(id);
  const nodes: Record<string, { x: number; y: number; height: number }> = {};
  let height = 0;
  columns.forEach((column, i) => {
    let y = 0;
    for (const id of column) {
      const t = through.get(id)!;
      const h = Math.max(t.in, t.out) * UNIT;
      nodes[id] = { x: i * COL_STEP, y, height: h };
      y += h + GAP;
    }
    height = Math.max(height, y - GAP);
  });
  const width = columns.length === 0 ? 0 : (columns.length - 1) * COL_STEP + NODE_W;
  return { columns, nodes, width, height };
}

export const sankeyStub: DiagramPlugin<SankeyModel, SankeyLayout> = {
  id: 'sankey-stub',
  layoutKind: 'custom',
  detector: (text) => /^\s*stub-sankey\b/.test(text),
  parse: (text) => ({
    model: parseFlows(text),
    ast: { id: 'sankey', type: 'Sankey', range: { start: 0, end: text.length } },
    diagnostics: [],
    symbols: [],
    statements: [],
  }),
  layout: (model) => layoutFlows(model),
  render: (_model, layout, ctx, w) => {
    w.open('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      id: ctx.idPrefix,
      viewBox: [0, 0, layout.width, layout.height],
    });
    for (const [id, n] of Object.entries(layout.nodes))
      w.leaf('rect', { 'data-id': id, x: n.x, y: n.y, width: NODE_W, height: n.height });
    w.close();
  },
};
