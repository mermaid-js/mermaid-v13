// Swimlane lanes (spec #528, D535, D536): when the `swimlane` engine lays a flowchart out, each
// top-level group is a lane, drawn as v12's swimlane cluster (`clusters/swimlane.js` at
// upstream c9b12739f): a title band and a body, both filled `clusterBkg` and stroked
// `clusterBorder`. v12 wrote `fill="none"` on the body, but its `.cluster rect` CSS filled it
// (D768). Loose nodes sit in a lane the engine makes, which flowchart's model does not have.
// v12's `log.warn`s for shared nodes and nested lanes are warnings here (D226).
// A part of its own (`../lanes.ts`, R-PERF-1), loaded with the engine for flowcharts only. It
// imports only types from the renderer: what it draws with comes in the `Scene` and `makeLanes()`.
import type { LayoutModel, LayoutModelGroup } from '@mermaid-js/core/layout';
import { rotate, type Attrs } from '@mermaid-js/core/svg';
import type { FlowModel } from '../parser/index.ts';
import type { FlowWarning } from './context.ts';
import type { NodeView, Prepared } from './prepare.ts';
import type { Classes, LaneDrawer, LaneDrawerFactory, Scene } from './render.ts';

/**
 * The lanes of a render the swimlane engine laid out: its top-level groups (D535), a group with
 * no subgraph (the engine's default lane) included. `lanes.has(id)` is the one lane test.
 */
const lanesOf = (layout: LayoutModel, flow: Prepared): ReadonlySet<string> =>
  new Set([...layout.groups.keys()].filter((id) => flow.views.get(id)?.parent === undefined));

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
function laneWarnings(
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
  // A member a subgraph listed but an earlier one kept (v12 `droppedSubGraphMembers`): its
  // keeper is the subgraph it is drawn in. A keeper in the same lane (nested in the lister, or
  // the lister itself) is no conflict.
  for (const sg of model.subgraphs) {
    const own = new Set(sg.nodes);
    // A redeclaration lists its members again: one warning each.
    for (const node of new Set(sg.listed)) {
      if (node === sg.id || own.has(node)) continue;
      const kept = laneOf(flow.views.get(node)?.parent ?? '');
      const dropped = laneOf(sg.id);
      if (kept === undefined || dropped === undefined || kept === dropped) continue;
      const what = subgraphs.has(node) ? 'subgraph' : 'node';
      warn({
        code: 'SWIMLANE_SHARED_NODE',
        message: `Swimlane ${what} "${node}" is listed in lanes "${kept}" and "${dropped}"; it is drawn in "${kept}" only.`,
        astIds: [...astOf(flow, kept), ...astOf(flow, dropped)],
      });
    }
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
 * A lane as v12's swimlane cluster: `rect.swimlane-body` and `rect.swimlane-title`, both
 * filled `clusterBkg` (D768) and stroked `clusterBorder`, then the label, centred in the band and
 * turned −90° when the band is on the left. In the colour themes both rects take the palette
 * slot, fill included, as v12's `[data-color-id]` lane rules did. The author's `style` and
 * `classDef` still win (spread after). No drop shadow: v12's swimlane styles turned it off.
 * `view` is undefined for a lane the engine made (the default lane): no subgraph, no label.
 */
function drawLane(
  cls: Classes,
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
  w.outline('group', 'rect', { class: 'swimlane-body', ...parts.body, ...paintOf(cluster.fill) });
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
 * The part's default export: one layout's lane drawer, its lanes worked out once, drawing with
 * the renderer's `cls`; with `warn`, v12's warnings first. `mermaid` loads it with the
 * `swimlane` layout and the renderer gets it from `ctx.layoutPart` (per API object, never
 * module state).
 */
export const makeLanes: LaneDrawerFactory = (cls, model, flow, layout, warn): LaneDrawer => {
  const lanes = lanesOf(layout, flow);
  if (warn) laneWarnings(model, flow, lanes, warn);
  return (scene, plain) => {
    // Boxes from the scene's layout: a `postLayout` hook may have moved them since.
    const { groups } = scene.layout;
    // Lanes the engine made (the default lane for loose nodes) have no subgraph. v12 gives the
    // default lane the slot after every subgraph's, so it never takes the first one.
    let made = model.subgraphs.length;
    for (const id of lanes) {
      const box = flow.views.has(id) ? undefined : groups.get(id);
      if (box) drawLane(cls, scene, id, box, undefined, made++);
    }
    for (const g of flow.groups) {
      const box = groups.get(g.id);
      if (!box) continue;
      if (lanes.has(g.id)) drawLane(cls, scene, g.id, box, g, g.order);
      else plain(g, box);
    }
  };
};
