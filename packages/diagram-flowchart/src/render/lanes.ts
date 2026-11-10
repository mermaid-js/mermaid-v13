// Swimlane lanes (spec #528, D535, D536): when the `swimlane` engine lays a flowchart out, each
// top-level subgraph is a lane (`LayoutModel.lanes`), drawn as v12's swimlane cluster (`clusters/swimlane.js` at
// upstream c9b12739f): a title band filled `clusterBkg` and an unfilled body, both stroked
// `clusterBorder`. Loose nodes sit in a lane the engine makes, which flowchart's model does
// not have. v12's `log.warn`s for shared nodes and nested lanes are warnings here (D226).
import type { LayoutModel, LayoutModelGroup } from '@mermaid-js/core/layout';
import type { FlowModel } from '../parser/index.ts';
import type { FlowWarning } from './context.ts';
import type { Prepared } from './prepare.ts';

/**
 * The lanes of a layout, when its engine laid groups out as lanes (`LayoutModel.lanes`, set by
 * `swimlane` only: `swimlane-beta`, or any flowchart with `layout: swimlane`, D535). Read from
 * the model, so a stand-in engine (a placeholder render) or an alias never draws lanes wrongly.
 * The one "is a lane" test: `lanes.has(id)`.
 */
export const lanesOf = (layout: LayoutModel): ReadonlySet<string> | undefined =>
  layout.lanes ? new Set(layout.lanes) : undefined;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A lane's two rects, and whether its label is turned (−90°, reading upward). */
export interface LaneBox {
  readonly title: Rect;
  readonly body: Rect;
  readonly turned: boolean;
}

/**
 * The title band and body of a lane. The engine reserves the band inside the lane box and puts
 * `title` at its centre (D536), so the band runs from the box's start to twice that far: on top
 * for TB and BT, on the left for LR and RL (v12 turned only LR; RL is the listed fix).
 */
export function laneBox(box: LayoutModelGroup, direction: LayoutModel['direction']): LaneBox {
  const turned = direction === 'LR' || direction === 'RL';
  const left = box.x - box.width / 2;
  const top = box.y - box.height / 2;
  if (turned) {
    const band = Math.min(box.width, Math.max(0, 2 * (box.title.x - left)));
    return {
      title: { x: left, y: top, width: band, height: box.height },
      body: { x: left + band, y: top, width: box.width - band, height: box.height },
      turned,
    };
  }
  const band = Math.min(box.height, Math.max(0, 2 * (box.title.y - top)));
  return {
    title: { x: left, y: top, width: box.width, height: band },
    body: { x: left, y: top + band, width: box.width, height: box.height - band },
    turned,
  };
}

/** The AST id of a subgraph, for a warning's `astIds`. */
const astOf = (flow: Prepared, id: string): string[] => {
  const ast = flow.views.get(id)?.ast;
  return ast === undefined ? [] : [ast];
};

/**
 * v12's swimlane warnings (D536), raised at layout, only when the engine laid out lanes:
 * `SWIMLANE_SHARED_NODE` for a node (or subgraph) listed in two lanes, directly or through a
 * subgraph nested in one (kept in the first; both lanes in `astIds`), and
 * `SWIMLANE_NESTED_LANE` for each subgraph inside a lane (drawn as a box).
 */
export function laneWarnings(
  model: FlowModel,
  flow: Prepared,
  lanes: ReadonlySet<string>,
  warn: (warning: FlowWarning) => void
): void {
  /** The lane `id` sits in (or is), following the drawn nesting. */
  const laneOf = (id: string): string | undefined => {
    const seen = new Set<string>();
    for (let c: string | undefined = id; c !== undefined && !seen.has(c); ) {
      if (lanes.has(c)) return c;
      seen.add(c);
      c = flow.views.get(c)?.parent;
    }
    return undefined;
  };
  const subgraphs = new Set(model.subgraphs.map((sg) => sg.id));
  for (const { node, keptBy, droppedFrom } of model.droppedMembers ?? []) {
    const kept = laneOf(keptBy);
    const dropped = laneOf(droppedFrom);
    if (kept === undefined || dropped === undefined || kept === dropped) continue;
    const what = subgraphs.has(node) ? 'subgraph' : 'node';
    warn({
      code: 'SWIMLANE_SHARED_NODE',
      message: `Swimlane ${what} "${node}" is listed in lanes "${kept}" and "${dropped}"; it is drawn in "${kept}" only.`,
      astIds: [...astOf(flow, kept), ...astOf(flow, dropped)],
    });
  }
  for (const g of flow.groups) {
    if (lanes.has(g.id) || g.parent === undefined) continue;
    warn({
      code: 'SWIMLANE_NESTED_LANE',
      message: `Swimlane subgraph "${g.id}" is nested in "${g.parent}"; only top-level subgraphs are lanes, so it is drawn as a plain box.`,
      astIds: [g.ast],
    });
  }
}
