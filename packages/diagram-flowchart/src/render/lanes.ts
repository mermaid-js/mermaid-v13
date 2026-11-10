// Swimlane lanes (spec #528, D535, D536): when the `swimlane` engine lays a flowchart out, each
// top-level subgraph is a lane (`LayoutModel.lanes`), drawn as v12's swimlane cluster (`clusters/swimlane.js` at
// upstream c9b12739f): a title band filled `clusterBkg` and an unfilled body, both stroked
// `clusterBorder`. Loose nodes sit in a lane the engine makes, which flowchart's model does
// not have. v12's `log.warn`s for shared nodes and nested lanes are warnings here (D226).
// A chunk of its own, loaded with the engine (`../lanes.ts`, R-PERF-1): `render.ts` holds only
// the slot it installs into.
import type { LayoutModel, LayoutModelGroup } from '@mermaid-js/core/layout';
import { rotate, type Attrs } from '@mermaid-js/core/svg';
import type { FlowModel } from '../parser/index.ts';
import type { FlowWarning } from './context.ts';
import type { NodeView, Prepared } from './prepare.ts';
import { cls, useLanes, type Scene } from './render.ts';

/** The lanes of a layout the swimlane engine laid out (`LayoutModel.lanes`): `lanes.has(id)`. */
const lanesOf = (layout: LayoutModel): ReadonlySet<string> => new Set(layout.lanes);

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
  layout: LayoutModel,
  warn: (warning: FlowWarning) => void
): void {
  const lanes = lanesOf(layout);
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

/**
 * A lane as v12's swimlane cluster: `rect.swimlane-body` (unfilled), `rect.swimlane-title`
 * (filled `clusterBkg`), both stroked `clusterBorder`, then the label, centred in the band and
 * turned −90° when the band is on the left. In the colour themes both rects take the palette
 * slot, fill included, as v12's `[data-color-id]` lane rules did. The author's `style` and
 * `classDef` still win (spread after). No drop shadow: v12's swimlane styles turned it off.
 * `view` is undefined for a lane the engine made (the default lane): no subgraph, no label.
 */
function drawLane(
  { w, layout, ctx, paint }: Scene,
  id: string,
  box: LayoutModelGroup,
  view: NodeView | undefined,
  order: number | undefined
): void {
  const cluster = paint.cluster!;
  const slot = paint.slotOf({ order });
  const parts = laneBox(box, layout.direction);
  const own = view?.style.shape;
  w.open('g', {
    class: 'cluster swimlane' + cls(view?.classes ?? []),
    'data-id': id,
    'data-ast': view?.ast,
    'data-color-id': slot?.id,
  });
  const paintOf = (fill: Attrs['fill']): Attrs => ({
    fill: slot?.fill ?? fill,
    stroke: slot?.stroke ?? paint.laneStroke,
    'stroke-width': cluster.strokeWidth,
    ...own,
  });
  w.outline('group', 'rect', { class: 'swimlane-body', ...parts.body, ...paintOf('none') });
  w.outline('group', 'rect', { class: 'swimlane-title', ...parts.title, ...paintOf(cluster.fill) });
  if (view) {
    const { x, y } = box.title;
    const fill = own?.fill;
    w.label(view.label, x, y, {
      class: 'cluster-label swimlane-label',
      transform: parts.turned ? rotate(-90, x, y) : undefined,
      fill: (fill && ctx.theme.ink(fill)) || cluster.text,
      ...view.style.text,
    });
  }
  w.close();
}

/**
 * Installs lane drawing into flowchart's renderer (idempotent) and returns `engine` as is:
 * `mermaid`'s `swimlane` loader passes the engine's module through it.
 */
export function withLanes<T>(engine: T): T {
  useLanes({
    warn: laneWarnings,
    open(scene, model) {
      const lanes = lanesOf(scene.layout);
      // Lanes the engine made (the default lane for loose nodes) have no subgraph. v12 gives the
      // default lane the slot after every subgraph's, so it never takes the first one.
      let made = model.subgraphs.length;
      for (const id of lanes) {
        const box = scene.flow.views.has(id) ? undefined : scene.layout.groups.get(id);
        if (box) drawLane(scene, id, box, undefined, made++);
      }
      return lanes;
    },
    draw: (scene, view, box) => drawLane(scene, view.id, box, view, view.order),
  });
  return engine;
}
